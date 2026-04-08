import { CreateAccountButton } from "@/components/crm/accounts/CreateAccountButton";
import { AccountsPageClient } from "@/components/crm/accounts/AccountsPageClient";
import type { UserRole } from "@/lib/crm/roles";
import { requireAdmin } from "@/lib/crm/currentUser";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { CrmTableContainer } from "@/components/crm/CrmTableContainer";
import type { CrmUserStatus } from "@/lib/crm/accountActions";

type Row = {
  id: string;
  name: string;
  first_name?: string;
  last_name?: string;
  legacy_name?: string;
  email: string;
  role: UserRole;
  status: string;
  status_raw?: CrmUserStatus;
  lastActivityLabel: string;
  phone?: string | null;
  avatar_url?: string | null;
};

export const dynamic = "force-dynamic";

export default async function PaskyrosPage() {
  await requireAdmin({ mode: "redirect", redirectTo: "/analitika" });

  let admin;
  try {
    admin = createSupabaseAdminClient();
  } catch (e) {
    const message = e instanceof Error ? e.message : "Klaida";
    return (
      <CrmTableContainer className="pb-10 pt-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Paskyros</h1>
            <p className="mt-1 text-sm text-zinc-600">Vidinės CRM paskyros (be viešo registravimo).</p>
          </div>
        </div>
        <p className="mt-4 text-sm text-red-600">Trūksta serverio konfigūracijos. {message}</p>
        <p className="mt-2 text-xs text-zinc-500">
          Reikia <code className="rounded bg-zinc-100 px-1">SUPABASE_SERVICE_ROLE_KEY</code> (tik serveryje).
        </p>
      </CrmTableContainer>
    );
  }

  const { data: usersData, error: usersErr } = await admin.auth.admin.listUsers({ perPage: 200, page: 1 });
  if (usersErr) {
    return (
      <CrmTableContainer className="pb-10 pt-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Paskyros</h1>
            <p className="mt-1 text-sm text-zinc-600">Vidinės CRM paskyros (be viešo registravimo).</p>
          </div>
        </div>
        <p className="mt-4 text-sm text-red-600">Nepavyko įkelti naudotojų: {usersErr.message}</p>
      </CrmTableContainer>
    );
  }

  const authUsers = usersData?.users ?? [];
  const ids = authUsers.map((u) => u.id);
  const { data: crmRows } = ids.length
    ? await admin
        .from("crm_users")
        .select("id,name,first_name,last_name,email,role,status,phone,avatar_url")
        .in("id", ids)
    : {
        data: [] as Array<{
          id: string;
          name: string;
          first_name: string;
          last_name: string;
          email: string;
          role: string;
          status: CrmUserStatus;
          phone: string | null;
        }>,
      };
  const crmById = new Map((crmRows ?? []).map((r) => [r.id, r]));

  const rows: Row[] = authUsers.map((u) => {
    const p = crmById.get(u.id);
    const fn = (p as any)?.first_name ? String((p as any).first_name).trim() : "";
    const ln = (p as any)?.last_name ? String((p as any).last_name).trim() : "";
    const full = [fn, ln].filter(Boolean).join(" ").trim();
    const legacyName = (p as any)?.name ? String((p as any).name).trim() : "";
    const name = full || legacyName || "—";
    const email = (p?.email?.trim() ? p.email : (u.email ?? "")).trim() || "—";
    const role = (p?.role?.trim() ? p.role : "sales") as UserRole;
    const statusRaw = String(((p as any)?.status ?? "active") as string).toLowerCase();
    const status = statusRaw === "inactive" ? "Neaktyvi" : "Aktyvi";
    const phone = (p as any)?.phone == null ? null : String((p as any).phone);
    const avatar_url = (p as any)?.avatar_url == null ? null : String((p as any).avatar_url);
    return {
      id: u.id,
      name,
      first_name: fn || undefined,
      last_name: ln || undefined,
      legacy_name: legacyName || undefined,
      email,
      role,
      status,
      status_raw: (statusRaw === "inactive" ? "inactive" : "active") as CrmUserStatus,
      lastActivityLabel: "-",
      phone,
      avatar_url,
    };
  });

  return (
    <CrmTableContainer className="pb-10 pt-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Paskyros</h1>
          <p className="mt-1 text-sm text-zinc-600">Vidinės CRM paskyros (be viešo registravimo).</p>
        </div>
        <div className="shrink-0">
          <CreateAccountButton />
        </div>
      </div>

      <div className="mt-6">
        <AccountsPageClient rows={rows} />
      </div>
    </CrmTableContainer>
  );
}

