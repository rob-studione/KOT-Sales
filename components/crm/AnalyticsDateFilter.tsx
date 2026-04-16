"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import type { SalesDashboardPeriod, SalesDashboardRange } from "@/lib/crm/salesAnalyticsDashboard";

const BTN =
  "cursor-pointer rounded-md border px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50";
const ACTIVE = "border-zinc-900 bg-zinc-900 text-white";
const IDLE = "border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50";

export function AnalyticsDateFilter({
  period,
  range,
}: {
  period: SalesDashboardPeriod;
  range: SalesDashboardRange;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function navigate(next: URLSearchParams) {
    const q = next.toString();
    startTransition(() => {
      router.push(q ? `${pathname}?${q}` : pathname);
    });
  }

  function setPeriod(p: SalesDashboardPeriod) {
    if (p === period) return;
    if (isPending) return;
    const next = new URLSearchParams(searchParams.toString());
    next.set("period", p);
    if (p !== "custom") {
      next.delete("from");
      next.delete("to");
    }
    navigate(next);
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={isPending}
          className={`${BTN} ${period === "today" ? ACTIVE : IDLE}`}
          onClick={() => setPeriod("today")}
        >
          Šiandien
        </button>
        <button
          type="button"
          disabled={isPending}
          className={`${BTN} ${period === "week" ? ACTIVE : IDLE}`}
          onClick={() => setPeriod("week")}
        >
          Šią savaitę
        </button>
        <button
          type="button"
          disabled={isPending}
          className={`${BTN} ${period === "month" ? ACTIVE : IDLE}`}
          onClick={() => setPeriod("month")}
        >
          Šį mėnesį
        </button>
        <button
          type="button"
          disabled={isPending}
          className={`${BTN} ${period === "custom" ? ACTIVE : IDLE}`}
          onClick={() => setPeriod("custom")}
        >
          Pasirinkti laikotarpį
        </button>
      </div>

      {period === "custom" ? (
        <form className="flex flex-wrap items-center gap-2" action={pathname} method="get">
          <input type="hidden" name="period" value="custom" />
          <label className="flex items-center gap-1.5 text-xs text-zinc-600">
            Nuo
            <input
              type="date"
              name="from"
              required
              defaultValue={range.from}
              className="rounded-md border border-zinc-200 px-2 py-1 text-sm text-zinc-900"
            />
          </label>
          <label className="flex items-center gap-1.5 text-xs text-zinc-600">
            Iki
            <input
              type="date"
              name="to"
              required
              defaultValue={range.to}
              className="rounded-md border border-zinc-200 px-2 py-1 text-sm text-zinc-900"
            />
          </label>
          <button type="submit" className={`${BTN} ${IDLE}`}>
            Taikyti
          </button>
        </form>
      ) : null}

      <p className="text-xs text-zinc-500 sm:text-right">
        Rodoma: <span className="font-medium text-zinc-700">{range.from}</span> —{" "}
        <span className="font-medium text-zinc-700">{range.to}</span>
      </p>
    </div>
  );
}
