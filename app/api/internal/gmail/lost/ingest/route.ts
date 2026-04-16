import { NextResponse } from "next/server";

import { assertCronOrInternalSecret } from "@/lib/crm/lostQa/gmailInternalAuth";
import { ingestLostThreadForMailbox } from "@/lib/crm/lostQa/ingestThread";
import { fetchMailbox } from "@/lib/crm/lostQa/lostQaRepository";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type Body = {
  mailboxId: string;
  gmailThreadId: string;
};

/**
 * POST with `Authorization: Bearer $CRON_SECRET` (or `x-cron-secret`).
 */
export async function POST(request: Request) {
  const unauthorized = assertCronOrInternalSecret(request);
  if (unauthorized) return unauthorized;

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }
  if (!body.mailboxId?.trim() || !body.gmailThreadId?.trim()) {
    return NextResponse.json({ ok: false, error: "mailboxId and gmailThreadId are required." }, { status: 400 });
  }

  try {
    const admin = createSupabaseAdminClient();
    const mailbox = await fetchMailbox(admin, body.mailboxId.trim());
    if (!mailbox) {
      return NextResponse.json({ ok: false, error: "Mailbox not found." }, { status: 404 });
    }
    if (!mailbox.is_active) {
      return NextResponse.json({ ok: false, error: "Mailbox is inactive." }, { status: 400 });
    }
    const r = await ingestLostThreadForMailbox(admin, mailbox, body.gmailThreadId.trim());
    return NextResponse.json({ ok: true, result: r });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[lost-qa] lost ingest:", e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
