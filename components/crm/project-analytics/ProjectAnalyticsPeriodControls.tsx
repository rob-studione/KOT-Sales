"use client";

import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ProjectAnalyticsPeriod } from "@/lib/crm/projectAnalytics";
import { CrmIsoDatePicker } from "@/components/crm/CrmIsoDatePicker";
import { PeriodFilterCalendarIcon } from "@/components/crm/PeriodFilterCalendarIcon";

function isIsoDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function clampIsoOrder(from: string, to: string): { from: string; to: string } {
  return from <= to ? { from, to } : { from: to, to: from };
}

const PRESETS: Array<{ id: Exclude<ProjectAnalyticsPeriod, "custom">; label: string }> = [
  { id: "today", label: "Šiandien" },
  { id: "week", label: "Ši savaitė" },
  { id: "month", label: "Šis mėnuo" },
  { id: "prev_month", label: "Praėjęs mėnuo" },
  { id: "year", label: "Šie metai" },
  { id: "all_time", label: "Visas laikotarpis" },
];

const PERIOD_LABEL: Record<ProjectAnalyticsPeriod, string> = {
  today: "Šiandien",
  week: "Ši savaitė",
  month: "Šis mėnuo",
  prev_month: "Praėjęs mėnuo",
  year: "Šie metai",
  all_time: "Visas laikotarpis",
  custom: "Pasirinktas intervalas",
};

export type ProjectAnalyticsPeriodParamKeys = {
  period: string;
  from: string;
  to: string;
};

const DEFAULT_PARAM_KEYS: ProjectAnalyticsPeriodParamKeys = {
  period: "period",
  from: "from",
  to: "to",
};

const MENU_PAD = 8;
/** Pastumti panelę dešiniau nuo mygtuko dešinio krašto. */
const NUDGE_RIGHT_PX = 20;
/** Šiek tiek užlipti ant mygtuko — panelė aukščiau. */
const NUDGE_UP_PX = 10;

export function ProjectAnalyticsPeriodControls({
  projectId,
  activePeriod,
  rangeFrom,
  rangeTo,
  paramKeys = DEFAULT_PARAM_KEYS,
  heading = "Laikotarpis",
  tabSegment = "apzvalga",
}: {
  projectId: string;
  activePeriod: ProjectAnalyticsPeriod;
  rangeFrom: string;
  rangeTo: string;
  /** URL query raktai — veiklai `period/from/to`, pardavimams `salesPeriod/salesFrom/salesTo`. */
  paramKeys?: ProjectAnalyticsPeriodParamKeys;
  heading?: string;
  /** Kelias po `/projektai/[id]/` — `apzvalga` | `pajamos` ir t. t. */
  tabSegment?: string;
}) {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(rangeFrom);
  const [to, setTo] = useState(rangeTo);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setFrom(rangeFrom);
    setTo(rangeTo);
  }, [rangeFrom, rangeTo]);

  useLayoutEffect(() => {
    if (!open) {
      setCoords(null);
      return;
    }
    const btn = rootRef.current?.querySelector("button");
    const menu = menuRef.current;
    if (!btn || !menu) return;

    function place() {
      const b = btn!.getBoundingClientRect();
      const m = menu!.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      let left = b.right - m.width + NUDGE_RIGHT_PX;
      left = Math.max(MENU_PAD, Math.min(left, vw - m.width - MENU_PAD));

      const spaceBelow = vh - b.bottom - MENU_PAD;
      const spaceAbove = b.top - MENU_PAD;
      const openUp = spaceBelow < m.height && spaceAbove > spaceBelow;

      let top = openUp ? b.top - m.height + NUDGE_UP_PX : b.bottom - NUDGE_UP_PX;
      top = Math.max(MENU_PAD, Math.min(top, vh - m.height - MENU_PAD));

      setCoords({ top, left });
    }

    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node | null;
      if (!target) return;
      if (rootRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function pushPeriod(period: ProjectAnalyticsPeriod, customFrom?: string, customTo?: string) {
    const q = new URLSearchParams(window.location.search);
    q.set(paramKeys.period, period);
    if (period === "custom" && customFrom && customTo) {
      q.set(paramKeys.from, customFrom);
      q.set(paramKeys.to, customTo);
    } else {
      q.delete(paramKeys.from);
      q.delete(paramKeys.to);
    }
    const qs = q.toString();
    const base = `/projektai/${projectId}/${tabSegment}`;
    router.push(qs ? `${base}?${qs}` : base);
  }

  const applyCustomDisabled = !isIsoDate(from) || !isIsoDate(to);
  const periodText = PERIOD_LABEL[activePeriod];

  const menu =
    open && mounted ? (
      <div
        ref={menuRef}
        style={
          coords
            ? { position: "fixed", top: coords.top, left: coords.left, width: "min(22rem, calc(100vw - 2rem))" }
            : { position: "fixed", top: 0, left: 0, width: "min(22rem, calc(100vw - 2rem))", visibility: "hidden" }
        }
        className="z-[80] rounded-xl border border-zinc-200 bg-white p-3 shadow-xl shadow-black/10"
      >
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">{heading}</div>
        <div className="grid grid-cols-2 gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                setOpen(false);
                pushPeriod(p.id);
              }}
              className={
                activePeriod === p.id
                  ? "rounded-md border border-[#7C4A57] bg-white px-2.5 py-2 text-left text-sm font-medium text-[#7C4A57]"
                  : "rounded-md border border-zinc-200 bg-white px-2.5 py-2 text-left text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              }
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="mt-3 border-t border-zinc-100 pt-3">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">Pasirinktas intervalas</div>
          <div className="flex items-center gap-2">
            <CrmIsoDatePicker
              name={`${paramKeys.from}_local`}
              value={from}
              onValueChange={setFrom}
              ariaLabel="Nuo"
              inputClassName="h-9 w-full rounded-md border border-zinc-200 px-2 pr-9 text-sm text-zinc-900 outline-none focus:border-[#7C4A57] focus:ring-2 focus:ring-[#7C4A57]/10"
              buttonClassName="absolute right-1 top-0 inline-flex h-9 w-8 items-center justify-center text-zinc-500 hover:text-zinc-700"
            />
            <span className="text-zinc-400">–</span>
            <CrmIsoDatePicker
              name={`${paramKeys.to}_local`}
              value={to}
              onValueChange={setTo}
              ariaLabel="Iki"
              inputClassName="h-9 w-full rounded-md border border-zinc-200 px-2 pr-9 text-sm text-zinc-900 outline-none focus:border-[#7C4A57] focus:ring-2 focus:ring-[#7C4A57]/10"
              buttonClassName="absolute right-1 top-0 inline-flex h-9 w-8 items-center justify-center text-zinc-500 hover:text-zinc-700"
            />
          </div>
          <button
            type="button"
            disabled={applyCustomDisabled}
            onClick={() => {
              if (applyCustomDisabled) return;
              const ordered = clampIsoOrder(from, to);
              setOpen(false);
              pushPeriod("custom", ordered.from, ordered.to);
            }}
            className="mt-2 h-9 rounded-md bg-[#7C4A57] px-3 text-sm font-medium text-white hover:bg-[#693948] disabled:cursor-not-allowed disabled:bg-zinc-200 disabled:text-zinc-500"
          >
            Taikyti
          </button>
        </div>
      </div>
    ) : null;

  return (
    <div ref={rootRef} className="relative isolate">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-9 max-w-full items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-700 shadow-sm shadow-black/5 hover:bg-zinc-50"
      >
        <PeriodFilterCalendarIcon className="shrink-0 text-zinc-400" />
        <span className="truncate">{periodText}</span>
        <span className={`shrink-0 text-zinc-400 transition-transform ${open ? "rotate-180" : ""}`}>▾</span>
      </button>
      {menu ? createPortal(menu, document.body) : null}
    </div>
  );
}
