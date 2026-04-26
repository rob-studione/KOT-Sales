import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { analyzeLostCasesPendingBatch } from "@/lib/crm/lostQa/analyze/analyzeLostCaseBatch";
import { generateMissingDailySummaries } from "@/lib/crm/lostQa/daily/runDailySummaryBatch";
import { parseYmdOrThrow } from "@/lib/crm/lostQa/daily/dailySummaryBuild";
import { renewWatches, runHistorySyncForMailbox } from "@/lib/crm/lostQa/lostQaGmailOrchestrator";
import { fetchActiveMailboxes } from "@/lib/crm/lostQa/lostQaRepository";
import { prepareLostCasesBatch } from "@/lib/crm/lostQa/prepare/prepareLostCaseBatch";

function utcYmd(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function defaultSummaryLookbackDays(): number {
  const n = Number(process.env.LOST_QA_CRON_SUMMARY_LOOKBACK_DAYS);
  if (Number.isFinite(n) && n >= 1 && n <= 30) return Math.floor(n);
  return 7;
}

function defaultMaxMailboxesGmailPerTick(): number {
  const n = Number(process.env.LOST_QA_MAX_MAILBOXES_GMAIL_PER_TICK);
  if (Number.isFinite(n) && n >= 1) return Math.min(20, Math.floor(n));
  return 5;
}

function describeUnknownError(e: unknown): Record<string, unknown> {
  if (e instanceof Error) {
    const anyErr = e as any;
    return {
      kind: "Error",
      name: e.name,
      message: e.message,
      stack: e.stack,
      // common shapes (googleapis, fetch, etc.)
      code: typeof anyErr.code === "string" || typeof anyErr.code === "number" ? anyErr.code : undefined,
      status: typeof anyErr.status === "number" ? anyErr.status : undefined,
      statusCode: typeof anyErr.statusCode === "number" ? anyErr.statusCode : undefined,
      responseStatus: typeof anyErr.response?.status === "number" ? anyErr.response.status : undefined,
      responseData: anyErr.response?.data,
      errors: anyErr.errors,
    };
  }
  if (e && typeof e === "object") {
    try {
      return { kind: "object", value: JSON.parse(JSON.stringify(e)) as unknown };
    } catch {
      return { kind: "object", value: String(e) };
    }
  }
  return { kind: typeof e, value: String(e) };
}

export type RunLostQaPipelineTickResult = {
  watch: { mailboxId: string; renewed: boolean; error?: string }[];
  gmail: { mailboxId: string; ok: boolean; error?: string; threadsSeen?: number; threadsProcessed?: number }[];
  prepare: { attempted: number; prepared_new: number; skipped_same_hash: number; failed: number };
  analyze: {
    attempted: number;
    analyzed_new: number;
    skipped_existing: number;
    skipped_settings: number;
    updated_existing: number;
    failed: number;
  };
  daily: { dateFrom: string; dateTo: string; byMailbox: { mailboxId: string; attempted: number; created_or_updated: number; skipped: number; failed: number }[] };
};

/**
 * Vieno cron „tick’o“ pipeline: watch → Gmail history+ingest (aktyvios dėžutės) → prepare → analyze → trūkstamų dienų suvestinės.
 * Suprojektuota taip, kad kiekvienas etapas būtų idempotentas ir nenukentėtų serverless (riboti limitai per env).
 */
export async function runLostQaPipelineTick(
  admin: SupabaseClient,
  options?: { skipGmail?: boolean }
): Promise<RunLostQaPipelineTickResult> {
  const skipGmail = Boolean(options?.skipGmail);

  const watch: RunLostQaPipelineTickResult["watch"] = [];
  if (!skipGmail) {
    try {
      const w = await renewWatches(admin, {});
      watch.push(...w);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[lost-qa cron] step=renewWatches failed", { error: describeUnknownError(e) });
      watch.push({ mailboxId: "_batch", renewed: false, error: msg });
    }
  }

  const gmail: RunLostQaPipelineTickResult["gmail"] = [];
  if (!skipGmail) {
    const mailboxes = await fetchActiveMailboxes(admin);
    const maxMb = defaultMaxMailboxesGmailPerTick();
    for (const m of mailboxes.slice(0, maxMb)) {
      try {
        console.log("[lost-qa cron] step=historySync start", {
          mailboxId: m.id,
          mailboxEmail: m.email_address,
          lostLabelId: m.lost_label_id ?? null,
          watchHistoryId: m.watch_history_id ?? null,
          activationHistoryId: m.activation_history_id ?? null,
          startHistoryId: null,
        });

        const r = await runHistorySyncForMailbox(admin, m.id, null);

        console.log("[lost-qa cron] step=historySync ok", {
          mailboxId: m.id,
          mailboxEmail: m.email_address,
          threadsSeen: r.threadsSeen,
          threadsProcessed: r.threadsProcessed,
          latestHistoryId: r.latestHistoryId,
        });

        gmail.push({
          mailboxId: m.id,
          ok: true,
          threadsSeen: r.threadsSeen,
          threadsProcessed: r.threadsProcessed,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[lost-qa cron] step=historySync failed", {
          mailboxId: m.id,
          mailboxEmail: m.email_address,
          lostLabelId: m.lost_label_id ?? null,
          watchHistoryId: m.watch_history_id ?? null,
          activationHistoryId: m.activation_history_id ?? null,
          startHistoryId: null,
          error: describeUnknownError(e),
        });
        gmail.push({ mailboxId: m.id, ok: false, error: msg });
      }
    }
  }

  let prepare: RunLostQaPipelineTickResult["prepare"];
  try {
    const prepLimit = Number(process.env.LOST_QA_PREPARE_BATCH_LIMIT);
    prepare = await prepareLostCasesBatch(admin, {
      limit: Number.isFinite(prepLimit) && prepLimit > 0 ? Math.min(100, Math.floor(prepLimit)) : 30,
      onlyCurrentPendingAnalysis: true,
    });
    console.log("[lost-qa cron] step=prepare ok", prepare);
  } catch (e) {
    console.error("[lost-qa cron] step=prepare failed", { error: describeUnknownError(e) });
    throw e;
  }

  let analyze: RunLostQaPipelineTickResult["analyze"];
  try {
    const alimit = Number(process.env.LOST_QA_ANALYZE_BATCH_LIMIT);
    analyze = await analyzeLostCasesPendingBatch(admin, {
      limit: Number.isFinite(alimit) && alimit > 0 ? Math.min(100, Math.floor(alimit)) : 15,
    });
    console.log("[lost-qa cron] step=analyze ok", analyze);
  } catch (e) {
    console.error("[lost-qa cron] step=analyze failed", { error: describeUnknownError(e) });
    throw e;
  }

  const lookback = defaultSummaryLookbackDays();
  const dateTo = utcYmd(new Date());
  const dateFromDate = new Date();
  dateFromDate.setUTCDate(dateFromDate.getUTCDate() - (lookback - 1));
  const dateFrom = utcYmd(dateFromDate);
  parseYmdOrThrow(dateFrom);
  parseYmdOrThrow(dateTo);

  const active = await fetchActiveMailboxes(admin);
  const byMailbox: RunLostQaPipelineTickResult["daily"]["byMailbox"] = [];
  try {
    for (const mb of active) {
      const s = await generateMissingDailySummaries(admin, {
        dateFrom,
        dateTo,
        mailboxId: mb.id,
        force: false,
      });
      byMailbox.push({
        mailboxId: mb.id,
        attempted: s.attempted,
        created_or_updated: s.created_or_updated,
        skipped: s.skipped,
        failed: s.failed,
      });
    }
  } catch (e) {
    console.error("[lost-qa cron] step=daily mailbox failed", { dateFrom, dateTo, error: describeUnknownError(e) });
    throw e;
  }

  try {
    const gNull = await generateMissingDailySummaries(admin, {
      dateFrom,
      dateTo,
      mailboxId: null,
      force: false,
    });
    byMailbox.push({
      mailboxId: "global",
      attempted: gNull.attempted,
      created_or_updated: gNull.created_or_updated,
      skipped: gNull.skipped,
      failed: gNull.failed,
    });
  } catch (e) {
    console.error("[lost-qa cron] step=daily global failed", { dateFrom, dateTo, error: describeUnknownError(e) });
    throw e;
  }

  return { watch, gmail, prepare, analyze, daily: { dateFrom, dateTo, byMailbox } };
}
