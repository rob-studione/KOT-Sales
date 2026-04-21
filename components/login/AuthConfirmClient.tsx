"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient, resetSupabaseBrowserClient } from "@/lib/supabase/browser";

type Phase = "verifying" | "set_password" | "done" | "error";

type AuthFlowType = "invite" | "recovery" | "signup" | "email_change" | "magiclink" | "unknown";

function parseHashParams(hash: string): Record<string, string> {
  const raw = String(hash ?? "").trim();
  if (!raw) return {};
  const h = raw.startsWith("#") ? raw.slice(1) : raw;
  const qs = new URLSearchParams(h);
  const out: Record<string, string> = {};
  for (const [k, v] of qs.entries()) out[k] = v;
  return out;
}

function parseAuthParamsFromWindow(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const out: Record<string, string> = {};
  const search = new URLSearchParams(window.location.search);
  for (const [k, v] of search.entries()) out[k] = v;
  const hashParams = parseHashParams(window.location.hash);
  for (const [k, v] of Object.entries(hashParams)) {
    // query wins if duplicated
    if (!(k in out)) out[k] = v;
  }
  return out;
}

function normalizeAuthType(raw: string | null | undefined): AuthFlowType {
  const t = String(raw ?? "").trim().toLowerCase();
  if (t === "invite" || t === "recovery" || t === "signup" || t === "email_change" || t === "magiclink") return t;
  if (t === "email") return "signup"; // common alias
  return "unknown";
}

function isPasswordSetupFlow(t: AuthFlowType): boolean {
  return t === "invite" || t === "recovery" || t === "signup";
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
  const [flowType, setFlowType] = useState<AuthFlowType>("unknown");

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setError(null);
      setInfo(null);
      setPhase("verifying");
      setSessionUserId(null);
      setSessionEmail(null);
      setFlowType("unknown");

      // Critical: invite/recovery must not reuse a stale singleton client/session from another tab/user.
      resetSupabaseBrowserClient();
      const supabase = createSupabaseBrowserClient();

      // Always clear any existing browser session cookies before applying email-link tokens.
      // This prevents "password update applies to currently logged-in admin" collisions.
      try {
        await supabase.auth.signOut({ scope: "local" });
      } catch {
        // ignore
      }

      const params = parseAuthParamsFromWindow();
      const tokenHash = String(params.token_hash ?? "").trim();
      const code = String(params.code ?? "").trim();
      const accessToken = String(params.access_token ?? "").trim();
      const refreshToken = String(params.refresh_token ?? "").trim();
      const type = normalizeAuthType(params.type);
      setFlowType(type);

      const expectedEmail = String(params.email ?? "").trim().toLowerCase();

      try {
        if (tokenHash) {
          if (!isPasswordSetupFlow(type) && type !== "unknown") {
            throw new Error("Netinkamas nuorodos tipas.");
          }
          if (type === "unknown") {
            throw new Error("Trūksta nuorodos tipo (type).");
          }

          const { error: vErr } = await supabase.auth.verifyOtp({
            // invite/recovery/signup/email_change are supported by verifyOtp depending on project settings.
            type: type as any,
            token_hash: tokenHash,
          });
          if (vErr) throw vErr;
        } else if (code) {
          const { error: xErr } = await supabase.auth.exchangeCodeForSession(code);
          if (xErr) throw xErr;
        } else if (accessToken && refreshToken) {
          const { error: sErr } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
          if (sErr) throw sErr;
        }

        const { data, error: sErr } = await supabase.auth.getSession();
        if (sErr) throw sErr;
        if (!data.session?.user?.id) {
          throw new Error("Nepavyko nustatyti sesijos pagal nuorodą.");
        }

        const uid = String(data.session.user.id);
        const email = String(data.session.user.email ?? "").trim().toLowerCase();

        if (expectedEmail && email && expectedEmail !== email) {
          // Hard safety: if the email in the URL doesn't match the session user, refuse password changes.
          throw new Error("Nuoroda neatitinka naudotojo. Atidarykite naujausią kvietimo laišką dar kartą.");
        }

        if (!isPasswordSetupFlow(type)) {
          // Not a password setup flow; don't expose password UI.
          throw new Error("Ši nuoroda nėra slaptažodžio nustatymui.");
        }

        if (!cancelled) {
          setSessionUserId(uid);
          setSessionEmail(email || null);
          setPhase("set_password");
          setInfo("Nustatykite slaptažodį, kad galėtumėte prisijungti.");
        }
      } catch (e) {
        const msg = e && typeof e === "object" && "message" in e ? String((e as any).message) : "Klaida";
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

