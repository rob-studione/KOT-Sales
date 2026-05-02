import { NextResponse } from "next/server";
import { createSupabaseSsrClient } from "@/lib/supabase/ssr";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const p = await params;
  const id = typeof p?.id === "string" ? p.id.trim() : "";
  if (!id) {
    return NextResponse.json({ ok: false, error: "Missing id" }, { status: 400 });
  }

  const supabase = await createSupabaseSsrClient();
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase.rpc("duplicate_playbook", { p_source_id: id }).single();
  const newId = typeof data === "string" ? data : "";
  if (error || !newId) {
    return NextResponse.json({ ok: false, error: error?.message ?? "Duplicate failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: newId });
}

