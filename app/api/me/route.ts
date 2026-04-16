import { NextResponse } from "next/server";
import { createSupabaseSsrClient } from "@/lib/supabase/ssr";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createSupabaseSsrClient();
  const { data: userData, error: userErr } = await supabase.auth.getUser();

  if (userErr || !userData.user) {
    return NextResponse.json(
      { ok: false, authed: false, error: userErr?.message ?? null },
      { status: 200 }
    );
  }

  const authUser = userData.user;
  const { data: crmUser, error: crmErr } = await supabase
    .from("crm_users")
    .select("id,email,role")
    .eq("id", authUser.id)
    .maybeSingle();

  return NextResponse.json({
    ok: true,
    authed: true,
    auth: { id: authUser.id, email: authUser.email ?? null },
    crm: crmErr ? { error: crmErr.message } : crmUser,
  });
}

