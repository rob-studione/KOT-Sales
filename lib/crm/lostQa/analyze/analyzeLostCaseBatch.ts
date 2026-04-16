import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { runLostCaseAnalysis } from "@/lib/crm/lostQa/analyze/runLostCaseAnalysis";
import { getCurrentPreparedInput } from "@/lib/crm/lostQa/prepare/preparedInputRepository";

export type AnalyzePendingParams = {
  mailboxId?: string | null;
  limit?: number;
  force?: boolean;
};

export type AnalyzePendingSummary = {
  attempted: number;
  analyzed_new: number;
  skipped_existing: number;
  updated_existing: number;
  failed: number;
};

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

export async function analyzeLostCasesPendingBatch(
  admin: SupabaseClient,
  params: AnalyzePendingParams
): Promise<AnalyzePendingSummary> {
  const rawLimit = params.limit ?? DEFAULT_LIMIT;
  const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : DEFAULT_LIMIT, 1), MAX_LIMIT);

  let q = admin
    .from("lost_cases")
    .select("id")
    .or("status.eq.pending_analysis,needs_reanalysis.eq.true")
    .order("lost_detected_at", { ascending: true })
    .limit(limit);

  if (params.mailboxId?.trim()) {
    q = q.eq("mailbox_id", params.mailboxId.trim());
  }

  const { data, error } = await q;
  if (error) throw error;
  const rows = (data as { id: string }[] | null) ?? [];

  const summary: AnalyzePendingSummary = {
    attempted: 0,
    analyzed_new: 0,
    skipped_existing: 0,
    updated_existing: 0,
    failed: 0,
  };

  const force = Boolean(params.force);

  for (const row of rows) {
    const prepared = await getCurrentPreparedInput(admin, row.id);
    if (!prepared) {
      continue;
    }

    summary.attempted += 1;
    const r = await runLostCaseAnalysis(admin, { lostCaseId: row.id, force });
    if (!r.ok) {
      summary.failed += 1;
      continue;
    }
    if (r.outcome === "skipped_existing") {
      summary.skipped_existing += 1;
    } else if (r.outcome === "analyzed_new") {
      summary.analyzed_new += 1;
    } else {
      summary.updated_existing += 1;
    }
  }

  return summary;
}
