import { NextResponse } from "next/server";
import { createSupabaseSsrClient } from "@/lib/supabase/ssr";
import type { CrmNotificationRow } from "@/lib/crm/notificationConstants";

export const dynamic = "force-dynamic";

const LIST_LIMIT = 25;

export async function GET() {
  const supabase = await createSupabaseSsrClient();
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const uid = userData.user.id;

  const [listRes, countRes] = await Promise.all([
    supabase
      .from("notifications")
      .select("id,user_id,project_id,contract_id,type,message,is_read,created_at")
      .eq("user_id", uid)
      .order("created_at", { ascending: false })
      .limit(LIST_LIMIT),
    supabase
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("user_id", uid)
      .eq("is_read", false),
  ]);

  if (listRes.error) {
    return NextResponse.json({ ok: false, error: listRes.error.message }, { status: 500 });
  }
  if (countRes.error) {
    return NextResponse.json({ ok: false, error: countRes.error.message }, { status: 500 });
  }

  const items = (listRes.data ?? []) as CrmNotificationRow[];
  const unreadCount = countRes.count ?? 0;

  return NextResponse.json({ ok: true, items, unreadCount });
}

export async function PATCH(request: Request) {
  const supabase = await createSupabaseSsrClient();
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const uid = userData.user.id;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const b = body as { id?: unknown; markAll?: unknown };
  if (b.markAll === true) {
    const { error } = await supabase.from("notifications").update({ is_read: true }).eq("user_id", uid).eq("is_read", false);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  const id = typeof b.id === "string" ? b.id.trim() : "";
  if (!id) {
    return NextResponse.json({ ok: false, error: "Missing id or markAll" }, { status: 400 });
  }

  const { error } = await supabase.from("notifications").update({ is_read: true }).eq("id", id).eq("user_id", uid);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
