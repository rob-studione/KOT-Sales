import { after, NextResponse } from "next/server";

import { assertCronOrInternalSecret } from "@/lib/crm/lostQa/gmailInternalAuth";
import { gmailPubSubOidcAudience } from "@/lib/crm/lostQa/gmailEnv";
import { verifyPubSubOidcBearer } from "@/lib/crm/lostQa/pubsubVerify";
import { GmailHistoryInvalidError } from "@/lib/crm/lostQa/gmailErrors";
import { fetchActiveMailboxes } from "@/lib/crm/lostQa/lostQaRepository";
import { runHistorySyncForMailbox } from "@/lib/crm/lostQa/lostQaGmailOrchestrator";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type PubSubPushBody = {
  message?: { data?: string; attributes?: Record<string, string> };
  subscription?: string;
};

type GmailPushNotification = {
  emailAddress?: string;
  historyId?: string | number;
};

async function assertPubSubAuthorized(request: Request): Promise<NextResponse | null> {
  const audience = gmailPubSubOidcAudience();
  if (audience) {
    const ok = await verifyPubSubOidcBearer(request.headers.get("authorization"));
    if (!ok) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return null;
  }
  // Dev / fallback: reuse CRON_SECRET like other internal routes (Pub/Sub won't send this in prod).
  return assertCronOrInternalSecret(request);
}

/**
 * Google Pub/Sub push endpoint for Gmail `users.watch` notifications.
 *
 * Configure push subscription OIDC audience to match `GMAIL_PUBSUB_AUDIENCE` (recommended),
 * or use `CRON_SECRET` locally to POST synthetic payloads.
 */
export async function POST(request: Request) {
  const unauthorized = await assertPubSubAuthorized(request);
  if (unauthorized) return unauthorized;

  let body: PubSubPushBody;
  try {
    body = (await request.json()) as PubSubPushBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const dataB64 = body.message?.data;
  if (!dataB64) {
    return NextResponse.json({ error: "Missing message.data" }, { status: 400 });
  }

  let decoded: GmailPushNotification;
  try {
    const json = Buffer.from(dataB64, "base64").toString("utf8");
    decoded = JSON.parse(json) as GmailPushNotification;
  } catch {
    return NextResponse.json({ error: "Invalid base64/json payload." }, { status: 400 });
  }

  const emailAddress = decoded.emailAddress?.trim();
  const historyId = decoded.historyId != null ? String(decoded.historyId).trim() : "";
  if (!emailAddress || !historyId) {
    return NextResponse.json({ error: "emailAddress and historyId required in notification." }, { status: 400 });
  }

  try {
    const admin = createSupabaseAdminClient();
    const mailboxes = await fetchActiveMailboxes(admin);
    const hit = mailboxes.find((m) => m.email_address.trim().toLowerCase() === emailAddress.toLowerCase());
    if (!hit) {
      console.error(`[lost-qa] pubsub: no active mailbox for email ${emailAddress}`);
      return NextResponse.json({ ok: true, accepted: false, error: "Unknown mailbox email." }, { status: 200 });
    }

    const mailboxId = hit.id;
    const startHist = historyId;
    after(async () => {
      try {
        const bg = createSupabaseAdminClient();
        await runHistorySyncForMailbox(bg, mailboxId, startHist);
      } catch (e) {
        if (e instanceof GmailHistoryInvalidError) {
          console.error("[lost-qa] pubsub history sync (async):", e.message);
        } else {
          console.error("[lost-qa] pubsub sync (async):", e);
        }
      }
    });

    return NextResponse.json({ ok: true, accepted: true }, { status: 200 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[lost-qa] pubsub:", e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
