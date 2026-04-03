import Link from "next/link";

function pageWindow(current: number, total: number, max = 7): number[] {
  if (total <= max) return Array.from({ length: total }, (_, i) => i + 1);
  const half = Math.floor(max / 2);
  let start = Math.max(1, current - half);
  let end = Math.min(total, start + max - 1);
  if (end - start < max - 1) start = Math.max(1, end - max + 1);
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}

type Props = {
  page: number;
  totalCount: number;
  pageSize: number;
  buildHref: (page: number) => string;
  /** Sąskaitos: Pirmas / Paskutinis, „Puslapis X iš Y“, pastaba apie naujausias/senesnes. */
  variant?: "default" | "invoices";
};

export function ListPagination({ page, totalCount, pageSize, buildHref, variant = "default" }: Props) {
  const total = Math.max(1, Math.ceil(totalCount / pageSize));
  const safe = Math.min(Math.max(1, page), total);
  const pages = pageWindow(safe, total);

  if (totalCount === 0) {
    return null;
  }

  const isInvoices = variant === "invoices";

  const btn =
    "rounded border border-zinc-200 bg-white px-2 py-1 text-zinc-800 hover:bg-zinc-50";
  const btnDisabled = "rounded border border-zinc-100 px-2 py-1 text-zinc-400";

  return (
    <>
      <nav
        className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-100 bg-zinc-50/80 px-3 py-2 text-sm"
        aria-label="Puslapiavimas"
      >
        <div className="flex flex-wrap items-center gap-1">
          {isInvoices ? (
            <>
              {safe > 1 ? (
                <Link href={buildHref(1)} className={btn}>
                  Pirmas
                </Link>
              ) : (
                <span className={btnDisabled}>Pirmas</span>
              )}
              {safe > 1 ? (
                <Link href={buildHref(safe - 1)} className={btn}>
                  Ankstesnis
                </Link>
              ) : (
                <span className={btnDisabled}>Ankstesnis</span>
              )}
              {safe < total ? (
                <Link href={buildHref(safe + 1)} className={btn}>
                  Kitas
                </Link>
              ) : (
                <span className={btnDisabled}>Kitas</span>
              )}
              {safe < total ? (
                <Link href={buildHref(total)} className={btn}>
                  Paskutinis
                </Link>
              ) : (
                <span className={btnDisabled}>Paskutinis</span>
              )}
            </>
          ) : (
            <>
              {safe > 1 ? (
                <Link href={buildHref(safe - 1)} className={btn}>
                  Ankstesnis
                </Link>
              ) : (
                <span className={btnDisabled}>Ankstesnis</span>
              )}
              {safe < total ? (
                <Link href={buildHref(safe + 1)} className={btn}>
                  Kitas
                </Link>
              ) : (
                <span className={btnDisabled}>Kitas</span>
              )}
            </>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1 justify-center">
          {pages.map((p) => (
            <Link
              key={p}
              href={buildHref(p)}
              className={
                p === safe
                  ? "min-w-[2rem] rounded bg-zinc-900 px-2 py-1 text-center text-white"
                  : "min-w-[2rem] rounded border border-zinc-200 bg-white px-2 py-1 text-center text-zinc-800 hover:bg-zinc-50"
              }
            >
              {p}
            </Link>
          ))}
        </div>
        <div className="text-xs text-zinc-500 tabular-nums">
          {isInvoices ? (
            <>
              Puslapis {safe} iš {total}
              <span className="text-zinc-400"> · iš viso {totalCount}</span>
            </>
          ) : (
            <>
              {safe} / {total} · iš viso {totalCount}
            </>
          )}
        </div>
      </nav>
      {isInvoices ? (
        <p className="border-t border-zinc-100 bg-zinc-50/80 px-3 py-2 text-xs text-zinc-500">
          Pirmas puslapis rodo naujausias sąskaitas; paskutinis – senesnes chronologine tvarka.
        </p>
      ) : null}
    </>
  );
}
