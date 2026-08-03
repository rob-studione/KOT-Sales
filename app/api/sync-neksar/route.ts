import { NextResponse } from "next/server";
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

const SYNC_STATE_ID = "neksar";
const UPSERT_BATCH = 400;

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

/**
 * Neksar TMS client-invoices sync into `public.invoices`.
 *
 * Cutover-safe dedup: invoices already present in KOT Sales under a DIFFERENT id
 * (delivered earlier by the legacy Invoice123 sync) are matched by invoice NUMBER
 * and skipped, so switching sources creates no duplicates and fills any gaps.
 *
 * Scope: STANDARD, native (importedAt=null), EUR, LT billing entity, status in
 * SENT,PAID,OVERDUE. Does not touch the Invoice123 integration.
 *
 * Body: { updatedSince?, issuedFrom?, statuses?, maxPages?, dryRun? }
 */
export async function POST(request: Request) {
  const startedAt = Date.now();

  const secret = process.env.NEKSAR_SYNC_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    const bearer = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
    const headerSecret = request.headers.get("x-neksar-secret");
    if (bearer !== secret && headerSecret !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  let body: {
    updatedSince?: unknown;
    issuedFrom?: unknown;
    statuses?: unknown;
    maxPages?: unknown;
    dryRun?: unknown;
  } = {};
  try {
    const text = await request.text();
    if (text.trim()) body = JSON.parse(text) as typeof body;
  } catch {
    body = {};
  }

  const dryRun = body.dryRun === true;
  const updatedSince = asString(body.updatedSince);
  const issuedFrom = asString(body.issuedFrom);
  const statuses = asString(body.statuses)?.trim() || process.env.NEKSAR_STATUSES?.trim() || NEKSAR_DEFAULT_STATUSES;
  const maxPages = Math.min(
    500,
    Math.max(1, asNumber(body.maxPages) ?? (Number(process.env.NEKSAR_MAX_PAGES) || 50))
  );

  const baseUrl = process.env.NEKSAR_API_BASE_URL?.trim() || NEKSAR_API_BASE_URL_DEFAULT;
  const billingEntityId = process.env.NEKSAR_BILLING_ENTITY_ID?.trim() || NEKSAR_LT_BILLING_ENTITY_ID;

  const apiKey = process.env.NEKSAR_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing env var NEKSAR_API_KEY", tookMs: Date.now() - startedAt },
      { status: 500 }
    );
  }

  let supabase;
  try {
    // Server-only service_role — must not use the public anon key for invoice upserts.
    supabase = createSupabaseAdminClient();
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: `Supabase: ${message}`, tookMs: Date.now() - startedAt }, { status: 500 });
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

      // 429: retryAfter comes in the body JSON (not header), per Neksar contract.
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

  const stats = {
    pagesFetched: 0,
    totalPages: null as number | null,
    apiTotal: null as number | null,
    listRows: 0,
    candidates: 0,
    insertedOrUpdated: 0,
    skippedExistingOtherSource: 0,
    upsertOwn: 0,
    insertNew: 0,
    skippedByReason: {} as Record<NeksarMapSkipReason, number>,
  };

  const bumpSkip = (r: NeksarMapSkipReason) => {
    stats.skippedByReason[r] = (stats.skippedByReason[r] ?? 0) + 1;
  };

  const sampleInserts: Array<{ number: string; invoice_date: string; amount: number }> = [];

  try {
    let page = 1;
    for (;;) {
      if (page > maxPages) {
        break;
      }
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
      if (status === 401) {
        return NextResponse.json({ error: "Neksar 401 (invalid API key)", tookMs: Date.now() - startedAt }, { status: 502 });
      }
      if (status === 429) {
        return NextResponse.json(
          { error: "Neksar rate limited (429) after retries", ...stats, tookMs: Date.now() - startedAt },
          { status: 503 }
        );
      }
      if (status < 200 || status >= 300) {
        return NextResponse.json(
          { error: `Neksar upstream ${status}`, ...stats, tookMs: Date.now() - startedAt },
          { status: 502 }
        );
      }

      stats.pagesFetched += 1;
      const { invoices, pagination } = parseNeksarListJson(json);
      stats.listRows += invoices.length;
      if (pagination) {
        stats.totalPages = pagination.totalPages;
        stats.apiTotal = pagination.total;
      }

      // Map + apply scope filters.
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

      // Cross-source dedup by invoice number: find existing rows sharing these numbers.
      const seriesNumbers = Array.from(
        new Set(candidateRows.map((r) => r.series_number).filter((n): n is number => n != null))
      );
      const existingKeyToIds = new Map<string, Set<string>>();
      if (seriesNumbers.length > 0) {
        const { data: existing, error: exErr } = await supabase
          .from("invoices")
          .select("invoice_id, series_title, series_number")
          .in("series_number", seriesNumbers);
        if (exErr) {
          return NextResponse.json(
            { error: `Existing-lookup failed: ${exErr.message}`, ...stats, tookMs: Date.now() - startedAt },
            { status: 502 }
          );
        }
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
            // Already present under a different (legacy Invoice123) id — do not duplicate.
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
          if (upsertRes.error) {
            return NextResponse.json(
              { error: `Upsert failed: ${upsertRes.error.message}`, ...stats, tookMs: Date.now() - startedAt },
              { status: 502 }
            );
          }
          stats.insertedOrUpdated += upsertRes.data?.length ?? 0;
        }
      } else if (dryRun) {
        stats.insertedOrUpdated += toUpsert.length;
      }

      const totalPages = pagination?.totalPages ?? page;
      if (page >= totalPages) break;
      page += 1;
    }

    const result = {
      ok: true,
      dryRun,
      scope: { baseUrl, billingEntityId, statuses, updatedSince, issuedFrom, maxPages },
      ...stats,
      sampleInserts,
      tookMs: Date.now() - startedAt,
    };

    if (!dryRun) {
      try {
        const nowIso = new Date().toISOString();
        await supabase.from("invoice_sync_state").upsert(
          { id: SYNC_STATE_ID, last_run_at: nowIso, last_result: result, last_error: null, updated_at: nowIso },
          { onConflict: "id" }
        );
      } catch {
        // never fail sync on status write
      }
    }

    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message, ...stats, tookMs: Date.now() - startedAt }, { status: 500 });
  }
}
