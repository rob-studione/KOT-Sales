/** Suspense fallback kol serveris skaičiuoja Veiklos analitiką. */
export function SalesAnalyticsSkeleton() {
  return (
    <div className="animate-pulse space-y-10" aria-busy="true" aria-label="Skaičiuojama analitika">
      <div className="space-y-3">
        <div className="h-4 w-24 rounded bg-zinc-200" />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 rounded-lg bg-zinc-200" />
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <div className="h-4 w-48 rounded bg-zinc-200" />
        <div className="h-48 rounded-lg bg-zinc-200" />
      </div>
    </div>
  );
}

/** Suspense fallback kol kraunami all_time pardavimai. */
export function SalesAnalyticsSalesSkeleton({
  salesPeriod,
  rangeFrom,
  rangeTo,
}: {
  salesPeriod: string;
  rangeFrom: string;
  rangeTo: string;
}) {
  return (
    <section className="border-t border-zinc-200/80 pt-10" aria-busy="true" aria-label="Skaičiuojami pardavimai">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="h-4 w-28 animate-pulse rounded bg-zinc-200" />
          <div className="h-8 w-full max-w-xl animate-pulse rounded bg-zinc-100" />
        </div>
        <div className="w-full sm:w-auto lg:shrink-0">
          <div className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">Pardavimų laikotarpis</div>
          <div className="mt-2 flex flex-col gap-2">
            <div className="h-9 w-44 animate-pulse rounded-lg border border-zinc-200 bg-zinc-50" />
            <p className="text-xs text-zinc-400">
              {salesPeriod === "all_time" ? "Visas laikotarpis" : `${rangeFrom} — ${rangeTo}`}
            </p>
          </div>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {[1, 2].map((i) => (
          <div key={i} className="space-y-3">
            <div className="h-24 animate-pulse rounded-lg bg-zinc-200" />
            <div className="h-40 animate-pulse rounded-md bg-zinc-100" />
          </div>
        ))}
      </div>
    </section>
  );
}
