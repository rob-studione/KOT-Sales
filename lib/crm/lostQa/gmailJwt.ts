import "server-only";

import { google } from "googleapis";

import { requireGmailServiceAccountJson } from "@/lib/crm/lostQa/gmailEnv";

const GMAIL_READONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

export async function getGmailClientForMailbox(mailboxEmailAddress: string) {
  const creds = requireGmailServiceAccountJson();
  const auth = new google.auth.JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: [GMAIL_READONLY_SCOPE],
    subject: mailboxEmailAddress.trim(),
  });
  await auth.authorize();
  return google.gmail({ version: "v1", auth });
}
