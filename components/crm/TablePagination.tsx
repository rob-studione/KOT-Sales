"use client";

import Link from "next/link";
import { useCallback, useId } from "react";
import { useRouter } from "next/navigation";
import {
  PAGE_SIZES,
  type PageSize,
  buildPaginationSlots,
} from "@/lib/crm/pagination";

export type TablePaginationProps = {
  /** Path only, e.g. `/clients` or `/clients/foo%20bar` (no query string). */
  basePath: string;
  pageIndex0: number;
  pageSize: PageSize;
  totalCount: number;
  totalPages: number;
  showingFrom: number;
  showingTo: number;
  /** Extra query params to preserve (e.g. `q`, `sort`, `q` for invoices). Omit empty values. */
  extraQuery?: Record<string, string | undefined>;
  ariaLabel?: string;
};

const btn =
  "inline-flex h-8 min-w-[2rem] cursor-pointer items-center justify-center rounded border border-zinc-200 bg-white px-2 text-sm text-zinc-800 hover:bg-zinc-50";
const btnDisabled =
  "inline-flex h-8 min-w-[2rem] cursor-not-allowed items-center justify-center rounded border border-zinc-100 bg-transparent px-2 text-sm text-zinc-400";
const btnActive =
  "inline-flex h-8 min-w-[2rem] cursor-pointer items-center justify-center rounded bg-zinc-900 px-2 text-sm font-medium text-white hover:bg-zinc-800";

function useBuildHref(basePath: string, extraQuery: Record<string, string | undefined> | undefined) {
  return useCallback(
    (pageIndex0: number, pageSize: PageSize) => {
      const p = new URLSearchParams();
      for (const [k, v] of Object.entries(extraQuery ?? {})) {
        if (v !== undefined && v !== "") p.set(k, v);
      }
      p.set("page", String(pageIndex0));
      p.set("pageSize", String(pageSize));
      const q = p.toString();
      return q ? `${basePath}?${q}` : basePath;
    },
    [basePath, extraQuery]
  );
}

/**
 * Shared table footer: page size (20/50/100), “Rodoma X–Y iš Z”, ellipsis page numbers, first/prev/next/last.
 * Place below the table; same layout on all CRM list pages.
 */
export function TablePagination({
  basePath,
  pageIndex0,
  pageSize,
  totalCount,
  totalPages,
  showingFrom,
  showingTo,
  extraQuery,
  ariaLabel = "Puslapiavimas",
}: TablePaginationProps) {
  const pageSizeId = useId();
  const router = useRouter();
  const buildHref = useBuildHref(basePath, extraQuery);

  const pushHref = useCallback(
    (nextPageIndex0: number, size: PageSize) => {
      router.push(buildHref(nextPageIndex0, size));
    },
    [buildHref, router]
  );

  const onPageSizeChange = useCallback(
    (next: PageSize) => {
      pushHref(0, next);
    },
    [pushHref]
  );

  const current1Based = pageIndex0 + 1;
  const slots = buildPaginationSlots(totalPages, current1Based);

  return (
    <div className="border-t border-zinc-100 bg-zinc-50/80 px-4 py-3">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-700">
          <label htmlFor={pageSizeId} className="text-zinc-600">
            Puslapyje
          </label>
          <select
            id={pageSizeId}
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value) as PageSize)}
            className="h-9 cursor-pointer rounded-md border border-zinc-200 bg-white px-2 text-sm outline-none focus:border-zinc-400"
          >
            {PAGE_SIZES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          {totalCount > 0 ? (
            <span className="text-xs text-zinc-500 tabular-nums sm:text-sm">
              Rodoma {showingFrom}–{showingTo} iš {totalCount}
            </span>
          ) : (
            <span className="text-xs text-zinc-500 sm:text-sm">Nėra įrašų</span>
          )}
        </div>

        {totalPages > 0 ? (
          <nav className="flex flex-wrap items-center justify-center gap-1" aria-label={ariaLabel}>
            {pageIndex0 > 0 ? (
              <Link href={buildHref(0, pageSize)} className={btn} title="Pirmas puslapis">
                ««
              </Link>
            ) : (
              <button
                type="button"
                disabled
                className={btnDisabled}
                title="Pirmas puslapis"
                aria-label="Pirmas puslapis"
              >
                ««
              </button>
            )}
            {pageIndex0 > 0 ? (
              <Link href={buildHref(pageIndex0 - 1, pageSize)} className={btn} title="Ankstesnis">
                ‹
              </Link>
            ) : (
              <button type="button" disabled className={btnDisabled} title="Ankstesnis" aria-label="Ankstesnis">
                ‹
              </button>
            )}

            <div className="flex flex-wrap items-center gap-1 px-1">
              {slots.map((s) =>
                s.type === "ellipsis" ? (
                  <span key={s.key} className="px-1 text-zinc-400">
                    …
                  </span>
                ) : (
                  <Link
                    key={s.n}
                    href={buildHref(s.n - 1, pageSize)}
                    className={s.n === current1Based ? btnActive : btn}
                    aria-current={s.n === current1Based ? "page" : undefined}
                  >
                    {s.n}
                  </Link>
                )
              )}
            </div>

            {pageIndex0 < totalPages - 1 ? (
              <Link href={buildHref(pageIndex0 + 1, pageSize)} className={btn} title="Kitas">
                ›
              </Link>
            ) : (
              <button type="button" disabled className={btnDisabled} title="Kitas" aria-label="Kitas">
                ›
              </button>
            )}
            {pageIndex0 < totalPages - 1 ? (
              <Link href={buildHref(totalPages - 1, pageSize)} className={btn} title="Paskutinis puslapis">
                »»
              </Link>
            ) : (
              <button
                type="button"
                disabled
                className={btnDisabled}
                title="Paskutinis puslapis"
                aria-label="Paskutinis puslapis"
              >
                »»
              </button>
            )}
          </nav>
        ) : null}
      </div>
    </div>
  );
}
