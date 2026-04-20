import { SalesAnalyticsSkeleton } from "@/components/crm/SalesAnalyticsSkeleton";

export default function DashboardLoading() {
  return (
    <div className="space-y-8">
      <div className="animate-pulse space-y-3" aria-busy="true" aria-label="Įkeliamas filtras">
        <div className="h-9 w-full max-w-md rounded-md bg-zinc-200" />
      </div>
      <SalesAnalyticsSkeleton />
    </div>
  );
}
