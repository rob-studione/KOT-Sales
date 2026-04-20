import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { fetchLostCaseById } from "@/lib/crm/lostQa/prepare/preparedInputRepository";
import { generateDailySummary, type GenerateDailySummaryResult } from "@/lib/crm/lostQa/daily/runDailySummary";

function summaryDateFromLostDetectedAt(lostDetectedAtIso: string | null | undefined): string | null {
  const s = String(lostDetectedAtIso ?? "").trim();
  if (!s) return null;
  const ymd = s.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(ymd) ? ymd : null;
}

export type RebuildDailySummaryForCaseResult =
  | {
      ok: true;
      summary_date: string;
      mailbox_id: string | null;
      outcome: "created_or_updated" | "skipped";
      summary_id?: string;
      reason?: string;
      total_lost_count: number;
    }
  | { ok: false; error: string };

export async function rebuildDailySummaryForLostCase(
  admin: SupabaseClient,
  lostCaseId: string
): Promise<RebuildDailySummaryForCaseResult> {
  const lostCase = await fetchLostCaseById(admin, lostCaseId);
  if (!lostCase) {
    return { ok: false, error: "Lost case not found." };
  }

  const summaryDate = summaryDateFromLostDetectedAt(lostCase.lost_detected_at);
  if (!summaryDate) {
    return { ok: false, error: "Invalid lost_detected_at; cannot compute summary date." };
  }

  const rebuilt = await generateDailySummary(admin, {
    summaryDate,
    mailboxId: lostCase.mailbox_id,
    force: true,
  });

  if (!rebuilt.ok) return rebuilt;
  return { ...rebuilt, summary_date: summaryDate, mailbox_id: lostCase.mailbox_id };
}

