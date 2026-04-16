import "server-only";

/**
 * Deterministic Gmail web URL for a thread in a given mailbox.
 * Uses `authuser` query param so multi-account browsers open the right inbox.
 */
export function buildGmailThreadUrl(mailboxEmailAddress: string, gmailThreadId: string): string {
  const auth = encodeURIComponent(mailboxEmailAddress.trim());
  const tid = encodeURIComponent(gmailThreadId.trim());
  return `https://mail.google.com/mail/u/0/?authuser=${auth}#inbox/${tid}`;
}
