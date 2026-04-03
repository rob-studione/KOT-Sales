import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  asNumber,
  asString,
  buildInvoicesListUrl,
  type MappedListInvoiceRow,
  mapInvoiceListItems,
  parseInvoicesListJson,
  resolveInvoicesListNextUrl,
} from "@/lib/invoice123/invoices-list";

const CHECKPOINT_ID = "default";
const INVOICE_API_PAGE_MAX = 500;

type AnyRecord = Record<string, unknown>;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
    promise
      .then((v) => resolve(v))
      .catch(reject)
      .finally(() => clearTimeout(id));
  });
}

function addDays(isoDate: string, deltaDays: number): string {
  const [y, m, d] = isoDate.split("-").map((x) => parseInt(x, 10));
  const t = Date.UTC(y, m - 1, d) + deltaDays * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function nextOlderWindow(
  currentRangeStart: string,
  windowDays: number,
  historyFloor: string
): { start: string; end: string } | null {
  const newEnd = addDays(currentRangeStart, -1);
  if (newEnd < historyFloor) return null;
  let newStart = addDays(newEnd, -(windowDays - 1));
  if (newStart < historyFloor) newStart = historyFloor;
  return { start: newStart, end: newEnd };
}

function pageFromNextUrl(nextFromApi: string): number | null {
  const resolved = resolveInvoicesListNextUrl(nextFromApi);
  try {
    const u = new URL(resolved);
    const p = u.searchParams.get("page");
    if (!p) return null;
    const n = parseInt(p, 10);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function daysBetweenInclusive(startIso: string, endIso: string): number {
  // Both inputs are expected to be `YYYY-MM-DD`.
  const [sy, sm, sd] = startIso.split("-").map((x) => parseInt(x, 10));
  const [ey, em, ed] = endIso.split("-").map((x) => parseInt(x, 10));
  const startMs = Date.UTC(sy, sm - 1, sd);
  const endMs = Date.UTC(ey, em - 1, ed);
  const days = Math.floor((endMs - startMs) / 86_400_000) + 1;
  return Math.max(1, days);
}

function maybeShrinkRangeStartForPageCap(range_start: string | null, range_end: string | null): string | null {
  if (!range_start || !range_end) return null;
  const windowDays = daysBetweenInclusive(range_start, range_end);
  if (windowDays <= 1) return null;
  const newWindowDays = Math.max(1, Math.floor(windowDays / 2));
  if (newWindowDays >= windowDays) return null;
  const newStart = addDays(range_end, -(newWindowDays - 1));
  return newStart > range_start ? newStart : null;
}

function paginationStatsFromApi(pagination: AnyRecord | null | undefined): {
  currentPage: number | null;
  lastPage: number | null;
  perPage: number | null;
  total: number | null;
  impliedPages: number | null;
} {
  const currentPage = asNumber(pagination?.current_page) ?? null;
  const lastPage = asNumber(pagination?.last_page) ?? null;
  const perPage = asNumber(pagination?.per_page) ?? null;
  const total = asNumber(pagination?.total) ?? null;
  const impliedPages =
    perPage != null && total != null && perPage > 0 ? Math.ceil(total / perPage) : null;
  return { currentPage, lastPage, perPage, total, impliedPages };
}

function isLikelyTruncatedByPageCap(args: {
  requestedPage: number;
  nextFromApi: string | null;
  pagination: AnyRecord | null | undefined;
}): boolean {
  const { requestedPage, nextFromApi, pagination } = args;
  const { currentPage, lastPage, impliedPages } = paginationStatsFromApi(pagination);

  if (requestedPage > INVOICE_API_PAGE_MAX) return true;

  // Server returns a next link at/after the declared max page -> we will eventually exceed the API's cap.
  if (requestedPage >= INVOICE_API_PAGE_MAX && nextFromApi) return true;

  if (lastPage != null && lastPage > INVOICE_API_PAGE_MAX) return true;
  if (impliedPages != null && impliedPages > INVOICE_API_PAGE_MAX) return true;

  // If there's no next link, but the API says there are more items than we've paged through, treat as truncation.
  if (!nextFromApi && impliedPages != null) {
    const cur = currentPage ?? requestedPage;
    if (impliedPages > cur) return true;
  }

  // last_page==500 without next_link could still be truncation, but we avoid false positives here;
  // impliedPages/total checks cover the important cases.
  return false;
}

type Checkpoint = {
  id: string;
  strategy: "range" | "page";
  next_page: number;
  range_start: string | null;
  range_end: string | null;
  range_next_page: number;
  oldest_invoice_date_seen: string | null;
  last_batch_at: string | null;
  last_batch_imported: number;
  finished: boolean;
  total_imported_bootstrap: number;
  updated_at: string;
};

function minIsoDate(a: string | null, b: string): string {
  if (a === null) return b;
  return b < a ? b : a;
}

async function upsertInvoiceRows(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  rows: MappedListInvoiceRow[]
): Promise<number> {
  if (rows.length === 0) return 0;
  const UPSERT_BATCH = 400;
  let upserted = 0;
  for (let i = 0; i < rows.length; i += UPSERT_BATCH) {
    const batch = rows.slice(i, i + UPSERT_BATCH);
    const maxDbRetries = Math.min(
      5,
      Math.max(1, Number(process.env.BOOTSTRAP_DB_MAX_RETRIES) || 2)
    );
    const dbBackoffBaseMs = Math.min(
      10_000,
      Math.max(250, Number(process.env.BOOTSTRAP_DB_RETRY_BACKOFF_BASE_MS) || 750)
    );

    let lastErr: unknown = null;
    for (let attempt = 1; attempt <= maxDbRetries; attempt++) {
      try {
        const res = await supabase
          .from("invoices")
          .upsert(batch, { onConflict: "invoice_id" })
          .select("invoice_id");
        upserted += res.data?.length ?? 0;
        if (res.error) {
          lastErr = res.error;
          // Retry only when Supabase reports a transient-ish status.
          const code = (res.error as { code?: string }).code;
          const shouldRetry =
            attempt < maxDbRetries &&
            (code === "PGRST301" || code === "PGRST503" || code === "PGRST200" || !code);
          if (!shouldRetry) {
            throw new Error(res.error.message);
          }
        } else {
          lastErr = null;
          break;
        }
      } catch (e) {
        lastErr = e;
        if (attempt < maxDbRetries) {
          const backoff = dbBackoffBaseMs * Math.pow(2, attempt - 1);
          const jitter = Math.floor(Math.random() * 250);
          await sleep(Math.min(30_000, backoff) + jitter);
          continue;
        }
        break;
      }
    }
    if (lastErr) {
      const msg =
        lastErr instanceof Error
          ? lastErr.message
          : typeof lastErr === "string"
            ? lastErr
            : "Unknown DB upsert error";
      throw new Error(msg);
    }
  }
  return upserted;
}

export async function POST(request: Request) {
  const startedAt = Date.now();

  const secret = process.env.BOOTSTRAP_SYNC_SECRET;
  if (secret) {
    const h = request.headers.get("x-bootstrap-secret");
    const auth = request.headers.get("authorization");
    const bearer = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
    if (h !== secret && bearer !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  let body: {
    reset?: boolean;
    maxInvoices?: number;
    strategy?: "range" | "page";
  } = {};
  try {
    const text = await request.text();
    if (text.trim()) body = JSON.parse(text) as typeof body;
  } catch {
    body = {};
  }

  const envBatch = Number(process.env.BOOTSTRAP_BATCH_MAX_INVOICES);
  const maxInvoices = Math.min(
    Math.max(1, body.maxInvoices ?? (Number.isFinite(envBatch) && envBatch > 0 ? envBatch : 500)),
    2000
  );
  const maxPagesPerRun = Math.min(
    Math.max(1, Number(process.env.BOOTSTRAP_MAX_PAGES_PER_RUN) || 40),
    200
  );
  const windowDays = Math.min(
    Math.max(7, Number(process.env.BOOTSTRAP_RANGE_WINDOW_DAYS) || 120),
    366
  );
  const historyFloor =
    process.env.BOOTSTRAP_HISTORY_FLOOR?.trim() && /^\d{4}-\d{2}-\d{2}$/.test(process.env.BOOTSTRAP_HISTORY_FLOOR)
      ? process.env.BOOTSTRAP_HISTORY_FLOOR
      : "2010-01-01";
  const runTimeoutMs = Math.min(
    Math.max(30_000, Number(process.env.BOOTSTRAP_TIMEOUT_MS) || 180_000),
    900_000
  );

  const defaultStrategy =
    process.env.BOOTSTRAP_DEFAULT_STRATEGY === "page" ? "page" : "range";

  let supabase;
  try {
    supabase = createSupabaseServerClient();
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: `Supabase: ${message}`, tookMs: Date.now() - startedAt }, { status: 500 });
  }

  const apiKey = process.env.SASKAITA123_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing env var SASKAITA123_API_KEY", tookMs: Date.now() - startedAt },
      { status: 500 }
    );
  }

  if (body.reset) {
    const strat = body.strategy ?? defaultStrategy;
    const { error: resetErr } = await supabase.from("invoice_bootstrap_checkpoint").upsert(
      {
        id: CHECKPOINT_ID,
        strategy: strat,
        next_page: 1,
        range_start: null,
        range_end: null,
        range_next_page: 1,
        oldest_invoice_date_seen: null,
        finished: false,
        total_imported_bootstrap: 0,
        last_batch_imported: 0,
        last_batch_at: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );
    if (resetErr) {
      return NextResponse.json({ error: resetErr.message, tookMs: Date.now() - startedAt }, { status: 500 });
    }
  }

  const { data: cpRow, error: loadErr } = await supabase
    .from("invoice_bootstrap_checkpoint")
    .select("*")
    .eq("id", CHECKPOINT_ID)
    .maybeSingle();

  if (loadErr) {
    return NextResponse.json({ error: loadErr.message, tookMs: Date.now() - startedAt }, { status: 500 });
  }

  if (!cpRow) {
    const { error: insErr } = await supabase.from("invoice_bootstrap_checkpoint").insert({ id: CHECKPOINT_ID });
    if (insErr) {
      return NextResponse.json({ error: insErr.message, tookMs: Date.now() - startedAt }, { status: 500 });
    }
  }

  const { data: cpFresh, error: load2Err } = await supabase
    .from("invoice_bootstrap_checkpoint")
    .select("*")
    .eq("id", CHECKPOINT_ID)
    .single();

  if (load2Err || !cpFresh) {
    return NextResponse.json(
      { error: load2Err?.message ?? "Checkpoint missing", tookMs: Date.now() - startedAt },
      { status: 500 }
    );
  }

  let cp = cpFresh as Checkpoint;

  if (!body.reset && body.strategy && body.strategy !== cp.strategy) {
    const { error: uErr } = await supabase
      .from("invoice_bootstrap_checkpoint")
      .update({
        strategy: body.strategy,
        next_page: 1,
        range_start: null,
        range_end: null,
        range_next_page: 1,
        finished: false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", CHECKPOINT_ID);
    if (uErr) {
      return NextResponse.json({ error: uErr.message, tookMs: Date.now() - startedAt }, { status: 500 });
    }
    const { data: again } = await supabase.from("invoice_bootstrap_checkpoint").select("*").eq("id", CHECKPOINT_ID).single();
    if (again) cp = again as Checkpoint;
  }

  const checkpointStartSignature = `${cp.strategy}|${cp.next_page}|${cp.range_start ?? ""}|${cp.range_end ?? ""}|${cp.range_next_page}|${cp.finished}`;
  const totalImportedBefore = Number(cp.total_imported_bootstrap);

  if (cp.finished) {
    return NextResponse.json({
      importedThisRun: 0,
      totalImportedSoFar: Number(cp.total_imported_bootstrap),
      currentCheckpoint: cp,
      currentWindow:
        cp.range_start && cp.range_end
          ? { start: cp.range_start, end: cp.range_end }
          : null,
      oldestSeen: cp.oldest_invoice_date_seen,
      hasMore: false,
      nextAction: "Bootstrap already finished. POST with { reset: true } to start over.",
      tookMs: Date.now() - startedAt,
    });
  }

  const initRangeIfNeeded = async (): Promise<{ skipFinished: boolean }> => {
    if (cp.strategy !== "range") return { skipFinished: false };
    if (cp.range_start && cp.range_end) return { skipFinished: false };

    const { data: minRows } = await supabase
      .from("invoices")
      .select("invoice_date")
      .order("invoice_date", { ascending: true })
      .limit(1);

    const minD = minRows?.[0] as { invoice_date?: string } | undefined;
    const minStr = minD?.invoice_date && /^\d{4}-\d{2}-\d{2}$/.test(minD.invoice_date) ? minD.invoice_date : null;

    let range_end: string;
    let range_start: string;

    if (minStr) {
      range_end = addDays(minStr, -1);
      if (range_end < historyFloor) {
        return { skipFinished: true };
      }
      range_start = addDays(range_end, -(windowDays - 1));
      if (range_start < historyFloor) range_start = historyFloor;
    } else {
      range_end = todayISO();
      range_start = addDays(range_end, -(windowDays - 1));
      if (range_start < historyFloor) range_start = historyFloor;
    }

    cp.range_start = range_start;
    cp.range_end = range_end;
    cp.range_next_page = 1;
    return { skipFinished: false };
  };

  let importedThisRun = 0;
  let pagesThisRun = 0;
  let oldestThisRun: string | null = null;
  let stopReason = "incomplete";
  let rangeFallbackToPage = false;

  const checkpointEveryPages =
    Math.max(1, Number(process.env.BOOTSTRAP_CHECKPOINT_EVERY_PAGES) || 1);
  const maxRetries = Math.min(
    5,
    Math.max(1, Number(process.env.BOOTSTRAP_FETCH_MAX_RETRIES) || 3)
  );
  const retryBackoffBaseMs = Math.min(
    10_000,
    Math.max(250, Number(process.env.BOOTSTRAP_FETCH_RETRY_BACKOFF_BASE_MS) || 1000)
  );

  const saveCheckpoint = async (opts: { lastBatchImported: number }) => {
    // Persist progress frequently to make restarts/crashes safe.
    const newTotal = Number(cp.total_imported_bootstrap) + importedThisRun;
    const newOldest =
      cp.oldest_invoice_date_seen && oldestThisRun
        ? minIsoDate(cp.oldest_invoice_date_seen, oldestThisRun)
        : cp.oldest_invoice_date_seen ?? oldestThisRun;

    const { error: saveErr } = await supabase
      .from("invoice_bootstrap_checkpoint")
      .update({
        strategy: cp.strategy,
        next_page: cp.next_page,
        range_start: cp.range_start,
        range_end: cp.range_end,
        range_next_page: cp.range_next_page,
        oldest_invoice_date_seen: newOldest,
        finished: cp.finished,
        total_imported_bootstrap: newTotal,
        last_batch_imported: opts.lastBatchImported,
        last_batch_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", CHECKPOINT_ID);

    if (saveErr) throw new Error(saveErr.message);
  };

  const fetchInvoicesListPage = async (url: string): Promise<{ res: Response; json: unknown }> => {
    let lastErr: unknown = null;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const controller = new AbortController();
      const abortId = setTimeout(() => controller.abort(), 10_000);

      try {
        const res = await fetch(url, {
          method: "GET",
          headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
          cache: "no-store",
          signal: controller.signal,
        });

        // Retry on transient conditions.
        if (!res.ok) {
          if ([429, 500, 502, 503, 504].includes(res.status) && attempt < maxRetries) {
            throw new Error(`Upstream transient ${res.status}`);
          }
          return { res, json: null };
        }

        // Parse body only when we got a successful response or will retry later.
        let text = "";
        try {
          text = await withTimeout(res.text(), 10_000, "Reading upstream response body");
        } finally {
          clearTimeout(abortId);
        }

        const json = text ? JSON.parse(text) : null;
        return { res, json };
      } catch (e) {
        lastErr = e;
      } finally {
        clearTimeout(abortId);
      }

      if (attempt < maxRetries) {
        const backoff = retryBackoffBaseMs * Math.pow(2, attempt - 1);
        // Add jitter to reduce thundering herd.
        const jitter = Math.floor(Math.random() * 250);
        await sleep(Math.min(30_000, backoff) + jitter);
      }
    }
    const msg = lastErr instanceof Error ? lastErr.message : "Unknown fetch error";
    throw new Error(msg);
  };

  try {
    const init = await initRangeIfNeeded();
    if (init.skipFinished) {
      cp.finished = true;
      stopReason = "nothing_older_than_existing_db_and_floor";
    } else {
      while (
        importedThisRun < maxInvoices &&
        pagesThisRun < maxPagesPerRun &&
        Date.now() - startedAt < runTimeoutMs &&
        !cp.finished
      ) {
        let url: string;
        if (cp.strategy === "range") {
          if (!cp.range_start || !cp.range_end) break;

          // If we exceed the Invoice123 documented page cap, shrink the date window and retry.
          if (cp.range_next_page > INVOICE_API_PAGE_MAX) {
            const newStart = maybeShrinkRangeStartForPageCap(cp.range_start, cp.range_end);
            if (!newStart) {
              throw new Error(
                `Cannot continue bootstrap: page cap (${INVOICE_API_PAGE_MAX}) exceeded for smallest range. ` +
                  `range_start=${cp.range_start}, range_end=${cp.range_end}, range_next_page=${cp.range_next_page}`
              );
            }
            cp.range_start = newStart;
            cp.range_next_page = 1;
            await saveCheckpoint({ lastBatchImported: 0 });
            continue;
          }

          url = buildInvoicesListUrl({
            page: cp.range_next_page,
            limit: 50,
            rangeStart: cp.range_start,
            rangeEnd: cp.range_end,
          });
        } else {
          url = buildInvoicesListUrl({ page: cp.next_page, limit: 50 });
        }

        const { res, json } = await fetchInvoicesListPage(url);

        if (!res.ok) {
          if (cp.strategy === "range" && (res.status === 400 || res.status === 422)) {
            console.log("[bootstrap] range filter rejected; falling back to page strategy");
            cp.strategy = "page";
            cp.range_start = null;
            cp.range_end = null;
            cp.range_next_page = 1;
            cp.next_page = 1;
            rangeFallbackToPage = true;
            continue;
          }
          throw new Error(`Upstream ${res.status}`);
        }

        const { invoices, pagination } = parseInvoicesListJson(json);
        const { rows } = mapInvoiceListItems(invoices);
        let pageOldest: string | null = null;
        for (const r of rows) {
          pageOldest = minIsoDate(pageOldest, r.invoice_date);
          oldestThisRun = minIsoDate(oldestThisRun, r.invoice_date);
        }

        const nUpsert = await upsertInvoiceRows(supabase, rows);
        importedThisRun += nUpsert;
        pagesThisRun += 1;

        const nextFromApi = asString(pagination?.next_page_url) ?? asString(pagination?.nextPageUrl);
        const requestedPage = cp.strategy === "range" ? cp.range_next_page : cp.next_page;

        // Detect truncation due to Invoice123 `page` maximum (500).
        if (cp.strategy === "range") {
          const truncated = isLikelyTruncatedByPageCap({
            requestedPage,
            nextFromApi: nextFromApi ?? null,
            pagination,
          });

          if (truncated) {
            const newStart = maybeShrinkRangeStartForPageCap(cp.range_start, cp.range_end);
            if (!newStart) {
              throw new Error(
                `Cannot continue bootstrap: Invoice123 page cap truncation detected even at the smallest window. ` +
                  `range_start=${cp.range_start}, range_end=${cp.range_end}, requested_page=${requestedPage}, ` +
                  `pagination_stats=${JSON.stringify(paginationStatsFromApi(pagination))}`
              );
            }
            console.log("[bootstrap] page-cap truncation suspected; shrinking range", {
              rangeStart: cp.range_start,
              rangeEnd: cp.range_end,
              truncated,
              requestedPage,
              nextFromApi,
              pagination: pagination ? Object.keys(pagination).slice(0, 20) : null,
            });
            cp.range_start = newStart;
            cp.range_next_page = 1;

            if (pagesThisRun % checkpointEveryPages === 0) {
              await saveCheckpoint({ lastBatchImported: nUpsert });
            }
            // Re-fetch page 1 for the shrunken date window.
            if (importedThisRun >= maxInvoices) {
              stopReason = "batch_invoice_cap";
              break;
            }
            continue;
          }
        }

        // Determine next cursor position.
        if (nextFromApi) {
          const p = pageFromNextUrl(nextFromApi);
          if (p == null) throw new Error("Failed to parse next_page_url page parameter");
          if (cp.strategy === "range") cp.range_next_page = p;
          else cp.next_page = p;
        } else if (cp.strategy === "range") {
          const windowDaysCurrent = daysBetweenInclusive(cp.range_start!, cp.range_end!);
          const nw = nextOlderWindow(cp.range_start!, windowDaysCurrent, historyFloor);
          if (!nw) {
            cp.finished = true;
            stopReason = "reached_history_floor";
          } else {
            cp.range_start = nw.start;
            cp.range_end = nw.end;
            cp.range_next_page = 1;
          }
        } else {
          cp.finished = true;
          stopReason = "no_next_page_url";
        }

        if (pagesThisRun % checkpointEveryPages === 0) {
          await saveCheckpoint({ lastBatchImported: nUpsert });
        }

        if (importedThisRun >= maxInvoices) {
          stopReason = "batch_invoice_cap";
          break;
        }
      }

      if (Date.now() - startedAt >= runTimeoutMs && !cp.finished) {
        stopReason = "run_timeout";
      } else if (pagesThisRun >= maxPagesPerRun && !cp.finished && importedThisRun < maxInvoices) {
        stopReason = "max_pages_per_run";
      } else if (stopReason === "incomplete" && !cp.finished) {
        stopReason = importedThisRun > 0 ? "batch_complete_more_likely" : "no_work_done";
      }
    }

    const newTotal = Number(cp.total_imported_bootstrap) + importedThisRun;
    const newOldest =
      cp.oldest_invoice_date_seen && oldestThisRun
        ? minIsoDate(cp.oldest_invoice_date_seen, oldestThisRun)
        : (cp.oldest_invoice_date_seen ?? oldestThisRun);

    const { error: saveErr } = await supabase
      .from("invoice_bootstrap_checkpoint")
      .update({
        strategy: cp.strategy,
        next_page: cp.next_page,
        range_start: cp.range_start,
        range_end: cp.range_end,
        range_next_page: cp.range_next_page,
        oldest_invoice_date_seen: newOldest,
        finished: cp.finished,
        total_imported_bootstrap: newTotal,
        last_batch_imported: importedThisRun,
        last_batch_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", CHECKPOINT_ID);

    if (saveErr) throw new Error(saveErr.message);

    const { data: cpOut } = await supabase.from("invoice_bootstrap_checkpoint").select("*").eq("id", CHECKPOINT_ID).single();

    const finalCp = (cpOut ?? cp) as Checkpoint;
    const hasMore = !finalCp.finished;

    const checkpointFinalSignature = `${finalCp.strategy}|${finalCp.next_page}|${finalCp.range_start ?? ""}|${finalCp.range_end ?? ""}|${finalCp.range_next_page}|${finalCp.finished}`;
    const stuckDetected =
      hasMore && importedThisRun === 0 && checkpointFinalSignature === checkpointStartSignature;
    if (stuckDetected) {
      stopReason = "stuck_no_progress";
      console.log("[bootstrap] stuck detected: checkpoint unchanged and importedThisRun=0", {
        checkpointStartSignature,
        checkpointFinalSignature,
        totalImportedBefore,
        totalImportedSoFar: Number(finalCp.total_imported_bootstrap),
      });
    }

    const nextAction = finalCp.finished
      ? "History bootstrap complete. Use POST /api/sync-saskaita123 for incremental sync."
      : rangeFallbackToPage
        ? "Range API unsupported or rejected; continued in page mode. Call this endpoint again."
        : "Call POST /api/sync-saskaita123/bootstrap again (cron or scheduler) until hasMore is false.";

    return NextResponse.json({
      importedThisRun,
      totalImportedSoFar: Number(finalCp.total_imported_bootstrap),
      currentCheckpoint: finalCp,
      currentWindow:
        finalCp.range_start && finalCp.range_end
          ? { start: finalCp.range_start, end: finalCp.range_end }
          : null,
      oldestSeen: finalCp.oldest_invoice_date_seen,
      hasMore,
      nextAction,
      stopReason,
      pagesThisRun,
      tookMs: Date.now() - startedAt,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.log("[bootstrap] error", message);
    if (importedThisRun > 0) {
      const newTotal = Number(cp.total_imported_bootstrap) + importedThisRun;
      const newOldest =
        cp.oldest_invoice_date_seen && oldestThisRun
          ? minIsoDate(cp.oldest_invoice_date_seen, oldestThisRun)
          : (cp.oldest_invoice_date_seen ?? oldestThisRun);
      await supabase
        .from("invoice_bootstrap_checkpoint")
        .update({
          strategy: cp.strategy,
          next_page: cp.next_page,
          range_start: cp.range_start,
          range_end: cp.range_end,
          range_next_page: cp.range_next_page,
          oldest_invoice_date_seen: newOldest,
          finished: cp.finished,
          total_imported_bootstrap: newTotal,
          last_batch_imported: importedThisRun,
          last_batch_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", CHECKPOINT_ID);
    }
    const { data: cpAfterErr } = await supabase.from("invoice_bootstrap_checkpoint").select("*").eq("id", CHECKPOINT_ID).maybeSingle();
    return NextResponse.json(
      {
        error: message,
        importedThisRun,
        totalImportedSoFar: Number(cpAfterErr?.total_imported_bootstrap ?? cp.total_imported_bootstrap),
        currentCheckpoint: (cpAfterErr ?? cp) as Checkpoint,
        currentWindow:
          (cpAfterErr ?? cp).range_start && (cpAfterErr ?? cp).range_end
            ? {
                start: (cpAfterErr ?? cp).range_start,
                end: (cpAfterErr ?? cp).range_end,
              }
            : null,
        oldestSeen: (cpAfterErr ?? cp).oldest_invoice_date_seen,
        hasMore: !(cpAfterErr as Checkpoint | undefined)?.finished,
        nextAction:
          importedThisRun > 0
            ? "Partial batch was saved. Fix the error and call bootstrap again to continue."
            : "Fix the error, then call bootstrap again.",
        tookMs: Date.now() - startedAt,
      },
      { status: 502 }
    );
  }
}
