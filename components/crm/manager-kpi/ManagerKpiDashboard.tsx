"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { formatDate } from "@/lib/crm/format";
import type { ManagerKpiTableRow, ManagerKpiViewModel } from "@/lib/crm/managerKpiDashboard";
import { managerKpiCompareShortLabel, type ManagerKpiPreset } from "@/lib/crm/managerKpiPeriods";
import { ManagerKpiSettingsDrawer } from "@/components/crm/manager-kpi/ManagerKpiSettingsDrawer";

const PRESETS: { id: ManagerKpiPreset; label: string }[] = [
  { id: "today", label: "Šiandien" },
  { id: "week", label: "Ši savaitė" },
  { id: "month", label: "Šis mėnuo" },
  { id: "custom", label: "Pasirinkti" },
];

function compareCaptionLine(model: ManagerKpiViewModel): string {
  const label = managerKpiCompareShortLabel(model.preset);
  if (model.preset === "custom" && model.compareRange) {
    return `${label} (${formatDate(model.compareRange.from)}–${formatDate(model.compareRange.to)})`;
  }
  return label;
}

type SortKey = "calls_pct" | "answered_pct" | "calls" | "answered" | "trend";

function fmtPct(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${n.toLocaleString("lt-LT", { maximumFractionDigits: 1 })}%`;
}

function fmtDelta(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toLocaleString("lt-LT", { maximumFractionDigits: 1 })}%`;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function ProgressBar({ value01, tone }: { value01: number; tone?: "neutral" | "ok" | "warn" | "bad" }) {
  const v = clamp01(value01);
  const resolvedTone = tone ?? (v >= 1 ? "ok" : v >= 0.8 ? "warn" : "bad");
  const bar =
    resolvedTone === "ok"
      ? "bg-emerald-600"
      : resolvedTone === "warn"
        ? "bg-amber-500"
        : resolvedTone === "bad"
          ? "bg-red-600"
          : "bg-zinc-800";
  return (
    <div className="mt-2 h-1.5 w-full rounded-full bg-zinc-100" aria-hidden>
      <div className={`h-1.5 rounded-full ${bar}`} style={{ width: `${Math.round(v * 100)}%` }} />
    </div>
  );
}

function StatusBadge({ status }: { status: ManagerKpiTableRow["status"] }) {
  const cls =
    status === "ok"
      ? "bg-emerald-100 text-emerald-900 ring-emerald-200"
      : status === "warn"
        ? "bg-amber-100 text-amber-900 ring-amber-200"
        : "bg-red-100 text-red-800 ring-red-200";
  const label = status === "ok" ? "Gerai" : status === "warn" ? "Rizika" : "Atsilieka";
  return (
    <span className={`inline-flex whitespace-nowrap rounded-full px-1.5 py-0.5 text-xs font-semibold ring-1 ${cls}`}>
      {label}
    </span>
  );
}

function KpiCard({
  label,
  actual,
  actualLabel,
  target,
  pct,
  delta,
  emphasis,
}: {
  label: string;
  actual: number;
  actualLabel?: string;
  target?: number;
  pct?: number | null;
  delta?: number | null;
  emphasis?: boolean;
}) {
  // Defensive coercion: RSC/JSON serialization can sometimes surface numeric-like values as strings.
  const targetNum = target == null ? null : Number(target);
  const hasTarget = targetNum != null && Number.isFinite(targetNum) && targetNum > 0;
  const ratio = hasTarget ? actual / targetNum : null;
  const valueLine = `${actualLabel ?? actual.toLocaleString("lt-LT")}${hasTarget ? ` / ${targetNum.toLocaleString("lt-LT")}` : ""}`;
  const baseCard =
    "group cursor-pointer rounded-xl bg-white p-4 shadow-sm transition-[transform,box-shadow] duration-150 ease-out hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 active:scale-[0.98]";
  return (
    <div
      className={
        emphasis
          ? `${baseCard} border border-zinc-300 ring-1 ring-zinc-900/5`
          : `${baseCard} border border-zinc-200/80`
      }
      suppressHydrationWarning
    >
      <div className="text-xs font-medium uppercase tracking-wide text-zinc-400">{label}</div>
      <div
        className="mt-1 text-2xl font-semibold tabular-nums text-zinc-900 transition-colors duration-150 ease-out group-hover:text-zinc-950"
        suppressHydrationWarning
      >
        {valueLine}
      </div>
      {pct != null ? (
        <div className="mt-0.5 text-sm font-medium text-zinc-600" suppressHydrationWarning>
          {fmtPct(pct)}
        </div>
      ) : null}
      {ratio != null ? <ProgressBar value01={ratio} /> : null}
      {delta != null ? <div className="mt-1 text-xs text-zinc-500">vs ankst. periodas: {fmtDelta(delta)}</div> : null}
    </div>
  );
}

function statusDetailText(r: ManagerKpiTableRow): string {
  const callsTarget = r.callsTarget ?? 0;
  const answeredTarget = r.answeredTarget ?? 0;
  const callsMissing = Math.max(0, callsTarget - r.calls);
  const answeredMissing = Math.max(0, answeredTarget - r.answered);
  const callsOver = Math.max(0, r.calls - callsTarget);
  const answeredOver = Math.max(0, r.answered - answeredTarget);

  // Choose the "worst" KPI to explain.
  const callsPct = r.callsPct ?? -1;
  const answeredPct = r.answeredPct ?? -1;
  const worst: "calls" | "answered" = callsPct <= answeredPct ? "calls" : "answered";

  if (r.status === "ok") {
    if (worst === "calls" && callsOver > 0) return `Virš: +${callsOver.toLocaleString("lt-LT")} sk.`;
    if (worst === "answered" && answeredOver > 0) return `Virš: +${answeredOver.toLocaleString("lt-LT")} ats.`;
    return "100%+";
  }

  if (worst === "calls") return `Trūksta: ${callsMissing.toLocaleString("lt-LT")} sk.`;
  return `Trūksta: ${answeredMissing.toLocaleString("lt-LT")} ats.`;
}

export function ManagerKpiDashboard({ model }: { model: ManagerKpiViewModel }) {
  const router = useRouter();
  const sp = useSearchParams();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("calls_pct");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [chartMetric, setChartMetric] = useState<"calls" | "answered" | "commercial">("calls");
  const [customFrom, setCustomFrom] = useState(model.range.from);
  const [customTo, setCustomTo] = useState(model.range.to);

  const compareOn = model.compareEnabled;

  function buildHref(next: Record<string, string | undefined>) {
    const q = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v === undefined || v === "") q.delete(k);
      else q.set(k, v);
    }
    return `/analitika/vadybininku-kpi?${q.toString()}`;
  }

  const sortedRows = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    const rows = [...model.rows];
    rows.sort((a, b) => {
      let va = 0;
      let vb = 0;
      if (sortKey === "calls_pct") {
        va = a.callsPct ?? -1;
        vb = b.callsPct ?? -1;
      } else if (sortKey === "answered_pct") {
        va = a.answeredPct ?? -1;
        vb = b.answeredPct ?? -1;
      } else if (sortKey === "calls") {
        va = a.calls;
        vb = b.calls;
      } else if (sortKey === "answered") {
        va = a.answered;
        vb = b.answered;
      } else {
        va = (a.trendCallsActual ?? 0) + (a.trendAnsweredActual ?? 0);
        vb = (b.trendCallsActual ?? 0) + (b.trendAnsweredActual ?? 0);
      }
      if (va === vb) return a.name.localeCompare(b.name);
      return va > vb ? dir : -dir;
    });
    return rows;
  }, [model.rows, sortKey, sortDir]);

  const chartMax = useMemo(() => {
    let m = 1;
    for (const p of model.chart) {
      m = Math.max(m, p[chartMetric]);
    }
    return m;
  }, [model.chart, chartMetric]);

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir(k === "calls" || k === "answered" ? "desc" : "desc");
    }
  }

  const thBtn = (k: SortKey, label: string) => (
    <button type="button" className="inline font-semibold text-zinc-700 hover:text-zinc-900" onClick={() => toggleSort(k)}>
      {label}
      {sortKey === k ? (sortDir === "desc" ? " ↓" : " ↑") : ""}
    </button>
  );

  const summary = useMemo(() => {
    const total = model.rows.length;
    const ok = model.rows.filter((r) => r.status === "ok").length;
    const bad = model.rows.filter((r) => r.status === "bad").length;
    const warn = Math.max(0, total - ok - bad);
    return { total, ok, warn, bad };
  }, [model.rows]);

  // Keep managers table compact and separately controlled.
  const managersShell = "w-full max-w-[1200px]";

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900">Vadybininkų KPI</h1>
          <p className="mt-1 text-sm text-zinc-500">Komandos aktyvumo ir KPI vykdymo suvestinė</p>
          <p className="mt-2 text-xs text-zinc-500">
            Laikotarpis: {formatDate(model.range.from)} — {formatDate(model.range.to)}
            <br />
            Darbo dienos: {model.workingDayCount}
          </p>
          {compareOn && model.compareRange ? (
            <p className="mt-1 text-xs text-zinc-400">Lyginama su: {compareCaptionLine(model)}</p>
          ) : null}
        </div>
        <div className="flex w-full min-w-0 flex-col gap-3 lg:max-w-none lg:items-end">
          <div className="flex w-full flex-wrap items-center justify-end gap-x-1 gap-y-2 sm:gap-x-1.5">
            {PRESETS.map((p) => (
              <Link
                key={p.id}
                href={buildHref({
                  period: p.id,
                  ...(p.id !== "custom" ? { from: undefined, to: undefined } : {}),
                })}
                className={
                  model.preset === p.id
                    ? "shrink-0 rounded-lg bg-zinc-900 px-2.5 py-1.5 text-sm font-medium text-white sm:px-3"
                    : "shrink-0 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-sm font-medium text-zinc-700 shadow-sm hover:bg-zinc-50 sm:px-3"
                }
              >
                {p.label}
              </Link>
            ))}
            <span className="hidden h-4 w-px shrink-0 bg-zinc-200 sm:block" aria-hidden />
            <label className="flex max-w-[min(100%,18rem)] shrink cursor-pointer items-center gap-2 text-sm text-zinc-700 sm:max-w-none">
              <input
                type="checkbox"
                className="shrink-0"
                checked={compareOn}
                onChange={() => {
                  router.push(buildHref({ compare: compareOn ? undefined : "1" }));
                }}
              />
              <span className="leading-snug">Lyginti su ankstesniu periodu</span>
            </label>
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="shrink-0 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-sm font-medium text-zinc-800 shadow-sm hover:bg-zinc-50 sm:px-3"
            >
              KPI nustatymai
            </button>
          </div>
          {model.preset === "custom" ? (
            <form
              className="flex flex-wrap items-end justify-end gap-2"
              action="/analitika/vadybininku-kpi"
              method="get"
            >
              <input type="hidden" name="period" value="custom" />
              {compareOn ? <input type="hidden" name="compare" value="1" /> : null}
              <label className="text-xs text-zinc-500">
                Nuo
                <input
                  name="from"
                  type="date"
                  className="ml-1 rounded-md border border-zinc-200 px-2 py-1 text-sm"
                  defaultValue={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                />
              </label>
              <label className="text-xs text-zinc-500">
                Iki
                <input
                  name="to"
                  type="date"
                  className="ml-1 rounded-md border border-zinc-200 px-2 py-1 text-sm"
                  defaultValue={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                />
              </label>
              <button
                type="submit"
                className="rounded-lg bg-zinc-100 px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-200"
              >
                Taikyti
              </button>
            </form>
          ) : null}
        </div>
      </div>

      {model.warnings.length > 0 ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {model.warnings.map((w, i) => (
            <p key={i}>{w}</p>
          ))}
        </div>
      ) : null}

      <section aria-label="Komandos suvestinė">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-400">Komanda</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
          <KpiCard
            label="Skambučiai"
            actual={model.team.calls}
            target={model.team.callsTarget}
            pct={model.team.callsKpiPct}
            delta={model.team.trendCallsActual}
            emphasis
          />
          <KpiCard
            label="Atsiliepė"
            actual={model.team.answered}
            target={model.team.answeredTarget}
            pct={model.team.answeredKpiPct}
            delta={model.team.trendAnsweredActual}
          />
          <KpiCard label="Neatsiliepė" actual={model.team.notAnswered} />
          <KpiCard
            label="Atsiliepimo %"
            actual={model.team.answerRatePct ?? 0}
            actualLabel={model.team.answerRatePct == null ? "—" : undefined}
            pct={model.team.answerRatePct}
            delta={model.team.trendAnswerRatePP}
          />
        </div>
        <p className="mt-2 text-xs text-zinc-500">
          Skambučių KPI: tik <span className="font-medium">action_type = call</span> ir ne tuščias{" "}
          <span className="font-medium">performed_by</span> (be priskyrimo pagal kortelės{" "}
          <span className="font-medium">assigned_to</span>). Komerciniai — su{" "}
          <span className="font-medium">performed_by</span> arba <span className="font-medium">assigned_to</span>. Tik{" "}
          <span className="font-medium">is_kpi_tracked</span>. „Atsiliepė“ / „neatsiliepė“ pagal{" "}
          <span className="font-medium">ANSWERED_STATUSES</span> / <span className="font-medium">NOT_ANSWERED_STATUSES</span> (
          <code className="text-xs">lib/crm/projectBoardConstants.ts</code>).
        </p>
      </section>

      <section aria-label="Vadybininkai" className={managersShell}>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-400">Vadybininkai</h2>
        <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-500">
          <span>
            <span className="font-semibold text-zinc-700">{summary.total}</span> vadybininkų
          </span>
          <span>
            Vykdo KPI: <span className="font-semibold text-zinc-700">{summary.ok}</span>
          </span>
          <span>
            Rizika: <span className="font-semibold text-zinc-700">{summary.warn}</span>
          </span>
          <span>
            Atsilieka: <span className="font-semibold text-zinc-700">{summary.bad}</span>
          </span>
        </div>
        <div className="overflow-x-auto rounded-xl border border-zinc-200/80 bg-white shadow-sm w-full max-w-[1320px]">
          <table className="w-full table-fixed text-left text-sm">
            <colgroup>
              {/* Name: 1.5fr, Calls: 1fr, Answered: 1fr, Status: auto-ish (fixed) */}
              <col className="w-[42%]" />
              <col className="w-[29%]" />
              <col className="w-[29%]" />
              <col className="w-[200px]" />
              {compareOn ? <col className="w-[120px]" /> : null}
            </colgroup>
            <thead className="border-b border-zinc-100 bg-zinc-50/80 text-xs font-semibold uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-3 py-3 pr-7">Vadybininkas</th>
                <th className="px-3 py-3 text-right tabular-nums">
                  <div className="flex flex-col items-end">
                    {thBtn("calls", "Skambučiai")}
                    <span className="mt-0.5 text-xs font-medium normal-case tracking-normal text-zinc-400">
                      {thBtn("calls_pct", "KPI %")}
                    </span>
                  </div>
                </th>
                <th className="px-3 py-3 text-right tabular-nums">
                  <div className="flex flex-col items-end">
                    {thBtn("answered", "Atsiliepė")}
                    <span className="mt-0.5 text-xs font-medium normal-case tracking-normal text-zinc-400">
                      {thBtn("answered_pct", "KPI %")}
                    </span>
                  </div>
                </th>
                <th className="px-3 py-3 text-right whitespace-nowrap">Statusas</th>
                {compareOn ? <th className="px-3 py-3 text-right">{thBtn("trend", "Pokytis")}</th> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {sortedRows.map((r) => (
                <tr key={r.userId} className="hover:bg-zinc-50/60">
                  <td className="px-3 py-2.5 pr-7">
                    <div className="flex items-center gap-2">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-100 text-xs font-semibold text-zinc-600">
                        {r.initials}
                      </span>
                      <span className="font-medium text-zinc-900">{r.name}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    <div className="flex flex-col items-end gap-1">
                      <div className="text-zinc-900" suppressHydrationWarning>
                        <span className="font-medium">{r.calls.toLocaleString("lt-LT")}</span>
                        <span className="text-zinc-500"> / {r.callsTarget.toLocaleString("lt-LT")}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-zinc-700" suppressHydrationWarning>
                          {fmtPct(r.callsPct)}
                        </span>
                        {r.callsTarget > 0 ? (
                          <div className="w-24">
                            <ProgressBar value01={r.calls / r.callsTarget} />
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    <div className="flex flex-col items-end gap-1">
                      <div className="text-zinc-900" suppressHydrationWarning>
                        <span className="font-medium">{r.answered.toLocaleString("lt-LT")}</span>
                        <span className="text-zinc-500"> / {r.answeredTarget.toLocaleString("lt-LT")}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-zinc-700" suppressHydrationWarning>
                          {fmtPct(r.answeredPct)}
                        </span>
                        {r.answeredTarget > 0 ? (
                          <div className="w-24">
                            <ProgressBar value01={r.answered / r.answeredTarget} />
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 pl-6">
                    <div className="flex flex-col items-end gap-1 text-right">
                      <StatusBadge status={r.status} />
                      <span className="text-xs font-medium text-zinc-500">{statusDetailText(r)}</span>
                    </div>
                  </td>
                  {compareOn ? (
                    <td className="px-3 py-2.5 text-right text-xs text-zinc-600">
                      <span>
                        sk.: {fmtDelta(r.trendCallsActual)}
                        <br />
                        ats.: {fmtDelta(r.trendAnsweredActual)}
                      </span>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-label="Dinamika">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Dinamika</h2>
          <div className="flex gap-1 rounded-lg border border-zinc-200 bg-white p-0.5 text-xs">
            {(
              [
                ["calls", "Skambučiai"],
                ["answered", "Atsiliepė"],
                ["commercial", "Komerciniai"],
              ] as const
            ).map(([k, lab]) => (
              <button
                key={k}
                type="button"
                onClick={() => setChartMetric(k)}
                className={
                  chartMetric === k
                    ? "rounded-md bg-zinc-900 px-2.5 py-1 font-medium text-white"
                    : "rounded-md px-2.5 py-1 font-medium text-zinc-600 hover:bg-zinc-50"
                }
              >
                {lab}
              </button>
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-zinc-200/80 bg-white p-4 shadow-sm">
          {model.chart.some((p) => p.calls > 0 || p.answered > 0 || p.commercial > 0) ? (
            <>
              <div className="flex h-52 items-end gap-px sm:gap-0.5">
                {model.chart.map((p) => {
                  const v = p[chartMetric];
                  const h = Math.round((v / chartMax) * 100);
                  return (
                    <div key={p.date} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1">
                      <div
                        className="w-full max-w-[14px] rounded-t bg-zinc-800/85 sm:max-w-[18px]"
                        style={{ height: `${Math.max(4, h)}%` }}
                        title={`${p.date}: ${v}`}
                      />
                      <span className="hidden text-xs text-zinc-400 sm:block">
                        {p.date.slice(8, 10)}.{p.date.slice(5, 7)}
                      </span>
                    </div>
                  );
                })}
              </div>
              <p className="mt-3 text-xs text-zinc-500">Komandos suma per dieną (tik su priskirtu vadybininku).</p>
            </>
          ) : (
            <div className="flex h-52 items-center justify-center text-sm text-zinc-500">Nėra duomenų šiame laikotarpyje</div>
          )}
        </div>
      </section>

      {settingsOpen ? (
        <ManagerKpiSettingsDrawer
          key={`${model.range.from}-${model.range.to}-${model.workingDayCount}-${model.rows.map((r) => r.userId).join(",")}`}
          onClose={() => {
            setSettingsOpen(false);
            router.refresh();
          }}
          rows={model.rows}
          workingDayCount={model.workingDayCount}
        />
      ) : null}
    </div>
  );
}
