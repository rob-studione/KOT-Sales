"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDate } from "@/lib/crm/format";
import type { CrmNotificationRow } from "@/lib/crm/notificationConstants";

type ApiOk = { ok: true; items: CrmNotificationRow[]; unreadCount: number };

const FOCUS_REFRESH_MIN_MS = 120_000;

export function CrmNotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<CrmNotificationRow[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const inFlightRef = useRef(false);
  const lastSuccessFetchRef = useRef(0);

  const load = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/crm/notifications", { cache: "no-store" });
      const json = (await res.json()) as ApiOk | { ok: false; error?: string };
      if (!res.ok || !json.ok) {
        setError((json as { error?: string }).error ?? "Nepavyko įkelti");
        return;
      }
      setItems(json.items);
      setUnreadCount(json.unreadCount);
      lastSuccessFetchRef.current = Date.now();
    } catch {
      setError("Tinklo klaida");
    } finally {
      inFlightRef.current = false;
      setLoading(false);
    }
  }, []);

  /** Ne critical path: idle arba vėlesnis fallback, be fetch ant mount. */
  useEffect(() => {
    const schedule = () => {
      void load();
    };
    const win = window as Window & {
      requestIdleCallback?: (cb: IdleRequestCallback, opts?: IdleRequestOptions) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (typeof win.requestIdleCallback === "function") {
      const id = win.requestIdleCallback(schedule, { timeout: 12_000 });
      return () => {
        if (typeof win.cancelIdleCallback === "function") win.cancelIdleCallback(id);
      };
    }
    const t = window.setTimeout(schedule, 4_000);
    return () => clearTimeout(t);
  }, [load]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current) return;
      if (e.target instanceof Node && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    if (!open) return;
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  /** Tik jei jau buvo sėkmingas fetch — retai atnaujinti grįžus į skirtuką. */
  useEffect(() => {
    function onVisibility() {
      if (document.visibilityState !== "visible") return;
      if (lastSuccessFetchRef.current === 0) return;
      if (Date.now() - lastSuccessFetchRef.current < FOCUS_REFRESH_MIN_MS) return;
      void load();
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [load]);

  async function markRead(id: string) {
    await fetch("/api/crm/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    void load();
    router.refresh();
  }

  async function markAllRead() {
    await fetch("/api/crm/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ markAll: true }),
    });
    void load();
    router.refresh();
  }

  function hrefFor(n: CrmNotificationRow): string {
    return `/projektai/${n.project_id}?tab=sutartys`;
  }

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
        aria-label="Pranešimai"
        aria-expanded={open}
        onPointerEnter={() => {
          void load();
        }}
        onClick={() => {
          setOpen((v) => !v);
          if (!open) void load();
        }}
      >
        <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 8a6 6 0 10-12 0c0 7-3 7-3 7h18s-3 0-3-7" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M13.73 21a2 2 0 01-3.46 0" strokeLinecap="round" />
        </svg>
        {unreadCount > 0 ? (
          <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-xs font-semibold text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 top-10 z-50 w-[min(100vw-2rem,22rem)] overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-zinc-100 px-3 py-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Pranešimai</span>
            {unreadCount > 0 ? (
              <button
                type="button"
                className="text-xs font-medium text-zinc-600 underline-offset-2 hover:text-zinc-900 hover:underline"
                onClick={() => void markAllRead()}
              >
                Pažymėti visus
              </button>
            ) : null}
          </div>
          <div className="max-h-[min(70vh,24rem)] overflow-y-auto">
            {loading && items.length === 0 ? (
              <p className="px-3 py-4 text-sm text-zinc-500">Įkeliama…</p>
            ) : error ? (
              <p className="px-3 py-4 text-sm text-red-600">{error}</p>
            ) : items.length === 0 ? (
              <p className="px-3 py-4 text-sm text-zinc-500">Nėra pranešimų</p>
            ) : (
              <ul className="divide-y divide-zinc-100">
                {items.map((n) => (
                  <li key={n.id}>
                    <Link
                      href={hrefFor(n)}
                      className={`block px-3 py-2.5 text-left transition-colors hover:bg-zinc-50 ${n.is_read ? "bg-white" : "bg-gray-50"}`}
                      onClick={() => {
                        if (!n.is_read) void markRead(n.id);
                        setOpen(false);
                      }}
                    >
                      <p className={`text-sm leading-snug ${n.is_read ? "text-zinc-700" : "font-medium text-zinc-900"}`}>
                        {n.message}
                      </p>
                      <p className="mt-1 text-xs text-zinc-400">
                        {formatDate(n.created_at.slice(0, 10))}
                        {n.type === "procurement_deadline" ? " · Viešieji pirkimai" : null}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
