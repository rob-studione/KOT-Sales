import { NextResponse } from "next/server";

import { assertCronOrInternalSecret } from "@/lib/crm/lostQa/gmailInternalAuth";
import { fetchLostCaseById } from "@/lib/crm/lostQa/prepare/preparedInputRepository";
import { prepareLostCaseFromDb } from "@/lib/crm/lostQa/prepare/prepareLostCase";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type Body = {
  lostCaseId: string;
};

/**
 * POST `Authorization: Bearer $CRON_SECRET` or `x-cron-secret`.
 */
export async function POST(request: Request) {
  console.log("[lost-qa prepare-case] 1 route entry");
  try {
    const unauthorized = assertCronOrInternalSecret(request);
    console.log("[lost-qa prepare-case] CRON_SECRET present:", Boolean(process.env.CRON_SECRET?.trim()));
    if (unauthorized) {
      console.log("[lost-qa prepare-case] 11 before returning response (unauthorized)");
      return unauthorized;
    }
    console.log("[lost-qa prepare-case] 2 after auth passes");

    let body: Body;
    try {
      body = (await request.json()) as Body;
    } catch (parseErr) {
      console.error("[lost-qa prepare-case] request body parse error (full):", parseErr);
      console.log("[lost-qa prepare-case] 11 before returning response (400 invalid JSON)");
      return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
    }
    console.log("[lost-qa prepare-case] 3 after request body parse");

    if (!body.lostCaseId?.trim()) {
      console.log("[lost-qa prepare-case] 11 before returning response (400 missing lostCaseId)");
      return NextResponse.json({ ok: false, error: "lostCaseId is required." }, { status: 400 });
    }

    const admin = createSupabaseAdminClient();
    const lostCaseId = body.lostCaseId.trim();
    console.log("[lost-qa prepare-case] 4 before fetchLostCaseById", lostCaseId);
    const lostCase = await fetchLostCaseById(admin, lostCaseId);
    console.log("[lost-qa prepare-case] 5 after fetchLostCaseById", lostCase ? `found ${lostCase.id}` : "null");
    if (!lostCase) {
      console.log("[lost-qa prepare-case] 11 before returning response (404 not found)");
      return NextResponse.json({ ok: false, error: "Lost case not found." }, { status: 404 });
    }
    const r = await prepareLostCaseFromDb(admin, lostCase);
    if (!r.ok) {
      console.log("[lost-qa prepare-case] 11 before returning response (400 prepare failed)");
      return NextResponse.json({ ok: false, error: r.error }, { status: 400 });
    }
    if (r.skipped) {
      console.log("[lost-qa prepare-case] 11 before returning response (200 skipped same_hash)");
      return NextResponse.json({ ok: true, skipped: true, reason: r.reason });
    }
    console.log("[lost-qa prepare-case] 11 before returning response (200 prepared)");
    return NextResponse.json({
      ok: true,
      skipped: false,
      preparation_version: r.preparation_version,
      prepared_hash: r.prepared_hash,
      prepared_input_id: r.prepared_input_id,
      source_message_count: r.source_message_count,
      selected_message_count: r.selected_message_count,
    });
  } catch (e) {
    console.error("[lost-qa prepare-case] handler error (full):", e);
    if (e instanceof Error) {
      console.error("[lost-qa prepare-case] handler error stack:", e.stack);
    }
    const msg = e instanceof Error ? e.message : String(e);
    console.log("[lost-qa prepare-case] 11 before returning response (500)");
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
