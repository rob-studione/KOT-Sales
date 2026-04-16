import { NextResponse } from "next/server";

import { assertCronOrInternalSecret } from "@/lib/crm/lostQa/gmailInternalAuth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { generateMissingDailySummaries } from "@/lib/crm/lostQa/daily/runDailySummaryBatch";

type Body = {
  dateFrom: string; // YYYY-MM-DD
  dateTo: string; // YYYY-MM-DD
  mailboxId?: string | null;
  force?: boolean;
};

/**
 * POST `Authorization: Bearer $CRON_SECRET` or `x-cron-secret`.
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

  if (!body.dateFrom?.trim() || !body.dateTo?.trim()) {
    return NextResponse.json({ ok: false, error: "dateFrom and dateTo are required." }, { status: 400 });
  }

  try {
    const admin = createSupabaseAdminClient();
    const r = await generateMissingDailySummaries(admin, {
      dateFrom: body.dateFrom.trim(),
      dateTo: body.dateTo.trim(),
      mailboxId: body.mailboxId ?? null,
      force: Boolean(body.force),
    });
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[lost-qa] generate-missing-daily-summaries:", e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

