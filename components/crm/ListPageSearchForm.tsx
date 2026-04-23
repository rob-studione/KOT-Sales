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

/**
 * Compact list search: icon + input + “Ieškoti” in one row — place in `flex justify-end`
 * above the table header (same card), right-aligned.
 */
export function ListPageSearchForm({
  action,
  defaultQuery,
  placeholder = "Įveskite paieškos užklausą",
  inputId,
  hiddenFields,
  size = "compact",
  className = "",
}: {
  action: string;
  defaultQuery: string;
  placeholder?: string;
  inputId: string;
  hiddenFields: Record<string, string>;
  size?: "compact" | "regular";
  className?: string;
}) {
  const isRegular = size === "regular";
  return (
    <form
      method="get"
      action={action}
      className={[
        "flex w-full shrink-0 overflow-hidden rounded-md border border-zinc-200 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)]",
        isRegular ? "max-w-[min(100%,21rem)] sm:max-w-[24rem]" : "max-w-[min(100%,17rem)] sm:max-w-[20.5rem]",
        className,
      ].join(" ")}
    >
      {Object.entries(hiddenFields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <div className="relative min-w-0 flex-1">
        <span className="pointer-events-none absolute left-2.5 top-1/2 z-[1] -translate-y-1/2 text-zinc-400">
          <SearchIcon className="block" />
        </span>
        <input
          id={inputId}
          name="q"
          type="search"
          defaultValue={defaultQuery}
          placeholder={placeholder}
          autoComplete="off"
          className={[
            "w-full min-w-0 border-0 bg-transparent py-0 pl-8 pr-2 text-zinc-900 outline-none ring-0 placeholder:text-zinc-400 focus:ring-0",
            isRegular ? "h-10 text-sm" : "h-8 text-xs",
          ].join(" ")}
        />
      </div>
      <button
        type="submit"
        className={[
          "inline-flex shrink-0 cursor-pointer items-center justify-center border-l border-zinc-200 bg-zinc-100 font-medium text-zinc-800 transition-colors duration-150 hover:bg-zinc-200 hover:text-zinc-900 active:bg-zinc-200/90",
          isRegular ? "h-10 px-4 text-sm" : "h-8 px-3 text-xs",
        ].join(" ")}
      >
        Ieškoti
      </button>
    </form>
  );
}
