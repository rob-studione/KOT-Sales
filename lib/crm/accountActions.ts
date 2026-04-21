"use server";

import { revalidatePath } from "next/cache";
import { isUserRole, type UserRole } from "@/lib/crm/roles";
import { requireAdmin } from "@/lib/crm/currentUser";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseSsrClient } from "@/lib/supabase/ssr";
import { isValidUuid } from "@/lib/crm/crmUsers";

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

function safeRole(raw: unknown): string {
  const r = String(raw ?? "").trim().toLowerCase();
  if (!r) return "sales";
  if (isUserRole(r)) return r;
  return "__invalid__";
}

export async function createAccountAction(
  formData: FormData
): Promise<{ ok: true; invitedEmail: string } | { ok: false; error: string }> {
  try {
    await requireAdmin({ mode: "throw" });
  } catch {
    return { ok: false, error: "Neturite teisių atlikti šį veiksmą." };
  }

  const email = safeEmail(formData.get("email"));
  const name = safeName(formData.get("name"));
  const role = safeRole(formData.get("role"));

  if (!email || !email.includes("@")) return { ok: false, error: "Įveskite el. paštą." };
  if (!name) return { ok: false, error: "Įveskite vardą." };
  if (role === "__invalid__") return { ok: false, error: "Neleistina rolė." };

  let admin;
  try {
    admin = createSupabaseAdminClient();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Trūksta Supabase konfigūracijos." };
  }

  // Invite flow: user sets password via email link.
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
      role: role as UserRole,
      is_kpi_tracked: role !== "admin",
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

  let actor;
  try {
    actor = await requireAdmin({ mode: "throw" });
  } catch {
    return { ok: false, error: "Neturite teisių atlikti šį veiksmą." };
  }

  if (actor.id === id) {
    return { ok: false, error: "Negalite ištrinti savo paskyros (administratoriaus)." };
  }

  let admin;
  try {
    admin = createSupabaseAdminClient();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Trūksta Supabase konfigūracijos." };
  }

  const { error: delCrmErr } = await admin.from("crm_users").delete().eq("id", id);
  if (delCrmErr) {
    console.error("[accounts] delete crm_users failed", delCrmErr);
    return { ok: false, error: delCrmErr.message ?? "Nepavyko pašalinti CRM profilio." };
  }

  const { error: delAuthErr } = await admin.auth.admin.deleteUser(id);
  if (delAuthErr) {
    console.error("[accounts] delete auth user failed", delAuthErr);
    return { ok: false, error: delAuthErr.message ?? "Nepavyko pašalinti Auth naudotojo." };
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
        role: UserRole;
        status: CrmUserStatus;
      };
    }
  | { ok: false; error: string }
> {
  const actor = await (async () => {
    try {
      return await requireAdmin({ mode: "throw" });
    } catch {
      return null;
    }
  })();

  // Use cookie-based SSR client: enforces RLS and doesn't require service-role.
  const supabase = await createSupabaseSsrClient();
  const { data: authData } = await supabase.auth.getUser();
  const authId = authData.user?.id ?? null;
  const canRead = actor?.role === "admin" || (authId != null && authId === id);
  if (!canRead) return { ok: false, error: "Neturite teisių peržiūrėti šios paskyros." };

  const { data, error } = await supabase
    .from("crm_users")
    .select("id,email,first_name,last_name,phone,role,status")
    .eq("id", id)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Naudotojas nerastas." };

  const role = String((data as any).role ?? "").trim().toLowerCase();
  const status = String((data as any).status ?? "").trim().toLowerCase();
  if (!isUserRole(role)) return { ok: false, error: "Neleistina rolė (DB)." };
  if (!isCrmUserStatus(status)) return { ok: false, error: "Neleistina būsena (DB)." };

  return {
    ok: true,
    user: {
      id: String(data.id),
      email: String(data.email ?? ""),
      first_name: String((data as any).first_name ?? ""),
      last_name: String((data as any).last_name ?? ""),
      phone: (data as any).phone == null ? null : String((data as any).phone),
      role,
      status,
    },
  };
}

export async function updateCrmUserAction(input: {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  role: UserRole;
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
        role: UserRole;
        status: CrmUserStatus;
      };
    }
  | { ok: false; error: string }
> {
  const adminUser = await (async () => {
    try {
      return await requireAdmin({ mode: "throw" });
    } catch {
      return null;
    }
  })();

  const id = String(input.id ?? "").trim();
  const first_name = String(input.first_name ?? "").trim();
  const last_name = String(input.last_name ?? "").trim();
  const phoneRaw = input.phone == null ? "" : String(input.phone).trim();
  const phone = phoneRaw ? phoneRaw : null;
  const role = String(input.role ?? "").trim().toLowerCase();
  const status = String(input.status ?? "").trim().toLowerCase();

  if (!id) return { ok: false, error: "Neteisingas naudotojas." };
  if (!first_name) return { ok: false, error: "Vardas yra privalomas." };
  if (!isUserRole(role)) return { ok: false, error: "Neleistina rolė." };
  if (!isCrmUserStatus(status)) return { ok: false, error: "Neleistina būsena." };
  const roleNorm = role as UserRole;
  const statusNorm = status as CrmUserStatus;

  let allowRoleStatusChange = false;
  if (adminUser?.role === "admin") {
    allowRoleStatusChange = true;
  } else {
    // Self-edit is allowed for profile fields only.
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

  // For self-edit: keep role/status unchanged.
  let nextRole: UserRole = roleNorm;
  let nextStatus: CrmUserStatus = statusNorm;
  if (!allowRoleStatusChange) {
    const { data: current, error: curErr } = await admin
      .from("crm_users")
      .select("role,status")
      .eq("id", id)
      .maybeSingle();
    if (curErr) return { ok: false, error: curErr.message };
    if (!current) return { ok: false, error: "Naudotojas nerastas." };
    const dbRole = String((current as any).role ?? "").trim().toLowerCase();
    const dbStatus = String((current as any).status ?? "").trim().toLowerCase();
    if (!isUserRole(dbRole)) return { ok: false, error: "Neleistina rolė (DB)." };
    if (!isCrmUserStatus(dbStatus)) return { ok: false, error: "Neleistina būsena (DB)." };
    nextRole = dbRole as UserRole;
    nextStatus = dbStatus as CrmUserStatus;
  }

  const { error } = await admin
    .from("crm_users")
    .update({
      first_name,
      last_name,
      phone,
      role: nextRole,
      status: nextStatus,
    })
    .eq("id", id);

  if (error) return { ok: false, error: error.message };

  // Read back the updated row to return a single source of truth to the client.
  const { data: updated, error: readErr } = await admin
    .from("crm_users")
    .select("id,email,first_name,last_name,phone,role,status")
    .eq("id", id)
    .maybeSingle();
  if (readErr) return { ok: false, error: readErr.message };
  if (!updated) return { ok: false, error: "Naudotojas nerastas po išsaugojimo." };

  revalidatePath("/nustatymai/paskyros");
  const role2 = String((updated as any).role ?? "").trim().toLowerCase();
  const status2 = String((updated as any).status ?? "").trim().toLowerCase();
  if (!isUserRole(role2)) return { ok: false, error: "Neleistina rolė (DB)." };
  if (!isCrmUserStatus(status2)) return { ok: false, error: "Neleistina būsena (DB)." };

  return {
    ok: true,
    user: {
      id: String(updated.id),
      email: String(updated.email ?? ""),
      first_name: String((updated as any).first_name ?? ""),
      last_name: String((updated as any).last_name ?? ""),
      phone: (updated as any).phone == null ? null : String((updated as any).phone),
      role: role2,
      status: status2,
    },
  };
}

