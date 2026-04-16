import { SalesAnalyticsSkeleton } from "@/components/crm/SalesAnalyticsSkeleton";

/** Maršruto navigacija: rodoma kol serveris ruošia puslapį. */
export default function AnalitikaLoading() {
  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-9 w-28 animate-pulse rounded-md bg-zinc-200" />
          ))}
        </div>
        <div className="h-4 w-48 animate-pulse rounded bg-zinc-200 sm:ml-auto" />
      </div>
      <SalesAnalyticsSkeleton />
    </div>
  );
}
