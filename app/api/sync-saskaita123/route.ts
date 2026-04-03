import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  type AnyRecord,
  asNumber,
  asString,
  buildInvoicesListUrl,
  INVOICES_LIST_BASE,
  isRecord,
  mapInvoiceListItems,
  mergeMappedRowsByInvoiceId,
  parseInvoicesListJson,
  resolveInvoicesListNextUrl,
} from "@/lib/invoice123/invoices-list";

let didLogFullJson = false;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
    promise
      .then((v) => resolve(v))
      .catch(reject)
      .finally(() => clearTimeout(id));
  });
}

/** Full sync: follow pagination until API has no next URL. Optional SYNC_MAX_PAGES_FULL caps pages (safety). */
function resolveFullSyncMaxPages(): number {
  const raw = process.env.SYNC_MAX_PAGES_FULL;
  if (raw === undefined || raw === "") {
    return Number.MAX_SAFE_INTEGER;
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) {
    return Number.MAX_SAFE_INTEGER;
  }
  return Math.floor(n);
}

function addDaysUtc(isoDate: string, deltaDays: number): string {
  const [y, m, d] = isoDate.split("-").map((x) => parseInt(x, 10));
  const t = Date.UTC(y, m - 1, d) + deltaDays * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

function todayUtcIso(): string {
  return new Date().toISOString().slice(0, 10);
}

const BOOTSTRAP_CHECKPOINT_ID = "default";

function parseLookbackOverride(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

/** Env default (1) or `SYNC_INCREMENTAL_LOOKBACK_DAYS`, capped at 180. */
function defaultIncrementalLookbackFromEnv(): number {
  const n = Number(process.env.SYNC_INCREMENTAL_LOOKBACK_DAYS);
  if (Number.isFinite(n) && n >= 1) return Math.min(180, Math.floor(n));
  return 1;
}

/**
 * Incremental: rolling inclusive date window (API `range`).
 * Request body `lookbackDays` overrides env default; always clamped to [1, 180].
 */
function resolveIncrementalLookbackDays(override: unknown): number {
  const o = parseLookbackOverride(override);
  if (o === undefined) return defaultIncrementalLookbackFromEnv();
  return Math.min(180, Math.max(1, Math.floor(o)));
}

function resolveIncrementalMaxPages(): number {
  const n = Number(process.env.SYNC_MAX_PAGES_INCREMENTAL);
  if (!Number.isFinite(n) || n < 1) {
    return 300;
  }
  return Math.min(500, Math.floor(n));
}

export async function POST(request: Request) {
  const startedAt = Date.now();

  let bodyParsed: { full?: unknown; lookbackDays?: unknown; debug?: unknown } = {};
  let fullSync = false;
  let debugResponse = false;
  try {
    const text = await request.text();
    if (text.trim()) {
      bodyParsed = JSON.parse(text) as typeof bodyParsed;
      fullSync = bodyParsed.full === true;
      debugResponse = bodyParsed.debug === true;
    }
  } catch {
    fullSync = false;
    debugResponse = false;
  }

  let invoiceCount = 0;
  let latestKnownInvoiceDate: string | null = null;
  let supabase;
  try {
    supabase = createSupabaseServerClient();
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json(
      { error: `Supabase: ${message}`, fetched: 0, validRows: 0, upsertedCount: 0, tookMs: Date.now() - startedAt },
      { status: 500 }
    );
  }

  let supabaseMinInvoiceDateBefore: string | null = null;
  {
    const { count, error: countError } = await supabase
      .from("invoices")
      .select("*", { count: "exact", head: true });
    if (countError) {
      console.log("[sync-saskaita123] error counting invoices", countError.message);
    }
    invoiceCount = count ?? 0;

    if (invoiceCount > 0) {
      const { data, error } = await supabase
        .from("invoices")
        .select("invoice_date")
        .order("invoice_date", { ascending: false })
        .limit(1);

      if (error) {
        console.log("[sync-saskaita123] error reading latestKnownInvoiceDate", error.message);
      } else {
        const first = (data ?? [])[0] as AnyRecord | undefined;
        const d = asString(first?.invoice_date);
        latestKnownInvoiceDate = d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
      }

      const { data: minRows, error: minErr } = await supabase
        .from("invoices")
        .select("invoice_date")
        .order("invoice_date", { ascending: true })
        .limit(1);
      if (!minErr && minRows?.[0]) {
        const md = asString((minRows[0] as AnyRecord).invoice_date);
        supabaseMinInvoiceDateBefore = md && /^\d{4}-\d{2}-\d{2}$/.test(md) ? md : null;
      }
    }
  }

  const emptyDatabase = invoiceCount === 0;
  const noAnchorDate = invoiceCount > 0 && latestKnownInvoiceDate === null;
  const effectiveFullSync = fullSync || emptyDatabase || noAnchorDate;

  let autoFullSyncReason: "empty_database" | "no_anchor_date" | null = null;
  if (!fullSync && effectiveFullSync) {
    autoFullSyncReason = emptyDatabase ? "empty_database" : "no_anchor_date";
  }

  const lookbackOverrideRaw = bodyParsed.lookbackDays;
  const lookbackDaysResolved = !effectiveFullSync ? resolveIncrementalLookbackDays(lookbackOverrideRaw) : null;
  const lookbackSource =
    !effectiveFullSync && parseLookbackOverride(lookbackOverrideRaw) !== undefined ? "request" : "env";

  const incrementalWindow =
    !effectiveFullSync && lookbackDaysResolved != null
      ? (() => {
          const end = todayUtcIso();
          const start = addDaysUtc(end, -(lookbackDaysResolved - 1));
          return {
            rangeStart: start,
            rangeEnd: end,
            lookbackDays: lookbackDaysResolved,
            lookbackSource,
          };
        })()
      : null;

  if (!effectiveFullSync) {
    const { data: bootstrapCp, error: bootErr } = await supabase
      .from("invoice_bootstrap_checkpoint")
      .select("finished")
      .eq("id", BOOTSTRAP_CHECKPOINT_ID)
      .maybeSingle();

    if (bootErr) {
      console.log("[sync-saskaita123] bootstrap checkpoint read error", bootErr.message);
      return NextResponse.json(
        {
          error: "bootstrap_checkpoint_unavailable",
          message: bootErr.message,
          tookMs: Date.now() - startedAt,
        },
        { status: 503 }
      );
    }

    if (!bootstrapCp || bootstrapCp.finished !== true) {
      return NextResponse.json(
        {
          error: "bootstrap_not_finished",
          message:
            "Complete historical bootstrap first: POST /api/sync-saskaita123/bootstrap until hasMore=false and finished=true.",
          currentCheckpoint: { finished: bootstrapCp?.finished ?? false },
          tookMs: Date.now() - startedAt,
        },
        { status: 409 }
      );
    }
  }

  const hardTimeoutMs = effectiveFullSync
    ? Number(process.env.SYNC_FULL_TIMEOUT_MS) || 3_600_000
    : Number(process.env.SYNC_INCREMENTAL_TIMEOUT_MS) || 60_000;

  try {
    /** Updated during pagination so a hard timeout can still report partial progress. */
    const runDebug = {
      pagesFetched: 0,
      earliestInvoiceDateSeenInFetch: null as string | null,
      firstPaginationFromApi: null as {
        current_page: number | null;
        last_page: number | null;
        total: number | null;
        per_page: number | null;
        next_page_url: string | null;
      } | null,
      lastPaginationFromApi: null as {
        current_page: number | null;
        last_page: number | null;
        total: number | null;
        per_page: number | null;
        next_page_url: string | null;
      } | null,
      stoppedReason: "unknown" as string,
      nextUrlAfterLastPage: null as string | null,
    };

    const run = async () => {
      console.log("[sync-saskaita123] start", {
        fullSync,
        effectiveFullSync,
        autoFullSyncReason,
        invoiceCount,
        latestKnownInvoiceDate,
        incrementalLookback: incrementalWindow,
      });

      const apiKey = process.env.SASKAITA123_API_KEY;
      if (!apiKey) {
        console.log("[sync-saskaita123] error: missing SASKAITA123_API_KEY");
        console.log("[sync-saskaita123] before returning response");
        return NextResponse.json(
          {
            error: "Missing env var SASKAITA123_API_KEY",
            fetched: 0,
            validRows: 0,
            upsertedCount: 0,
            tookMs: Date.now() - startedAt,
          },
          { status: 500 }
        );
      }

      const fetchPage = async (url: string) => {
        let res: Response;
        let text = "";
        let json: unknown = null;

        console.log("[sync-saskaita123] before fetch", url);
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

          console.log("[sync-saskaita123] after fetch", {
            ok: res.ok,
            status: res.status,
            contentType: res.headers.get("content-type"),
          });

          console.log("[sync-saskaita123] before reading body");
          try {
            text = await withTimeout(res.text(), 10_000, "Reading upstream response body");
          } finally {
            clearTimeout(abortId);
          }
          console.log("[sync-saskaita123] after reading body", { bytes: text.length });

          console.log("[sync-saskaita123] before parsing JSON");
          json = text ? (JSON.parse(text) as unknown) : null;
          console.log("[sync-saskaita123] after parsing JSON");
        } catch (e) {
          clearTimeout(abortId);
          const msg = e instanceof Error ? `${e.name}: ${e.message}` : "Unknown error";
          throw new Error(msg);
        }

        return { res, json };
      };

      let pagesFetched = 0;
      /** Sum of `data.result.length` across pages (may exceed unique invoices if API returns line-level rows). */
      let listRowsRaw = 0;
      const snapshotPagination = (pagination: AnyRecord | null, nextResolved: string | null) => {
        const cur =
          typeof pagination?.current_page === "number"
            ? pagination.current_page
            : asNumber(pagination?.current_page);
        const last =
          typeof pagination?.last_page === "number"
            ? pagination.last_page
            : asNumber(pagination?.last_page);
        const tot =
          typeof pagination?.total === "number" ? pagination.total : asNumber(pagination?.total);
        const per =
          typeof pagination?.per_page === "number"
            ? pagination.per_page
            : asNumber(pagination?.per_page);
        return {
          current_page: cur,
          last_page: last,
          total: tot,
          per_page: per,
          next_page_url: nextResolved,
        };
      };

      /** Canonical CRM row — matches public.invoices columns (Saskaita123 → DB). */
      const allMappedValid: Array<{
        invoice_id: string;
        client_id: string | null;
        company_name: string;
        company_code: string;
        vat_code: string | null;
        address: string | null;
        email: string | null;
        phone: string | null;
        invoice_date: string;
        amount: number;
        series_title: string | null;
        series_number: number | null;
        updated_at: string;
      }> = [];
      let nextUrl: string | null = effectiveFullSync
        ? INVOICES_LIST_BASE
        : incrementalWindow
          ? buildInvoicesListUrl({
              page: 1,
              limit: 50,
              rangeStart: incrementalWindow.rangeStart,
              rangeEnd: incrementalWindow.rangeEnd,
            })
          : INVOICES_LIST_BASE;
      let stoppedReason: string = "unknown";
      const maxPages = effectiveFullSync ? resolveFullSyncMaxPages() : resolveIncrementalMaxPages();
      let paginationDebug:
        | {
            page: unknown;
            per_page: unknown;
            total: unknown;
            current_page: unknown;
            last_page: unknown;
            next_page_url: unknown;
            topLevelPaginationKeys: string[];
            dataPaginationKeys: string[];
          dataKeys: string[];
          dataDataKeys: string[] | null;
          dataPreview: unknown;
          dataDataPreview: unknown;
          paginationLikeFields: Record<string, unknown>;
          }
        | null = null;

      try {
        while (nextUrl && pagesFetched < maxPages) {
          console.log("[sync-saskaita123] fetching page", pagesFetched + 1);
          const { res, json } = await fetchPage(nextUrl);
          pagesFetched += 1;

          if (debugResponse && pagesFetched === 1) {
            const top = isRecord(json) ? (json as AnyRecord) : {};
            const data = isRecord((top as AnyRecord).data) ? ((top as AnyRecord).data as AnyRecord) : {};
            const dataData =
              isRecord((data as AnyRecord).data) ? ((data as AnyRecord).data as AnyRecord) : null;

            const isPagKey = (k: string) =>
              /page|per_page|perPage|total|next|prev|previous|last|first|cursor|links|meta/i.test(k);

            const pickPaginationLike = (obj: AnyRecord) => {
              const out: Record<string, unknown> = {};
              for (const [k, v] of Object.entries(obj)) {
                if (/^(links|meta|pagination|cursor|offset|limit)$/i.test(k) || /cursor|offset|limit/i.test(k)) {
                  out[k] = v;
                }
              }
              return out;
            };

            const shallowPreview = (v: unknown) => {
              if (!isRecord(v)) return v;
              const entries = Object.entries(v).slice(0, 25);
              return Object.fromEntries(entries);
            };

            paginationDebug = {
              page: (data as AnyRecord).page ?? (top as AnyRecord).page,
              per_page: (data as AnyRecord).per_page ?? (data as AnyRecord).perPage ?? (top as AnyRecord).per_page,
              total: (data as AnyRecord).total ?? (top as AnyRecord).total,
              current_page: (data as AnyRecord).current_page ?? (data as AnyRecord).currentPage ?? (top as AnyRecord).current_page,
              last_page: (data as AnyRecord).last_page ?? (data as AnyRecord).lastPage ?? (top as AnyRecord).last_page,
              next_page_url: (data as AnyRecord).next_page_url ?? (data as AnyRecord).nextPageUrl ?? (top as AnyRecord).next_page_url,
              topLevelPaginationKeys: Object.keys(top).filter(isPagKey),
              dataPaginationKeys: Object.keys(data).filter(isPagKey),
              dataKeys: Object.keys(data),
              dataDataKeys: dataData ? Object.keys(dataData) : null,
              dataPreview: shallowPreview(data),
              dataDataPreview: shallowPreview(dataData),
              paginationLikeFields: {
                top: pickPaginationLike(top),
                data: pickPaginationLike(data),
                dataData: dataData ? pickPaginationLike(dataData) : null,
              },
            };
          }

          if (debugResponse && !didLogFullJson) {
            didLogFullJson = true;
            try {
              console.log("[sync-saskaita123] FULL PARSED JSON (first request only):", json);
            } catch (e) {
              console.log(
                "[sync-saskaita123] FULL PARSED JSON log failed:",
                e instanceof Error ? e.message : "Unknown error"
              );
            }
          }

          if (!res.ok) {
            console.log("[sync-saskaita123] error: upstream not ok", { upstreamStatus: res.status });
            if (
              !effectiveFullSync &&
              incrementalWindow &&
              pagesFetched === 1 &&
              (res.status === 400 || res.status === 422)
            ) {
              return NextResponse.json(
                {
                  error: `Incremental sync requires Invoice123 list ?range= support; upstream returned ${res.status}.`,
                  effectiveFullSync,
                  incrementalLookback: incrementalWindow,
                  tookMs: Date.now() - startedAt,
                },
                { status: 502 }
              );
            }
            throw new Error(`Upstream returned non-2xx (${res.status})`);
          }

          const { invoices, pagination: paginationObj } = parseInvoicesListJson(json);
          listRowsRaw += invoices.length;

          const nextFromApi = asString(paginationObj?.next_page_url) ?? asString(paginationObj?.nextPageUrl);
          const currentPage =
            typeof paginationObj?.current_page === "number"
              ? paginationObj.current_page
              : Number(asString(paginationObj?.current_page) ?? NaN);
          console.log("[sync-saskaita123] current_page", Number.isFinite(currentPage) ? currentPage : null);

          const pagSnap = snapshotPagination(paginationObj, nextFromApi);
          runDebug.lastPaginationFromApi = pagSnap;
          if (pagesFetched === 1) {
            runDebug.firstPaginationFromApi = pagSnap;
          }

          const { rows: mappedPage, pageErrors } = mapInvoiceListItems(invoices);
          if (pageErrors.length > 0) {
            console.log("[sync-saskaita123] page mapping issues", pageErrors.slice(0, 8));
          }

          for (const r of mappedPage) {
            if (
              runDebug.earliestInvoiceDateSeenInFetch === null ||
              r.invoice_date < runDebug.earliestInvoiceDateSeenInFetch
            ) {
              runDebug.earliestInvoiceDateSeenInFetch = r.invoice_date;
            }
          }

          // Incremental: always paginate through the full lookback `range` window; do not stop on invoice_date vs DB max.

          // Accumulate mapped rows from this page.
          allMappedValid.push(...mappedPage);

          // Decide next page
          if (nextFromApi) {
            nextUrl = resolveInvoicesListNextUrl(nextFromApi);
            runDebug.nextUrlAfterLastPage = nextUrl;
          } else {
            stoppedReason = "no_next_page_url";
            runDebug.stoppedReason = stoppedReason;
            runDebug.nextUrlAfterLastPage = null;
            console.log("[sync-saskaita123] stoppedReason", stoppedReason);
            nextUrl = null;
          }
          runDebug.pagesFetched = pagesFetched;
        }

        if (pagesFetched >= maxPages && nextUrl) {
          stoppedReason = "max_pages_cap";
          runDebug.stoppedReason = stoppedReason;
          if (!effectiveFullSync && incrementalWindow) {
            console.warn(
              "[sync-saskaita123] INCREMENTAL_MAX_PAGES_CAP — lookback window exceeded per-run page budget; more pages remain.",
              {
                stoppedReason,
                pagesFetched,
                maxPages,
                hasNextPageUrl: true,
                incrementalLookback: incrementalWindow,
                recovery:
                  "No data loss if you re-run: increase SYNC_MAX_PAGES_INCREMENTAL, or rely on the next overlapping run (same range + idempotent upsert by invoice_id).",
              }
            );
          } else {
            console.log("[sync-saskaita123] stoppedReason", stoppedReason, { pagesFetched, maxPages });
          }
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Unknown error";
        runDebug.stoppedReason = "error";
        console.log("[sync-saskaita123] error during fetch/pagination", msg);
        console.log("[sync-saskaita123] runDebug", runDebug);
        console.log("[sync-saskaita123] before returning response");
        const errBase = {
          fullSync,
          effectiveFullSync,
          invoiceCount,
          invoiceCountAfter: null as number | null,
          fetchedTotal: 0,
          validRows: 0,
          upsertedCount: 0,
          latestKnownInvoiceDate,
          pagesFetched,
          stoppedReason: "error" as const,
          incrementalLookback: effectiveFullSync ? null : incrementalWindow,
          error: msg,
          tookMs: Date.now() - startedAt,
        };
        return NextResponse.json(
          debugResponse
            ? {
                ...errBase,
                debug: {
                  ...runDebug,
                  supabaseMinInvoiceDateBefore,
                  hardTimeoutMs,
                },
              }
            : errBase,
          { status: 502 }
        );
      }

      const uniqueRows = mergeMappedRowsByInvoiceId(allMappedValid);
      const fetchedTotal = uniqueRows.length;
      const validRows = uniqueRows.length;
      const duplicateRowsMerged = Math.max(0, listRowsRaw - uniqueRows.length);
      console.log("[sync-saskaita123] fetched count", {
        listRowsRaw,
        uniqueInvoices: uniqueRows.length,
        duplicateRowsMerged,
      });

      console.log("[sync-saskaita123] valid mapped rows count", validRows);

      const UPSERT_BATCH = 400;
      let upsertedCount = 0;
      let upsertError: string | null = null;
      if (uniqueRows.length > 0) {
        for (let i = 0; i < uniqueRows.length; i += UPSERT_BATCH) {
          const batch = uniqueRows.slice(i, i + UPSERT_BATCH);
          const upsertRes = await supabase
            .from("invoices")
            .upsert(batch, { onConflict: "invoice_id" })
            .select("invoice_id");
          upsertedCount += upsertRes.data?.length ?? 0;
          if (upsertRes.error) upsertError = upsertRes.error.message;
        }
      }

      console.log("[sync-saskaita123] upsert done", {
        upsertedCount,
        validRows,
        listRowsRaw,
        duplicateRowsMerged,
        batches: Math.ceil(uniqueRows.length / UPSERT_BATCH),
      });

      let supabaseMinInvoiceDateAfter: string | null = null;
      let invoiceCountAfter: number | null = null;
      {
        const { count: cAfter } = await supabase.from("invoices").select("*", { count: "exact", head: true });
        invoiceCountAfter = cAfter ?? 0;
        const { data: minAfterRows, error: minAfterErr } = await supabase
          .from("invoices")
          .select("invoice_date")
          .order("invoice_date", { ascending: true })
          .limit(1);
        if (!minAfterErr && minAfterRows?.[0]) {
          const md = asString((minAfterRows[0] as AnyRecord).invoice_date);
          supabaseMinInvoiceDateAfter = md && /^\d{4}-\d{2}-\d{2}$/.test(md) ? md : null;
        }
      }

      runDebug.stoppedReason = stoppedReason;
      const apiTotalHint = runDebug.firstPaginationFromApi?.total;
      const apiLastPageHint = runDebug.firstPaginationFromApi?.last_page;
      console.log("[sync-saskaita123] sync summary", {
        stoppedReason,
        pagesFetched,
        earliestInvoiceDateSeenInFetch: runDebug.earliestInvoiceDateSeenInFetch,
        apiTotalFromFirstPage: apiTotalHint,
        apiLastPageFromFirstPage: apiLastPageHint,
        lastPaginationFromApi: runDebug.lastPaginationFromApi,
        supabaseMinInvoiceDateBefore,
        supabaseMinInvoiceDateAfter,
        invoiceCountAfter,
      });

      console.log("[sync-saskaita123] before returning response");
      const recoveryHint =
        stoppedReason === "max_pages_cap" && !effectiveFullSync
          ? "Incremental run hit SYNC_MAX_PAGES_INCREMENTAL before reaching the end of the date range; more invoices may exist on later pages. Safe recovery: increase SYNC_MAX_PAGES_INCREMENTAL, or rely on the next scheduled run with the same lookback (overlapping re-fetch is idempotent via upsert on invoice_id)."
          : undefined;

      const slim = {
        fullSync,
        effectiveFullSync,
        invoiceCount,
        invoiceCountAfter,
        fetchedTotal,
        validRows,
        listRowsRaw,
        duplicateRowsMerged,
        upsertedCount,
        latestKnownInvoiceDate,
        pagesFetched,
        stoppedReason,
        incrementalLookback: effectiveFullSync ? null : incrementalWindow,
        error: upsertError,
        tookMs: Date.now() - startedAt,
        ...(recoveryHint ? { recoveryHint } : {}),
      };
      return NextResponse.json(
        debugResponse
          ? {
              ...slim,
              paginationDebug,
              debug: {
                ...runDebug,
                stoppedReason,
                incrementalMaxPages: effectiveFullSync ? null : maxPages,
                supabaseMinInvoiceDateBefore,
                supabaseMinInvoiceDateAfter,
                invoiceCountAfter,
                hardTimeoutMs,
                openapiNotes: [
                  "Invoice123 OpenAPI: GET /invoices query param page has maximum 500.",
                  "List `data.result` may contain line-level rows; we normalize to invoice id and merge duplicates before upsert.",
                  "Incremental sync uses Invoice123 range + full pagination in the window; upsert by invoice_id.",
                  "If stoppedReason is max_pages_cap on incremental, remaining pages were not fetched this run; next overlapping run or a higher SYNC_MAX_PAGES_INCREMENTAL completes the window safely.",
                ],
              },
            }
          : slim
      );
    };

    let hardTimeoutId: ReturnType<typeof setTimeout> | undefined;
    const hardTimeoutPromise = new Promise<NextResponse>((resolve) => {
      hardTimeoutId = setTimeout(() => {
        runDebug.stoppedReason = "hard_timeout";
        console.log("[sync-saskaita123] error: hard timeout reached", runDebug);
        console.log("[sync-saskaita123] before returning response");
        resolve(
          NextResponse.json(
            debugResponse
              ? {
                  error: `Hard timeout after ${hardTimeoutMs}ms`,
                  fullSync,
                  effectiveFullSync,
                  invoiceCount,
                  fetchedTotal: 0,
                  validRows: 0,
                  upsertedCount: 0,
                  latestKnownInvoiceDate,
                  pagesFetched: runDebug.pagesFetched,
                  stoppedReason: "hard_timeout",
                  incrementalLookback: effectiveFullSync ? null : incrementalWindow,
                  note:
                    "The HTTP response was cut off by the server timeout; pagination may still be running until the process ends, and some pages may have been upserted before this response.",
                  debug: {
                    ...runDebug,
                    supabaseMinInvoiceDateBefore,
                    hardTimeoutMs,
                  },
                  tookMs: Date.now() - startedAt,
                }
              : {
                  error: `Hard timeout after ${hardTimeoutMs}ms`,
                  fullSync,
                  effectiveFullSync,
                  invoiceCount,
                  fetchedTotal: 0,
                  validRows: 0,
                  upsertedCount: 0,
                  latestKnownInvoiceDate,
                  pagesFetched: runDebug.pagesFetched,
                  stoppedReason: "hard_timeout",
                  incrementalLookback: effectiveFullSync ? null : incrementalWindow,
                  tookMs: Date.now() - startedAt,
                },
            { status: 504 }
          )
        );
      }, hardTimeoutMs);
    });

    try {
      const result = await Promise.race([run(), hardTimeoutPromise]);
      return result;
    } finally {
      if (hardTimeoutId) clearTimeout(hardTimeoutId);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const name = error instanceof Error ? error.name : "Error";
    console.log("[sync-saskaita123] error", { name, message });
    console.log("[sync-saskaita123] before returning response");
    return NextResponse.json(
      {
        tookMs: Date.now() - startedAt,
        fetched: 0,
        validRows: 0,
        upsertedCount: 0,
        error: `${name}: ${message}`,
      },
      { status: 500 }
    );
  }
}

