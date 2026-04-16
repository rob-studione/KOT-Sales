import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { LostCaseMessageRow, LostCaseRow, PreparedLostCaseInputRow } from "@/lib/crm/lostQaDb";

export async function fetchLostCaseById(admin: SupabaseClient, lostCaseId: string): Promise<LostCaseRow | null> {
  const { data, error } = await admin.from("lost_cases").select("*").eq("id", lostCaseId).maybeSingle();
  if (error) throw error;
  return (data as LostCaseRow | null) ?? null;
}

export async function listMessagesForCase(
  admin: SupabaseClient,
  lostCaseId: string
): Promise<LostCaseMessageRow[]> {
  const { data, error } = await admin
    .from("lost_case_messages")
    .select("*")
    .eq("lost_case_id", lostCaseId)
    .order("message_index", { ascending: true });
  if (error) throw error;
  return (data as LostCaseMessageRow[]) ?? [];
}

export async function getCurrentPreparedInput(
  admin: SupabaseClient,
  lostCaseId: string
): Promise<PreparedLostCaseInputRow | null> {
  const { data, error } = await admin
    .from("prepared_lost_case_inputs")
    .select("*")
    .eq("lost_case_id", lostCaseId)
    .eq("is_current", true)
    .maybeSingle();
  if (error) throw error;
  return (data as PreparedLostCaseInputRow | null) ?? null;
}

export async function getMaxPreparationVersion(admin: SupabaseClient, lostCaseId: string): Promise<number> {
  const { data, error } = await admin
    .from("prepared_lost_case_inputs")
    .select("preparation_version")
    .eq("lost_case_id", lostCaseId)
    .order("preparation_version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  const v = (data as { preparation_version: number } | null)?.preparation_version;
  return typeof v === "number" ? v : 0;
}

export async function deactivateCurrentPreparedInputs(admin: SupabaseClient, lostCaseId: string): Promise<void> {
  const { error } = await admin
    .from("prepared_lost_case_inputs")
    .update({ is_current: false })
    .eq("lost_case_id", lostCaseId)
    .eq("is_current", true);
  if (error) throw error;
}

export async function insertPreparedInput(
  admin: SupabaseClient,
  row: {
    lost_case_id: string;
    preparation_version: number;
    source_message_count: number;
    selected_message_count: number;
    prepared_payload: object;
    prepared_text: string;
    prepared_hash: string;
    is_current: boolean;
  }
): Promise<string> {
  const { data, error } = await admin
    .from("prepared_lost_case_inputs")
    .insert(row)
    .select("id")
    .single();
  if (error) throw error;
  return (data as { id: string }).id;
}
