import { NextResponse } from "next/server";

import { getCurrentCrmUser } from "@/lib/crm/currentUser";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { logInternalError, toSafeApiError } from "@/lib/translatorSearch/apiErrors";
import { authorizeTranslatorSearchAction } from "@/lib/translatorSearch/auth";
import { reviewTranslatorCandidate } from "@/lib/translatorSearch/reviewCandidate";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const actor = await getCurrentCrmUser();
  const auth = authorizeTranslatorSearchAction(actor, "tools.translator_search.review");
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error, code: auth.status === 401 ? "unauthorized" : "forbidden" },
      { status: auth.status }
    );
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Neteisingas JSON.", code: "invalid_json" }, { status: 400 });
  }

  const candidateId = String(body.candidateId ?? body.candidate_id ?? "").trim();
  const reviewStatus = String(body.reviewStatus ?? body.review_status ?? "").trim();
  const reviewNote =
    body.reviewNote == null && body.review_note == null
      ? null
      : String(body.reviewNote ?? body.review_note ?? "");

  if (reviewStatus !== "approved" && reviewStatus !== "rejected") {
    const safe = toSafeApiError("validation_status");
    return NextResponse.json({ ok: false, error: safe.error, code: safe.code }, { status: safe.status });
  }

  try {
    const admin = createSupabaseAdminClient();
    const result = await reviewTranslatorCandidate(admin, {
      candidateId,
      reviewStatus,
      reviewNote,
      reviewedBy: auth.actor.id,
    });
    if (!result.ok) {
      const safe = toSafeApiError(result.code);
      return NextResponse.json({ ok: false, error: safe.error, code: safe.code }, { status: safe.status });
    }
    return NextResponse.json({
      ok: true,
      candidateId: result.candidateId,
      reviewStatus: result.reviewStatus,
      noop: result.noop ?? false,
    });
  } catch (e) {
    logInternalError("crm translator-search review", e);
    const safe = toSafeApiError("job_exception");
    return NextResponse.json({ ok: false, error: safe.error, code: safe.code }, { status: safe.status });
  }
}
