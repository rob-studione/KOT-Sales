"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  createSupabaseAuthConfirmBrowserClient,
  createSupabaseAuthRecoveryBrowserClient,
  createSupabaseBrowserClient,
  resetSupabaseAuthConfirmBrowserClient,
  resetSupabaseAuthRecoveryBrowserClient,
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
 * Password reset from email: PKCE `code` matches `code_challenge` from `resetPasswordForEmail`;
 * verifier lives in the same cookie storage as `createSupabaseBrowserClient()` on /login.
 * Do not call `signOut` before `exchangeCodeForSession` — signOut removes the verifier.
 * Use {@link createSupabaseAuthRecoveryBrowserClient} (detectSessionInUrl: false) so GoTrue
 * does not consume the verifier in `initialize()` before our explicit exchange.
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
          resetSupabaseAuthRecoveryBrowserClient();
          resetSupabaseBrowserClient();
          // Dedicated PKCE client with detectSessionInUrl: false — default createBrowserClient
          // auto-exchanges in initialize() and deletes code-verifier before this explicit exchange.
          const pkce = createSupabaseAuthRecoveryBrowserClient();
          authRecoveryLog("branch", { chosen: chosenBranch });
          const { error: xErr } = await pkce.auth.exchangeCodeForSession(code);
          authRecoveryLog("exchangeCodeForSession_result", { error: xErr?.message ?? null });
          if (xErr) {
            const m = String(xErr.message ?? "").toLowerCase();
            if (m.includes("verifier") && m.includes("not found")) {
              throw new Error(
                "Nepavyko patvirtinti nuorodos šiame įrenginyje. Atidarykite atkūrimo nuorodą toje pačioje naršyklėje, kurioje spaudėte „Pamiršote slaptažodį?“, arba užsisakykite naują atkūrimą.",
              );
            }
            throw xErr;
          }
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
    <div className="m-auto w-full max-w-[440px] rounded-2xl border border-gray-100 bg-white p-8 shadow-lg">
      <div className="text-center">
        <div className="mb-8 flex items-center justify-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo.svg" alt="" className="h-10 w-auto" />
          <span className="text-xl font-semibold text-gray-900" suppressHydrationWarning>
            KoT Sales
          </span>
        </div>
        <h1 className="mb-8 text-2xl font-semibold leading-snug tracking-tight text-gray-900">
          Slaptažodžio atkūrimas
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
          <p className="text-sm text-gray-900">{error ?? "Nepavyko patvirtinti atkūrimo nuorodos."}</p>
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
