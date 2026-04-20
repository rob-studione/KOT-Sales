"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

function IconEnvelope({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} aria-hidden>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 7l9 6 9-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconLock({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} aria-hidden>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 018 0v3" strokeLinecap="round" />
    </svg>
  );
}

function IconUserCircle({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} aria-hidden>
      <circle cx="12" cy="9" r="3.25" />
      <path d="M6.5 19.5a5.5 5.5 0 0111 0" strokeLinecap="round" />
    </svg>
  );
}

export function LoginForm() {
  const router = useRouter();
  const sp = useSearchParams();
  const next = useMemo(() => {
    const n = sp.get("next");
    return n && n.startsWith("/") ? n : "/analitika";
  }, [sp]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [info, setInfo] = useState<string | null>(null);

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
          Prisijunkite prie savo paskyros
        </h1>
      </div>

      <form
        method="post"
        className="mt-8 flex flex-col gap-5"
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          setInfo(null);
          setPending(true);
          try {
            const form = e.currentTarget;
            const email = String(new FormData(form).get("email") ?? "").trim();
            const password = String(new FormData(form).get("password") ?? "");
            const supabase = createSupabaseBrowserClient();
            const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
            if (signInErr) {
              const msg = String(signInErr.message ?? "");
              const lower = msg.toLowerCase();
              if (lower.includes("invalid") && lower.includes("credentials")) {
                setError("Neteisingi prisijungimo duomenys. Patikrinkite el. paštą ir slaptažodį.");
              } else if (lower.includes("email") && lower.includes("confirm")) {
                setError("El. paštas dar nepatvirtintas. Patikrinkite el. paštą arba paprašykite admin pakartoti kvietimą.");
              } else {
                setError(
                  process.env.NODE_ENV === "production"
                    ? "Nepavyko prisijungti. Patikrinkite el. paštą ir slaptažodį."
                    : `Nepavyko prisijungti: ${msg}`
                );
              }
              return;
            }
            router.replace(next);
            router.refresh();
          } finally {
            setPending(false);
          }
        }}
      >
        <div>
          <label htmlFor="login-email" className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-600">
            <IconEnvelope className="h-4 w-4 text-slate-400" />
            El. paštas
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
              <IconUserCircle className="h-[18px] w-[18px]" />
            </span>
            <input
              id="login-email"
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="El. paštas"
              className="w-full rounded-xl border border-slate-200 bg-slate-50/90 py-2.5 pl-11 pr-3.5 text-sm text-slate-900 shadow-inner shadow-slate-900/5 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/25"
            />
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between gap-3">
            <label htmlFor="login-password" className="flex items-center gap-2 text-sm font-medium text-slate-600">
              <IconLock className="h-4 w-4 text-slate-400" />
              Slaptažodis
            </label>
            <button
              type="button"
              className="shrink-0 text-sm font-medium text-blue-600 underline-offset-2 hover:text-blue-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 focus-visible:ring-offset-2"
              onClick={async () => {
                setError(null);
                setInfo(null);
                const emailInput = document.getElementById("login-email") as HTMLInputElement | null;
                const email = String(emailInput?.value ?? "").trim();
                if (!email) {
                  setError("Įveskite el. paštą, kad gautumėte slaptažodžio atkūrimo nuorodą.");
                  return;
                }
                setPending(true);
                try {
                  const supabase = createSupabaseBrowserClient();
                  const redirectTo = `${window.location.origin}/auth/confirm`;
                  const { error: resetErr } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
                  if (resetErr) {
                    const msg = String(resetErr.message ?? "");
                    const lower = msg.toLowerCase();
                    if (lower.includes("redirect") && (lower.includes("not allowed") || lower.includes("not whitelisted"))) {
                      setError(
                        "Nepavyko išsiųsti atkūrimo nuorodos: neteisingas redirect URL. Patikrinkite Supabase Auth nustatymuose leidžiamus redirect URL (localhost:3000/3002)."
                      );
                    } else if (lower.includes("rate") && lower.includes("limit")) {
                      setError("Per dažnai bandote. Palaukite kelias minutes ir bandykite dar kartą.");
                    } else {
                      setError(
                        process.env.NODE_ENV === "production"
                          ? "Nepavyko išsiųsti atkūrimo nuorodos. Bandykite vėliau."
                          : `Nepavyko išsiųsti atkūrimo nuorodos: ${msg}`
                      );
                    }
                    return;
                  }
                  setInfo("Atkūrimo nuoroda išsiųsta į el. paštą (jei toks vartotojas egzistuoja).");
                } finally {
                  setPending(false);
                }
              }}
            >
              Pamiršote slaptažodį?
            </button>
          </div>
          <div className="relative">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
              <IconLock className="h-[18px] w-[18px]" />
            </span>
            <input
              id="login-password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              placeholder="••••••••"
              className="w-full rounded-xl border border-slate-200 bg-slate-50/90 py-2.5 pl-11 pr-3.5 text-sm text-slate-900 shadow-inner shadow-slate-900/5 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/25"
            />
          </div>
        </div>

        <label className="flex cursor-pointer items-start gap-2.5 text-sm text-slate-600">
          <input
            name="remember"
            type="checkbox"
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-blue-600 focus:ring-2 focus:ring-blue-500/30"
          />
          <span>Prisiminti mane šiame įrenginyje</span>
        </label>

        <button
          type="submit"
          disabled={pending}
          className="mt-1 w-full rounded-xl bg-gradient-to-r from-sky-600 to-blue-600 py-3 text-sm font-semibold text-white shadow-md shadow-blue-600/20 transition hover:from-sky-500 hover:to-blue-500 hover:shadow-lg hover:shadow-blue-600/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
        >
          {pending ? "Jungiamasi…" : "Prisijungti"}
        </button>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {info ? <p className="text-sm text-emerald-700">{info}</p> : null}
      </form>
    </div>
  );
}
