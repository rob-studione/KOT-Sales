import "server-only";

import { formatMoney } from "@/lib/crm/format";
import { fetchProjectAnalytics, type ProjectAnalyticsRange } from "@/lib/crm/projectAnalytics";
import { CallsByDayBarChart } from "@/components/crm/CallsByDayBarChart";
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

export async function ProjectOverviewDeferred({
  projectId,
  range,
}: {
  projectId: string;
  range: ProjectAnalyticsRange;
}) {
  const supabase = await createSupabaseSsrReadOnlyClient();
  const data = await fetchProjectAnalytics(supabase, projectId, range);
  const { monthRange, monthCallsTrend, generated, kpi } = data;

  const directRevenue = generated.totalEur;
  const influencedRevenue = generated.totalEur;
  const avgPerContact = kpi.answered > 0 ? generated.totalEur / kpi.answered : null;
  const conversion =
    generated.clientsCount > 0 && data.work.totalPicked > 0 ? (generated.clientsCount / data.work.totalPicked) * 100 : null;

  return (
    <div className="space-y-8">
      <section className="rounded-xl border border-zinc-200/80 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-zinc-900">Skambučiai per mėnesį (darbo dienos)</h3>
        <div className="mt-4">
          <CallsByDayBarChart trend={monthCallsTrend} range={{ from: monthRange.from, to: monthRange.to }} showAverage={false} />
        </div>
      </section>

      <section>
        <div className="flex items-end justify-between gap-3">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Pardavimai</h3>
            <p className="mt-1 text-sm text-zinc-600">
              Pajamos skaičiuojamos pagal PVM sąskaitas po pirmo kontakto pasirinktame laikotarpyje (sąskaitos data vėlesnė nei kontakto
              diena).
            </p>
          </div>
          <div className="hidden text-xs text-zinc-500 sm:block">
            Klientai su užsakymu: <span className="font-medium tabular-nums text-zinc-900">{generated.clientsCount}</span>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
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
    </div>
  );
}

