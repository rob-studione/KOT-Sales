import { formatDate, formatMoney } from "@/lib/crm/format";
import {
  type ProjectAnalyticsDto,
  type ProjectAnalyticsPeriod,
} from "@/lib/crm/projectAnalytics";
import { ProjectAnalyticsPeriodControls } from "@/components/crm/project-analytics/ProjectAnalyticsPeriodControls";
import { CallsByDayBarChart } from "@/components/crm/CallsByDayBarChart";

function KpiCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-xl border border-zinc-200/80 bg-white p-4 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wide text-zinc-400">{label}</div>
      <div className="mt-1 text-3xl font-semibold tabular-nums tracking-tight text-zinc-900">{value}</div>
      {sub ? <div className="mt-0.5 text-xs text-zinc-500">{sub}</div> : null}
    </div>
  );
}

export function ProjectAnalyticsView({
  projectId,
  period,
  data,
}: {
  projectId: string;
  period: ProjectAnalyticsPeriod;
  data: ProjectAnalyticsDto;
}) {
  const { range, monthRange, monthCallsTrend, kpi, generated } = data;
  const pct =
    kpi.answerRatePercent != null
      ? `${kpi.answerRatePercent.toLocaleString("lt-LT", { maximumFractionDigits: 1 })}%`
      : "—";

  const directRevenue = generated.totalEur;
  const influencedRevenue = generated.totalEur;
  const avgPerContact =
    kpi.answered > 0 ? generated.totalEur / kpi.answered : null;
  const conversion =
    generated.clientsCount > 0 && data.work.totalPicked > 0
      ? (generated.clientsCount / data.work.totalPicked) * 100
      : null;

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900">Projekto apžvalga</h2>
          <p className="mt-1 text-sm text-zinc-500">
            {range.from === range.to
              ? formatDate(range.from)
              : `${formatDate(range.from)} — ${formatDate(range.to)}`}{" "}
            · tik šis projektas
          </p>
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
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-400">Veikla</h3>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
          <KpiCard label="Skambučiai" value={kpi.calls} />
          <KpiCard label="Atsiliepė" value={kpi.answered} />
          <KpiCard label="Neatsiliepė" value={kpi.notAnswered} />
          <KpiCard label="Laiškai" value={kpi.emails} />
          <KpiCard label="Komerciniai" value={kpi.commercial} />
          <KpiCard label="Atsiliepimo %" value={pct} sub="nuo skambučių" />
        </div>
      </section>

      <section className="rounded-xl border border-zinc-200/80 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-zinc-900">Skambučiai per mėnesį (darbo dienos)</h3>
        <div className="mt-4">
          <CallsByDayBarChart
            trend={monthCallsTrend}
            range={{ from: monthRange.from, to: monthRange.to }}
            showAverage={false}
          />
        </div>
      </section>

      <section>
        {/* intentionally removed per request */}
      </section>

      {/* intentionally removed per request */}

      <section>
        <div className="flex items-end justify-between gap-3">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Pardavimai</h3>
            <p className="mt-1 text-sm text-zinc-600">
              Pajamos skaičiuojamos pagal PVM sąskaitas po pirmo kontakto pasirinktame laikotarpyje (sąskaitos data vėlesnė nei kontakto diena).
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
