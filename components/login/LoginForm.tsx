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

  function resolveResetRedirectTo(): string {
    const prod = "https://kot-sales.vercel.app";
    const envBase = typeof process.env.NEXT_PUBLIC_SITE_URL === "string" ? process.env.NEXT_PUBLIC_SITE_URL.trim() : "";
    const base = envBase || window.location.origin;
    const normalized = base.replace(/\/+$/, "");
    if (normalized.startsWith("http://localhost") || normalized.includes("localhost:")) {
      return `${prod}/auth/recovery`;
    }
    if (normalized.startsWith("http://") || normalized.startsWith("https://")) {
      return `${normalized}/auth/recovery`;
    }
    return `${prod}/auth/recovery`;
  }

  return (
    <div className="m-auto w-full max-w-[440px] rounded-2xl border border-gray-100 bg-white p-8 shadow-lg">
      <div className="text-center">
        <div className="mb-8 flex items-center justify-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo.svg" alt="" className="h-10 w-auto" />
          <span className="text-xl font-semibold text-gray-900">KOT Sales</span>
        </div>
        <h1 className="mb-8 text-2xl font-semibold leading-snug tracking-tight text-gray-900">
          Prisijungimas prie paskyros
        </h1>
      </div>

      <form
        method="post"
        className="flex flex-col gap-5"
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
        <div className="flex flex-col gap-4">
          <div>
            <label htmlFor="login-email" className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-600">
              <IconEnvelope className="h-4 w-4 text-gray-400" />
              El. paštas
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
                <IconUserCircle className="h-[18px] w-[18px]" />
              </span>
              <input
                id="login-email"
                name="email"
                type="email"
                autoComplete="email"
                required
                placeholder="El. paštas"
                className="h-11 w-full rounded-lg border border-gray-400 bg-white px-4 pl-11 text-sm text-gray-900 placeholder:text-gray-400 hover:border-gray-300 focus:border-[#7C4A57] focus:outline-none focus:ring-2 focus:ring-[#7C4A57]/10"
              />
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between gap-3">
              <label htmlFor="login-password" className="flex items-center gap-2 text-sm font-medium text-gray-600">
                <IconLock className="h-4 w-4 text-gray-400" />
                Slaptažodis
              </label>
              <button
                type="button"
                className="shrink-0 text-sm text-gray-700 hover:text-gray-900 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-900/10 focus-visible:ring-offset-2"
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
                    const redirectTo = resolveResetRedirectTo();
                    const { error: resetErr } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
                    if (resetErr) {
                      const msg = String(resetErr.message ?? "");
                      const lower = msg.toLowerCase();
                      if (lower.includes("redirect") && (lower.includes("not allowed") || lower.includes("not whitelisted"))) {
                        setError(
                          "Nepavyko išsiųsti atkūrimo nuorodos: neteisingas redirect URL. Patikrinkite Supabase Auth nustatymuose leidžiamus redirect URL."
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
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
                <IconLock className="h-[18px] w-[18px]" />
              </span>
              <input
                id="login-password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                placeholder="••••••••"
                className="h-11 w-full rounded-lg border border-gray-400 bg-white px-4 pl-11 text-sm text-gray-900 placeholder:text-gray-400 hover:border-gray-300 focus:border-[#7C4A57] focus:outline-none focus:ring-2 focus:ring-[#7C4A57]/10"
              />
            </div>
          </div>
        </div>

        <label className="flex cursor-pointer items-start gap-2.5 text-sm text-gray-600">
          <input
            name="remember"
            type="checkbox"
            className="accent-[#7C4A57]"
          />
          <span>Prisiminti mane šiame įrenginyje</span>
        </label>

        <button
          type="submit"
          disabled={pending}
          className="mt-4 h-11 w-full rounded-lg bg-gray-800 text-sm font-medium text-white shadow-md transition-all hover:bg-gray-900 hover:shadow-lg active:scale-[0.99] disabled:bg-gray-300 disabled:hover:bg-gray-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-900/10 focus-visible:ring-offset-2"
        >
          {pending ? "Jungiamasi…" : "Prisijungti"}
        </button>

        {error ? <p className="text-sm text-gray-900">{error}</p> : null}
        {info ? <p className="text-sm text-gray-600">{info}</p> : null}
      </form>
    </div>
  );
}
