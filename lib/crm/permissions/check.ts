import { isSystemAdminRole } from "@/lib/crm/roles";

export type PermissionCarrier = {
  role: string;
  roleIsSystem?: boolean | null;
  permissionKeys?: string[] | null;
};

export function hasPermission(user: PermissionCarrier | null | undefined, permission: string): boolean {
  if (!user) return false;
  if (isSystemAdminRole(user.role, user.roleIsSystem)) return true;
  const set = new Set((user.permissionKeys ?? []).map((x) => String(x).trim()).filter(Boolean));
  return set.has(permission);
}

export function hasAnyPermission(user: PermissionCarrier | null | undefined, permissions: string[]): boolean {
  if (!user) return false;
  if (isSystemAdminRole(user.role, user.roleIsSystem)) return true;
  const set = new Set((user.permissionKeys ?? []).map((x) => String(x).trim()).filter(Boolean));
  return permissions.some((p) => set.has(p));
}
