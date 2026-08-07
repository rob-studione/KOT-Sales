export function ProjectOverviewSkeleton() {
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-zinc-200/80 bg-white p-5 shadow-sm">
        <div className="h-5 w-52 rounded bg-zinc-200/70" />
        <div className="mt-4 h-[220px] w-full rounded bg-zinc-100" />
      </div>
    </div>
  );
}

export function ProjectOverviewSalesKpisSkeleton() {
  return (
    <div className="mt-3 grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 xl:grid-cols-4">
      <div className="h-24 rounded-xl bg-zinc-100" />
      <div className="h-24 rounded-xl bg-zinc-100" />
      <div className="h-24 rounded-xl bg-zinc-100" />
      <div className="h-24 rounded-xl bg-zinc-100" />
    </div>
  );
}
