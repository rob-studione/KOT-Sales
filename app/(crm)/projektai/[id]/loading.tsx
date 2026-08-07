/** Rodoma po skirtukų navigacija kol krauna konkretaus tab'o turinį — antraštė (layout) lieka nejudinama. */
export default function ProjektasDetailTabLoading() {
  return (
    <div className="mt-4 min-w-0 animate-pulse" aria-busy="true" aria-label="Įkeliamas turinys">
      <div className="space-y-3">
        <div className="h-4 w-1/3 rounded bg-zinc-200/70" />
        <div className="h-24 w-full rounded-xl bg-zinc-100" />
        <div className="h-24 w-full rounded-xl bg-zinc-100" />
      </div>
    </div>
  );
}
