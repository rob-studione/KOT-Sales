export const CRM_PAGE_SIZE = 20;

export function parsePage(raw: string | string[] | undefined): number {
  const s = typeof raw === "string" ? raw : "1";
  const n = parseInt(s, 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, 50_000);
}

export function totalPages(totalCount: number, pageSize: number): number {
  return Math.max(1, Math.ceil(totalCount / pageSize));
}
