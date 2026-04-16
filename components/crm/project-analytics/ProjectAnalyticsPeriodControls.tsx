"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { ProjectAnalyticsPeriod } from "@/lib/crm/projectAnalytics";

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function isIsoDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function clampIsoOrder(from: string, to: string): { from: string; to: string } {
  return from <= to ? { from, to } : { from: to, to: from };
}

function buildHref(
  projectId: string,
  period: ProjectAnalyticsPeriod,
  customFrom?: string,
  customTo?: string
): string {
  const q = new URLSearchParams();
  q.set("tab", "apzvalga");
  q.set("period", period);
  if (period === "custom" && customFrom && customTo) {
    q.set("from", customFrom);
    q.set("to", customTo);
  }
  return `/projektai/${projectId}?${q.toString()}`;
}

const presets: { id: ProjectAnalyticsPeriod; label: string }[] = [
  { id: "today", label: "Šiandien" },
  { id: "week", label: "Ši savaitė" },
  { id: "month", label: "Šis mėnuo" },
];

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
  const [from, setFrom] = useState<string>(rangeFrom);
  const [to, setTo] = useState<string>(rangeTo);

  const applyCustom = useCallback(() => {
    if (!isIsoDate(from) || !isIsoDate(to)) return;
    const ordered = clampIsoOrder(from, to);
    router.push(buildHref(projectId, "custom", ordered.from, ordered.to));
  }, [from, to, projectId, router]);

  useEffect(() => {
    setFrom(rangeFrom);
    setTo(rangeTo);
  }, [rangeFrom, rangeTo]);

  return (
    <div className="flex flex-wrap items-center justify-end gap-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {presets.map(({ id, label }) => (
          <Link
            key={id}
            href={buildHref(projectId, id)}
            className={
              activePeriod === id
                ? "inline-flex h-9 items-center rounded-lg bg-zinc-900 px-3 text-sm font-medium text-white"
                : "inline-flex h-9 items-center rounded-lg border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-700 shadow-sm shadow-black/5 hover:bg-zinc-50"
            }
          >
            {label}
          </Link>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="h-9 w-[11.25rem] rounded-lg border border-zinc-200 bg-white px-2.5 text-sm text-zinc-900 shadow-sm shadow-black/5 focus:border-zinc-300 focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
          aria-label="Nuo"
        />
        <span className="px-1 text-sm font-medium text-zinc-500">–</span>
        <input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="h-9 w-[11.25rem] rounded-lg border border-zinc-200 bg-white px-2.5 text-sm text-zinc-900 shadow-sm shadow-black/5 focus:border-zinc-300 focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
          aria-label="Iki"
        />
        <button
          type="button"
          onClick={applyCustom}
          disabled={!isIsoDate(from) || !isIsoDate(to)}
          className="h-9 rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white shadow-sm shadow-black/10 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-200 disabled:text-zinc-500"
        >
          Taikyti
        </button>
      </div>
    </div>
  );
}
