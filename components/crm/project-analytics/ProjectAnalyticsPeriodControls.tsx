"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { ProjectAnalyticsPeriod } from "@/lib/crm/projectAnalytics";
import { CrmIsoDatePicker } from "@/components/crm/CrmIsoDatePicker";
import { PeriodFilterCalendarIcon } from "@/components/crm/PeriodFilterCalendarIcon";

function isIsoDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function clampIsoOrder(from: string, to: string): { from: string; to: string } {
  return from <= to ? { from, to } : { from: to, to: from };
}

function buildHref(projectId: string, period: ProjectAnalyticsPeriod, customFrom?: string, customTo?: string): string {
  const q = new URLSearchParams();
  q.set("tab", "apzvalga");
  q.set("period", period);
  if (period === "custom" && customFrom && customTo) {
    q.set("from", customFrom);
    q.set("to", customTo);
  }
  return `/projektai/${projectId}?${q.toString()}`;
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

export function ProjectAnalyticsPeriodControls({
  projectId,
  activePeriod,
  rangeFrom,
  rangeTo,
}: {
  projectId: string;
  activePeriod: ProjectAnalyticsPeriod;
  rangeFrom: string;
  rangeTo: string;
}) {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(rangeFrom);
  const [to, setTo] = useState(rangeTo);

  useEffect(() => {
    setFrom(rangeFrom);
    setTo(rangeTo);
  }, [rangeFrom, rangeTo]);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(e: PointerEvent) {
      const root = rootRef.current;
      if (!root) return;
      const target = e.target as Node | null;
      if (!target) return;
      if (!root.contains(target)) setOpen(false);
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

  const applyCustomDisabled = !isIsoDate(from) || !isIsoDate(to);
  const periodText = PERIOD_LABEL[activePeriod];

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-9 items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-700 shadow-sm shadow-black/5 hover:bg-zinc-50"
      >
        <PeriodFilterCalendarIcon className="shrink-0 text-zinc-400" />
        <span>{periodText}</span>
        <span className={`text-zinc-400 transition-transform ${open ? "rotate-180" : ""}`}>▾</span>
      </button>

      {open ? (
        <div className="absolute right-0 z-20 mt-2 w-[22rem] rounded-xl border border-zinc-200 bg-white p-3 shadow-xl shadow-black/10 sm:left-full sm:right-auto sm:ml-2 sm:mt-0 sm:top-0">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">Laikotarpis</div>
          <div className="grid grid-cols-2 gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setOpen(false);
                  router.push(buildHref(projectId, p.id));
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
                name="from_local"
                value={from}
                onValueChange={setFrom}
                ariaLabel="Nuo"
                inputClassName="h-9 w-full rounded-md border border-zinc-200 px-2 pr-9 text-sm text-zinc-900 outline-none focus:border-[#7C4A57] focus:ring-2 focus:ring-[#7C4A57]/10"
                buttonClassName="absolute right-1 top-0 inline-flex h-9 w-8 items-center justify-center text-zinc-500 hover:text-zinc-700"
              />
              <span className="text-zinc-400">–</span>
              <CrmIsoDatePicker
                name="to_local"
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
                router.push(buildHref(projectId, "custom", ordered.from, ordered.to));
              }}
              className="mt-2 h-9 rounded-md bg-[#7C4A57] px-3 text-sm font-medium text-white hover:bg-[#693948] disabled:cursor-not-allowed disabled:bg-zinc-200 disabled:text-zinc-500"
            >
              Taikyti
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
