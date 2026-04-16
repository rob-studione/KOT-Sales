import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { GmailMailboxRow, GmailThreadRawRow, LostCaseRow, LostCaseMessageRow } from "@/lib/crm/lostQaDb";

const TERMINAL_LOST_CASE_STATUSES = new Set<string>(["reviewed", "feedback_sent", "closed"]);

export async function fetchMailbox(admin: SupabaseClient, mailboxId: string): Promise<GmailMailboxRow | null> {
  const { data, error } = await admin.from("gmail_mailboxes").select("*").eq("id", mailboxId).maybeSingle();
  if (error) throw error;
  return (data as GmailMailboxRow | null) ?? null;
}

export async function fetchActiveMailboxes(admin: SupabaseClient): Promise<GmailMailboxRow[]> {
  const { data, error } = await admin.from("gmail_mailboxes").select("*").eq("is_active", true);
  if (error) throw error;
  return (data as GmailMailboxRow[]) ?? [];
}

export async function updateMailboxLostLabelAndMaybeWatchFields(
  admin: SupabaseClient,
  mailboxId: string,
  patch: Partial<
    Pick<GmailMailboxRow, "lost_label_id" | "watch_history_id" | "watch_expiration_at" | "activation_history_id">
  >
): Promise<void> {
  const { error } = await admin.from("gmail_mailboxes").update(patch).eq("id", mailboxId);
  if (error) throw error;
}

export async function fetchGmailThreadRaw(
  admin: SupabaseClient,
  mailboxId: string,
  gmailThreadId: string
): Promise<GmailThreadRawRow | null> {
  const { data, error } = await admin
    .from("gmail_threads_raw")
    .select("*")
    .eq("mailbox_id", mailboxId)
    .eq("gmail_thread_id", gmailThreadId)
    .maybeSingle();
  if (error) throw error;
  return (data as GmailThreadRawRow | null) ?? null;
}

export async function upsertGmailThreadRaw(
  admin: SupabaseClient,
  row: Omit<GmailThreadRawRow, "id" | "created_at" | "updated_at" | "fetched_at"> & {
    fetched_at?: string;
  }
): Promise<void> {
  const payload = {
    ...row,
    fetched_at: row.fetched_at ?? new Date().toISOString(),
  };
  const { error } = await admin.from("gmail_threads_raw").upsert(payload, {
    onConflict: "mailbox_id,gmail_thread_id",
  });
  if (error) throw error;
}

export async function fetchLostCase(
  admin: SupabaseClient,
  mailboxId: string,
  gmailThreadId: string
): Promise<LostCaseRow | null> {
  const { data, error } = await admin
    .from("lost_cases")
    .select("*")
    .eq("mailbox_id", mailboxId)
    .eq("gmail_thread_id", gmailThreadId)
    .maybeSingle();
  if (error) throw error;
  return (data as LostCaseRow | null) ?? null;
}

export async function listLostCaseMessageIds(admin: SupabaseClient, lostCaseId: string): Promise<string[]> {
  const { data, error } = await admin
    .from("lost_case_messages")
    .select("gmail_message_id")
    .eq("lost_case_id", lostCaseId);
  if (error) throw error;
  return (data as { gmail_message_id: string }[] | null)?.map((r) => r.gmail_message_id) ?? [];
}

export async function insertLostCase(
  admin: SupabaseClient,
  row: Omit<LostCaseRow, "id" | "created_at" | "updated_at">
): Promise<string> {
  const { data, error } = await admin.from("lost_cases").insert(row).select("id").single();
  if (error) throw error;
  return (data as { id: string }).id;
}

export async function updateLostCase(admin: SupabaseClient, lostCaseId: string, patch: Partial<LostCaseRow>): Promise<void> {
  const { error } = await admin.from("lost_cases").update(patch).eq("id", lostCaseId);
  if (error) throw error;
}

export function isTerminalLostCaseStatus(status: string): boolean {
  return TERMINAL_LOST_CASE_STATUSES.has(status);
}

export function computeContentChanged(params: {
  prevHistoryId: string | null;
  nextHistoryId: string | null;
  prevMessageIds: string[];
  nextMessageIds: string[];
}): boolean {
  const a = (params.prevHistoryId ?? "").trim();
  const b = (params.nextHistoryId ?? "").trim();
  if (a !== b) return true;
  const ps = [...params.prevMessageIds].sort().join("\n");
  const ns = [...params.nextMessageIds].sort().join("\n");
  return ps !== ns;
}

export async function upsertLostCaseMessage(admin: SupabaseClient, row: Omit<LostCaseMessageRow, "id" | "created_at">): Promise<void> {
  const { error } = await admin.from("lost_case_messages").upsert(row, {
    onConflict: "lost_case_id,gmail_message_id",
  });
  if (error) throw error;
}
