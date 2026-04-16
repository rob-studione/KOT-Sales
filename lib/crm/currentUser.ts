import "server-only";

import { redirect } from "next/navigation";
import { createSupabaseSsrReadOnlyClient } from "@/lib/supabase/ssr";
import type { UserRole } from "@/lib/crm/roles";
import type { CrmUserStatus } from "@/lib/crm/accountActions";

export type CurrentCrmUser = {
  id: string;
  email: string;
  role: UserRole;
  first_name: string;
  last_name: string;
  phone: string | null;
  status: CrmUserStatus;
  avatar_url: string | null;
};

export async function getCurrentCrmUser(): Promise<CurrentCrmUser | null> {
  const supabase = await createSupabaseSsrReadOnlyClient();
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) return null;

  const authUser = userData.user;
  const { data: crmUser, error: crmErr } = await supabase
    .from("crm_users")
    .select("id,email,role,first_name,last_name,phone,status,avatar_url")
    .eq("id", authUser.id)
    .maybeSingle();

  if (crmErr) throw crmErr;
  if (!crmUser) return null;

  return {
    id: crmUser.id,
    email: (crmUser.email ?? authUser.email ?? "").trim(),
    role: crmUser.role as UserRole,
    first_name: String((crmUser as any).first_name ?? ""),
    last_name: String((crmUser as any).last_name ?? ""),
    phone: (crmUser as any).phone == null ? null : String((crmUser as any).phone),
    status: String((crmUser as any).status ?? "active") as CrmUserStatus,
    avatar_url: (crmUser as any).avatar_url == null ? null : String((crmUser as any).avatar_url),
  };
}

type RequireAdminMode = "throw" | "redirect";

export async function requireAdmin(opts?: { mode?: RequireAdminMode; redirectTo?: string }): Promise<CurrentCrmUser> {
  const mode = opts?.mode ?? "throw";
  const redirectTo = opts?.redirectTo ?? "/analitika";

  const u = await getCurrentCrmUser();
  if (u && u.role === "admin") return u;

  if (mode === "redirect") {
    redirect(redirectTo);
  }

  throw new Error("Not authorized (admin required).");
}

