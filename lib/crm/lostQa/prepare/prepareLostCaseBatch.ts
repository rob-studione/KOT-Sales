import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { LostCaseRow } from "@/lib/crm/lostQaDb";
import { fetchLostCaseById } from "@/lib/crm/lostQa/prepare/preparedInputRepository";
import { prepareLostCaseFromDb } from "@/lib/crm/lostQa/prepare/prepareLostCase";

const PREPARE_STATUSES = [
  "pending_analysis",
  "analyzed",
  "reviewed",
  "feedback_sent",
  "closed",
] as const;

export async function listLostCasesForBatchPrepare(
  admin: SupabaseClient,
  params: {
    mailboxId?: string | null;
    limit: number;
    onlyCurrentPendingAnalysis: boolean;
  }
): Promise<LostCaseRow[]> {
  let q = admin
    .from("lost_cases")
    .select("*")
    .order("lost_detected_at", { ascending: true })
    .limit(Math.max(1, params.limit));

  if (params.mailboxId?.trim()) {
    q = q.eq("mailbox_id", params.mailboxId.trim());
  }

  if (params.onlyCurrentPendingAnalysis) {
    q = q.eq("status", "pending_analysis");
  } else {
    q = q.in("status", [...PREPARE_STATUSES]);
  }

  const { data, error } = await q;
  if (error) throw error;
  return (data as LostCaseRow[]) ?? [];
}

export type BatchPrepareSummary = {
  attempted: number;
  prepared_new: number;
  skipped_same_hash: number;
  failed: number;
};

export async function prepareLostCasesBatch(
  admin: SupabaseClient,
  params: {
    mailboxId?: string | null;
    limit?: number;
    onlyCurrentPendingAnalysis?: boolean;
  }
): Promise<BatchPrepareSummary> {
  const limit = params.limit ?? 50;
  const onlyCurrentPendingAnalysis = params.onlyCurrentPendingAnalysis ?? true;

  const cases = await listLostCasesForBatchPrepare(admin, {
    mailboxId: params.mailboxId,
    limit,
    onlyCurrentPendingAnalysis,
  });

  let prepared_new = 0;
  let skipped_same_hash = 0;
  let failed = 0;

  for (const c of cases) {
    const fresh = await fetchLostCaseById(admin, c.id);
    if (!fresh) {
      failed += 1;
      continue;
    }
    const r = await prepareLostCaseFromDb(admin, fresh);
    if (!r.ok) {
      failed += 1;
      continue;
    }
    if (r.skipped) skipped_same_hash += 1;
    else prepared_new += 1;
  }

  return {
    attempted: cases.length,
    prepared_new,
    skipped_same_hash,
    failed,
  };
}
