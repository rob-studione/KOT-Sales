import "server-only";

import { formatDate, formatMoney } from "@/lib/crm/format";
import {
  fetchProjectAnalytics,
  fetchProjectFirstActivityDate,
  fetchProjectMonthCallsTrend,
  resolveAnalyticsRange,
  type ProjectAnalyticsPeriod,
} from "@/lib/crm/projectAnalytics";
import { CallsByDayBarChart } from "@/components/crm/CallsByDayBarChart";
import { ProjectOverviewSalesPeriodHeader } from "@/components/crm/project-analytics/ProjectOverviewSalesPeriodHeader";
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
 * @deprecated Mėnesio grafikas įtrauktas į `ProjectOverviewCritical` (vienas overview RPC).
 * Palikta export'ui, jei kas importuotų seną kelią.
 */
export async function ProjectOverviewMonthCallsChart({ projectId }: { projectId: string }) {
  const supabase = await createSupabaseSsrReadOnlyClient();
  const { monthRange, monthCallsTrend } = await fetchProjectMonthCallsTrend(supabase, projectId);

  return (
    <section className="rounded-xl border border-zinc-200/80 bg-white p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-zinc-900">Skambučiai per mėnesį (darbo dienos)</h3>
      <div className="mt-4">
        <CallsByDayBarChart trend={monthCallsTrend} range={{ from: monthRange.from, to: monthRange.to }} showAverage={false} />
      </div>
    </section>
  );
}

/** Visa pardavimų sekcija: header + meta + KPI (all_time anchor tik čia). */
export async function ProjectOverviewSalesSection({
  projectId,
  salesPeriod,
  salesFrom,
  salesTo,
}: {
  projectId: string;
  salesPeriod: ProjectAnalyticsPeriod;
  salesFrom?: string;
  salesTo?: string;
}) {
  const supabase = await createSupabaseSsrReadOnlyClient();
  const allTimeFrom =
    salesPeriod === "all_time" ? await fetchProjectFirstActivityDate(supabase, projectId) : null;
  const salesRange = resolveAnalyticsRange(salesPeriod, salesFrom, salesTo, allTimeFrom);
  // overview ∥ revenue_feed(summary) — viename fetchProjectAnalytics
  const data = await fetchProjectAnalytics(supabase, projectId, salesRange);
  const { generated, kpi } = data;

  const directRevenue = generated.totalEur;
  const influencedRevenue = generated.totalEur;
  const avgPerContact = kpi.answered > 0 ? generated.totalEur / kpi.answered : null;
  const conversion =
    generated.clientsCount > 0 && data.work.totalPicked > 0 ? (generated.clientsCount / data.work.totalPicked) * 100 : null;

  const rangeLabel =
    salesRange.from === salesRange.to
      ? formatDate(salesRange.from)
      : `${formatDate(salesRange.from)} — ${formatDate(salesRange.to)}`;

  const meta = (
    <p className="text-xs text-zinc-500">
      Klientai su užsakymu: <span className="font-medium tabular-nums text-zinc-900">{generated.clientsCount}</span>
      <span className="mx-2 text-zinc-300">·</span>
      {rangeLabel}
    </p>
  );

  return (
    <>
      <ProjectOverviewSalesPeriodHeader
        projectId={projectId}
        salesPeriod={salesPeriod}
        rangeFrom={salesRange.from}
        rangeTo={salesRange.to}
        meta={meta}
      />
      <div className="mt-5 grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Direct pajamos" value={formatMoney(directRevenue)} sub="po kontakto (intervalas)" />
        <KpiCard label="Influenced pajamos" value={formatMoney(influencedRevenue)} sub="kol kas ta pati metodika" />
        <KpiCard
          label="Vid. € / kontaktą"
          value={avgPerContact == null ? "—" : formatMoney(avgPerContact)}
          sub="pagal atsiliepusius skambučius"
        />
        <KpiCard
          label="Konversija"
          value={conversion == null ? "—" : `${conversion.toLocaleString("lt-LT", { maximumFractionDigits: 1 })}%`}
          sub="užsakymas / paimtas į darbą"
        />
      </div>
    </>
  );
}

/** Greitas header be duomenų — kol Suspense krauna sales sekciją. */
export function ProjectOverviewSalesSectionFallback({
  projectId,
  salesPeriod,
  rangeFrom,
  rangeTo,
}: {
  projectId: string;
  salesPeriod: ProjectAnalyticsPeriod;
  rangeFrom: string;
  rangeTo: string;
}) {
  return (
    <>
      <ProjectOverviewSalesPeriodHeader
        projectId={projectId}
        salesPeriod={salesPeriod}
        rangeFrom={rangeFrom}
        rangeTo={rangeTo}
        meta={<div className="h-4 w-48 animate-pulse rounded bg-zinc-100" />}
      />
      <div className="mt-5 grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 xl:grid-cols-4">
        <div className="h-24 rounded-xl bg-zinc-100" />
        <div className="h-24 rounded-xl bg-zinc-100" />
        <div className="h-24 rounded-xl bg-zinc-100" />
        <div className="h-24 rounded-xl bg-zinc-100" />
      </div>
    </>
  );
}
