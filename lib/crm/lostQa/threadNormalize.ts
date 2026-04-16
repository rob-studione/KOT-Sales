import "server-only";

import type { gmail_v1 } from "googleapis";

import type { LostSenderRole } from "@/lib/crm/lostQaDb";
import { extractBodyPlainFromMessage, buildBodyClean } from "@/lib/crm/lostQa/messageBody";
import { classifySenderRole, inferIsInbound } from "@/lib/crm/lostQa/senderRole";

export type LostQaParticipant = {
  email: string;
  name: string | null;
};

export type NormalizedThreadMessage = {
  gmail_message_id: string;
  message_index: number;
  sent_at: string | null;
  sender_email: string | null;
  sender_name: string | null;
  sender_role: LostSenderRole;
  to_emails: string[];
  cc_emails: string[];
  snippet: string | null;
  body_plain: string | null;
  body_clean: string | null;
  is_inbound: boolean;
};

export type NormalizedLostThread = {
  gmail_thread_id: string;
  gmail_history_id: string | null;
  subject: string | null;
  message_count: number;
  last_message_at: string | null;
  first_message_at: string | null;
  has_lost_label: boolean;
  participants: LostQaParticipant[];
  messages: NormalizedThreadMessage[];
  raw_thread: gmail_v1.Schema$Thread;
};

function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

function getHeader(headers: gmail_v1.Schema$MessagePartHeader[] | undefined, name: string): string | undefined {
  const want = name.toLowerCase();
  const h = headers?.find((x) => (x.name ?? "").toLowerCase() === want);
  const v = h?.value?.trim();
  return v || undefined;
}

function parseAngleEmail(chunk: string): { name: string | null; email: string | null } {
  const s = chunk.trim();
  const m = s.match(/^(?:"?([^"]*)"?\s*)?<([^>]+)>$/);
  if (m) {
    const name = m[1]?.trim() || null;
    const email = normalizeEmail(m[2] ?? "");
    return { name, email: email || null };
  }
  if (s.includes("@")) return { name: null, email: normalizeEmail(s) };
  return { name: s || null, email: null };
}

function parseAddressList(headerValue: string | undefined): Array<{ name: string | null; email: string | null }> {
  if (!headerValue) return [];
  const parts: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < headerValue.length; i++) {
    const c = headerValue[i];
    if (c === '"') inQuotes = !inQuotes;
    if (c === "," && !inQuotes) {
      parts.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  if (cur.trim()) parts.push(cur);
  return parts.map((p) => parseAngleEmail(p));
}

function parseFromHeader(from: string | undefined): { name: string | null; email: string | null } {
  if (!from) return { name: null, email: null };
  return parseAngleEmail(from);
}

function uniqueEmails(rows: Array<{ name: string | null; email: string | null }>): LostQaParticipant[] {
  const byEmail = new Map<string, LostQaParticipant>();
  for (const r of rows) {
    if (!r.email) continue;
    const prev = byEmail.get(r.email);
    if (!prev) {
      byEmail.set(r.email, { email: r.email, name: r.name });
    } else if (!prev.name && r.name) {
      byEmail.set(r.email, { email: r.email, name: r.name });
    }
  }
  return [...byEmail.values()].sort((a, b) => a.email.localeCompare(b.email));
}

function internalDateMs(message: gmail_v1.Schema$Message): number | null {
  const raw = message.internalDate;
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function threadHasLostLabel(thread: gmail_v1.Schema$Thread, lostLabelId: string): boolean {
  const threadLabelIds = (thread as { labelIds?: string[] | null }).labelIds;
  if (threadLabelIds?.includes(lostLabelId)) return true;
  for (const m of thread.messages ?? []) {
    if ((m.labelIds ?? []).includes(lostLabelId)) return true;
  }
  return false;
}

export function normalizeGmailThread(
  thread: gmail_v1.Schema$Thread,
  mailboxEmail: string,
  lostLabelId: string
): NormalizedLostThread {
  const gmail_thread_id = thread.id ?? "";
  if (!gmail_thread_id) {
    throw new Error("Gmail thread missing id.");
  }

  const has_lost_label = threadHasLostLabel(thread, lostLabelId);

  const messagesUnsorted = [...(thread.messages ?? [])].filter((m) => m.id);
  messagesUnsorted.sort((a, b) => {
    const da = internalDateMs(a) ?? 0;
    const db = internalDateMs(b) ?? 0;
    return da - db;
  });

  const participantRows: Array<{ name: string | null; email: string | null }> = [];

  const messages: NormalizedThreadMessage[] = messagesUnsorted.map((m, idx) => {
    const headers = m.payload?.headers ?? undefined;
    const fromRaw = getHeader(headers, "From");
    const toRaw = getHeader(headers, "To");
    const ccRaw = getHeader(headers, "Cc");
    const dateHdr = getHeader(headers, "Date");

    const fromParsed = parseFromHeader(fromRaw);
    const toParsed = parseAddressList(toRaw);
    const ccParsed = parseAddressList(ccRaw);

    participantRows.push(fromParsed, ...toParsed, ...ccParsed);

    const sender_email = fromParsed.email;
    const sender_name = fromParsed.name;
    const sender_role = sender_email
      ? classifySenderRole(sender_email, mailboxEmail)
      : ("unknown" as const);
    const is_inbound = sender_email
      ? inferIsInbound(sender_role, sender_email)
      : inferIsInbound("unknown", "");

    const to_emails = [...new Set(toParsed.map((x) => x.email).filter(Boolean) as string[])];
    const cc_emails = [...new Set(ccParsed.map((x) => x.email).filter(Boolean) as string[])];

    let sent_at: string | null = null;
    const idMs = internalDateMs(m);
    if (idMs != null) {
      sent_at = new Date(idMs).toISOString();
    } else if (dateHdr) {
      const d = Date.parse(dateHdr);
      if (Number.isFinite(d)) sent_at = new Date(d).toISOString();
    }

    const body_plain_raw = extractBodyPlainFromMessage(m);
    const body_plain = body_plain_raw.trim() ? body_plain_raw : null;
    const body_clean = body_plain ? buildBodyClean(body_plain) : null;

    return {
      gmail_message_id: m.id as string,
      message_index: idx,
      sent_at,
      sender_email,
      sender_name,
      sender_role,
      to_emails,
      cc_emails,
      snippet: m.snippet ?? null,
      body_plain,
      body_clean,
      is_inbound,
    };
  });

  const ms = messagesUnsorted.map((m) => internalDateMs(m)).filter((x): x is number => x != null);
  const first_message_at = ms.length ? new Date(Math.min(...ms)).toISOString() : null;
  const last_message_at = ms.length ? new Date(Math.max(...ms)).toISOString() : null;

  const subject =
    getHeader(messagesUnsorted[0]?.payload?.headers, "Subject") ??
    getHeader(messagesUnsorted[messagesUnsorted.length - 1]?.payload?.headers, "Subject") ??
    null;

  return {
    gmail_thread_id,
    gmail_history_id: thread.historyId ? String(thread.historyId) : null,
    subject: subject?.trim() || null,
    message_count: messages.length,
    last_message_at,
    first_message_at,
    has_lost_label,
    participants: uniqueEmails(participantRows),
    messages,
    raw_thread: thread,
  };
}

export function pickClientFromMessages(
  messages: NormalizedThreadMessage[]
): { client_email: string | null; client_name: string | null } {
  const inboundClient = messages.filter((m) => m.is_inbound && m.sender_role === "client" && m.sender_email);
  const first = inboundClient[0];
  if (!first?.sender_email) return { client_email: null, client_name: null };
  return { client_email: first.sender_email, client_name: first.sender_name };
}

export function pickAssignedAgentFromMessages(
  messages: NormalizedThreadMessage[]
): { assigned_agent_email: string | null; assigned_agent_name: string | null } {
  const outbound = messages.filter(
    (m) =>
      !m.is_inbound &&
      m.sender_email &&
      (m.sender_role === "agent" || m.sender_role === "internal")
  );
  if (!outbound.length) return { assigned_agent_email: null, assigned_agent_name: null };

  const counts = new Map<string, { n: number; name: string | null; latestMs: number }>();
  for (const m of outbound) {
    const email = m.sender_email as string;
    const ms = m.sent_at ? Date.parse(m.sent_at) : 0;
    const cur = counts.get(email) ?? { n: 0, name: m.sender_name, latestMs: -1 };
    cur.n += 1;
    if (!cur.name && m.sender_name) cur.name = m.sender_name;
    if (ms >= cur.latestMs) {
      cur.latestMs = ms;
      cur.name = m.sender_name ?? cur.name;
    }
    counts.set(email, cur);
  }

  let bestEmail: string | null = null;
  let bestMeta: { n: number; name: string | null; latestMs: number } | null = null;
  for (const [email, meta] of counts) {
    if (!bestMeta || meta.n > bestMeta.n) {
      bestEmail = email;
      bestMeta = meta;
    } else if (meta.n === bestMeta.n) {
      if (meta.latestMs > bestMeta.latestMs) {
        bestEmail = email;
        bestMeta = meta;
      }
    }
  }

  return {
    assigned_agent_email: bestEmail,
    assigned_agent_name: bestMeta?.name ?? null,
  };
}
