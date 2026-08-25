/** KPI maršrutas: skeleton kol serveris surenka RPC + aktyvumą. */
export default function AnalitikaKpiLoading() {
  return (
    <div className="space-y-8" aria-busy="true" aria-label="Įkeliamas KPI">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <div className="h-7 w-48 animate-pulse rounded bg-zinc-200" />
          <div className="h-4 w-72 animate-pulse rounded bg-zinc-100" />
        </div>
        <div className="flex gap-2">
          <div className="h-9 w-36 animate-pulse rounded-lg bg-zinc-200" />
          <div className="h-9 w-44 animate-pulse rounded-lg bg-zinc-100" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-28 animate-pulse rounded-xl bg-zinc-100" />
        ))}
      </div>
      <div className="h-72 animate-pulse rounded-xl border border-zinc-200/80 bg-zinc-50" />
    </div>
  );
}
