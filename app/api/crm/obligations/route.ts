import { NextResponse } from "next/server";
import { loadManagerObligations } from "@/lib/crm/managerObligations";
import { createSupabaseSsrClient } from "@/lib/supabase/ssr";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createSupabaseSsrClient();
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const payload = await loadManagerObligations(supabase, userData.user.id);
  return NextResponse.json({ ok: true, ...payload });
}
