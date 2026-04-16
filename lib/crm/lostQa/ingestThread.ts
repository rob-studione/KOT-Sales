import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { GmailMailboxRow } from "@/lib/crm/lostQaDb";
import { gmailThreadsGetFull } from "@/lib/crm/lostQa/gmailThreadService";
import { buildGmailThreadUrl } from "@/lib/crm/lostQa/gmailThreadUrl";
import {
  computeContentChanged,
  fetchGmailThreadRaw,
  fetchLostCase,
  insertLostCase,
  isTerminalLostCaseStatus,
  listLostCaseMessageIds,
  updateLostCase,
  upsertGmailThreadRaw,
  upsertLostCaseMessage,
} from "@/lib/crm/lostQa/lostQaRepository";
import { runPostIngestLostQaPipeline } from "@/lib/crm/lostQa/postIngestPipeline";
import {
  normalizeGmailThread,
  pickAssignedAgentFromMessages,
  pickClientFromMessages,
} from "@/lib/crm/lostQa/threadNormalize";

export type IngestLostThreadResult =
  | { ok: true; skipped: true; reason: "no_lost_label" }
  | { ok: true; skipped: false; lost_case_id: string; reanalysis: boolean };

export async function ingestLostThreadForMailbox(
  admin: SupabaseClient,
  mailbox: GmailMailboxRow,
  gmailThreadId: string
): Promise<IngestLostThreadResult> {
  const prevRaw = await fetchGmailThreadRaw(admin, mailbox.id, gmailThreadId);
  const existingCase = await fetchLostCase(admin, mailbox.id, gmailThreadId);
  const prevMessageIds = existingCase ? await listLostCaseMessageIds(admin, existingCase.id) : [];

  const thread = await gmailThreadsGetFull(mailbox.email_address, gmailThreadId);
  const norm = normalizeGmailThread(thread, mailbox.email_address, mailbox.lost_label_id);

  await upsertGmailThreadRaw(admin, {
    mailbox_id: mailbox.id,
    gmail_thread_id: norm.gmail_thread_id,
    gmail_history_id: norm.gmail_history_id,
    subject: norm.subject,
    participants: norm.participants,
    message_count: norm.message_count,
    last_message_at: norm.last_message_at,
    has_lost_label: norm.has_lost_label,
    raw_payload: norm.raw_thread as unknown,
  });

  if (!norm.has_lost_label) {
    return { ok: true, skipped: true, reason: "no_lost_label" };
  }

  const nextMessageIds = norm.messages.map((m) => m.gmail_message_id);

  const contentChanged = computeContentChanged({
    prevHistoryId: prevRaw?.gmail_history_id ?? null,
    nextHistoryId: norm.gmail_history_id,
    prevMessageIds,
    nextMessageIds,
  });

  const { client_email, client_name } = pickClientFromMessages(norm.messages);
  const { assigned_agent_email, assigned_agent_name } = pickAssignedAgentFromMessages(norm.messages);
  const gmail_thread_url = buildGmailThreadUrl(mailbox.email_address, norm.gmail_thread_id);

  const nowIso = new Date().toISOString();

  let lostCaseId: string;
  let reanalysis = false;

  if (!existingCase) {
    lostCaseId = await insertLostCase(admin, {
      mailbox_id: mailbox.id,
      gmail_thread_id: norm.gmail_thread_id,
      gmail_thread_url,
      subject: norm.subject,
      client_email,
      client_name,
      assigned_agent_email,
      assigned_agent_name,
      first_message_at: norm.first_message_at,
      last_message_at: norm.last_message_at,
      lost_detected_at: nowIso,
      status: "pending_analysis",
      analysis_version: 1,
      needs_reanalysis: false,
    });
    reanalysis = false;
  } else {
    lostCaseId = existingCase.id;

    if (contentChanged) {
      reanalysis = true;
      if (isTerminalLostCaseStatus(existingCase.status)) {
        await updateLostCase(admin, lostCaseId, {
          subject: norm.subject,
          client_email,
          client_name,
          assigned_agent_email,
          assigned_agent_name,
          first_message_at: norm.first_message_at,
          last_message_at: norm.last_message_at,
          gmail_thread_url,
          needs_reanalysis: true,
        });
      } else {
        await updateLostCase(admin, lostCaseId, {
          subject: norm.subject,
          client_email,
          client_name,
          assigned_agent_email,
          assigned_agent_name,
          first_message_at: norm.first_message_at,
          last_message_at: norm.last_message_at,
          gmail_thread_url,
          status: "pending_analysis",
          needs_reanalysis: true,
        });
      }
    } else {
      reanalysis = false;
      await updateLostCase(admin, lostCaseId, {
        subject: norm.subject,
        client_email,
        client_name,
        assigned_agent_email,
        assigned_agent_name,
        first_message_at: norm.first_message_at,
        last_message_at: norm.last_message_at,
        gmail_thread_url,
      });
    }
  }

  for (const m of norm.messages) {
    await upsertLostCaseMessage(admin, {
      lost_case_id: lostCaseId,
      gmail_message_id: m.gmail_message_id,
      message_index: m.message_index,
      sent_at: m.sent_at,
      sender_email: m.sender_email,
      sender_name: m.sender_name,
      sender_role: m.sender_role,
      to_emails: m.to_emails,
      cc_emails: m.cc_emails,
      snippet: m.snippet,
      body_plain: m.body_plain,
      body_clean: m.body_clean,
      is_inbound: m.is_inbound,
    });
  }

  // Post-ingest automation: run the Lost QA pipeline for this single case only.
  // Safe + idempotent by design (prepare/analyze/summary may skip).
  const shouldTriggerPipeline = !existingCase || contentChanged;
  if (shouldTriggerPipeline) {
    console.log("[lost-qa post-ingest] trigger starting", {
      mailbox_id: mailbox.id,
      gmail_thread_id: norm.gmail_thread_id,
      lost_case_id: lostCaseId,
      has_existing_case: Boolean(existingCase),
      content_changed: contentChanged,
    });
    try {
      await runPostIngestLostQaPipeline(admin, { lostCaseId });
    } catch (e) {
      // Never fail the ingest itself because downstream automation failed.
      console.error("[lost-qa post-ingest] pipeline error (ingest stays ok)", {
        lost_case_id: lostCaseId,
        mailbox_id: mailbox.id,
        error: e,
      });
    }
  } else {
    console.log("[lost-qa post-ingest] trigger skipped", {
      mailbox_id: mailbox.id,
      gmail_thread_id: norm.gmail_thread_id,
      lost_case_id: lostCaseId,
      reason: "existing_case_and_no_content_change",
      has_existing_case: Boolean(existingCase),
      content_changed: contentChanged,
    });
  }

  return { ok: true, skipped: false, lost_case_id: lostCaseId, reanalysis };
}
