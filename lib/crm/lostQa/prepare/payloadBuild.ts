import "server-only";

import { createHash } from "crypto";

import type { LostCaseRow } from "@/lib/crm/lostQaDb";
import type { PreparedLostCasePayload } from "@/lib/crm/lostQa/prepare/preparedCasePayload";
import type { EnrichedLostMessage } from "@/lib/crm/lostQa/prepare/messageScore";

export function buildPreparedPayload(
  lostCase: LostCaseRow,
  allMessages: EnrichedLostMessage[],
  selected: EnrichedLostMessage[]
): PreparedLostCasePayload {
  const inbound_count = allMessages.filter((m) => m.is_inbound).length;
  const outbound_count = allMessages.filter((m) => !m.is_inbound).length;

  return {
    case_metadata: {
      lost_case_id: lostCase.id,
      mailbox_id: lostCase.mailbox_id,
      gmail_thread_id: lostCase.gmail_thread_id,
      gmail_thread_url: lostCase.gmail_thread_url,
      subject: lostCase.subject,
      client_email: lostCase.client_email,
      client_name: lostCase.client_name,
      assigned_agent_email: lostCase.assigned_agent_email,
      assigned_agent_name: lostCase.assigned_agent_name,
      first_message_at: lostCase.first_message_at,
      last_message_at: lostCase.last_message_at,
    },
    thread_statistics: {
      source_message_count: allMessages.length,
      selected_message_count: selected.length,
      inbound_count,
      outbound_count,
    },
    selected_messages: selected.map((m) => ({
      message_id: m.id,
      message_index: m.message_index,
      sent_at: m.sent_at,
      sender_role: m.sender_role,
      sender_email: m.sender_email,
      sender_name: m.sender_name,
      is_inbound: m.is_inbound,
      signals: { ...m.signals },
      clean_text: m.clean_text,
    })),
  };
}

export function buildPreparedText(payload: PreparedLostCasePayload): string {
  const m = payload.case_metadata;
  const lines: string[] = [];
  lines.push("CASE METADATA:");
  lines.push(`- lost_case_id: ${m.lost_case_id}`);
  lines.push(`- mailbox_id: ${m.mailbox_id}`);
  lines.push(`- gmail_thread_id: ${m.gmail_thread_id}`);
  lines.push(`- subject: ${m.subject ?? "null"}`);
  lines.push(`- client_email: ${m.client_email ?? "null"}`);
  lines.push(`- client_name: ${m.client_name ?? "null"}`);
  lines.push(`- assigned_agent_email: ${m.assigned_agent_email ?? "null"}`);
  lines.push(`- assigned_agent_name: ${m.assigned_agent_name ?? "null"}`);
  lines.push(`- first_message_at: ${m.first_message_at ?? "null"}`);
  lines.push(`- last_message_at: ${m.last_message_at ?? "null"}`);
  lines.push("");
  lines.push("THREAD STATISTICS:");
  lines.push(`- source_message_count: ${payload.thread_statistics.source_message_count}`);
  lines.push(`- selected_message_count: ${payload.thread_statistics.selected_message_count}`);
  lines.push(`- inbound_count: ${payload.thread_statistics.inbound_count}`);
  lines.push(`- outbound_count: ${payload.thread_statistics.outbound_count}`);
  lines.push("");
  lines.push("THREAD:");

  let n = 1;
  for (const sm of payload.selected_messages) {
    const role = sm.sender_role.toUpperCase();
    const ts = sm.sent_at ?? "null";
    const sig = `pricing=${sm.signals.pricing},timeline=${sm.signals.timeline},competitor=${sm.signals.competitor},objection=${sm.signals.objection},decision=${sm.signals.decision},scope=${sm.signals.scope},ghosting=${sm.signals.ghosting},low_value=${sm.signals.low_value}`;
    lines.push(`[${n}][${role}][${ts}][signals: ${sig}]`);
    lines.push(sm.clean_text);
    lines.push("");
    n += 1;
  }

  return lines.join("\n").trimEnd();
}

/** Deterministic content hash for idempotency (same prepared_text ⇒ same hash). */
export function hashPreparedInput(preparedText: string): string {
  return createHash("sha256").update(preparedText, "utf8").digest("hex");
}
