import Link from "next/link";
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
  const { kpi, warnings, bestCallTimes, projectRevenues, period, range } = data;

  const coldDisplay = kpi.coldRevenueEur === 0 ? "—" : formatMoney(kpi.coldRevenueEur);
  const returningDisplay = kpi.returningRevenueEur === 0 ? "—" : formatMoney(kpi.returningRevenueEur);
  const conversionDisplay =
    kpi.conversionPercent === null ? "—" : `${kpi.conversionPercent}%`;

  const pajamosQs = new URLSearchParams();
  pajamosQs.set("salesPeriod", period === "custom" ? "custom" : period);
  if (period === "custom") {
    pajamosQs.set("salesFrom", range.from);
    pajamosQs.set("salesTo", range.to);
  }

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
          <KpiCard label="Konversija" value={conversionDisplay} sub="klientai su sąskaita / atsiliepė" />
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
          PVM sąskaitos (sumos <span className="font-medium text-zinc-700">be PVM</span>) pagal{" "}
          <span className="font-medium text-zinc-700">invoice_date</span>. Cold / Returning — jei per 365 d. iki sąskaitos
          buvo call / email / meeting / commercial. Žemiau — pajamos pagal projektą; detalės — projekto Pajamose.
        </p>
        <div className="mt-4 space-y-3">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <KpiCard label="Cold pajamos (€, KPI langas)" value={coldDisplay} />
            <KpiCard label="Returning pajamos (€, KPI langas)" value={returningDisplay} />
          </div>

          {projectRevenues.length > 0 ? (
            <div className="overflow-hidden rounded-md border border-zinc-200 bg-white">
              <div className="border-b border-zinc-100 px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                Pajamos pagal projektą
              </div>
              <ul className="divide-y divide-zinc-100">
                {projectRevenues.map((row) => (
                  <li key={row.projectId}>
                    <Link
                      href={`/projektai/${row.projectId}/pajamos?${pajamosQs.toString()}`}
                      className="block px-3 py-2.5 transition-colors hover:bg-zinc-50"
                    >
                      <div className="truncate text-[13px] font-medium text-zinc-900">{row.projectName}</div>
                      <div className="mt-1.5 grid grid-cols-2 gap-3 text-[12px]">
                        <div>
                          <div className="text-[10px] font-medium uppercase tracking-wide text-zinc-400">Cold</div>
                          <div className="mt-0.5 tabular-nums font-semibold text-zinc-900">
                            {row.coldEur === 0 ? "—" : formatMoney(row.coldEur)}
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] font-medium uppercase tracking-wide text-zinc-400">Returning</div>
                          <div className="mt-0.5 tabular-nums font-semibold text-zinc-900">
                            {row.returningEur === 0 ? "—" : formatMoney(row.returningEur)}
                          </div>
                        </div>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
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
