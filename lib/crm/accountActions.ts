"use server";

import { revalidatePath } from "next/cache";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseSsrClient } from "@/lib/supabase/ssr";
import { isValidUuid } from "@/lib/crm/crmUsers";
import { getCurrentCrmUser } from "@/lib/crm/currentUser";
import { hasPermission } from "@/lib/crm/permissions/check";

export type CrmUserStatus = "active" | "inactive";

function isCrmUserStatus(v: unknown): v is CrmUserStatus {
  return v === "active" || v === "inactive";
}

function inviteRedirectTo(): string | undefined {
  const fallbackProd = "https://kot-sales.vercel.app";
  const base = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!base) return `${fallbackProd}/auth/confirm?next=/analitika`;
  const normalized = base.replace(/\/+$/, "");
  if (normalized.startsWith("http://localhost") || normalized.includes("localhost:")) {
    return `${fallbackProd}/auth/confirm?next=/analitika`;
  }
  if (normalized.startsWith("http://") || normalized.startsWith("https://")) {
    return `${normalized}/auth/confirm?next=/analitika`;
  }
  return `${fallbackProd}/auth/confirm?next=/analitika`;
}

function safeEmail(raw: unknown): string {
  return String(raw ?? "").trim().toLowerCase();
}

function safeName(raw: unknown): string {
  return String(raw ?? "").trim();
}

function safeRoleId(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  return isValidUuid(s) ? s : null;
}

async function resolveRoleById(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  roleId: string | null
): Promise<{ id: string; key: string } | null> {
  if (roleId && isValidUuid(roleId)) {
    const { data, error } = await admin.from("crm_roles").select("id,key").eq("id", roleId).maybeSingle();
    if (!error && data) {
      return { id: String((data as { id?: string }).id ?? ""), key: String((data as { key?: string }).key ?? "") };
    }
  }

  const { data: fallback, error: fallbackErr } = await admin
    .from("crm_roles")
    .select("id,key")
    .eq("key", "sales")
    .maybeSingle();
  if (fallbackErr || !fallback) return null;
  return {
    id: String((fallback as { id?: string }).id ?? ""),
    key: String((fallback as { key?: string }).key ?? "sales"),
  };
}

function canManageAccounts(user: Awaited<ReturnType<typeof getCurrentCrmUser>>): boolean {
  return Boolean(user && hasPermission(user, "settings.accounts"));
}

export async function createAccountAction(
  formData: FormData
): Promise<{ ok: true; invitedEmail: string } | { ok: false; error: string }> {
  const actor = await getCurrentCrmUser();
  if (!canManageAccounts(actor)) {
    return { ok: false, error: "Neturite teisių atlikti šį veiksmą." };
  }

  const email = safeEmail(formData.get("email"));
  const name = safeName(formData.get("name"));
  const roleId = safeRoleId(formData.get("roleId"));

  if (!email || !email.includes("@")) return { ok: false, error: "Įveskite el. paštą." };
  if (!name) return { ok: false, error: "Įveskite vardą." };

  let admin;
  try {
    admin = createSupabaseAdminClient();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Trūksta Supabase konfigūracijos." };
  }

  const role = await resolveRoleById(admin, roleId);
  if (!role) return { ok: false, error: "Nepavyko rasti rolės." };

  const redirectTo = inviteRedirectTo();
  const { data: inviteData, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo,
  });
  if (inviteErr || !inviteData?.user?.id) {
    console.error("[accounts] inviteUserByEmail failed", inviteErr);
    return { ok: false, error: "Nepavyko sukurti paskyros. Patikrinkite, ar el. paštas nėra jau panaudotas." };
  }

  const userId = inviteData.user.id;
  const { error: upsertErr } = await admin.from("crm_users").upsert(
    {
      id: userId,
      name,
      email,
      role: role.key,
      role_id: role.id,
      is_kpi_tracked: role.key !== "admin",
    },
    { onConflict: "id" }
  );
  if (upsertErr) {
    console.error("[accounts] crm_users upsert failed", upsertErr);
    return { ok: false, error: "Paskyra sukurta, bet nepavyko įrašyti profilio (crm_users)." };
  }

  revalidatePath("/nustatymai/paskyros");
  return { ok: true, invitedEmail: email };
}

export async function deleteCrmUserAccountAction(
  userId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const id = String(userId ?? "").trim();
  if (!id || !isValidUuid(id)) return { ok: false, error: "Neteisingas naudotojas." };

  const actor = await getCurrentCrmUser();
  if (!canManageAccounts(actor)) {
    return { ok: false, error: "Neturite teisių atlikti šį veiksmą." };
  }

  if (actor?.id === id) {
    return { ok: false, error: "Negalite ištrinti savo paskyros (administratoriaus)." };
  }

  let admin;
  try {
    admin = createSupabaseAdminClient();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Trūksta Supabase konfigūracijos." };
  }

  const { error: delAuthErr } = await admin.auth.admin.deleteUser(id);
  if (delAuthErr) {
    console.error("[accounts] delete auth user failed", delAuthErr);
    return { ok: false, error: delAuthErr.message ?? "Nepavyko pašalinti Auth naudotojo." };
  }

  const { error: delCrmErr } = await admin.from("crm_users").delete().eq("id", id);
  if (delCrmErr) {
    console.error("[accounts] delete crm_users failed", delCrmErr);
    return { ok: false, error: delCrmErr.message ?? "Auth naudotojas pašalintas, bet nepavyko pašalinti CRM profilio." };
  }

  revalidatePath("/nustatymai/paskyros");
  return { ok: true };
}

export async function getCrmUserAction(
  id: string
): Promise<
  | {
      ok: true;
      user: {
        id: string;
        email: string;
        first_name: string;
        last_name: string;
        phone: string | null;
        role: string;
        role_id: string | null;
        role_name: string | null;
        status: CrmUserStatus;
      };
    }
  | { ok: false; error: string }
> {
  const actor = await getCurrentCrmUser();

  const supabase = await createSupabaseSsrClient();
  const { data: authData } = await supabase.auth.getUser();
  const authId = authData.user?.id ?? null;
  const canRead = canManageAccounts(actor) || (authId != null && authId === id);
  if (!canRead) return { ok: false, error: "Neturite teisių peržiūrėti šios paskyros." };

  const { data, error } = await supabase
    .from("crm_users")
    .select("id,email,first_name,last_name,phone,role,role_id,status,crm_roles:role_id(name)")
    .eq("id", id)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Naudotojas nerastas." };

  const status = String((data as any).status ?? "").trim().toLowerCase();
  if (!isCrmUserStatus(status)) return { ok: false, error: "Neleistina būsena (DB)." };

  return {
    ok: true,
    user: {
      id: String(data.id),
      email: String(data.email ?? ""),
      first_name: String((data as any).first_name ?? ""),
      last_name: String((data as any).last_name ?? ""),
      phone: (data as any).phone == null ? null : String((data as any).phone),
      role: String((data as any).role ?? "sales"),
      role_id: (data as any).role_id == null ? null : String((data as any).role_id),
      role_name: (data as any).crm_roles?.name ? String((data as any).crm_roles.name) : null,
      status,
    },
  };
}

export async function updateCrmUserAction(input: {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  role_id: string | null;
  status: CrmUserStatus;
}): Promise<
  | {
      ok: true;
      user: {
        id: string;
        email: string;
        first_name: string;
        last_name: string;
        phone: string | null;
        role: string;
        role_id: string | null;
        role_name: string | null;
        status: CrmUserStatus;
      };
    }
  | { ok: false; error: string }
> {
  const actor = await getCurrentCrmUser();

  const id = String(input.id ?? "").trim();
  const first_name = String(input.first_name ?? "").trim();
  const last_name = String(input.last_name ?? "").trim();
  const phoneRaw = input.phone == null ? "" : String(input.phone).trim();
  const phone = phoneRaw ? phoneRaw : null;
  const role_id = safeRoleId(input.role_id);
  const status = String(input.status ?? "").trim().toLowerCase();

  if (!id) return { ok: false, error: "Neteisingas naudotojas." };
  if (!first_name) return { ok: false, error: "Vardas yra privalomas." };
  if (!isCrmUserStatus(status)) return { ok: false, error: "Neleistina būsena." };

  const adminMode = canManageAccounts(actor);

  if (!adminMode) {
    const supabase = await createSupabaseSsrClient();
    const { data: authData } = await supabase.auth.getUser();
    const authId = authData.user?.id ?? null;
    if (!authId || authId !== id) {
      return { ok: false, error: "Neturite teisių išsaugoti pakeitimų." };
    }
  }

  let admin;
  try {
    admin = createSupabaseAdminClient();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Trūksta Supabase konfigūracijos." };
  }

  let nextRoleId: string | null = role_id;
  let nextRoleKey: string | null = null;
  let nextStatus: CrmUserStatus = status;

  if (!adminMode) {
    const { data: current, error: curErr } = await admin
      .from("crm_users")
      .select("role_id,role,status")
      .eq("id", id)
      .maybeSingle();
    if (curErr) return { ok: false, error: curErr.message };
    if (!current) return { ok: false, error: "Naudotojas nerastas." };

    nextRoleId = (current as any).role_id == null ? null : String((current as any).role_id);
    nextRoleKey = String((current as any).role ?? "sales");
    const dbStatus = String((current as any).status ?? "active").toLowerCase();
    nextStatus = isCrmUserStatus(dbStatus) ? dbStatus : "active";
  }

  if (adminMode) {
    const role = await resolveRoleById(admin, nextRoleId);
    if (!role) return { ok: false, error: "Nepavyko rasti rolės." };
    nextRoleId = role.id;
    nextRoleKey = role.key;
  }

  const { error } = await admin
    .from("crm_users")
    .update({
      first_name,
      last_name,
      phone,
      role: nextRoleKey,
      role_id: nextRoleId,
      status: nextStatus,
      ...(adminMode ? { is_kpi_tracked: nextRoleKey !== "admin" } : {}),
    })
    .eq("id", id);

  if (error) return { ok: false, error: error.message };

  const { data: updated, error: readErr } = await admin
    .from("crm_users")
    .select("id,email,first_name,last_name,phone,role,role_id,status,crm_roles:role_id(name)")
    .eq("id", id)
    .maybeSingle();
  if (readErr) return { ok: false, error: readErr.message };
  if (!updated) return { ok: false, error: "Naudotojas nerastas po išsaugojimo." };

  revalidatePath("/nustatymai/paskyros");
  const status2 = String((updated as any).status ?? "").trim().toLowerCase();
  if (!isCrmUserStatus(status2)) return { ok: false, error: "Neleistina būsena (DB)." };

  return {
    ok: true,
    user: {
      id: String(updated.id),
      email: String(updated.email ?? ""),
      first_name: String((updated as any).first_name ?? ""),
      last_name: String((updated as any).last_name ?? ""),
      phone: (updated as any).phone == null ? null : String((updated as any).phone),
      role: String((updated as any).role ?? "sales"),
      role_id: (updated as any).role_id == null ? null : String((updated as any).role_id),
      role_name: (updated as any).crm_roles?.name ? String((updated as any).crm_roles.name) : null,
      status: status2,
    },
  };
}
