import { NextResponse } from "next/server";

import { assertCronOrInternalSecret } from "@/lib/crm/lostQa/gmailInternalAuth";
import { GmailHistoryInvalidError } from "@/lib/crm/lostQa/gmailErrors";
import { runHistorySyncForMailbox } from "@/lib/crm/lostQa/lostQaGmailOrchestrator";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type Body = {
  mailboxId: string;
  startHistoryId?: string | null;
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
  if (!body.mailboxId?.trim()) {
    return NextResponse.json({ ok: false, error: "mailboxId is required." }, { status: 400 });
  }

  try {
    const admin = createSupabaseAdminClient();
    const r = await runHistorySyncForMailbox(admin, body.mailboxId.trim(), body.startHistoryId ?? null);
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    if (e instanceof GmailHistoryInvalidError) {
      console.error("[lost-qa] history sync:", e.message);
      return NextResponse.json({ ok: false, code: e.code, error: e.message }, { status: 409 });
    }
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[lost-qa] history sync:", e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
