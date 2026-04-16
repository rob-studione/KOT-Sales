/** 0-based page index in URL (first page = 0). */
export const PAGE_SIZES = [20, 50, 100] as const;
export type PageSize = (typeof PAGE_SIZES)[number];

/** @deprecated Use DEFAULT_PAGE_SIZE — kept for legacy imports */
export const CRM_PAGE_SIZE = 20;
export const DEFAULT_PAGE_SIZE: PageSize = 20;

export function parsePageIndex0(raw: string | string[] | undefined): number {
  const s = typeof raw === "string" ? raw : "0";
  const n = parseInt(s, 10);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(n, 1_000_000);
}

export function parsePageSize(raw: string | string[] | undefined): PageSize {
  const s = typeof raw === "string" ? raw : "";
  const n = parseInt(s, 10);
  if (n === 50 || n === 100) return n;
  return DEFAULT_PAGE_SIZE;
}

export function totalPagesFromCount(totalCount: number, pageSize: number): number {
  if (totalCount <= 0) return 0;
  return Math.ceil(totalCount / pageSize);
}

/** Clamp 0-based page index to valid range. */
export function clampPageIndex0(requested: number, totalPages: number): number {
  if (totalPages <= 0) return 0;
  return Math.min(Math.max(0, requested), totalPages - 1);
}

/** 1-based inclusive range for “Rodoma X–Y iš Z”. */
export function showingRange1Based(
  pageIndex0: number,
  pageSize: number,
  totalCount: number
): { from: number; to: number; total: number } {
  if (totalCount <= 0) return { from: 0, to: 0, total: 0 };
  const from = pageIndex0 * pageSize + 1;
  const to = Math.min((pageIndex0 + 1) * pageSize, totalCount);
  return { from, to, total: totalCount };
}

/** Slots for pagination UI: page numbers 1-based + ellipsis markers. */
export function buildPaginationSlots(
  totalPages: number,
  current1Based: number
): Array<{ type: "page"; n: number } | { type: "ellipsis"; key: string }> {
  if (totalPages <= 0) return [];
  if (totalPages <= 9) {
    return Array.from({ length: totalPages }, (_, i) => ({ type: "page" as const, n: i + 1 }));
  }
  const cur = Math.min(Math.max(1, current1Based), totalPages);
  const pages = new Set<number>();
  pages.add(1);
  pages.add(totalPages);
  for (let d = -2; d <= 2; d++) {
    const p = cur + d;
    if (p >= 1 && p <= totalPages) pages.add(p);
  }
  const sorted = [...pages].sort((a, b) => a - b);
  const out: Array<{ type: "page"; n: number } | { type: "ellipsis"; key: string }> = [];
  let prev = 0;
  for (const n of sorted) {
    if (prev && n - prev > 1) out.push({ type: "ellipsis", key: `e-${prev}-${n}` });
    out.push({ type: "page", n });
    prev = n;
  }
  return out;
}
