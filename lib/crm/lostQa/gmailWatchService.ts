import "server-only";

import { getGmailClientForMailbox } from "@/lib/crm/lostQa/gmailJwt";

export type WatchBootstrapResult = {
  historyId: string;
  expirationMs: string;
};

/**
 * Start or renew Gmail push notifications via Pub/Sub.
 * When `lostLabelId` is set, only changes affecting that label are reported (Gmail API filter).
 */
export async function gmailUsersWatch(
  mailboxEmail: string,
  topicFullName: string,
  lostLabelId: string | null
): Promise<WatchBootstrapResult> {
  const gmail = await getGmailClientForMailbox(mailboxEmail);
  const body: { topicName: string; labelIds?: string[]; labelFilterBehavior?: string } = {
    topicName: topicFullName.trim(),
  };
  if (lostLabelId?.trim()) {
    body.labelIds = [lostLabelId.trim()];
    body.labelFilterBehavior = "include";
  }
  const res = await gmail.users.watch({
    userId: "me",
    requestBody: body,
  });
  const historyId = res.data.historyId;
  const expiration = res.data.expiration;
  if (!historyId || !expiration) {
    throw new Error("Gmail users.watch response missing historyId or expiration.");
  }
  return { historyId: String(historyId), expirationMs: String(expiration) };
}

/** Renew if expiration is within `withinMs` milliseconds from now. */
export function watchNeedsRenewal(watchExpirationAtIso: string | null, withinMs: number): boolean {
  if (!watchExpirationAtIso) return true;
  const t = Date.parse(watchExpirationAtIso);
  if (!Number.isFinite(t)) return true;
  return t - Date.now() <= withinMs;
}
