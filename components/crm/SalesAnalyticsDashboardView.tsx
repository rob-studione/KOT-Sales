import type { SalesDashboardData } from "@/lib/crm/salesAnalyticsDashboard";
import { formatMoney } from "@/lib/crm/format";
import { CallsByDayBarChart } from "@/components/crm/CallsByDayBarChart";
import { SalesAnalyticsBestCallTimeClient } from "@/components/crm/SalesAnalyticsBestCallTimeClient";

export function SalesAnalyticsDashboardView({
  data,
  monthCallsTrend,
  monthRange,
}: {
  data: SalesDashboardData;
  monthCallsTrend: Array<{ date: string; calls: number }>;
  monthRange: { from: string; to: string };
}) {
  const { kpi, warnings, bestCallTimes, directInvoices, influencedInvoices } = data;

  const directDisplay = kpi.directRevenueEur === 0 ? "—" : formatMoney(kpi.directRevenueEur);
  const influencedDisplay = kpi.influencedRevenueEur === 0 ? "—" : formatMoney(kpi.influencedRevenueEur);
  const avgDisplay =
    kpi.avgEurPerCall === null || kpi.avgEurPerCall === 0 ? "—" : formatMoney(kpi.avgEurPerCall);
  const conversionDisplay =
    kpi.conversionPercent === null ? "—" : `${kpi.conversionPercent}%`;

  return (
    <div className="space-y-10">
      <section aria-labelledby="activity-heading">
        <h2 id="activity-heading" className="text-sm font-semibold text-zinc-900">
          Veikla
        </h2>
        <p className="mt-1 text-xs text-zinc-500">
          Rodikliai pagal pasirinktą laikotarpį (veiklos įrašai visuose projektuose).
        </p>
        <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
          <KpiCard label="Skambučiai" value={String(kpi.calls)} />
          <KpiCard
            label="Atsiliepė"
            value={String(kpi.answeredCalls)}
            sub="skambučiai su atsiliepimo statusu"
          />
          <KpiCard label="Komerciniai" value={String(kpi.commercialActions)} sub="komerciniai įrašai" />
          <KpiCard label="Konversija" value={conversionDisplay} sub="klientai su sąskaita / skambučiai" />
        </div>
      </section>

      <section aria-labelledby="calls-by-day-heading">
        <h2 id="calls-by-day-heading" className="text-sm font-semibold text-zinc-900">
          Skambučiai per mėnesį (darbo dienos)
        </h2>
        <div className="mt-3">
          <CallsByDayBarChart trend={monthCallsTrend} range={monthRange} showAverage={false} />
        </div>
        <div className="mt-2">
          <SalesAnalyticsBestCallTimeClient data={bestCallTimes} />
        </div>
      </section>

      <section aria-labelledby="revenue-heading" className="border-t border-zinc-200/80 pt-10">
        <h2 id="revenue-heading" className="text-sm font-semibold text-zinc-900">
          Pardavimai
        </h2>
        <p className="mt-1 text-xs text-zinc-500">
          PVM sąskaitos pagal <span className="font-medium text-zinc-700">invoice_date</span> fiksuotame pardavimų lange: jei viršuje pasirinkta{" "}
          <span className="font-medium text-zinc-700">Pasirinkti laikotarpį</span> — naudojamos tos pačios <span className="font-medium text-zinc-700">nuo / iki</span>{" "}
          datos; kitu atveju — <span className="font-medium text-zinc-700">paskutinės 30 kalendorinių dienų</span> iki šiandien (Vilnius). Sąskaita
          įtraukiama, jei sąskaitos data vėlesnė nei pirmas skambutis tame lange; direct / influenced skirstoma pagal naujausią veiklos būseną tame
          lange.
        </p>
        <div className="mt-4 space-y-3">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <KpiCard label="Direct pajamos (€, KPI langas)" value={directDisplay} />
            <KpiCard label="Influenced pajamos (€, KPI langas)" value={influencedDisplay} />
            <KpiCard
              label="Vid. € / skambutį (KPI langas)"
              value={avgDisplay}
              sub="direct pajamos / skambučių sk. tame pačiame KPI lange"
            />
          </div>

          {directInvoices.length > 0 || influencedInvoices.length > 0 ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {directInvoices.length > 0 ? (
                <InvoicesBreakdownTable
                  className="sm:col-start-1"
                  rows={directInvoices}
                  title="Direct breakdown"
                />
              ) : null}
              {influencedInvoices.length > 0 ? (
                <InvoicesBreakdownTable
                  className="sm:col-start-2"
                  rows={influencedInvoices}
                  title="Influenced breakdown"
                />
              ) : null}
              {/* 3 stulpelis (Avg €): niekada nieko nerodom */}
            </div>
          ) : null}
        </div>
      </section>

      {warnings.length > 0 ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <div className="font-medium">Įspėjimai</div>
          <ul className="mt-1 list-inside list-disc space-y-0.5">
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div
      data-analytics-kpi-card="1"
      className="group cursor-pointer rounded-lg border border-zinc-200 bg-white px-4 py-4 shadow-sm transition-[transform,box-shadow,border-color] duration-150 ease-out hover:-translate-y-1 hover:border-zinc-400 hover:shadow-xl active:translate-y-0 active:scale-[0.98]"
    >
      <div className="text-sm font-medium text-zinc-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold tabular-nums text-zinc-900 transition-colors duration-150 ease-out group-hover:text-zinc-950">
        {value}
      </div>
      {sub ? <div className="mt-1 text-xs text-zinc-500">{sub}</div> : null}
    </div>
  );
}

function InvoicesBreakdownTable({
  rows,
  title,
  className,
}: {
  rows: Array<{ invoiceNumber: string; date: string; amount: number; clientKey: string }>;
  title: string;
  className?: string;
}) {
  if (rows.length === 0) return null;
  return (
    <div className={className}>
      <div className="mb-1 text-[11px] font-medium text-zinc-500">{title}</div>
      <div className="overflow-x-auto rounded-md border border-zinc-200 bg-white">
        <table className="min-w-full text-[11px]">
          <thead className="border-b border-zinc-100 bg-zinc-50/80 text-left font-medium uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-2.5 py-1.5">Invoice No.</th>
              <th className="px-2.5 py-1.5">Data</th>
              <th className="px-2.5 py-1.5 text-right">Suma</th>
              <th className="px-2.5 py-1.5">Company code</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {rows.map((inv) => (
              <tr key={`${inv.invoiceNumber}-${inv.date}-${inv.clientKey}`} className="text-zinc-800">
                <td className="px-2.5 py-1.5 font-medium text-zinc-900">{inv.invoiceNumber}</td>
                <td className="px-2.5 py-1.5 tabular-nums">{inv.date}</td>
                <td className="px-2.5 py-1.5 text-right tabular-nums font-semibold text-zinc-900">
                  {formatMoney(inv.amount)}
                </td>
                <td className="max-w-[18rem] truncate px-2.5 py-1.5 font-mono text-[11px] text-zinc-600">
                  {inv.clientKey}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
