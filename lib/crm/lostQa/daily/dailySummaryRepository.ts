import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { LostDailySummaryInsert, LostDailySummaryRow } from "@/lib/crm/lostQaDb";

export async function fetchDailySummary(
  admin: SupabaseClient,
  summaryDate: string,
  mailboxId: string | null
): Promise<LostDailySummaryRow | null> {
  let q = admin.from("lost_daily_summaries").select("*").eq("summary_date", summaryDate);
  q = mailboxId ? q.eq("mailbox_id", mailboxId) : q.is("mailbox_id", null);
  const { data, error } = await q.maybeSingle();
  if (error) throw error;
  return (data as LostDailySummaryRow | null) ?? null;
}

export async function upsertDailySummary(
  admin: SupabaseClient,
  row: LostDailySummaryInsert
): Promise<string> {
  const { data, error } = await admin
    .from("lost_daily_summaries")
    .upsert(row, { onConflict: "summary_date,mailbox_id" })
    .select("id")
    .single();
  if (error) throw error;
  return (data as { id: string }).id;
}

