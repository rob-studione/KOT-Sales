export const USER_ROLES = ["admin", "sales"] as const;

export type UserRole = (typeof USER_ROLES)[number];

export function isUserRole(value: unknown): value is UserRole {
  return USER_ROLES.includes(value as UserRole);
}

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Admin",
  sales: "Pardavimų vadybininkas",
};

