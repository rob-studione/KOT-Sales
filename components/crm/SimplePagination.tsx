"use client";

import Link from "next/link";
import { useCallback } from "react";
import { buildPaginationSlots } from "@/lib/crm/pagination";

export type SimplePaginationProps = {
  /** Path only, e.g. `/projektai/uuid` (no query string). */
  basePath: string;
  pageIndex0: number;
  totalPages: number;
  /** Extra query params to preserve (omit empty values). Jei `pageQueryParam=completedPage` — neįtraukite `completedPage`, jį suformuoja komponentas. */
  extraQuery?: Record<string, string | undefined>;
  /** Puslapiavimo raktas URL. `completedPage` = 1-based (pirmas puslapis be parametro). */
  pageQueryParam?: "page" | "completedPage";
  /** Rodyti „Rodoma X–Y iš Z“ virš navigacijos. */
  rangeSummary?: { from: number; to: number; total: number };
  /** `wordsLt` — „Ankstesnis“ / „Kitas“ vietoj simbolių. */
  prevNextStyle?: "symbols" | "wordsLt";
  ariaLabel?: string;
};

const btn =
  "inline-flex h-8 min-w-[2rem] cursor-pointer items-center justify-center rounded border border-zinc-200 bg-white px-2 text-sm text-zinc-800 hover:bg-zinc-50";
const btnWords =
  "inline-flex h-8 min-w-[6.5rem] cursor-pointer items-center justify-center rounded border border-zinc-200 bg-white px-2 text-sm text-zinc-800 hover:bg-zinc-50";
const btnDisabled =
  "inline-flex h-8 min-w-[2rem] cursor-not-allowed items-center justify-center rounded border border-zinc-100 bg-transparent px-2 text-sm text-zinc-400";
const btnWordsDisabled =
  "inline-flex h-8 min-w-[6.5rem] cursor-not-allowed items-center justify-center rounded border border-zinc-100 bg-transparent px-2 text-sm text-zinc-400";
const btnActive =
  "inline-flex h-8 min-w-[2rem] cursor-pointer items-center justify-center rounded bg-[#7C4A57] px-2 text-sm font-medium text-white hover:bg-[#693948]";

function buildHref(
  basePath: string,
  extraQuery: Record<string, string | undefined> | undefined,
  pageIndex0: number,
  pageQueryParam: "page" | "completedPage"
) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(extraQuery ?? {})) {
    if (v === undefined || v === "") continue;
    if (pageQueryParam === "page" && k === "page") continue;
    if (pageQueryParam === "completedPage" && k === "completedPage") continue;
    p.set(k, v);
  }
  if (pageQueryParam === "page") {
    if (pageIndex0 > 0) p.set("page", String(pageIndex0));
  } else {
    const c1 = pageIndex0 + 1;
    if (c1 > 1) p.set("completedPage", String(c1));
  }
  const q = p.toString();
  return q ? `${basePath}?${q}` : basePath;
}

export function SimplePagination({
  basePath,
  pageIndex0,
  totalPages,
  extraQuery,
  pageQueryParam = "page",
  rangeSummary,
  prevNextStyle = "symbols",
  ariaLabel = "Puslapiavimas",
}: SimplePaginationProps) {
  const current1Based = pageIndex0 + 1;
  const slots = buildPaginationSlots(totalPages, current1Based);
  const words = prevNextStyle === "wordsLt";

  const href = useCallback(
    (idx0: number) => buildHref(basePath, extraQuery, idx0, pageQueryParam),
    [basePath, extraQuery, pageQueryParam]
  );

  if (totalPages <= 1) return null;

  const pBtn = words ? btnWords : btn;
  const pBtnDis = words ? btnWordsDisabled : btnDisabled;

  return (
    <div className="border-t border-zinc-100 bg-zinc-50/80 px-4 py-3">
      {rangeSummary && rangeSummary.total > 0 ? (
        <p className="mb-2 text-center text-xs text-zinc-500 tabular-nums sm:text-left sm:text-sm">
          Rodoma {rangeSummary.from}–{rangeSummary.to} iš {rangeSummary.total}
        </p>
      ) : null}
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
          <Link href={href(pageIndex0 - 1)} className={pBtn} title="Ankstesnis">
            {words ? "Ankstesnis" : "‹"}
          </Link>
        ) : (
          <button type="button" disabled className={pBtnDis} title="Ankstesnis" aria-label="Ankstesnis">
            {words ? "Ankstesnis" : "‹"}
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
          <Link href={href(pageIndex0 + 1)} className={pBtn} title="Kitas">
            {words ? "Kitas" : "›"}
          </Link>
        ) : (
          <button type="button" disabled className={pBtnDis} title="Kitas" aria-label="Kitas">
            {words ? "Kitas" : "›"}
          </button>
        )}

        {pageIndex0 < totalPages - 1 ? (
          <Link href={href(totalPages - 1)} className={btn} title="Paskutinis puslapis">
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
    </div>
  );
}
