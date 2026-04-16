/**
 * GET forma – tie patys query parametrai (tab, page, period, status, q, pageSize).
 * Vienas filter bar virš sąrašo: paieška → statusas → Taikyti.
 */

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z"
        stroke="currentColor"
        strokeWidth="1.75"
      />
      <path d="M16.5 16.5 21 21" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

export function ManualProjectCandidatesFiltersBar({
  projectId,
  defaultStatus,
  defaultQuery,
  periodHidden,
  fromHidden,
  toHidden,
  pageSizeHidden,
}: {
  projectId: string;
  defaultStatus: string;
  defaultQuery: string;
  periodHidden: string;
  fromHidden?: string;
  toHidden?: string;
  pageSizeHidden?: string;
}) {
  return (
    <form method="get" action={`/projektai/${projectId}`} className="mb-4">
      <input type="hidden" name="tab" value="kandidatai" />
      <input type="hidden" name="page" value="0" />
      <input type="hidden" name="period" value={periodHidden} />
      {fromHidden != null && fromHidden !== "" ? <input type="hidden" name="from" value={fromHidden} /> : null}
      {toHidden != null && toHidden !== "" ? <input type="hidden" name="to" value={toHidden} /> : null}
      {pageSizeHidden != null && pageSizeHidden !== "" && pageSizeHidden !== "20" ? (
        <input type="hidden" name="pageSize" value={pageSizeHidden} />
      ) : null}

      <div className="max-w-full overflow-x-auto pb-0.5">
        <div className="inline-flex flex-nowrap items-center gap-3 rounded-lg border border-zinc-200 bg-white px-3 py-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <div className="relative h-9 w-[360px] shrink-0">
            <span className="pointer-events-none absolute left-2.5 top-1/2 z-[1] -translate-y-1/2 text-zinc-400">
              <SearchIcon className="block" />
            </span>
            <input
              id="manual-candidates-q"
              name="q"
              type="search"
              defaultValue={defaultQuery}
              placeholder="Įmonė arba kodas"
              autoComplete="off"
              aria-label="Paieška pagal įmonę ar kodą"
              className="box-border h-9 w-[360px] rounded-md border border-zinc-200 bg-white py-0 pl-8 pr-2.5 text-sm text-zinc-900 outline-none ring-0 placeholder:text-zinc-400 focus:border-zinc-400 focus:ring-1 focus:ring-zinc-300"
            />
          </div>

          <div className="shrink-0">
            <label htmlFor="manual-candidates-status" className="sr-only">
              Statusas
            </label>
            <select
              id="manual-candidates-status"
              name="status"
              defaultValue={defaultStatus}
              title="Statusas"
              className="box-border h-9 w-[140px] cursor-pointer rounded-md border border-zinc-200 bg-white px-2 text-sm text-zinc-900 outline-none focus:border-zinc-400 focus:ring-1 focus:ring-zinc-300"
            >
              <option value="">Visi</option>
              <option value="new_lead">Naujas leadas</option>
              <option value="former_client">Buvęs klientas</option>
              <option value="existing_client">Esamas klientas</option>
            </select>
          </div>

          <button
            type="submit"
            className="box-border h-9 w-[110px] shrink-0 rounded-md border border-zinc-200 bg-zinc-100 text-sm font-medium text-zinc-800 transition-colors hover:bg-zinc-200 hover:text-zinc-900 active:bg-zinc-200/90"
          >
            Taikyti
          </button>
        </div>
      </div>
    </form>
  );
}
