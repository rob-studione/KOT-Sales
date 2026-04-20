import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { prepareLostCaseFromDb } from "@/lib/crm/lostQa/prepare/prepareLostCase";
import { runLostCaseAnalysis } from "@/lib/crm/lostQa/analyze/runLostCaseAnalysis";
import { fetchLostCaseById } from "@/lib/crm/lostQa/prepare/preparedInputRepository";

function summaryDateFromLostDetectedAt(lostDetectedAtIso: string | null | undefined): string | null {
  const s = String(lostDetectedAtIso ?? "").trim();
  if (!s) return null;
  // lost_detected_at is stored as ISO timestamptz; YYYY-MM-DD prefix is stable for date grouping.
  const ymd = s.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(ymd) ? ymd : null;
}

export type PostIngestPipelineResult =
  | {
      ok: true;
      lost_case_id: string;
      mailbox_id: string;
      summary_date: string;
      prepare: { outcome: "prepared" | "skipped"; reason?: string };
      analyze: {
        outcome: "analyzed_new" | "updated_existing" | "skipped_existing" | "skipped_settings";
        reason?: string;
      };
      daily_summary: { outcome: "created_or_updated" | "skipped"; reason?: string };
    }
  | { ok: false; lost_case_id: string; error: string };

export async function runPostIngestLostQaPipeline(
  admin: SupabaseClient,
  params: { lostCaseId: string }
): Promise<PostIngestPipelineResult> {
  const lostCaseId = params.lostCaseId;

  const lostCase = await fetchLostCaseById(admin, lostCaseId);
  if (!lostCase) {
    return { ok: false, lost_case_id: lostCaseId, error: "Lost case not found." };
  }
  const summaryDate = summaryDateFromLostDetectedAt(lostCase.lost_detected_at);
  if (!summaryDate) {
    return { ok: false, lost_case_id: lostCaseId, error: "Invalid lost_detected_at; cannot compute summary date." };
  }

  console.log("[lost-qa post-ingest] prepare started", {
    lost_case_id: lostCaseId,
    mailbox_id: lostCase.mailbox_id,
    summary_date: summaryDate,
  });
  const prep = await prepareLostCaseFromDb(admin, lostCase);
  if (!prep.ok) {
    console.error("[lost-qa post-ingest] prepare failed", {
      lost_case_id: lostCaseId,
      mailbox_id: lostCase.mailbox_id,
      summary_date: summaryDate,
      error: prep.error,
    });
    return { ok: false, lost_case_id: lostCaseId, error: prep.error };
  }
  if (prep.skipped) {
    console.log("[lost-qa post-ingest] prepare skipped", {
      lost_case_id: lostCaseId,
      mailbox_id: lostCase.mailbox_id,
      summary_date: summaryDate,
      reason: prep.reason,
    });
  } else {
    console.log("[lost-qa post-ingest] prepare finished", {
      lost_case_id: lostCaseId,
      mailbox_id: lostCase.mailbox_id,
      summary_date: summaryDate,
      prepared_input_id: prep.prepared_input_id,
      prepared_hash: prep.prepared_hash,
    });
  }

  console.log("[lost-qa post-ingest] analyze started", {
    lost_case_id: lostCaseId,
    mailbox_id: lostCase.mailbox_id,
    summary_date: summaryDate,
  });
  const analysis = await runLostCaseAnalysis(admin, { lostCaseId, force: false, invoke: "auto" });
  if (!analysis.ok) {
    console.error("[lost-qa post-ingest] analyze failed", {
      lost_case_id: lostCaseId,
      mailbox_id: lostCase.mailbox_id,
      summary_date: summaryDate,
      error: analysis.error,
    });
    return { ok: false, lost_case_id: lostCaseId, error: analysis.error };
  }
  if (analysis.outcome === "skipped_existing" || analysis.outcome === "skipped_settings") {
    console.log("[lost-qa post-ingest] analyze skipped", {
      lost_case_id: lostCaseId,
      mailbox_id: lostCase.mailbox_id,
      summary_date: summaryDate,
      reason: analysis.reason,
    });
  } else {
    console.log("[lost-qa post-ingest] analyze finished", {
      lost_case_id: lostCaseId,
      mailbox_id: lostCase.mailbox_id,
      summary_date: summaryDate,
      outcome: analysis.outcome,
      analysis_id: analysis.analysis_id,
    });
  }

  if (analysis.outcome === "skipped_existing" || analysis.outcome === "skipped_settings") {
    console.log("[lost-qa post-ingest] daily summary refresh skipped", {
      lost_case_id: lostCaseId,
      mailbox_id: lostCase.mailbox_id,
      summary_date: summaryDate,
      reason:
        analysis.outcome === "skipped_existing"
          ? "analysis already reflected current prepared input"
          : analysis.reason,
    });
  } else {
    console.log("[lost-qa post-ingest] daily summary refresh finished", {
      lost_case_id: lostCaseId,
      mailbox_id: lostCase.mailbox_id,
      summary_date: summaryDate,
      via: "runLostCaseAnalysis",
    });
  }

  return {
    ok: true,
    lost_case_id: lostCaseId,
    mailbox_id: lostCase.mailbox_id,
    summary_date: summaryDate,
    prepare: prep.skipped ? { outcome: "skipped", reason: prep.reason } : { outcome: "prepared" },
    analyze:
      analysis.outcome === "skipped_existing" || analysis.outcome === "skipped_settings"
        ? { outcome: analysis.outcome, reason: analysis.reason }
        : { outcome: analysis.outcome },
    daily_summary:
      analysis.outcome === "skipped_existing" || analysis.outcome === "skipped_settings"
        ? {
            outcome: "skipped",
            reason:
              analysis.outcome === "skipped_existing"
                ? "analysis already reflected current prepared input"
                : analysis.reason,
          }
        : { outcome: "created_or_updated" },
  };
}

