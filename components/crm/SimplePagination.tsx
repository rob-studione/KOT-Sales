"use client";

import Link from "next/link";
import { useCallback } from "react";
import { buildPaginationSlots } from "@/lib/crm/pagination";

export type SimplePaginationProps = {
  /** Path only, e.g. `/projektai/uuid` (no query string). */
  basePath: string;
  pageIndex0: number;
  totalPages: number;
  /** Extra query params to preserve (omit empty values). */
  extraQuery?: Record<string, string | undefined>;
  ariaLabel?: string;
};

const btn =
  "inline-flex h-8 min-w-[2rem] cursor-pointer items-center justify-center rounded border border-zinc-200 bg-white px-2 text-sm text-zinc-800 hover:bg-zinc-50";
const btnDisabled =
  "inline-flex h-8 min-w-[2rem] cursor-not-allowed items-center justify-center rounded border border-zinc-100 bg-transparent px-2 text-sm text-zinc-400";
const btnActive =
  "inline-flex h-8 min-w-[2rem] cursor-pointer items-center justify-center rounded bg-zinc-900 px-2 text-sm font-medium text-white hover:bg-zinc-800";

function buildHref(basePath: string, extraQuery: Record<string, string | undefined> | undefined, pageIndex0: number) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(extraQuery ?? {})) {
    if (v !== undefined && v !== "") p.set(k, v);
  }
  if (pageIndex0 > 0) {
    p.set("page", String(pageIndex0));
  } else {
    p.delete("page");
  }
  const q = p.toString();
  return q ? `${basePath}?${q}` : basePath;
}

export function SimplePagination({
  basePath,
  pageIndex0,
  totalPages,
  extraQuery,
  ariaLabel = "Puslapiavimas",
}: SimplePaginationProps) {
  const current1Based = pageIndex0 + 1;
  const slots = buildPaginationSlots(totalPages, current1Based);

  const href = useCallback(
    (idx0: number) => buildHref(basePath, extraQuery, idx0),
    [basePath, extraQuery]
  );

  if (totalPages <= 1) return null;

  return (
    <div className="border-t border-zinc-100 bg-zinc-50/80 px-4 py-3">
      <nav className="flex flex-wrap items-center justify-center gap-1" aria-label={ariaLabel}>
        {pageIndex0 > 0 ? (
          <Link href={href(0)} className={btn} title="Pirmas puslapis">
            ««
          </Link>
        ) : (
          <button type="button" disabled className={btnDisabled} title="Pirmas puslapis" aria-label="Pirmas puslapis">
            ««
          </button>
        )}

        {pageIndex0 > 0 ? (
          <Link href={href(pageIndex0 - 1)} className={btn} title="Ankstesnis">
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
                href={href(s.n - 1)}
                className={s.n === current1Based ? btnActive : btn}
                aria-current={s.n === current1Based ? "page" : undefined}
              >
                {s.n}
              </Link>
            )
          )}
        </div>

        {pageIndex0 < totalPages - 1 ? (
          <Link href={href(pageIndex0 + 1)} className={btn} title="Kitas">
            ›
          </Link>
        ) : (
          <button type="button" disabled className={btnDisabled} title="Kitas" aria-label="Kitas">
            ›
          </button>
        )}

        {pageIndex0 < totalPages - 1 ? (
          <Link href={href(totalPages - 1)} className={btn} title="Paskutinis puslapis">
            »»
          </Link>
        ) : (
          <button type="button" disabled className={btnDisabled} title="Paskutinis puslapis" aria-label="Paskutinis puslapis">
            »»
          </button>
        )}
      </nav>
    </div>
  );
}

