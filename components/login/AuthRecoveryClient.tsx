"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  createSupabaseAuthConfirmBrowserClient,
  createSupabaseBrowserClient,
  resetSupabaseAuthConfirmBrowserClient,
  resetSupabaseBrowserClient,
} from "@/lib/supabase/browser";
import {
  parseAuthParamsFromWindow,
  normalizeAuthType,
  looksLikeOpaqueOtpToken,
} from "@/lib/login/authEmailLinkParams";
import { waitForSupabaseSessionAfterAuth } from "@/lib/login/waitForSupabaseSession";

type Phase = "verifying" | "set_password" | "done" | "error";

const DEBUG = process.env.NODE_ENV === "development" || process.env.NEXT_PUBLIC_AUTH_CONFIRM_DEBUG === "1";

function authRecoveryLog(message: string, data?: Record<string, unknown>) {
  if (!DEBUG) return;
  // eslint-disable-next-line no-console -- intentional field diagnostics for /auth/recovery
  console.info(`[auth/recovery] ${message}`, data ?? {});
}

/**
 * Password reset from email: PKCE `code` is issued against the `code_challenge` sent with
 * `resetPasswordForEmail` and the `code_verifier` stored in the browser. Do not call
 * `signOut` before `exchangeCodeForSession` — signOut removes the verifier from storage.
 */
export function AuthRecoveryClient() {
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

      const params = parseAuthParamsFromWindow();
      const code = String(params.code ?? "").trim();
      const token = String(params.token ?? "").trim();
      const accessToken = String(params.access_token ?? "").trim();
      const refreshToken = String(params.refresh_token ?? "").trim();
      const type = normalizeAuthType(params.type);

      authRecoveryLog("incoming", {
        keys: Object.keys(params),
        type,
        hasCode: !!code,
        hasHashTokens: !!(accessToken && refreshToken),
        hasToken: !!token,
      });

      try {
        let chosenBranch = "none";

        if (code) {
          chosenBranch = "recovery_pkce_code";
          resetSupabaseAuthConfirmBrowserClient();
          resetSupabaseBrowserClient();
          const pkce = createSupabaseBrowserClient();
          authRecoveryLog("branch", { chosen: chosenBranch });
          const { error: xErr } = await pkce.auth.exchangeCodeForSession(code);
          authRecoveryLog("exchangeCodeForSession_result", { error: xErr?.message ?? null });
          if (xErr) throw xErr;
          const { userId, email } = await waitForSupabaseSessionAfterAuth(pkce, chosenBranch, authRecoveryLog);
          if (!cancelled) {
            setSessionUserId(userId);
            setSessionEmail(email || null);
            setPhase("set_password");
            setInfo("Nustatykite naują slaptažodį.");
          }
          return;
        }

        resetSupabaseBrowserClient();
        resetSupabaseAuthConfirmBrowserClient();
        const supabase = createSupabaseAuthConfirmBrowserClient();
        try {
          await supabase.auth.signOut({ scope: "local" });
        } catch {
          // ignore
        }

        if (accessToken && refreshToken) {
          chosenBranch = "recovery_implicit_hash";
          authRecoveryLog("branch", { chosen: chosenBranch });
          const { error: sErr } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          authRecoveryLog("setSession_result", { error: sErr?.message ?? null });
          if (sErr) throw sErr;
        } else if (token && (type === "recovery" || looksLikeOpaqueOtpToken(token))) {
          chosenBranch = "recovery_token_query";
          authRecoveryLog("branch", { chosen: chosenBranch });
          const { error: vErr } = await supabase.auth.verifyOtp({
            type: "recovery",
            token_hash: token,
          });
          authRecoveryLog("verifyOtp_result", { error: vErr?.message ?? null });
          if (vErr) throw vErr;
        } else {
          throw new Error("Netinkama atkūrimo nuoroda. Naudokite nuorodą iš paskutinio slaptažodžio atkūrimo laiško.");
        }

        const { userId, email } = await waitForSupabaseSessionAfterAuth(supabase, chosenBranch, authRecoveryLog);
        if (!cancelled) {
          setSessionUserId(userId);
          setSessionEmail(email || null);
          setPhase("set_password");
          setInfo("Nustatykite naują slaptažodį.");
        }
      } catch (e) {
        const msg = e && typeof e === "object" && "message" in e ? String((e as { message?: string }).message) : "Klaida";
        authRecoveryLog("catch_run", { message: msg });
        if (!cancelled) {
          setPhase("error");
          setError(msg || "Nepavyko patvirtinti atkūrimo nuorodos.");
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
          Slaptažodžio atkūrimas
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
            const supabase = createSupabaseBrowserClient();
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
              setError("Sesija neatitinka. Atnaujinkite puslapį ir bandykite dar kartą.");
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
          <p className="text-sm text-red-600">{error ?? "Nepavyko patvirtinti atkūrimo nuorodos."}</p>
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
