export function ProjectOverviewSkeleton() {
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-zinc-200/80 bg-white p-5 shadow-sm">
        <div className="h-5 w-52 rounded bg-zinc-200/70" />
        <div className="mt-4 h-[220px] w-full rounded bg-zinc-100" />
      </div>
      <div className="rounded-xl border border-zinc-200/80 bg-white p-5 shadow-sm">
        <div className="h-5 w-32 rounded bg-zinc-200/70" />
        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="h-20 rounded-lg bg-zinc-100" />
          <div className="h-20 rounded-lg bg-zinc-100" />
          <div className="h-20 rounded-lg bg-zinc-100" />
          <div className="h-20 rounded-lg bg-zinc-100" />
        </div>
      </div>
    </div>
  );
}

