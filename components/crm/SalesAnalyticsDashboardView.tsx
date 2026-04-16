import type { SalesDashboardData } from "@/lib/crm/salesAnalyticsDashboard";
import { formatMoney } from "@/lib/crm/format";
import Link from "next/link";
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
  const { kpi, projects, warnings, bestCallTimes } = data;

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
          Sukaupta per visą laiką: PVM sąskaitos pagal išrašymo datą (<span className="font-medium text-zinc-700">invoice_date</span>) iki
          šiandien. <span className="font-medium text-zinc-700">Nepriklauso</span> nuo viršuje pasirinkto „Ši savaitė / mėnuo“ filtro.
          Sąskaita priskiriama, jei data vėlesnė nei pirmas kliento kontaktas; direct / influenced skirstoma pagal naujausią veiklos būseną.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <KpiCard label="Direct pajamos (€, viso laiko)" value={directDisplay} />
          <KpiCard label="Influenced pajamos (€, viso laiko)" value={influencedDisplay} />
          <KpiCard
            label="Vid. € / skambutį (viso laiko)"
            value={avgDisplay}
            sub="direct pajamos / visų laikų skambučių sk."
          />
        </div>
      </section>

      <section aria-labelledby="projects-heading">
        <h2 id="projects-heading" className="text-sm font-semibold text-zinc-900">
          Projektai
        </h2>
        <p className="mt-1 text-xs text-zinc-500">
          Pagal pasirinktą laikotarpį (skambučiai ir pajamos iš PVM sąskaitų, jei sąskaita įvyko po skambučio).
        </p>
        <div className="mt-3 overflow-x-auto rounded-lg border border-zinc-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="border-b border-zinc-100 bg-zinc-50/80 text-left text-[11px] font-medium uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-3 py-2">Projektas</th>
                <th className="px-3 py-2 text-right">Skambučiai</th>
                <th className="px-3 py-2 text-right">Direct €</th>
                <th className="px-3 py-2 text-right">Influenced €</th>
                <th className="px-3 py-2 text-right">Viso €</th>
              </tr>
            </thead>
            <tbody>
              {projects.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-zinc-500">
                    Nėra duomenų pasirinktam laikotarpiui.
                  </td>
                </tr>
              ) : (
                projects.map((p) => (
                  <tr key={p.projectId} className="border-t border-zinc-100">
                    <td className="max-w-[14rem] truncate px-3 py-2 font-medium text-zinc-900">
                      <Link href={`/projektai/${p.projectId}`} className="hover:underline">
                        {p.projectName}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-zinc-800">{p.calls}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold text-zinc-900">
                      {formatMoney(p.directRevenueEur)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold text-zinc-900">
                      {formatMoney(p.influencedRevenueEur)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-bold text-zinc-900">
                      {formatMoney(p.totalRevenueEur)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
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
