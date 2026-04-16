import "server-only";

import { GmailHistoryInvalidError } from "@/lib/crm/lostQa/gmailErrors";
import { collectIdsFromHistoryPage } from "@/lib/crm/lostQa/gmailHistoryParse";
import { getGmailClientForMailbox } from "@/lib/crm/lostQa/gmailJwt";

function isInvalidHistoryError(err: unknown): boolean {
  const g = err as { code?: number; message?: string; errors?: Array<{ reason?: string }> };
  const msg = String(g?.message ?? err ?? "").toLowerCase();
  if (g?.code === 404) return true;
  if (msg.includes("history") && (msg.includes("invalid") || msg.includes("too old") || msg.includes("not found"))) {
    return true;
  }
  const reasons = g?.errors?.map((e) => e.reason) ?? [];
  if (reasons.includes("notFound")) return true;
  if (reasons.includes("failedPrecondition")) return true;
  return false;
}

export type HistorySyncPageResult = {
  threadIds: Set<string>;
  latestHistoryId: string;
};

/**
 * List all history pages starting at `startHistoryId`, collecting affected thread IDs.
 * Returns the newest `historyId` from Gmail (for advancing the mailbox cursor).
 */
export async function listAllHistoryThreadIds(
  mailboxEmail: string,
  startHistoryId: string
): Promise<HistorySyncPageResult> {
  const gmail = await getGmailClientForMailbox(mailboxEmail);
  const threadIds = new Set<string>();
  const messageIdsNeedingThread = new Set<string>();
  let pageToken: string | undefined;
  let latestHistoryId = String(startHistoryId);

  try {
    for (;;) {
      const res = await gmail.users.history.list({
        userId: "me",
        startHistoryId,
        pageToken,
        historyTypes: ["messageAdded", "messageDeleted", "labelAdded", "labelRemoved"],
      });
      const history = res.data.history ?? [];
      const chunk = collectIdsFromHistoryPage(history);
      chunk.threadIds.forEach((t) => threadIds.add(t));
      chunk.messageIdsNeedingThread.forEach((m) => messageIdsNeedingThread.add(m));
      if (res.data.historyId) {
        latestHistoryId = String(res.data.historyId);
      }
      pageToken = res.data.nextPageToken ?? undefined;
      if (!pageToken) break;
    }
  } catch (e) {
    if (isInvalidHistoryError(e)) {
      throw new GmailHistoryInvalidError(
        `Gmail history sync failed for ${mailboxEmail}: startHistoryId is invalid or expired. ` +
          `Reset watch (bootstrap) or perform a full resync. Original: ${e instanceof Error ? e.message : String(e)}`
      );
    }
    throw e;
  }

  for (const mid of messageIdsNeedingThread) {
    try {
      const m = await gmail.users.messages.get({ userId: "me", id: mid, format: "minimal" });
      const tid = m.data.threadId;
      if (tid) threadIds.add(tid);
    } catch (e) {
      console.error(`[lost-qa] gmail history: failed to resolve threadId for message ${mid} (${mailboxEmail}):`, e);
    }
  }

  return { threadIds, latestHistoryId };
}
