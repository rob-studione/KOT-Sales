"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  createSupabaseAuthConfirmBrowserClient,
  resetSupabaseAuthConfirmBrowserClient,
  resetSupabaseBrowserClient,
} from "@/lib/supabase/browser";

type Phase = "verifying" | "set_password" | "done" | "error";

type AuthFlowType = "invite" | "recovery" | "signup" | "email_change" | "magiclink" | "unknown";

const AUTH_CONFIRM_DEBUG =
  process.env.NODE_ENV === "development" || process.env.NEXT_PUBLIC_AUTH_CONFIRM_DEBUG === "1";

const SENSITIVE_KEYS = new Set([
  "access_token",
  "refresh_token",
  "token",
  "token_hash",
  "code",
  "provider_token",
  "provider_refresh_token",
]);

function maskValue(key: string, value: string): string {
  if (!SENSITIVE_KEYS.has(key)) return value;
  const v = String(value ?? "");
  if (v.length <= 10) return `[${key}:len=${v.length}]`;
  return `[${key}:${v.slice(0, 4)}…${v.slice(-4)} len=${v.length}]`;
}

function authConfirmLog(message: string, data?: Record<string, unknown>) {
  if (!AUTH_CONFIRM_DEBUG) return;
  // eslint-disable-next-line no-console -- intentional field diagnostics for /auth/confirm
  console.info(`[auth/confirm] ${message}`, data ?? {});
}

function parseHashParams(hash: string): Record<string, string> {
  const raw = String(hash ?? "").trim();
  if (!raw) return {};
  const h = raw.startsWith("#") ? raw.slice(1) : raw;
  const qs = new URLSearchParams(h);
  const out: Record<string, string> = {};
  for (const [k, v] of qs.entries()) out[k] = v;
  return out;
}

/** Match GoTrue `parseParametersFromURL`: hash first, then search params override. */
function parseAuthParamsFromWindow(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const hashParams = parseHashParams(window.location.hash);
  const out: Record<string, string> = { ...hashParams };
  const search = new URLSearchParams(window.location.search);
  for (const [k, v] of search.entries()) {
    out[k] = v;
  }
  return out;
}

function normalizeAuthType(raw: string | null | undefined): AuthFlowType {
  const t = String(raw ?? "").trim().toLowerCase();
  if (t === "invite" || t === "recovery" || t === "signup" || t === "email_change" || t === "magiclink") return t;
  if (t === "email") return "signup";
  return "unknown";
}

function isPasswordSetupFlow(t: AuthFlowType): boolean {
  return t === "invite" || t === "recovery" || t === "signup";
}

function looksLikeOpaqueOtpToken(token: string): boolean {
  const t = String(token ?? "").trim();
  return t.length >= 20 && !t.includes("@");
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

async function waitForSessionAfterAuth(
  supabase: ReturnType<typeof createSupabaseAuthConfirmBrowserClient>,
  label: string,
): Promise<{ session: NonNullable<Awaited<ReturnType<typeof supabase.auth.getSession>>["data"]["session"]>; userId: string; email: string }> {
  const maxAttempts = 8;
  const delayMs = 100;
  let lastErr: string | null = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const { data, error } = await supabase.auth.getSession();
    authConfirmLog("getSession", {
      label,
      attempt,
      hasSession: !!data.session?.user?.id,
      error: error?.message ?? null,
    });
    if (error) lastErr = error.message;
    const uid = data.session?.user?.id ? String(data.session.user.id) : "";
    if (uid) {
      const email = String(data.session?.user?.email ?? "").trim().toLowerCase();
      authConfirmLog("getSession_ok", { label, attempt, userIdPrefix: uid.slice(0, 8) });
      return { session: data.session!, userId: uid, email };
    }
    if (attempt < maxAttempts) {
      try {
        await supabase.auth.refreshSession();
      } catch {
        // ignore
      }
      await sleep(delayMs);
    }
  }
  authConfirmLog("getSession_exhausted", { label, lastError: lastErr });
  throw new Error("Nepavyko nustatyti sesijos pagal nuorodą.");
}

export function AuthConfirmClient() {
  const router = useRouter();
  const sp = useSearchParams();
  const next = useMemo(() => {
    const n = sp.get("next");
    return n && n.startsWith("/") ? n : "/analitika";
  }, [sp]);

  const [phase, setPhase] = useState<Phase>("verifying");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setError(null);
      setInfo(null);
      setPhase("verifying");
      setSessionUserId(null);
      setSessionEmail(null);

      resetSupabaseBrowserClient();
      resetSupabaseAuthConfirmBrowserClient();
      const supabase = createSupabaseAuthConfirmBrowserClient();

      try {
        await supabase.auth.signOut({ scope: "local" });
      } catch {
        // ignore
      }

      const params = parseAuthParamsFromWindow();
      const tokenHash = String(params.token_hash ?? "").trim();
      const token = String(params.token ?? "").trim();
      const code = String(params.code ?? "").trim();
      const accessToken = String(params.access_token ?? "").trim();
      const refreshToken = String(params.refresh_token ?? "").trim();
      const type = normalizeAuthType(params.type);

      const expectedEmail = String(params.email ?? "").trim().toLowerCase();

      const queryKeys = typeof window !== "undefined" ? Array.from(new URLSearchParams(window.location.search).keys()) : [];
      const masked: Record<string, string> = {};
      for (const [k, v] of Object.entries(params)) {
        masked[k] = maskValue(k, v);
      }

      authConfirmLog("incoming", {
        href_masked:
          typeof window !== "undefined"
            ? `${window.location.origin}${window.location.pathname}?[query]&[hash]`
            : null,
        queryParamKeys: queryKeys,
        hashParamKeys: Object.keys(parseHashParams(typeof window !== "undefined" ? window.location.hash : "")),
        mergedKeys: Object.keys(params),
        type_raw: params.type ?? null,
        type_normalized: type,
        params_masked: masked,
      });

      try {
        let chosenBranch = "none";

        // --- Invite / signup: token_hash in URL (email template → app) ---
        if (tokenHash) {
          chosenBranch = "token_hash";
          authConfirmLog("branch", { chosen: chosenBranch, otpVerifyType: type });
          if (!isPasswordSetupFlow(type) && type !== "unknown") {
            throw new Error("Netinkamas nuorodos tipas.");
          }
          if (type === "unknown") {
            throw new Error("Trūksta nuorodos tipo (type).");
          }
          const { data: vData, error: vErr } = await supabase.auth.verifyOtp({
            type: type as "invite" | "recovery" | "signup",
            token_hash: tokenHash,
          });
          authConfirmLog("verifyOtp_result", {
            branch: chosenBranch,
            error: vErr?.message ?? null,
            hasSession: !!vData?.session?.access_token,
            hasUser: !!vData?.user?.id,
          });
          if (vErr) throw vErr;
        }
        // --- Recovery after GET /auth/v1/verify: implicit tokens in URL ---
        else if (type === "recovery" && accessToken && refreshToken) {
          chosenBranch = "recovery_implicit_hash";
          authConfirmLog("branch", { chosen: chosenBranch });
          const { data: sData, error: sErr } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          authConfirmLog("setSession_result", {
            branch: chosenBranch,
            error: sErr?.message ?? null,
            hasSession: !!sData?.session?.access_token,
          });
          if (sErr) throw sErr;
        }
        // Recovery must not use PKCE code exchange (no code_verifier in this flow).
        else if (type === "recovery" && code && !(accessToken && refreshToken)) {
          chosenBranch = "recovery_code_unsupported";
          authConfirmLog("branch", {
            chosen: chosenBranch,
            note: "refuse exchangeCodeForSession for recovery",
          });
          throw new Error(
            "Slaptažodžio atkūrimo nuoroda neatitinka laukiamo formato (trūksta sesijos duomenų). Atidarykite nuorodą tiesiai iš el. laiško arba užsisakykite naują slaptažodžio atkūrimą.",
          );
        }
        // --- PKCE: auth `code` from same-browser OAuth / invite redirect (never recovery; see above) ---
        else if (code && type !== "recovery") {
          chosenBranch = `pkce_code_exchange_${type}`;
          authConfirmLog("branch", { chosen: chosenBranch });
          const { data: xData, error: xErr } = await supabase.auth.exchangeCodeForSession(code);
          authConfirmLog("exchangeCodeForSession_result", {
            branch: chosenBranch,
            error: xErr?.message ?? null,
            hasSession: !!xData?.session?.access_token,
          });
          if (xErr) throw xErr;
        }
        // --- Recovery: ?token=…&type=recovery (or long opaque token) → verify as token_hash ---
        else if (
          token &&
          (type === "recovery" ||
            (type === "unknown" && looksLikeOpaqueOtpToken(token) && !code && !(accessToken && refreshToken)))
        ) {
          chosenBranch = "recovery_token_query";
          authConfirmLog("branch", { chosen: chosenBranch });
          const { data: vData, error: vErr } = await supabase.auth.verifyOtp({
            type: "recovery",
            token_hash: token,
          });
          authConfirmLog("verifyOtp_result", {
            branch: chosenBranch,
            error: vErr?.message ?? null,
            hasSession: !!vData?.session?.access_token,
            hasUser: !!vData?.user?.id,
          });
          if (vErr) throw vErr;
        }
        // --- Implicit tokens without explicit recovery type (magic link, some templates) ---
        else if (accessToken && refreshToken) {
          chosenBranch = "implicit_tokens_generic";
          authConfirmLog("branch", { chosen: chosenBranch, type });
          const { data: sData, error: sErr } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          authConfirmLog("setSession_result", {
            branch: chosenBranch,
            error: sErr?.message ?? null,
            hasSession: !!sData?.session?.access_token,
          });
          if (sErr) throw sErr;
        } else {
          chosenBranch = "none";
          authConfirmLog("branch", { chosen: chosenBranch, note: "no matching auth branch" });
        }

        const { userId, email } = await waitForSessionAfterAuth(supabase, chosenBranch);

        const { data: g2, error: g2e } = await supabase.auth.getUser();
        authConfirmLog("getUser_final", {
          error: g2e?.message ?? null,
          userIdMatch: g2.user?.id === userId,
        });

        if (expectedEmail && email && expectedEmail !== email) {
          if (type === "recovery") {
            authConfirmLog("skip_email_mismatch_guard", { reason: "recovery_flow" });
          } else {
            throw new Error("Nuoroda neatitinka naudotojo. Atidarykite naujausią kvietimo laišką dar kartą.");
          }
        }

        if (!isPasswordSetupFlow(type)) {
          throw new Error("Ši nuoroda nėra slaptažodžio nustatymui.");
        }

        if (!cancelled) {
          setSessionUserId(userId);
          setSessionEmail(email || null);
          setPhase("set_password");
          setInfo("Nustatykite slaptažodį, kad galėtumėte prisijungti.");
        }
      } catch (e) {
        const msg = e && typeof e === "object" && "message" in e ? String((e as { message?: string }).message) : "Klaida";
        authConfirmLog("catch_run", { message: msg });
        if (!cancelled) {
          setPhase("error");
          setError(msg || "Nepavyko patvirtinti nuorodos.");
        }
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [next]);

  return (
    <div className="w-full max-w-[460px] rounded-[18px] border border-slate-200/80 bg-white p-8 shadow-[0_20px_50px_-12px_rgba(15,23,42,0.12)] sm:p-10">
      <div className="text-center">
        <div className="flex items-center justify-center gap-2.5">
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-sky-600 to-blue-600 text-lg font-bold leading-none text-white shadow-sm shadow-blue-600/25"
            aria-hidden
          >
            S
          </div>
          <span className="text-[1.65rem] font-bold tracking-tight text-slate-900">Salex</span>
        </div>
        <p className="mt-1.5 text-sm text-slate-500">CRM platforma</p>
        <h1 className="mt-6 text-xl font-bold leading-snug tracking-tight text-slate-900 sm:text-[1.35rem]">
          Slaptažodžio nustatymas
        </h1>
      </div>

      {phase === "verifying" ? (
        <p className="mt-8 text-center text-sm text-slate-600">Tikrinama nuoroda…</p>
      ) : null}

      {phase === "set_password" ? (
        <form
          className="mt-8 flex flex-col gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setError(null);
            if (!sessionUserId) {
              setError("Sesija nepatvirtinta. Atnaujinkite puslapį arba atidarykite nuorodą iš naujo.");
              return;
            }
            const fd = new FormData(e.currentTarget);
            const p1 = String(fd.get("password") ?? "");
            const p2 = String(fd.get("password2") ?? "");
            if (p1.length < 8) {
              setError("Slaptažodis turi būti bent 8 simbolių.");
              return;
            }
            if (p1 !== p2) {
              setError("Slaptažodžiai nesutampa.");
              return;
            }
            const supabase = createSupabaseAuthConfirmBrowserClient();
            const { data: pre, error: preErr } = await supabase.auth.getUser();
            if (preErr) {
              setError("Nepavyko patvirtinti sesijos prieš keičiant slaptažodį.");
              return;
            }
            const uid = pre.user?.id ? String(pre.user.id) : "";
            const email = pre.user?.email ? String(pre.user.email).trim().toLowerCase() : "";
            if (!uid || uid !== sessionUserId) {
              setError("Sesija pasikeitė. Atnaujinkite puslapį ir bandykite dar kartą.");
              return;
            }
            if (sessionEmail && email && sessionEmail !== email) {
              setError("Sesija neatitinka kvietimo. Atnaujinkite puslapį ir bandykite dar kartą.");
              return;
            }
            const { error: uErr } = await supabase.auth.updateUser({ password: p1 });
            if (uErr) {
              setError("Nepavyko nustatyti slaptažodžio. Bandykite dar kartą.");
              return;
            }
            setPhase("done");
            setInfo("Slaptažodis nustatytas. Nukreipiame…");
            router.replace(next);
            router.refresh();
          }}
        >
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-slate-700">Naujas slaptažodis</span>
            <input
              name="password"
              type="password"
              required
              autoComplete="new-password"
              className="w-full rounded-xl border border-slate-200 bg-slate-50/90 px-3.5 py-2.5 text-sm text-slate-900 shadow-inner shadow-slate-900/5 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/25"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-slate-700">Pakartokite slaptažodį</span>
            <input
              name="password2"
              type="password"
              required
              autoComplete="new-password"
              className="w-full rounded-xl border border-slate-200 bg-slate-50/90 px-3.5 py-2.5 text-sm text-slate-900 shadow-inner shadow-slate-900/5 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/25"
            />
          </label>

          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          {info ? <p className="text-sm text-emerald-700">{info}</p> : null}

          <button
            type="submit"
            className="mt-1 w-full rounded-xl bg-gradient-to-r from-sky-600 to-blue-600 py-3 text-sm font-semibold text-white shadow-md shadow-blue-600/20 transition hover:from-sky-500 hover:to-blue-500 hover:shadow-lg hover:shadow-blue-600/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            Nustatyti slaptažodį
          </button>
        </form>
      ) : null}

      {phase === "error" ? (
        <div className="mt-8">
          <p className="text-sm text-red-600">{error ?? "Nepavyko patvirtinti nuorodos."}</p>
          <button
            type="button"
            className="mt-4 w-full rounded-xl border border-slate-200 bg-white py-3 text-sm font-semibold text-slate-800 hover:bg-slate-50"
            onClick={() => router.replace("/login")}
          >
            Grįžti į prisijungimą
          </button>
        </div>
      ) : null}

      {phase === "done" ? <p className="mt-8 text-center text-sm text-slate-600">Atlikta.</p> : null}
    </div>
  );
}
