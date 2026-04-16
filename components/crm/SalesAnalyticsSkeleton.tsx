/** Suspense fallback kol serveris skaičiuoja analitiką. */
export function SalesAnalyticsSkeleton() {
  return (
    <div className="animate-pulse space-y-10" aria-busy="true" aria-label="Skaičiuojama analitika">
      <div className="space-y-3">
        <div className="h-4 w-24 rounded bg-zinc-200" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-20 rounded-lg bg-zinc-200" />
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <div className="h-4 w-32 rounded bg-zinc-200" />
        <div className="h-48 rounded-lg bg-zinc-200" />
      </div>
      <div className="h-52 rounded-lg bg-zinc-200" />
    </div>
  );
}
