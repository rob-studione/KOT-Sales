import { NextResponse } from "next/server";

import { assertCronOrInternalSecret } from "@/lib/crm/lostQa/gmailInternalAuth";
import { prepareLostCasesBatch } from "@/lib/crm/lostQa/prepare/prepareLostCaseBatch";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type Body = {
  mailboxId?: string | null;
  limit?: number;
  onlyCurrentPendingAnalysis?: boolean;
};

/**
 * POST `Authorization: Bearer $CRON_SECRET` or `x-cron-secret`.
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
    const summary = await prepareLostCasesBatch(admin, {
      mailboxId: body.mailboxId,
      limit: body.limit,
      onlyCurrentPendingAnalysis: body.onlyCurrentPendingAnalysis ?? true,
    });
    return NextResponse.json({ ok: true, ...summary });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[lost-qa] prepare-pending:", e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
