import type { SupabaseClient } from "@supabase/supabase-js";
import {
  type AnyRecord,
  asString,
  buildInvoicesListUrl,
  isRecord,
  type MappedListInvoiceRow,
  mapInvoiceListItems,
  mergeInvoiceRowGroup,
  mergeInvoicesListRangeIntoUrl,
  parseInvoicesListJson,
  resolveInvoicesListNextUrl,
} from "@/lib/invoice123/invoices-list";

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
    promise
      .then((v) => resolve(v))
      .catch(reject)
      .finally(() => clearTimeout(id));
  });
}

export type ReconciliationFetchStoppedReason =
  | "budget_pages"
  | "budget_time"
  | "chunk_complete"
  | "upstream_error";

export type ReconciliationChunkFetchResult = {
  pagesProcessed: number;
  upsertedThisStep: number;
  nextPageUrl: string | null;
  stoppedReason: ReconciliationFetchStoppedReason;
  upstreamError?: string;
};

function filterRowsInChunkRange(
  rows: MappedListInvoiceRow[],
  chunkStart: string,
  chunkEnd: string
): MappedListInvoiceRow[] {
  return rows.filter((r) => r.invoice_date >= chunkStart && r.invoice_date <= chunkEnd);
}

/**
 * Bounded fetch + per-page upsert for one reconciliation chunk.
 * Always enforces `range=chunkStart,chunkEnd` on every request URL.
 */
export async function runReconciliationChunkPages(opts: {
  supabase: SupabaseClient;
  apiKey: string;
  chunkRangeStart: string;
  chunkRangeEnd: string;
  resumeUrl: string | null;
  maxPages: number;
  budgetMs: number;
  startedAtMs: number;
}): Promise<ReconciliationChunkFetchResult> {
  const { chunkRangeStart, chunkRangeEnd, supabase, apiKey, maxPages, budgetMs, startedAtMs } = opts;

  const incrementalMergedById = new Map<string, MappedListInvoiceRow>();
  const UPSERT_BATCH = 400;

  let nextUrl: string | null =
    opts.resumeUrl && opts.resumeUrl.trim() !== ""
      ? mergeInvoicesListRangeIntoUrl(opts.resumeUrl.trim(), chunkRangeStart, chunkRangeEnd)
      : buildInvoicesListUrl({
          page: 1,
          limit: 50,
          rangeStart: chunkRangeStart,
          rangeEnd: chunkRangeEnd,
        });

  let pagesProcessed = 0;
  let upsertedThisStep = 0;

  const fetchPage = async (url: string) => {
    let res: Response;
    let text = "";
    let json: unknown = null;
    const controller = new AbortController();
    const abortId = setTimeout(() => controller.abort(), 10_000);
    try {
      res = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/json",
        },
        cache: "no-store",
        signal: controller.signal,
      });
      try {
        text = await withTimeout(res.text(), 10_000, "Reading upstream response body");
      } finally {
        clearTimeout(abortId);
      }
      json = text ? (JSON.parse(text) as unknown) : null;
    } catch (e) {
      clearTimeout(abortId);
      const msg = e instanceof Error ? `${e.name}: ${e.message}` : "Unknown error";
      throw new Error(msg);
    }
    return { res, json };
  };

  try {
    while (nextUrl) {
      if (Date.now() - startedAtMs >= budgetMs) {
        return {
          pagesProcessed,
          upsertedThisStep,
          nextPageUrl: mergeInvoicesListRangeIntoUrl(nextUrl, chunkRangeStart, chunkRangeEnd),
          stoppedReason: "budget_time",
        };
      }

      if (pagesProcessed >= maxPages) {
        return {
          pagesProcessed,
          upsertedThisStep,
          nextPageUrl: mergeInvoicesListRangeIntoUrl(nextUrl, chunkRangeStart, chunkRangeEnd),
          stoppedReason: "budget_pages",
        };
      }

      const pendingUrl = nextUrl;
      const urlThis = mergeInvoicesListRangeIntoUrl(nextUrl, chunkRangeStart, chunkRangeEnd);
      const { res, json } = await fetchPage(urlThis);

      if (!res.ok) {
        return {
          pagesProcessed,
          upsertedThisStep,
          nextPageUrl: mergeInvoicesListRangeIntoUrl(pendingUrl, chunkRangeStart, chunkRangeEnd),
          stoppedReason: "upstream_error",
          upstreamError: `Upstream returned non-2xx (${res.status})`,
        };
      }

      pagesProcessed += 1;

      const { invoices, pagination: paginationObj } = parseInvoicesListJson(json);
      const { rows: mappedPageRaw } = mapInvoiceListItems(invoices);
      const mappedPage = filterRowsInChunkRange(mappedPageRaw, chunkRangeStart, chunkRangeEnd);

      const rowsToUpsert: MappedListInvoiceRow[] = [];
      for (const r of mappedPage) {
        const existing = incrementalMergedById.get(r.invoice_id);
        if (!existing) {
          incrementalMergedById.set(r.invoice_id, r);
          rowsToUpsert.push(r);
        } else {
          const merged = mergeInvoiceRowGroup([existing, r]);
          incrementalMergedById.set(r.invoice_id, merged);
          rowsToUpsert.push(merged);
        }
      }

      if (rowsToUpsert.length > 0) {
        for (let i = 0; i < rowsToUpsert.length; i += UPSERT_BATCH) {
          const batch = rowsToUpsert.slice(i, i + UPSERT_BATCH);
          const upsertRes = await supabase
            .from("invoices")
            .upsert(batch, { onConflict: "invoice_id" })
            .select("invoice_id");
          if (upsertRes.error) {
            throw new Error(upsertRes.error.message);
          }
          upsertedThisStep += upsertRes.data?.length ?? 0;
        }
      }

      const nextFromApi = asString(paginationObj?.next_page_url) ?? asString(paginationObj?.nextPageUrl);
      if (!nextFromApi) {
        return {
          pagesProcessed,
          upsertedThisStep,
          nextPageUrl: null,
          stoppedReason: "chunk_complete",
        };
      }

      nextUrl = mergeInvoicesListRangeIntoUrl(
        resolveInvoicesListNextUrl(nextFromApi),
        chunkRangeStart,
        chunkRangeEnd
      );
    }

    return {
      pagesProcessed,
      upsertedThisStep,
      nextPageUrl: null,
      stoppedReason: "chunk_complete",
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return {
      pagesProcessed,
      upsertedThisStep,
      nextPageUrl: nextUrl ? mergeInvoicesListRangeIntoUrl(nextUrl, chunkRangeStart, chunkRangeEnd) : null,
      stoppedReason: "upstream_error",
      upstreamError: msg,
    };
  }
}
