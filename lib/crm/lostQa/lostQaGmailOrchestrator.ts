import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { GmailMailboxRow } from "@/lib/crm/lostQaDb";
import { GmailHistoryInvalidError } from "@/lib/crm/lostQa/gmailErrors";
import { resolveLostLabelId } from "@/lib/crm/lostQa/gmailLabelService";
import { listAllHistoryThreadIds } from "@/lib/crm/lostQa/gmailHistoryService";
import { gmailUsersWatch, watchNeedsRenewal } from "@/lib/crm/lostQa/gmailWatchService";
import { gmailThreadsGetMinimal } from "@/lib/crm/lostQa/gmailThreadService";
import { ingestLostThreadForMailbox } from "@/lib/crm/lostQa/ingestThread";
import {
  fetchActiveMailboxes,
  fetchMailbox,
  fetchGmailThreadRaw,
  updateMailboxLostLabelAndMaybeWatchFields,
} from "@/lib/crm/lostQa/lostQaRepository";

const DEFAULT_RENEW_WITHIN_MS = 36 * 60 * 60 * 1000;

export async function refreshLostLabelInDb(admin: SupabaseClient, mailbox: GmailMailboxRow): Promise<GmailMailboxRow> {
  const lostId = await resolveLostLabelId(mailbox.id, mailbox.email_address);
  await updateMailboxLostLabelAndMaybeWatchFields(admin, mailbox.id, { lost_label_id: lostId });
  return { ...mailbox, lost_label_id: lostId };
}

export async function applyGmailWatchForMailbox(admin: SupabaseClient, mailbox: GmailMailboxRow): Promise<GmailMailboxRow> {
  const topic = mailbox.watch_topic_name?.trim();
  if (!topic) {
    throw new Error(`Mailbox ${mailbox.id} is missing watch_topic_name (Pub/Sub topic full name).`);
  }
  const refreshed = await refreshLostLabelInDb(admin, mailbox);
  const { historyId, expirationMs } = await gmailUsersWatch(refreshed.email_address, topic, refreshed.lost_label_id);
  const expIso = new Date(Number(expirationMs)).toISOString();
  const activationPatch =
    refreshed.activation_history_id == null || String(refreshed.activation_history_id).trim() === ""
      ? { activation_history_id: historyId }
      : null;
  if (activationPatch) {
    console.log("[lost-qa] activation baseline stored", {
      mailbox_id: refreshed.id,
      email: refreshed.email_address,
      activation_history_id: historyId,
    });
  }
  await updateMailboxLostLabelAndMaybeWatchFields(admin, refreshed.id, {
    watch_history_id: historyId,
    watch_expiration_at: expIso,
    ...(activationPatch ?? {}),
  });
  return {
    ...refreshed,
    watch_history_id: historyId,
    activation_history_id: activationPatch ? historyId : refreshed.activation_history_id,
    watch_expiration_at: expIso,
  };
}

export async function bootstrapWatchForMailboxId(admin: SupabaseClient, mailboxId: string): Promise<GmailMailboxRow> {
  const m = await fetchMailbox(admin, mailboxId);
  if (!m) {
    throw new Error(`Mailbox not found: ${mailboxId}`);
  }
  return applyGmailWatchForMailbox(admin, m);
}

export async function bootstrapWatchAllActive(admin: SupabaseClient): Promise<{ mailboxId: string; ok: boolean; error?: string }[]> {
  const rows = await fetchActiveMailboxes(admin);
  const out: { mailboxId: string; ok: boolean; error?: string }[] = [];
  for (const m of rows) {
    try {
      await applyGmailWatchForMailbox(admin, m);
      out.push({ mailboxId: m.id, ok: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[lost-qa] watch bootstrap failed for ${m.email_address} (${m.id}):`, e);
      out.push({ mailboxId: m.id, ok: false, error: msg });
    }
  }
  return out;
}

export async function renewWatches(
  admin: SupabaseClient,
  params?: { mailboxId?: string | null; withinMs?: number }
): Promise<{ mailboxId: string; renewed: boolean; error?: string }[]> {
  const withinMs = params?.withinMs ?? DEFAULT_RENEW_WITHIN_MS;
  let rows: GmailMailboxRow[];
  if (params?.mailboxId) {
    const one = await fetchMailbox(admin, params.mailboxId);
    if (!one) {
      throw new Error(`Mailbox not found: ${params.mailboxId}`);
    }
    rows = [one];
  } else {
    rows = await fetchActiveMailboxes(admin);
  }
  const out: { mailboxId: string; renewed: boolean; error?: string }[] = [];
  for (const m of rows) {
    if (!m.is_active) {
      out.push({ mailboxId: m.id, renewed: false });
      continue;
    }
    try {
      if (!watchNeedsRenewal(m.watch_expiration_at, withinMs)) {
        out.push({ mailboxId: m.id, renewed: false });
        continue;
      }
      await applyGmailWatchForMailbox(admin, m);
      out.push({ mailboxId: m.id, renewed: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[lost-qa] watch renew failed for ${m.email_address} (${m.id}):`, e);
      out.push({ mailboxId: m.id, renewed: false, error: msg });
    }
  }
  return out;
}

export type HistorySyncResult = {
  mailboxId: string;
  threadsSeen: number;
  threadsProcessed: number;
  latestHistoryId: string;
};

export async function runHistorySyncForMailbox(
  admin: SupabaseClient,
  mailboxId: string,
  startHistoryId?: string | null
): Promise<HistorySyncResult> {
  const mailbox = await fetchMailbox(admin, mailboxId);
  if (!mailbox) {
    throw new Error(`Mailbox not found: ${mailboxId}`);
  }
  if (!mailbox.is_active) {
    throw new Error(`Mailbox inactive: ${mailboxId}`);
  }
  const baseline =
    mailbox.activation_history_id != null && String(mailbox.activation_history_id).trim()
      ? String(mailbox.activation_history_id).trim()
      : mailbox.watch_history_id != null && String(mailbox.watch_history_id).trim()
        ? String(mailbox.watch_history_id).trim()
        : null;
  if (!baseline) {
    throw new Error(
      `Mailbox ${mailbox.email_address} (${mailboxId}) has no activation/watch baseline; run POST /api/internal/gmail/watch/bootstrap first.`
    );
  }

  const requested =
    startHistoryId != null && String(startHistoryId).trim()
      ? String(startHistoryId).trim()
      : mailbox.watch_history_id != null && String(mailbox.watch_history_id).trim()
        ? String(mailbox.watch_history_id).trim()
        : baseline;

  function toBigIntOrNull(v: string | null): bigint | null {
    if (!v) return null;
    try {
      return BigInt(v);
    } catch {
      return null;
    }
  }

  const baselineN = toBigIntOrNull(baseline);
  const requestedN = toBigIntOrNull(requested);
  const start =
    baselineN != null && requestedN != null
      ? (requestedN < baselineN ? baseline : requested)
      : baseline;

  if (requested && baselineN != null && requestedN != null && requestedN < baselineN) {
    console.log("[lost-qa] history sync start clamped to activation baseline (safe mode)", {
      mailbox_id: mailboxId,
      email: mailbox.email_address,
      requested_start_history_id: requested,
      activation_history_id: baseline,
      effective_start_history_id: start,
    });
  }

  let list: Awaited<ReturnType<typeof listAllHistoryThreadIds>>;
  try {
    list = await listAllHistoryThreadIds(mailbox.email_address, start);
  } catch (e) {
    if (e instanceof GmailHistoryInvalidError) {
      console.error(`[lost-qa] ${e.message}`);
    }
    throw e;
  }

  const mailboxFresh = await fetchMailbox(admin, mailboxId);
  if (!mailboxFresh) {
    throw new Error(`Mailbox not found after history list: ${mailboxId}`);
  }

  const threadIds = [...list.threadIds];
  let processed = 0;
  for (const tid of threadIds) {
    try {
      const raw = await fetchGmailThreadRaw(admin, mailboxFresh.id, tid);
      const minimal = await gmailThreadsGetMinimal(mailboxFresh.email_address, tid);
      const remoteHist =
        minimal.historyId != null && String(minimal.historyId).trim() ? String(minimal.historyId).trim() : null;
      if (baselineN != null && remoteHist) {
        const remoteN = toBigIntOrNull(remoteHist);
        if (remoteN != null && remoteN < baselineN) {
          console.log("[lost-qa] skip historical thread (predates activation baseline)", {
            mailbox_id: mailboxId,
            thread_id: tid,
            thread_history_id: remoteHist,
            activation_history_id: baseline,
          });
          continue;
        }
      }
      const localHist =
        raw?.gmail_history_id != null && String(raw.gmail_history_id).trim()
          ? String(raw.gmail_history_id).trim()
          : null;
      if (localHist != null && remoteHist != null && localHist === remoteHist) {
        continue;
      }

      const r = await ingestLostThreadForMailbox(admin, mailboxFresh, tid);
      if (!r.skipped) {
        processed += 1;
        console.log("[lost-qa] thread ingested (updated after activation)", {
          mailbox_id: mailboxId,
          thread_id: tid,
          thread_history_id: remoteHist,
        });
      }
    } catch (e) {
      console.error(`[lost-qa] ingest failed mailbox=${mailboxId} thread=${tid}:`, e);
      throw e;
    }
  }

  await updateMailboxLostLabelAndMaybeWatchFields(admin, mailbox.id, {
    watch_history_id: list.latestHistoryId,
  });

  return {
    mailboxId,
    threadsSeen: threadIds.length,
    threadsProcessed: processed,
    latestHistoryId: list.latestHistoryId,
  };
}
