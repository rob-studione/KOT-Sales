import { NextResponse } from "next/server";

import { assertCronOrInternalSecret } from "@/lib/crm/lostQa/gmailInternalAuth";
import { GmailLostLabelMissingError } from "@/lib/crm/lostQa/gmailErrors";
import { bootstrapWatchAllActive, bootstrapWatchForMailboxId } from "@/lib/crm/lostQa/lostQaGmailOrchestrator";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type Body = {
  mailboxId?: string | null;
};

/**
 * POST with `Authorization: Bearer $CRON_SECRET` (or `x-cron-secret`).
 * Body: `{ "mailboxId": "<uuid>" | null }` — null/omitted = all active mailboxes.
 */
export async function POST(request: Request) {
  const unauthorized = assertCronOrInternalSecret(request);
  if (unauthorized) return unauthorized;

  let body: Body = {};
  try {
    body = (await request.json()) as Body;
  } catch {
    body = {};
  }

  try {
    const admin = createSupabaseAdminClient();
    if (body.mailboxId) {
      const m = await bootstrapWatchForMailboxId(admin, body.mailboxId);
      return NextResponse.json({ ok: true, mode: "one", mailboxId: m.id });
    }
    const summary = await bootstrapWatchAllActive(admin);
    return NextResponse.json({ ok: true, mode: "all", results: summary });
  } catch (e) {
    if (e instanceof GmailLostLabelMissingError) {
      console.error("[lost-qa] watch bootstrap:", e.message);
      return NextResponse.json({ ok: false, code: e.code, error: e.message }, { status: 400 });
    }
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[lost-qa] watch bootstrap:", e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
