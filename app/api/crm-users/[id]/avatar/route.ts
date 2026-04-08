import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getCurrentCrmUser } from "@/lib/crm/currentUser";

export const dynamic = "force-dynamic";

const ALLOWED_MIME = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);
const MAX_BYTES = 5 * 1024 * 1024; // 5MB

function fileExtFromMime(mime: string): string {
  switch (mime) {
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    default:
      return "jpg";
  }
}

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const targetUserId = String(id ?? "").trim();
  if (!targetUserId) return NextResponse.json({ ok: false, error: "Neteisingas naudotojas." }, { status: 400 });

  const actor = await getCurrentCrmUser();
  if (!actor) return NextResponse.json({ ok: false, error: "Neprisijungę." }, { status: 401 });

  const canEdit = actor.id === targetUserId || actor.role === "admin";
  if (!canEdit) return NextResponse.json({ ok: false, error: "Neturite teisių keisti nuotraukos." }, { status: 403 });

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "Nepasirinktas failas." }, { status: 400 });
  }

  if (!ALLOWED_MIME.has(file.type)) {
    return NextResponse.json({ ok: false, error: "Neleistinas failo tipas. Leisti: JPG, PNG, WEBP." }, { status: 400 });
  }
  if (file.size <= 0 || file.size > MAX_BYTES) {
    return NextResponse.json({ ok: false, error: "Failas per didelis (max 5 MB)." }, { status: 400 });
  }

  let admin;
  try {
    admin = createSupabaseAdminClient();
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Trūksta Supabase konfigūracijos." },
      { status: 500 }
    );
  }

  // Ensure bucket exists (avoid relying on SQL ownership of storage schema).
  try {
    const { data: buckets, error: bErr } = await admin.storage.listBuckets();
    if (bErr) throw bErr;
    const exists = (buckets ?? []).some((b) => b.name === "crm-avatars" || b.id === "crm-avatars");
    if (!exists) {
      const { error: cErr } = await admin.storage.createBucket("crm-avatars", { public: true });
      if (cErr) throw cErr;
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: `Nepavyko paruošti Storage: ${msg}` }, { status: 500 });
  }

  const ext = fileExtFromMime(file.type);
  const objectPath = `${targetUserId}/avatar.${ext}`;

  const { error: upErr } = await admin.storage.from("crm-avatars").upload(objectPath, file, {
    upsert: true,
    contentType: file.type,
    cacheControl: "3600",
  });
  if (upErr) {
    return NextResponse.json({ ok: false, error: `Nepavyko įkelti: ${upErr.message}` }, { status: 500 });
  }

  const { data: pub } = admin.storage.from("crm-avatars").getPublicUrl(objectPath);
  const avatarUrl = pub?.publicUrl ?? null;
  if (!avatarUrl) {
    return NextResponse.json({ ok: false, error: "Nepavyko gauti avatar URL." }, { status: 500 });
  }

  const { error: dbErr } = await admin.from("crm_users").update({ avatar_url: avatarUrl }).eq("id", targetUserId);
  if (dbErr) {
    return NextResponse.json({ ok: false, error: `Nepavyko atnaujinti profilio: ${dbErr.message}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true, avatar_url: avatarUrl });
}

