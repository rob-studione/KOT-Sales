import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { getSsrAuth } from "@/lib/supabase/ssr";
import { isLegacyUserRole, type UserRole } from "@/lib/crm/roles";
import { SALES_DEFAULT_PERMISSIONS } from "@/lib/crm/permissions/catalog";
import { hasPermission } from "@/lib/crm/permissions/check";

export type CrmUserStatus = "active" | "inactive";

export type CurrentCrmUser = {
  id: string;
  email: string;
  role: UserRole;
  role_id: string | null;
  role_name: string | null;
  role_color: string | null;
  role_is_system: boolean;
  permissionKeys: string[];
  first_name: string;
  last_name: string;
  phone: string | null;
  status: CrmUserStatus;
  avatar_url: string | null;
};

type CrmUserSelect = {
  id: string;
  email: string | null;
  role: string | null;
  role_id: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  status: string | null;
  avatar_url: string | null;
  crm_roles:
    | {
        id: string;
        key: string;
        name: string;
        color: string | null;
        is_system: boolean;
        crm_role_permissions: Array<{ permission_key: string }> | null;
      }
    | null;
};

/** Cached per RSC request — shares Auth session with `createSupabaseSsrReadOnlyClient`. */
export const getCurrentCrmUser = cache(async function getCurrentCrmUser(): Promise<CurrentCrmUser | null> {
  const { client: supabase, user: authUser } = await getSsrAuth();
  if (!authUser) return null;

  let crmUser: CrmUserSelect | null = null;
  let crmErr: unknown = null;

  const primary = await supabase
    .from("crm_users")
    .select(
      "id,email,role,role_id,first_name,last_name,phone,status,avatar_url,crm_roles:role_id(id,key,name,color,is_system,crm_role_permissions(permission_key))"
    )
    .eq("id", authUser.id)
    .maybeSingle();

  crmErr = primary.error;
  crmUser = (primary.data as unknown as CrmUserSelect | null) ?? null;

  // Backward-compat fallback for environments where 0140 migration is not applied yet.
  if (crmErr) {
    const err = crmErr as { message?: string; code?: string; details?: string };
    const isMissingRbacRelation =
      err.code === "PGRST200" || String(err.message ?? "").toLowerCase().includes("relationship");
    if (isMissingRbacRelation) {
      const legacy = await supabase
        .from("crm_users")
        .select("id,email,role,first_name,last_name,phone,status,avatar_url")
        .eq("id", authUser.id)
        .maybeSingle();

      crmErr = legacy.error;
      crmUser = legacy.data ? ({ ...legacy.data, role_id: null, crm_roles: null } as unknown as CrmUserSelect) : null;
    }
  }

  if (crmErr) {
    const err = crmErr as { message?: string; code?: string; details?: string };
    throw new Error(
      [err.message, err.code ? `code=${err.code}` : "", err.details ? `details=${err.details}` : ""]
        .filter(Boolean)
        .join(" | ")
    );
  }
  if (!crmUser) return null;

  const row = crmUser as unknown as CrmUserSelect;
  const roleObj = row.crm_roles;
  const roleKey = (roleObj?.key ?? row.role ?? "sales").trim().toLowerCase();
  const roleIsSystem = Boolean(roleObj?.is_system) || roleKey === "admin";

  let permissionKeys = (roleObj?.crm_role_permissions ?? [])
    .map((x) => String(x.permission_key ?? "").trim())
    .filter(Boolean);

  // Fallback for pre-RBAC rows during migration rollout.
  if (permissionKeys.length === 0 && isLegacyUserRole(roleKey)) {
    permissionKeys = roleKey === "admin" ? ["*"] : [...SALES_DEFAULT_PERMISSIONS];
  }

  const status = String(row.status ?? "active").toLowerCase() === "inactive" ? "inactive" : "active";

  return {
    id: row.id,
    email: (row.email ?? authUser.email ?? "").trim(),
    role: roleKey,
    role_id: row.role_id,
    role_name: roleObj?.name ?? null,
    role_color: roleObj?.color ?? null,
    role_is_system: roleIsSystem,
    permissionKeys,
    first_name: String(row.first_name ?? ""),
    last_name: String(row.last_name ?? ""),
    phone: row.phone == null ? null : String(row.phone),
    status,
    avatar_url: row.avatar_url == null ? null : String(row.avatar_url),
  };
});

type RequireAdminMode = "throw" | "redirect";

/** Legacy helper kept for compatibility in untouched code paths. */
export async function requireAdmin(opts?: { mode?: RequireAdminMode; redirectTo?: string }): Promise<CurrentCrmUser> {
  const mode = opts?.mode ?? "throw";
  const redirectTo = opts?.redirectTo ?? "/analitika";

  const u = await getCurrentCrmUser();
  if (u && hasPermission(u, "settings.accounts")) return u;

  if (mode === "redirect") {
    redirect(redirectTo);
  }

  throw new Error("Not authorized (admin required).");
}
