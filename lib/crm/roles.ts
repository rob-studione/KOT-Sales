export const LEGACY_USER_ROLES = ["admin", "sales"] as const;

export type LegacyUserRole = (typeof LEGACY_USER_ROLES)[number];

/**
 * Kept wide because RBAC now supports custom roles from DB.
 * `role` field stores role key (e.g. admin/sales/custom_key).
 */
export type UserRole = string;

export const ADMIN_ROLE_KEY = "admin";
export const SALES_ROLE_KEY = "sales";

export const SYSTEM_ROLE_LABELS: Record<LegacyUserRole, string> = {
  admin: "Administratorius",
  sales: "Pardavimų vadybininkas",
};

export function isLegacyUserRole(value: unknown): value is LegacyUserRole {
  return LEGACY_USER_ROLES.includes(value as LegacyUserRole);
}

export function roleLabelFromKey(roleKey: string | null | undefined, roleName?: string | null): string {
  const key = String(roleKey ?? "").trim().toLowerCase();
  if (roleName && roleName.trim()) return roleName.trim();
  if (isLegacyUserRole(key)) return SYSTEM_ROLE_LABELS[key];
  return key || "—";
}

export function isSystemAdminRole(roleKey: string | null | undefined, roleIsSystem?: boolean | null): boolean {
  const key = String(roleKey ?? "").trim().toLowerCase();
  // Admin key always means full access; `is_system` can be temporarily inconsistent during rollout.
  if (key === ADMIN_ROLE_KEY) return true;
  return Boolean(roleIsSystem) && key === ADMIN_ROLE_KEY;
}
