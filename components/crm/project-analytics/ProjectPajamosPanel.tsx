import "server-only";

import { formatDate, formatMoney } from "@/lib/crm/format";
import {
  fetchProjectAnalytics,
  fetchProjectFirstActivityDate,
  fetchProjectRevenueFeed,
  resolveAnalyticsRange,
  type ProjectAnalyticsPeriod,
} from "@/lib/crm/projectAnalytics";
import type { InvoiceBreakdownRow } from "@/components/crm/InvoicesBreakdownTable";
import { ProjectInvoicesBreakdownTable } from "@/components/crm/project-analytics/ProjectInvoicesBreakdownTable";
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

const PAJAMOS_PERIOD_KEYS = {
  period: "salesPeriod",
  from: "salesFrom",
  to: "salesTo",
} as const;

/** Skirtukas „Pajamos“: Pardavimai KPI + sąskaitų išklotinė (dashboard stiliumi). */
export async function ProjectPajamosPanel({
  projectId,
  period,
  from,
  to,
}: {
  projectId: string;
  period: ProjectAnalyticsPeriod;
  from?: string;
  to?: string;
}) {
  const supabase = await createSupabaseSsrReadOnlyClient();
  const allTimeFrom = period === "all_time" ? await fetchProjectFirstActivityDate(supabase, projectId) : null;
  const range = resolveAnalyticsRange(period, from, to, allTimeFrom);

  const [data, feed] = await Promise.all([
    fetchProjectAnalytics(supabase, projectId, range),
    fetchProjectRevenueFeed(supabase, projectId, range),
  ]);

  const { generated, kpi } = data;
  const directRevenue = generated.totalEur;
  const influencedRevenue = generated.totalEur;
  const avgPerContact = kpi.answered > 0 ? generated.totalEur / kpi.answered : null;
  const conversion =
    generated.clientsCount > 0 && data.work.totalPicked > 0 ? (generated.clientsCount / data.work.totalPicked) * 100 : null;

  const rangeLabel =
    range.from === range.to ? formatDate(range.from) : `${formatDate(range.from)} — ${formatDate(range.to)}`;

  const meta = (
    <p className="text-xs text-zinc-500">
      Klientai su užsakymu: <span className="font-medium tabular-nums text-zinc-900">{generated.clientsCount}</span>
      <span className="mx-2 text-zinc-300">·</span>
      {rangeLabel}
    </p>
  );

  const invoiceRows: InvoiceBreakdownRow[] = feed.rows.map((r) => ({
    invoiceNumber: r.invoice_number?.trim() ? r.invoice_number : "—",
    date: r.invoice_date,
    amount: r.amount_eur,
    clientKey: r.client_label,
    companyName: r.client_label,
  }));

  return (
    <div className="flex flex-col gap-6">
      <section className="overflow-visible rounded-xl border border-zinc-200/80 bg-white p-5 shadow-sm">
        <ProjectOverviewSalesPeriodHeader
          projectId={projectId}
          salesPeriod={period}
          rangeFrom={range.from}
          rangeTo={range.to}
          meta={meta}
          tabSegment="pajamos"
          paramKeys={PAJAMOS_PERIOD_KEYS}
          heading="Pardavimų laikotarpis"
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
      </section>

      {invoiceRows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-200 bg-zinc-50/50 px-6 py-12 text-center text-sm text-zinc-500">
          Nėra pajamų įrašų pagal pasirinktą laikotarpį.
        </div>
      ) : (
        <section className="rounded-xl border border-zinc-200/80 bg-white p-5 shadow-sm">
          <ProjectInvoicesBreakdownTable rows={invoiceRows} />
        </section>
      )}
    </div>
  );
}

export function ProjectPajamosPanelFallback({
  projectId,
  period,
  rangeFrom,
  rangeTo,
}: {
  projectId: string;
  period: ProjectAnalyticsPeriod;
  rangeFrom: string;
  rangeTo: string;
}) {
  return (
    <div className="flex flex-col gap-6">
      <section className="overflow-visible rounded-xl border border-zinc-200/80 bg-white p-5 shadow-sm">
        <ProjectOverviewSalesPeriodHeader
          projectId={projectId}
          salesPeriod={period}
          rangeFrom={rangeFrom}
          rangeTo={rangeTo}
          meta={<div className="h-4 w-48 animate-pulse rounded bg-zinc-100" />}
          tabSegment="pajamos"
          paramKeys={PAJAMOS_PERIOD_KEYS}
        />
        <div className="mt-5 grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 xl:grid-cols-4">
          <div className="h-24 rounded-xl bg-zinc-100" />
          <div className="h-24 rounded-xl bg-zinc-100" />
          <div className="h-24 rounded-xl bg-zinc-100" />
          <div className="h-24 rounded-xl bg-zinc-100" />
        </div>
      </section>
      <div className="h-48 animate-pulse rounded-xl bg-zinc-100" />
    </div>
  );
}
