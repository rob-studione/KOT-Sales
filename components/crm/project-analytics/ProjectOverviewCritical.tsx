import "server-only";

import { formatDate } from "@/lib/crm/format";
import {
  type ProjectAnalyticsPeriod,
  type ProjectAnalyticsRange,
  fetchProjectOverviewCriticalKpis,
} from "@/lib/crm/projectAnalytics";
import { CallsByDayBarChart } from "@/components/crm/CallsByDayBarChart";
import { ProjectAnalyticsPeriodControls } from "@/components/crm/project-analytics/ProjectAnalyticsPeriodControls";
import { createSupabaseSsrReadOnlyClient } from "@/lib/supabase/ssr";

function KpiCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-xl border border-zinc-200/80 bg-white p-4 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wide text-zinc-400">{label}</div>
      <div className="mt-1 text-3xl font-semibold tabular-nums tracking-tight text-zinc-900">{value}</div>
      {sub ? <div className="mt-0.5 text-xs text-zinc-500">{sub}</div> : null}
    </div>
  );
}

/**
 * Veikla KPI + mėnesio skambučių grafikas — vienas `project_overview_analytics` RPC
 * (grafiko trendas ateina tame pačiame payload, be antro round-trip).
 */
export async function ProjectOverviewCritical({
  projectId,
  period,
  range,
}: {
  projectId: string;
  period: ProjectAnalyticsPeriod;
  range: ProjectAnalyticsRange;
}) {
  const supabase = await createSupabaseSsrReadOnlyClient();
  const data = await fetchProjectOverviewCriticalKpis(supabase, projectId, range);
  const pct =
    data.kpi.answerRatePercent != null
      ? `${data.kpi.answerRatePercent.toLocaleString("lt-LT", { maximumFractionDigits: 1 })}%`
      : "—";

  return (
    <div className="space-y-8">
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900">Projekto apžvalga</h2>
            <p className="mt-1 text-sm text-zinc-500">
              {range.from === range.to ? formatDate(range.from) : `${formatDate(range.from)} — ${formatDate(range.to)}`} · tik
              šis projektas
            </p>
          </div>
          <ProjectAnalyticsPeriodControls
            key={`${range.from}-${range.to}-${period}`}
            projectId={projectId}
            activePeriod={period}
            rangeFrom={range.from}
            rangeTo={range.to}
            heading="Veiklos laikotarpis"
          />
        </div>

        <section>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-400">Veikla</h3>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
            <KpiCard label="Skambučiai" value={data.kpi.calls} />
            <KpiCard label="Atsiliepė" value={data.kpi.answered} />
            <KpiCard label="Neatsiliepė" value={data.kpi.notAnswered} />
            <KpiCard label="Laiškai" value={data.closedEmail} sub="uždaryta periode" />
            <KpiCard label="Komerciniai" value={data.closedCommercial} sub="uždaryta periode" />
            <KpiCard label="Atsiliepimo %" value={pct} sub="nuo skambučių" />
          </div>
        </section>
      </div>

      <section className="rounded-xl border border-zinc-200/80 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-zinc-900">Skambučiai per mėnesį (darbo dienos)</h3>
        <div className="mt-4">
          <CallsByDayBarChart
            trend={data.monthCallsTrend}
            range={{ from: data.monthRange.from, to: data.monthRange.to }}
            showAverage={false}
          />
        </div>
      </section>
    </div>
  );
}
