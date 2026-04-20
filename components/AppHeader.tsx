"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { CurrentCrmUser } from "@/lib/crm/currentUser";
import { CrmNotificationBell } from "@/components/crm/CrmNotificationBell";

function initialsFromNameOrEmail(name: string, email: string): string {
  const t = (name ?? "").trim();
  if (t) {
    const parts = t.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0]!.slice(0, 1) + parts[1]!.slice(0, 1)).toUpperCase();
    return t.slice(0, 2).toUpperCase();
  }
  const e = (email ?? "").trim();
  if (!e) return "?";
  return e.slice(0, 2).toUpperCase();
}

function displayName(u: CurrentCrmUser): string {
  const fn = (u.first_name ?? "").trim();
  const ln = (u.last_name ?? "").trim();
  const full = [fn, ln].filter(Boolean).join(" ").trim();
  return full || u.email;
}

export function AppHeader({
  user,
  onOpenMyAccount,
}: {
  user: CurrentCrmUser | null;
  onOpenMyAccount?: () => void;
}) {
  const router = useRouter();

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!menuRef.current) return;
      if (e.target instanceof Node && !menuRef.current.contains(e.target)) setMenuOpen(false);
    }
    if (!menuOpen) return;
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  const avatar = useMemo(() => {
    if (!user) return null;
    return {
      src: user.avatar_url,
      initials: initialsFromNameOrEmail(displayName(user), user.email),
    };
  }, [user]);

  return (
    <header
      className="sticky top-0 z-40 flex h-14 shrink-0 items-center justify-between gap-4 border-b border-zinc-200 bg-white px-4 backdrop-blur-sm sm:px-6"
      role="banner"
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <Link
          href="/dashboard"
          className="inline-flex shrink-0 cursor-pointer items-center gap-2 text-2xl font-semibold leading-none tracking-tight text-zinc-900 transition-colors hover:text-zinc-700"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/logo.svg"
            alt=""
            className="inline-block h-[38px] w-[38px] rounded-md"
          />
          <span className="font-bold">KoT</span>{" "}
          <span className="font-normal text-zinc-800">Sales</span>
        </Link>
      </div>

      <div className="flex shrink-0 items-center gap-0.5 text-zinc-300 sm:gap-1" aria-label="Vieta paieškai, veiksmams ir paskyrai">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-md" aria-hidden>
          <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3-4.3" strokeLinecap="round" />
          </svg>
        </span>
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-md" aria-hidden>
          <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14M5 12h14" strokeLinecap="round" />
          </svg>
        </span>
        {user ? <CrmNotificationBell /> : null}
        <div className="relative ml-1" ref={menuRef}>
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-zinc-200 bg-zinc-50 text-zinc-700 hover:bg-zinc-100"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Paskyra"
          >
            {avatar?.src ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatar.src} alt="" className="h-8 w-8 rounded-full object-cover" />
            ) : (
              <span className="text-xs font-semibold text-zinc-600">{avatar?.initials ?? "?"}</span>
            )}
          </button>

          {menuOpen ? (
            <div className="absolute right-0 top-10 z-50 w-44 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-lg">
              <button
                type="button"
                className="w-full px-3 py-2.5 text-left text-sm text-zinc-800 hover:bg-zinc-50"
                onClick={() => {
                  setMenuOpen(false);
                  onOpenMyAccount?.();
                }}
              >
                Mano paskyra
              </button>
              <button
                type="button"
                className="w-full px-3 py-2.5 text-left text-sm text-zinc-800 hover:bg-zinc-50"
                onClick={async () => {
                  setMenuOpen(false);
                  const supabase = createSupabaseBrowserClient();
                  await supabase.auth.signOut();
                  router.replace("/login");
                  router.refresh();
                }}
              >
                Atsijungti
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
