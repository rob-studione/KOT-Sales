"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type Phase = "verifying" | "set_password" | "done" | "error";

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

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setError(null);
      setInfo(null);
      setPhase("verifying");
      const supabase = createSupabaseBrowserClient();

      // Supabase invite/recovery links can arrive as:
      // - query params: ?token_hash=...&type=invite|recovery
      // - hash params:  #access_token=...&refresh_token=...&type=invite|recovery
      const tokenHash = sp.get("token_hash");
      const type = sp.get("type");

      try {
        if (tokenHash && type) {
          const { error: vErr } = await supabase.auth.verifyOtp({
            type: type as any,
            token_hash: tokenHash,
          });
          if (vErr) throw vErr;
        }

        // If we got hash tokens, Supabase JS usually parses them automatically on load.
        const { data } = await supabase.auth.getSession();
        if (!data.session) {
          // No session yet; user may have opened link without tokens.
          if (!cancelled) {
            setPhase("error");
            setError("Nepavyko patvirtinti nuorodos. Pabandykite atsidaryti kvietimo laišką dar kartą.");
          }
          return;
        }

        if (!cancelled) {
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
  }, [sp]);

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

