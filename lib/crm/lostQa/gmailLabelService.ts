import "server-only";

import { GmailLostLabelMissingError } from "@/lib/crm/lostQa/gmailErrors";
import { getGmailClientForMailbox } from "@/lib/crm/lostQa/gmailJwt";

function lostLabelName(): string {
  const v = process.env.GMAIL_LOST_LABEL?.trim();
  return v && v.length ? v : "Lost";
}

export async function resolveLostLabelId(mailboxId: string, emailAddress: string): Promise<string> {
  const gmail = await getGmailClientForMailbox(emailAddress);
  const res = await gmail.users.labels.list({ userId: "me" });
  const labels = res.data.labels ?? [];
  const lost = labels.find((l) => l.name === lostLabelName());
  if (!lost?.id) {
    throw new GmailLostLabelMissingError(mailboxId, emailAddress);
  }
  return lost.id;
}
