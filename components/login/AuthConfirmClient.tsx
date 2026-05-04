"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  createSupabaseAuthConfirmBrowserClient,
  resetSupabaseAuthConfirmBrowserClient,
  resetSupabaseBrowserClient,
} from "@/lib/supabase/browser";
import {
  parseAuthParamsFromWindow,
  parseHashParams,
  normalizeAuthType,
  isPasswordSetupFlow,
  looksLikeOpaqueOtpToken,
  isRecoveryPkceCodeOnlyRedirect,
  type AuthFlowType,
} from "@/lib/login/authEmailLinkParams";
import { waitForSupabaseSessionAfterAuth } from "@/lib/login/waitForSupabaseSession";

type Phase = "verifying" | "set_password" | "done" | "error";

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
      if (typeof window !== "undefined") {
        const early = parseAuthParamsFromWindow();
        if (isRecoveryPkceCodeOnlyRedirect(early)) {
          authConfirmLog("delegate_to_auth_recovery", { reason: "pkce_code_without_invite_type" });
          router.replace(`/auth/recovery${window.location.search}${window.location.hash}`);
          return;
        }
      }

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
      const type = normalizeAuthType(params.type) as AuthFlowType;

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
        // --- Recovery after GET /auth/v1/verify: implicit tokens (legacy redirect_to /auth/confirm) ---
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
        // --- PKCE: invite / signup / OAuth (not recovery — recovery PKCE is handled on /auth/recovery) ---
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
        // --- Recovery: ?token=…&type=recovery (legacy /auth/confirm) ---
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
        // --- Implicit tokens (magic link, etc.) ---
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

        const { userId, email } = await waitForSupabaseSessionAfterAuth(supabase, chosenBranch, authConfirmLog);

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
  }, [next, router]);

  return (
    <div className="m-auto w-full max-w-[440px] rounded-2xl border border-gray-100 bg-white p-8 shadow-lg">
      <div className="text-center">
        <div className="mb-8 flex items-center justify-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo.svg" alt="" className="h-10 w-auto" />
          <span className="text-xl font-semibold text-gray-900">KOT Sales</span>
        </div>
        <h1 className="mb-8 text-2xl font-semibold leading-snug tracking-tight text-gray-900">
          Slaptažodžio nustatymas
        </h1>
      </div>

      {phase === "verifying" ? (
        <p className="mt-8 text-center text-sm text-gray-600">Tikrinama nuoroda…</p>
      ) : null}

      {phase === "set_password" ? (
        <form
          className="flex flex-col gap-4"
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
            <span className="font-medium text-gray-700">Naujas slaptažodis</span>
            <input
              name="password"
              type="password"
              required
              autoComplete="new-password"
              className="h-11 w-full rounded-lg border border-gray-400 bg-white px-4 text-sm text-gray-900 placeholder:text-gray-400 hover:border-gray-300 focus:border-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900/10"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-gray-700">Pakartokite slaptažodį</span>
            <input
              name="password2"
              type="password"
              required
              autoComplete="new-password"
              className="h-11 w-full rounded-lg border border-gray-400 bg-white px-4 text-sm text-gray-900 placeholder:text-gray-400 hover:border-gray-300 focus:border-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900/10"
            />
          </label>

          {error ? <p className="text-sm text-gray-900">{error}</p> : null}
          {info ? <p className="text-sm text-gray-600">{info}</p> : null}

          <button
            type="submit"
            className="mt-4 h-11 w-full rounded-lg bg-[#7C4A57] text-sm font-medium text-white shadow-md transition-all hover:bg-[#693948] hover:shadow-lg active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7C4A57]/20 focus-visible:ring-offset-2"
          >
            Nustatyti slaptažodį
          </button>
        </form>
      ) : null}

      {phase === "error" ? (
        <div className="mt-8">
          <p className="text-sm text-gray-900">{error ?? "Nepavyko patvirtinti nuorodos."}</p>
          <button
            type="button"
            className="mt-4 h-11 w-full rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-800 hover:bg-gray-50"
            onClick={() => router.replace("/login")}
          >
            Grįžti į prisijungimą
          </button>
        </div>
      ) : null}

      {phase === "done" ? <p className="mt-8 text-center text-sm text-gray-600">Atlikta.</p> : null}
    </div>
  );
}
