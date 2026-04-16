import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { runProcurementDeadlineNotifications } from "@/lib/crm/procurementDeadlineCron";

function assertCronAuth(request: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  const bearer = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  const headerSecret = request.headers.get("x-cron-secret");
  const token = bearer ?? headerSecret;
  if (secret && token !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

/**
 * Kasdienis viešųjų pirkimų sutarčių priminimas.
 * GET su `Authorization: Bearer $CRON_SECRET` arba antraštė `x-cron-secret`.
 */
export async function GET(request: Request) {
  const unauthorized = assertCronAuth(request);
  if (unauthorized) return unauthorized;

  try {
    const admin = createSupabaseAdminClient();
    const r = await runProcurementDeadlineNotifications(admin);
    return NextResponse.json({
      ok: true,
      checked: r.checked,
      notified: r.notified,
      errors: r.errors,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Klaida";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
