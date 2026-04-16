import { NextResponse } from "next/server";

import { assertCronOrInternalSecret } from "@/lib/crm/lostQa/gmailInternalAuth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { generateDailySummary } from "@/lib/crm/lostQa/daily/runDailySummary";

type Body = {
  summaryDate: string; // YYYY-MM-DD
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

  if (!body.summaryDate?.trim()) {
    return NextResponse.json({ ok: false, error: "summaryDate is required." }, { status: 400 });
  }

  try {
    const admin = createSupabaseAdminClient();
    const r = await generateDailySummary(admin, {
      summaryDate: body.summaryDate.trim(),
      mailboxId: body.mailboxId ?? null,
      force: Boolean(body.force),
    });
    if (!r.ok) {
      const status = r.error.includes("OPENAI_API_KEY") ? 500 : 500;
      return NextResponse.json({ ok: false, error: r.error }, { status });
    }
    return NextResponse.json(r);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[lost-qa] generate-daily-summary:", e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

