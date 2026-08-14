"use server";

import { revalidatePath } from "next/cache";

import { ADMIN_DEFAULT_PERMISSIONS, isPermissionKey } from "@/lib/crm/permissions/catalog";
import { requirePermission } from "@/lib/crm/requirePermission";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { ADMIN_ROLE_KEY, SALES_ROLE_KEY, isSystemAdminRole } from "@/lib/crm/roles";

export type CrmRoleSummary = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  color: string;
  is_system: boolean;
  user_count: number;
  permission_keys: string[];
};

function normText(v: unknown): string {
  return String(v ?? "").trim();
}

function normColor(v: unknown): string {
  const s = String(v ?? "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s;
  return "#7C4A57";
}

function normalizePermissionKeys(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    const key = String(item ?? "").trim();
    if (!isPermissionKey(key)) continue;
    if (!out.includes(key)) out.push(key);
  }
  return out;
}

function slugifyRoleKey(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

async function loadRoleSummaryRows(): Promise<CrmRoleSummary[]> {
  const admin = createSupabaseAdminClient();
  const [{ data: roles, error: rolesErr }, { data: perms, error: permsErr }, { data: users, error: usersErr }] =
    await Promise.all([
      admin.from("crm_roles").select("id,key,name,description,color,is_system,created_at").order("is_system", { ascending: false }).order("name", { ascending: true }),
      admin.from("crm_role_permissions").select("role_id,permission_key"),
      admin.from("crm_users").select("id,role_id"),
    ]);

  if (rolesErr) throw new Error(rolesErr.message);
  if (permsErr) throw new Error(permsErr.message);
  if (usersErr) throw new Error(usersErr.message);

  const permByRole = new Map<string, string[]>();
  for (const p of perms ?? []) {
    const roleId = String((p as { role_id?: string }).role_id ?? "");
    const key = String((p as { permission_key?: string }).permission_key ?? "").trim();
    if (!roleId || !key) continue;
    const list = permByRole.get(roleId) ?? [];
    if (!list.includes(key)) list.push(key);
    permByRole.set(roleId, list);
  }

  const userCountByRole = new Map<string, number>();
  for (const u of users ?? []) {
    const roleId = String((u as { role_id?: string | null }).role_id ?? "");
    if (!roleId) continue;
    userCountByRole.set(roleId, (userCountByRole.get(roleId) ?? 0) + 1);
  }

  return (roles ?? []).map((r) => {
    const id = String((r as { id?: string }).id ?? "");
    return {
      id,
      key: String((r as { key?: string }).key ?? ""),
      name: String((r as { name?: string }).name ?? ""),
      description: (r as { description?: string | null }).description ?? null,
      color: String((r as { color?: string }).color ?? "#7C4A57"),
      is_system: Boolean((r as { is_system?: boolean }).is_system),
      user_count: userCountByRole.get(id) ?? 0,
      permission_keys: (permByRole.get(id) ?? []).sort(),
    };
  });
}

export async function loadRolesManagementData(): Promise<{ ok: true; roles: CrmRoleSummary[] } | { ok: false; error: string }> {
  try {
    await requirePermission("settings.roles", { mode: "throw" });
  } catch {
    return { ok: false, error: "Neturite teisių valdyti roles." };
  }

  try {
    const rows = await loadRoleSummaryRows();
    return { ok: true, roles: rows };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Nepavyko įkelti rolių." };
  }
}

export async function loadAssignableRoles(): Promise<CrmRoleSummary[]> {
  const rows = await loadRoleSummaryRows();
  return rows;
}

export async function createRoleAction(input: {
  name: string;
  description?: string | null;
  color?: string | null;
  permission_keys: string[];
}): Promise<{ ok: true; roleId: string } | { ok: false; error: string }> {
  let actor;
  try {
    actor = await requirePermission("settings.roles", { mode: "throw" });
  } catch {
    return { ok: false, error: "Neturite teisių valdyti roles." };
  }

  const name = normText(input.name);
  if (name.length < 2) return { ok: false, error: "Rolės pavadinimas per trumpas." };

  const description = normText(input.description ?? "") || null;
  const color = normColor(input.color ?? "");
  const requestedPerms = normalizePermissionKeys(input.permission_keys);

  const baseKey = slugifyRoleKey(name) || `role_${Date.now()}`;

  const admin = createSupabaseAdminClient();
  const { data: existing } = await admin.from("crm_roles").select("key").ilike("key", `${baseKey}%`);
  const existingKeys = new Set((existing ?? []).map((x) => String((x as { key?: string }).key ?? "")));
  let key = baseKey;
  let n = 2;
  while (existingKeys.has(key)) {
    key = `${baseKey}_${n}`;
    n += 1;
  }

  const { data: role, error: roleErr } = await admin
    .from("crm_roles")
    .insert({ key, name, description, color, is_system: false })
    .select("id")
    .single();

  if (roleErr || !role) {
    return { ok: false, error: roleErr?.message ?? "Nepavyko sukurti rolės." };
  }

  if (requestedPerms.length > 0) {
    const rows = requestedPerms.map((permission_key) => ({ role_id: role.id, permission_key }));
    const { error: permErr } = await admin.from("crm_role_permissions").insert(rows);
    if (permErr) return { ok: false, error: permErr.message };
  }

  // Keep actor cache fresh after roles changed.
  revalidatePath("/nustatymai/roles");
  revalidatePath("/nustatymai/paskyros");
  revalidatePath("/dashboard");
  revalidatePath("/analitika");
  revalidatePath("/klientai");
  revalidatePath("/projektai");
  revalidatePath("/irankiai");

  if (actor.id) revalidatePath("/");
  return { ok: true, roleId: role.id };
}

export async function updateRoleAction(input: {
  role_id: string;
  name: string;
  description?: string | null;
  color?: string | null;
  permission_keys: string[];
}): Promise<{ ok: true } | { ok: false; error: string }> {
  let actor;
  try {
    actor = await requirePermission("settings.roles", { mode: "throw" });
  } catch {
    return { ok: false, error: "Neturite teisių valdyti roles." };
  }

  const roleId = normText(input.role_id);
  if (!roleId) return { ok: false, error: "Neteisinga rolė." };

  const name = normText(input.name);
  if (name.length < 2) return { ok: false, error: "Rolės pavadinimas per trumpas." };

  const description = normText(input.description ?? "") || null;
  const color = normColor(input.color ?? "");

  const admin = createSupabaseAdminClient();
  const { data: roleRow, error: roleErr } = await admin
    .from("crm_roles")
    .select("id,key,is_system")
    .eq("id", roleId)
    .maybeSingle();

  if (roleErr) return { ok: false, error: roleErr.message };
  if (!roleRow) return { ok: false, error: "Rolė nerasta." };

  const roleKey = String((roleRow as { key?: string }).key ?? "").trim().toLowerCase();
  const roleIsSystem = Boolean((roleRow as { is_system?: boolean }).is_system);

  let nextPerms = normalizePermissionKeys(input.permission_keys);
  if (isSystemAdminRole(roleKey, roleIsSystem)) {
    nextPerms = [...ADMIN_DEFAULT_PERMISSIONS];
  }

  const { error: updErr } = await admin
    .from("crm_roles")
    .update({ name, description, color })
    .eq("id", roleId);

  if (updErr) return { ok: false, error: updErr.message };

  const { error: delErr } = await admin.from("crm_role_permissions").delete().eq("role_id", roleId);
  if (delErr) return { ok: false, error: delErr.message };

  if (nextPerms.length > 0) {
    const rows = nextPerms.map((permission_key) => ({ role_id: roleId, permission_key }));
    const { error: insErr } = await admin.from("crm_role_permissions").insert(rows);
    if (insErr) return { ok: false, error: insErr.message };
  }

  // Prevent accidental lockout for own role.
  const { data: me, error: meErr } = await admin.from("crm_users").select("role_id").eq("id", actor.id).maybeSingle();
  if (!meErr && me && String((me as { role_id?: string }).role_id ?? "") === roleId) {
    const needs = ["settings.roles", "settings.accounts"];
    for (const key of needs) {
      if (nextPerms.includes(key)) continue;
      return { ok: false, error: "Negalite pašalinti kritinių teisių nuo savo rolės." };
    }
  }

  revalidatePath("/nustatymai/roles");
  revalidatePath("/nustatymai/paskyros");
  revalidatePath("/dashboard");
  revalidatePath("/analitika");
  revalidatePath("/klientai");
  revalidatePath("/projektai");
  revalidatePath("/irankiai");

  return { ok: true };
}

export async function deleteRoleAction(input: {
  role_id: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await requirePermission("settings.roles", { mode: "throw" });
  } catch {
    return { ok: false, error: "Neturite teisių valdyti roles." };
  }

  const roleId = normText(input.role_id);
  if (!roleId) return { ok: false, error: "Neteisinga rolė." };

  const admin = createSupabaseAdminClient();
  const { data: roleRow, error: roleErr } = await admin
    .from("crm_roles")
    .select("id,key,is_system")
    .eq("id", roleId)
    .maybeSingle();

  if (roleErr) return { ok: false, error: roleErr.message };
  if (!roleRow) return { ok: false, error: "Rolė nerasta." };

  const roleKey = String((roleRow as { key?: string }).key ?? "");
  if (Boolean((roleRow as { is_system?: boolean }).is_system)) {
    return { ok: false, error: "Sisteminės rolės trinti negalima." };
  }
  if (roleKey === ADMIN_ROLE_KEY || roleKey === SALES_ROLE_KEY) {
    return { ok: false, error: "Sisteminės rolės trinti negalima." };
  }

  const { count: usersCount, error: usersErr } = await admin
    .from("crm_users")
    .select("id", { count: "exact", head: true })
    .eq("role_id", roleId);

  if (usersErr) return { ok: false, error: usersErr.message };
  if ((usersCount ?? 0) > 0) {
    return { ok: false, error: "Negalima trinti rolės, kol ji priskirta naudotojams." };
  }

  const { error: delErr } = await admin.from("crm_roles").delete().eq("id", roleId);
  if (delErr) return { ok: false, error: delErr.message };

  revalidatePath("/nustatymai/roles");
  revalidatePath("/nustatymai/paskyros");
  revalidatePath("/dashboard");
  revalidatePath("/analitika");
  revalidatePath("/klientai");
  revalidatePath("/projektai");
  revalidatePath("/irankiai");

  return { ok: true };
}

