import { formatDate, formatMoney } from "@/lib/crm/format";
import type { ProjectAnalyticsPeriod } from "@/lib/crm/projectAnalytics";
import type { ProcurementDashboardAnalyticsDto } from "@/lib/crm/procurementAnalytics";
import { ProjectAnalyticsPeriodControls } from "@/components/crm/project-analytics/ProjectAnalyticsPeriodControls";

function KpiCard({
  label,
  value,
  sub,
  compact,
}: {
  label: string;
  value: string | number;
  sub?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={`group cursor-pointer rounded-xl border border-zinc-200/80 bg-white shadow-sm transition-[transform,box-shadow,border-color] duration-150 ease-out hover:-translate-y-1 hover:border-zinc-300/90 hover:shadow-lg active:translate-y-0 active:scale-[0.98] ${
        compact ? "p-3" : "p-4"
      }`}
    >
      <div className="text-xs font-medium uppercase tracking-wide text-zinc-400">{label}</div>
      <div
        className={`mt-1 font-semibold tabular-nums tracking-tight text-zinc-900 transition-colors duration-150 ease-out group-hover:text-zinc-950 ${
          compact ? "text-2xl" : "text-3xl"
        }`}
      >
        {value}
      </div>
      {sub ? <div className="mt-0.5 text-xs text-zinc-500">{sub}</div> : null}
    </div>
  );
}

export function ProcurementAnalyticsView({
  projectId,
  period,
  data,
}: {
  projectId: string;
  period: ProjectAnalyticsPeriod;
  data: ProcurementDashboardAnalyticsDto;
}) {
  const { range, totals, period: per } = data;
  const conv =
    per.contactedConversionPercent == null
      ? "—"
      : `${per.contactedConversionPercent.toLocaleString("lt-LT", { maximumFractionDigits: 1 })}%`;

  function pct(n: number, d: number): string {
    if (!Number.isFinite(n) || !Number.isFinite(d) || d <= 0) return "—";
    return `${((n / d) * 100).toLocaleString("lt-LT", { maximumFractionDigits: 1 })}%`;
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-zinc-900">Viešieji pirkimai — apžvalga</h2>
            <p className="mt-1 text-sm text-zinc-500">
              {range.from === range.to ? formatDate(range.from) : `${formatDate(range.from)} — ${formatDate(range.to)}`} · tik šis
              projektas
            </p>
            <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
              <span className="text-zinc-500" title="Bendra visų sutarčių vertė projekte">
                Potencialas
              </span>
              <span className="font-semibold tabular-nums text-zinc-900">{formatMoney(totals.totalValueEur)}</span>
            </div>
          </div>
        </div>
        <ProjectAnalyticsPeriodControls
          key={`${range.from}-${range.to}-${period}`}
          projectId={projectId}
          activePeriod={period}
          rangeFrom={range.from}
          rangeTo={range.to}
        />
      </div>

      <section>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-400">Funnel</h3>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr] lg:items-stretch">
              <div className="group cursor-pointer rounded-xl border border-zinc-200/80 bg-white p-5 shadow-sm transition-[transform,box-shadow,border-color] duration-150 ease-out hover:-translate-y-1 hover:border-zinc-300/90 hover:shadow-lg active:translate-y-0 active:scale-[0.98]">
                <div className="text-xs font-medium uppercase tracking-wide text-zinc-400">Sutartys</div>
                <div className="mt-1 text-4xl font-semibold tabular-nums tracking-tight text-zinc-900 transition-colors duration-150 ease-out group-hover:text-zinc-950">
                  {totals.contracts}
                </div>
              </div>
              <div className="hidden items-center justify-center text-2xl text-zinc-300 lg:flex">→</div>
              <div className="group cursor-pointer rounded-xl border border-zinc-200/80 bg-white p-5 shadow-sm transition-[transform,box-shadow,border-color] duration-150 ease-out hover:-translate-y-1 hover:border-zinc-300/90 hover:shadow-lg active:translate-y-0 active:scale-[0.98]">
                <div className="text-xs font-medium uppercase tracking-wide text-zinc-400">Skambinta</div>
                <div className="mt-1 text-4xl font-semibold tabular-nums tracking-tight text-zinc-900 transition-colors duration-150 ease-out group-hover:text-zinc-950">
                  {totals.calledWorkItems}
                </div>
                <div className="mt-1 text-sm font-semibold text-zinc-800">
                  {pct(totals.calledWorkItems, totals.contracts)}{" "}
                  <span className="font-medium text-zinc-500">nuo visų</span>
                </div>
              </div>
              <div className="hidden items-center justify-center text-2xl text-zinc-300 lg:flex">→</div>
              <div className="group cursor-pointer rounded-xl border border-zinc-200/80 bg-white p-5 shadow-sm transition-[transform,box-shadow,border-color] duration-150 ease-out hover:-translate-y-1 hover:border-zinc-300/90 hover:shadow-lg active:translate-y-0 active:scale-[0.98]">
                <div className="text-xs font-medium uppercase tracking-wide text-zinc-400">Susisiekta</div>
                <div className="mt-1 text-4xl font-semibold tabular-nums tracking-tight text-zinc-900 transition-colors duration-150 ease-out group-hover:text-zinc-950">
                  {totals.contacted}
                </div>
                <div className="mt-1 text-sm font-semibold text-zinc-800">
                  {pct(totals.contacted, totals.calledWorkItems)}{" "}
                  <span className="font-medium text-zinc-500">nuo skambinta</span>
                </div>
              </div>
              <div className="hidden items-center justify-center text-2xl text-zinc-300 lg:flex">→</div>
              <div className="group cursor-pointer rounded-xl border border-zinc-200/80 bg-white p-5 shadow-sm transition-[transform,box-shadow,border-color] duration-150 ease-out hover:-translate-y-1 hover:border-zinc-300/90 hover:shadow-lg active:translate-y-0 active:scale-[0.98]">
                <div className="text-xs font-medium uppercase tracking-wide text-zinc-400">Pakviesta / įtraukti</div>
                <div className="mt-1 text-4xl font-semibold tabular-nums tracking-tight text-zinc-900 transition-colors duration-150 ease-out group-hover:text-zinc-950">
                  {totals.invitedOrIncluded}
                </div>
                <div className="mt-1 text-sm font-semibold text-zinc-800">
                  {pct(totals.invitedOrIncluded, totals.contacted)}{" "}
                  <span className="font-medium text-zinc-500">nuo susisiekta</span>
                </div>
              </div>
            </div>
          </div>

          {/* Potencialas perkeltas į header (statinis KPI). */}
        </div>
      </section>

      <section>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-400">Aktyvumas (pasirinktas laikotarpis)</h3>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-2">
          <KpiCard label="Skambučiai" value={per.calls} sub="per laikotarpį" />
          <KpiCard label="Susisiekimo konversija" value={conv} sub="susisiekta / skambinta" />
        </div>
      </section>
    </div>
  );
}

