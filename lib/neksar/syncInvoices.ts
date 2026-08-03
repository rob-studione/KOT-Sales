import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  asNumber,
  asString,
  buildNeksarListUrl,
  invoiceNumberKey,
  mapNeksarInvoice,
  type MappedNeksarRow,
  NEKSAR_API_BASE_URL_DEFAULT,
  NEKSAR_DEFAULT_STATUSES,
  NEKSAR_LT_BILLING_ENTITY_ID,
  NEKSAR_PAGE_LIMIT_MAX,
  type NeksarMapSkipReason,
  parseNeksarListJson,
} from "@/lib/neksar/client-invoices";

export const NEKSAR_SYNC_STATE_ID = "neksar";
const UPSERT_BATCH = 400;

export type NeksarSyncInput = {
  updatedSince?: string | null;
  issuedFrom?: string | null;
  statuses?: string | null;
  maxPages?: number | null;
  dryRun?: boolean;
};

export type NeksarSyncStats = {
  pagesFetched: number;
  totalPages: number | null;
  apiTotal: number | null;
  listRows: number;
  candidates: number;
  insertedOrUpdated: number;
  skippedExistingOtherSource: number;
  upsertOwn: number;
  insertNew: number;
  skippedByReason: Partial<Record<NeksarMapSkipReason, number>>;
};

export type NeksarSyncSuccess = {
  ok: true;
  dryRun: boolean;
  scope: {
    baseUrl: string;
    billingEntityId: string;
    statuses: string;
    updatedSince: string | null;
    issuedFrom: string | null;
    maxPages: number;
  };
  sampleInserts: Array<{ number: string; invoice_date: string; amount: number }>;
  tookMs: number;
} & NeksarSyncStats;

export type NeksarSyncFailure = {
  ok: false;
  error: string;
  dryRun: boolean;
  httpStatus: number;
  tookMs: number;
} & Partial<NeksarSyncStats>;

export type NeksarSyncResult = NeksarSyncSuccess | NeksarSyncFailure;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
    promise
      .then((v) => resolve(v))
      .catch(reject)
      .finally(() => clearTimeout(id));
  });
}

async function writeSyncState(opts: {
  dryRun: boolean;
  success: boolean;
  result: Record<string, unknown>;
  error: string | null;
}): Promise<void> {
  if (opts.dryRun) return;
  try {
    const supabase = createSupabaseAdminClient();
    const nowIso = new Date().toISOString();
    const payload: Record<string, unknown> = {
      id: NEKSAR_SYNC_STATE_ID,
      last_result: opts.result,
      last_error: opts.error,
      updated_at: nowIso,
    };
    // last_run_at advances only on a clearly successful non-dry run.
    if (opts.success) payload.last_run_at = nowIso;
    const { error } = await supabase.from("invoice_sync_state").upsert(payload, { onConflict: "id" });
    if (error) {
      console.error("[neksar-sync] invoice_sync_state upsert failed", {
        message: error.message,
        code: error.code,
      });
    }
  } catch (e) {
    console.error("[neksar-sync] invoice_sync_state write failed", e instanceof Error ? e.message : e);
  }
}

/**
 * Neksar TMS client-invoices sync into `public.invoices` (service_role).
 * Shared by cron and the manual `/api/sync-neksar` route — no self-HTTP.
 */
export async function syncNeksarInvoices(input: NeksarSyncInput = {}): Promise<NeksarSyncResult> {
  const startedAt = Date.now();
  const dryRun = input.dryRun === true;
  const updatedSince = asString(input.updatedSince);
  const issuedFrom = asString(input.issuedFrom);
  const statuses = asString(input.statuses)?.trim() || process.env.NEKSAR_STATUSES?.trim() || NEKSAR_DEFAULT_STATUSES;
  const maxPages = Math.min(
    500,
    Math.max(1, asNumber(input.maxPages) ?? (Number(process.env.NEKSAR_MAX_PAGES) || 50))
  );
  const baseUrl = process.env.NEKSAR_API_BASE_URL?.trim() || NEKSAR_API_BASE_URL_DEFAULT;
  const billingEntityId = process.env.NEKSAR_BILLING_ENTITY_ID?.trim() || NEKSAR_LT_BILLING_ENTITY_ID;

  const stats: NeksarSyncStats = {
    pagesFetched: 0,
    totalPages: null,
    apiTotal: null,
    listRows: 0,
    candidates: 0,
    insertedOrUpdated: 0,
    skippedExistingOtherSource: 0,
    upsertOwn: 0,
    insertNew: 0,
    skippedByReason: {},
  };

  const fail = async (error: string, httpStatus: number): Promise<NeksarSyncFailure> => {
    const result: NeksarSyncFailure = {
      ok: false,
      error,
      dryRun,
      httpStatus,
      tookMs: Date.now() - startedAt,
      ...stats,
    };
    console.error("[neksar-sync] failed", {
      error,
      httpStatus,
      dryRun,
      listRows: stats.listRows,
      insertNew: stats.insertNew,
      upsertOwn: stats.upsertOwn,
      insertedOrUpdated: stats.insertedOrUpdated,
      skippedExistingOtherSource: stats.skippedExistingOtherSource,
      skippedByReason: stats.skippedByReason,
      tookMs: result.tookMs,
    });
    await writeSyncState({
      dryRun,
      success: false,
      result,
      error,
    });
    return result;
  };

  const apiKey = process.env.NEKSAR_API_KEY;
  if (!apiKey) {
    return fail("Missing env var NEKSAR_API_KEY", 500);
  }

  let supabase;
  try {
    supabase = createSupabaseAdminClient();
  } catch (e) {
    return fail(`Supabase: ${e instanceof Error ? e.message : "Unknown error"}`, 500);
  }

  const fetchPage = async (url: string): Promise<{ status: number; json: unknown; retryAfter: number | null }> => {
    const maxRetries = 4;
    let attempt = 0;
    for (;;) {
      attempt += 1;
      const controller = new AbortController();
      const abortId = setTimeout(() => controller.abort(), 15_000);
      let res: Response;
      let text = "";
      try {
        res = await fetch(url, {
          method: "GET",
          headers: { "X-API-KEY": apiKey, Accept: "application/json" },
          cache: "no-store",
          signal: controller.signal,
        });
        try {
          text = await withTimeout(res.text(), 15_000, "Reading Neksar response body");
        } finally {
          clearTimeout(abortId);
        }
      } catch (e) {
        clearTimeout(abortId);
        if (attempt <= maxRetries) {
          await sleep(Math.min(15_000, 1000 * 2 ** (attempt - 1)));
          continue;
        }
        throw new Error(e instanceof Error ? `${e.name}: ${e.message}` : "Unknown fetch error");
      }

      let json: unknown = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = null;
      }

      if (res.status === 429) {
        const ra =
          typeof (json as { retryAfter?: unknown })?.retryAfter === "number"
            ? (json as { retryAfter: number }).retryAfter
            : null;
        if (attempt <= maxRetries) {
          await sleep(Math.min(60_000, (ra ?? 2 ** attempt) * 1000));
          continue;
        }
        return { status: 429, json, retryAfter: ra };
      }

      return { status: res.status, json, retryAfter: null };
    }
  };

  const bumpSkip = (r: NeksarMapSkipReason) => {
    stats.skippedByReason[r] = (stats.skippedByReason[r] ?? 0) + 1;
  };

  const sampleInserts: Array<{ number: string; invoice_date: string; amount: number }> = [];

  try {
    let page = 1;
    for (;;) {
      if (page > maxPages) break;

      const url = buildNeksarListUrl({
        baseUrl,
        page,
        limit: NEKSAR_PAGE_LIMIT_MAX,
        statuses,
        billingEntityId,
        updatedSince,
        issuedFrom,
      });

      const { status, json } = await fetchPage(url);
      if (status === 401) return fail("Neksar 401 (invalid API key)", 502);
      if (status === 429) return fail("Neksar rate limited (429) after retries", 503);
      if (status < 200 || status >= 300) return fail(`Neksar upstream ${status}`, 502);

      stats.pagesFetched += 1;
      const { invoices, pagination } = parseNeksarListJson(json);
      stats.listRows += invoices.length;
      if (pagination) {
        stats.totalPages = pagination.totalPages;
        stats.apiTotal = pagination.total;
      }

      const candidateRows: MappedNeksarRow[] = [];
      for (const inv of invoices) {
        const r = mapNeksarInvoice(inv);
        if (!r.ok) {
          bumpSkip(r.reason);
          continue;
        }
        candidateRows.push(r.row);
      }
      stats.candidates += candidateRows.length;

      const seriesNumbers = Array.from(
        new Set(candidateRows.map((r) => r.series_number).filter((n): n is number => n != null))
      );
      const existingKeyToIds = new Map<string, Set<string>>();
      if (seriesNumbers.length > 0) {
        const { data: existing, error: exErr } = await supabase
          .from("invoices")
          .select("invoice_id, series_title, series_number")
          .in("series_number", seriesNumbers);
        if (exErr) return fail(`Existing-lookup failed: ${exErr.message}`, 502);
        for (const row of existing ?? []) {
          const key = invoiceNumberKey(
            asString((row as { series_title?: unknown }).series_title),
            asNumber((row as { series_number?: unknown }).series_number)
          );
          const id = asString((row as { invoice_id?: unknown }).invoice_id);
          if (!key || !id) continue;
          const set = existingKeyToIds.get(key) ?? new Set<string>();
          set.add(id);
          existingKeyToIds.set(key, set);
        }
      }

      const toUpsert: MappedNeksarRow[] = [];
      for (const row of candidateRows) {
        const key = invoiceNumberKey(row.series_title, row.series_number);
        const existingIds = key ? existingKeyToIds.get(key) : undefined;
        if (existingIds && existingIds.size > 0) {
          if (existingIds.has(row.invoice_id)) {
            stats.upsertOwn += 1;
            toUpsert.push(row);
          } else {
            stats.skippedExistingOtherSource += 1;
          }
        } else {
          stats.insertNew += 1;
          toUpsert.push(row);
          if (sampleInserts.length < 20) {
            sampleInserts.push({ number: row.invoice_number, invoice_date: row.invoice_date, amount: row.amount });
          }
        }
      }

      if (!dryRun && toUpsert.length > 0) {
        for (let i = 0; i < toUpsert.length; i += UPSERT_BATCH) {
          const batch = toUpsert.slice(i, i + UPSERT_BATCH);
          const upsertRes = await supabase.from("invoices").upsert(batch, { onConflict: "invoice_id" }).select("invoice_id");
          if (upsertRes.error) return fail(`Upsert failed: ${upsertRes.error.message}`, 502);
          stats.insertedOrUpdated += upsertRes.data?.length ?? 0;
        }
      } else if (dryRun) {
        stats.insertedOrUpdated += toUpsert.length;
      }

      const totalPages = pagination?.totalPages ?? page;
      if (page >= totalPages) break;
      page += 1;
    }

    const result: NeksarSyncSuccess = {
      ok: true,
      dryRun,
      scope: { baseUrl, billingEntityId, statuses, updatedSince, issuedFrom, maxPages },
      ...stats,
      sampleInserts,
      tookMs: Date.now() - startedAt,
    };

    console.info("[neksar-sync] ok", {
      dryRun,
      listRows: stats.listRows,
      insertNew: stats.insertNew,
      upsertOwn: stats.upsertOwn,
      insertedOrUpdated: stats.insertedOrUpdated,
      skippedExistingOtherSource: stats.skippedExistingOtherSource,
      skippedByReason: stats.skippedByReason,
      tookMs: result.tookMs,
    });

    await writeSyncState({
      dryRun,
      success: true,
      result,
      error: null,
    });

    return result;
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Unknown error", 500);
  }
}
