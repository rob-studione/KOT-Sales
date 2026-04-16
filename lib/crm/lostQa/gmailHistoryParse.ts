import "server-only";

import type { gmail_v1 } from "googleapis";

export type HistoryIdsExtract = {
  threadIds: Set<string>;
  messageIdsNeedingThread: Set<string>;
};

function noteMessageRef(out: HistoryIdsExtract, m: gmail_v1.Schema$Message | null | undefined) {
  if (!m) return;
  const tid = m.threadId;
  if (tid) {
    out.threadIds.add(tid);
    return;
  }
  const mid = m.id;
  if (mid) out.messageIdsNeedingThread.add(mid);
}

/**
 * Collect thread IDs (and message IDs missing threadId) from a `users.history.list` page.
 */
export function collectIdsFromHistoryPage(history: gmail_v1.Schema$History[] | undefined): HistoryIdsExtract {
  const out: HistoryIdsExtract = { threadIds: new Set(), messageIdsNeedingThread: new Set() };
  if (!history) return out;
  for (const h of history) {
    const added = h.messagesAdded ?? [];
    for (const x of added) noteMessageRef(out, x.message);
    const removed = h.messagesDeleted ?? [];
    for (const x of removed) noteMessageRef(out, x.message);
    const la = h.labelsAdded ?? [];
    for (const x of la) noteMessageRef(out, x.message);
    const lr = h.labelsRemoved ?? [];
    for (const x of lr) noteMessageRef(out, x.message);
  }
  return out;
}
