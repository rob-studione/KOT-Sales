import { NextResponse } from "next/server";

import { getCurrentCrmUser } from "@/lib/crm/currentUser";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { logInternalError, toSafeApiError } from "@/lib/translatorSearch/apiErrors";
import { authorizeTranslatorSearchAdmin } from "@/lib/translatorSearch/auth";
import { DbUpdateError } from "@/lib/translatorSearch/dbUpdates";
import { TranslatorSearchConfigError } from "@/lib/translatorSearch/model";
import { runTranslatorSearchJob } from "@/lib/translatorSearch/runJob";
import { validateTranslatorSearchRequest } from "@/lib/translatorSearch/validateRequest";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: Request) {
  const actor = await getCurrentCrmUser();
  const auth = authorizeTranslatorSearchAdmin(actor);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error, code: auth.status === 401 ? "unauthorized" : "forbidden" }, { status: auth.status });
  }

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Neteisingas JSON.", code: "invalid_json" }, { status: 400 });
  }

  const validated = validateTranslatorSearchRequest(body);
  if (!validated.ok) {
    return NextResponse.json(
      { ok: false, error: validated.error, code: validated.code },
      { status: 400 }
    );
  }

  try {
    const admin = createSupabaseAdminClient();
    const result = await runTranslatorSearchJob({
      admin,
      actorId: auth.actor.id,
      title: validated.title,
      requestParams: validated.params,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    logInternalError("crm translator-search run", e);
    const code =
      e instanceof TranslatorSearchConfigError || e instanceof DbUpdateError
        ? e.code
        : "job_exception";
    const safe = toSafeApiError(code);
    return NextResponse.json({ ok: false, error: safe.error, code: safe.code }, { status: safe.status });
  }
}
