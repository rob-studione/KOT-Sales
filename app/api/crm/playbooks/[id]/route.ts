import { NextResponse } from "next/server";
import { canAdvancePlaybookStatus, normalizePlaybookStatus } from "@/lib/crm/playbooks/playbookStatus";
import { createSupabaseSsrClient } from "@/lib/supabase/ssr";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const p = await params;
  const id = typeof p?.id === "string" ? p.id.trim() : "";
  if (!id) {
    return NextResponse.json({ ok: false, error: "Missing id" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const raw =
    typeof body === "object" && body !== null && "status" in body
      ? (body as { status: unknown }).status
      : undefined;
  const nextStatus = normalizePlaybookStatus(typeof raw === "string" ? raw : "");

  const supabase = await createSupabaseSsrClient();
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const cur = await supabase.from("playbooks").select("status").eq("id", id).maybeSingle();
  if (cur.error) {
    return NextResponse.json({ ok: false, error: cur.error.message }, { status: 500 });
  }
  if (!cur.data) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  const current = normalizePlaybookStatus(cur.data.status as string | null);
  if (!canAdvancePlaybookStatus(current, nextStatus)) {
    return NextResponse.json({ ok: false, error: "Invalid status transition" }, { status: 400 });
  }

  const { error } = await supabase.from("playbooks").update({ status: nextStatus }).eq("id", id);
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, status: nextStatus });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
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

  const { error } = await supabase.from("playbooks").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

