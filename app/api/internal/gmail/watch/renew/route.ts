import { NextResponse } from "next/server";

import { assertCronOrInternalSecret } from "@/lib/crm/lostQa/gmailInternalAuth";
import { renewWatches } from "@/lib/crm/lostQa/lostQaGmailOrchestrator";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type Body = {
  mailboxId?: string | null;
  withinHours?: number;
};

/**
 * POST with `Authorization: Bearer $CRON_SECRET` (or `x-cron-secret`).
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

  const withinMs =
    body.withinHours != null && Number.isFinite(body.withinHours)
      ? Math.max(1, body.withinHours) * 60 * 60 * 1000
      : undefined;

  try {
    const admin = createSupabaseAdminClient();
    const results = await renewWatches(admin, { mailboxId: body.mailboxId ?? undefined, withinMs });
    return NextResponse.json({ ok: true, results });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[lost-qa] watch renew:", e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
