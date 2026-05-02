import { NextResponse } from "next/server";
import { createSupabaseSsrClient } from "@/lib/supabase/ssr";

export const dynamic = "force-dynamic";

export async function POST() {
  const supabase = await createSupabaseSsrClient();
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .rpc("create_playbook_with_start_node", {
      p_name: "Naujas scenarijus",
      p_description: null,
    })
    .single();

  const playbookId = (data as { playbook_id?: unknown } | null)?.playbook_id;
  if (error || typeof playbookId !== "string" || !playbookId) {
    return NextResponse.json({ ok: false, error: error?.message ?? "Create failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: playbookId });
}

