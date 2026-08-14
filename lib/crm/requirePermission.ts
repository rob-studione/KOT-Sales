import "server-only";

import { redirect } from "next/navigation";
import { getCurrentCrmUser, type CurrentCrmUser } from "@/lib/crm/currentUser";
import { hasPermission, hasAnyPermission } from "@/lib/crm/permissions/check";

type RequireMode = "throw" | "redirect";

export async function requirePermission(
  permission: string,
  opts?: { mode?: RequireMode; redirectTo?: string }
): Promise<CurrentCrmUser> {
  const mode = opts?.mode ?? "throw";
  const redirectTo = opts?.redirectTo ?? "/dashboard";
  const user = await getCurrentCrmUser();

  if (user && hasPermission(user, permission)) return user;

  if (mode === "redirect") redirect(redirectTo);
  throw new Error(`Not authorized (${permission} required).`);
}

export async function requireAnyPermission(
  permissions: string[],
  opts?: { mode?: RequireMode; redirectTo?: string }
): Promise<CurrentCrmUser> {
  const mode = opts?.mode ?? "throw";
  const redirectTo = opts?.redirectTo ?? "/dashboard";
  const user = await getCurrentCrmUser();

  if (user && hasAnyPermission(user, permissions)) return user;

  if (mode === "redirect") redirect(redirectTo);
  throw new Error(`Not authorized (${permissions.join(",")}).`);
}
