import { NextResponse } from "next/server";

import { assertCronOrInternalSecret } from "@/lib/crm/lostQa/gmailInternalAuth";
import { runLostCaseAnalysis } from "@/lib/crm/lostQa/analyze/runLostCaseAnalysis";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type Body = {
  lostCaseId: string;
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

  if (!body.lostCaseId?.trim()) {
    return NextResponse.json({ ok: false, error: "lostCaseId is required." }, { status: 400 });
  }

  try {
    const admin = createSupabaseAdminClient();
    const r = await runLostCaseAnalysis(admin, {
      lostCaseId: body.lostCaseId.trim(),
      force: Boolean(body.force),
      invoke: "manual_endpoint",
    });
    if (!r.ok) {
      const status =
        r.error.includes("not found") || r.error.includes("No current prepared")
          ? 400
          : r.error.includes("OPENAI_API_KEY")
            ? 500
            : 502;
      return NextResponse.json({ ok: false, error: r.error }, { status });
    }
    return NextResponse.json({
      ok: true,
      outcome: r.outcome,
      ...(r.outcome === "skipped_existing" || r.outcome === "skipped_settings"
        ? { reason: r.reason }
        : { analysis_id: r.analysis_id }),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[lost-qa] analyze-case:", e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
