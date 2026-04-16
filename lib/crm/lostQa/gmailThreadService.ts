import "server-only";

import type { gmail_v1 } from "googleapis";

import { getGmailClientForMailbox } from "@/lib/crm/lostQa/gmailJwt";

/** Lightweight thread metadata (includes `historyId`) without full message bodies. */
export async function gmailThreadsGetMinimal(
  mailboxEmail: string,
  threadId: string
): Promise<gmail_v1.Schema$Thread> {
  const gmail = await getGmailClientForMailbox(mailboxEmail);
  const res = await gmail.users.threads.get({
    userId: "me",
    id: threadId,
    format: "minimal",
  });
  if (!res.data?.id) {
    throw new Error(`Gmail threads.get(minimal) returned empty payload for thread ${threadId}.`);
  }
  return res.data;
}

export async function gmailThreadsGetFull(mailboxEmail: string, threadId: string): Promise<gmail_v1.Schema$Thread> {
  const gmail = await getGmailClientForMailbox(mailboxEmail);
  const res = await gmail.users.threads.get({
    userId: "me",
    id: threadId,
    format: "full",
  });
  if (!res.data?.id) {
    throw new Error(`Gmail threads.get returned empty payload for thread ${threadId}.`);
  }
  return res.data;
}
