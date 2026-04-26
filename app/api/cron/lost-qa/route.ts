import { NextResponse } from "next/server";

import { assertCronVercelOrInternalSecret } from "@/lib/crm/lostQa/gmailInternalAuth";
import { runLostQaPipelineTick } from "@/lib/crm/lostQa/cron/runLostQaPipelineTick";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 300;

/**
 * Vercel Cron (GET) arba rankinis kvietimas su `Authorization: Bearer $CRON_SECRET`.
 * Jei Gmail API ar history sinchronas neturi veikti (pvz. testuojant), naudokite `?skipGmail=1`.
 */
export async function GET(request: Request) {
  const unauthorized = assertCronVercelOrInternalSecret(request);
  if (unauthorized) return unauthorized;

  const { searchParams } = new URL(request.url);
  const skipGmail = searchParams.get("skipGmail") === "1" || searchParams.get("skipGmail") === "true";

  try {
    const admin = createSupabaseAdminClient();
    const r = await runLostQaPipelineTick(admin, { skipGmail });
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[lost-qa] cron tick failed:", e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
