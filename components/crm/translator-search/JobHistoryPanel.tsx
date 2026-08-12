import type { TranslatorSearchJobRow } from "@/lib/translatorSearch/types";

export function JobHistoryPanel({
  jobs,
  loadError,
}: {
  jobs: TranslatorSearchJobRow[];
  loadError: string | null;
}) {
  if (loadError) {
    return (
      <div className="max-w-xl">
        <h2 className="text-lg font-semibold text-zinc-900">Paieškos istorija</h2>
        <p className="mt-2 text-sm text-red-600">{loadError}</p>
      </div>
    );
  }

  if (!jobs.length) {
    return (
      <div className="max-w-xl">
        <h2 className="text-lg font-semibold text-zinc-900">Paieškos istorija</h2>
        <p className="mt-2 text-[15px] leading-relaxed text-zinc-600">
          Paieškų istorija tuščia. Paleistos paieškos ir jų būsenos bus rodomos čia.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-lg font-semibold text-zinc-900">Paieškos istorija</h2>
      <ul className="mt-4 divide-y divide-zinc-200 border-t border-zinc-200">
        {jobs.map((j) => (
          <li key={j.id} className="py-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-medium text-zinc-900">{j.title || j.id}</p>
              <StatusBadge status={j.status} />
            </div>
            <p className="mt-1 text-xs text-zinc-500">
              {new Date(j.created_at).toLocaleString("lt-LT")}
              {j.finished_at ? ` → ${new Date(j.finished_at).toLocaleString("lt-LT")}` : ""}
            </p>
            {j.stop_reason ? <p className="mt-1 text-sm text-zinc-600">stop: {j.stop_reason}</p> : null}
            {j.warning ? <p className="mt-1 text-sm text-amber-700">{j.warning}</p> : null}
            {j.status === "failed" ? (
              <p className="mt-1 text-sm text-red-600">
                {j.error_code ? `[${j.error_code}] ` : ""}
                {j.error_message}
              </p>
            ) : null}
            <p className="mt-1 text-xs text-zinc-500">
              search={j.search_calls} · fetch={j.fetch_url_count} · pdf={j.pdf_count} · openai={j.openai_calls} ·
              apskaičiuota kaina ≈ {Number(j.cost_eur_estimated).toFixed(4)} EUR
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "completed"
      ? "bg-emerald-50 text-emerald-800"
      : status === "failed"
        ? "bg-red-50 text-red-800"
        : status === "running"
          ? "bg-amber-50 text-amber-900"
          : "bg-zinc-100 text-zinc-700";
  return <span className={`rounded px-2 py-0.5 text-xs font-semibold ${cls}`}>{status}</span>;
}
