import { CreateAccountButton } from "@/components/crm/accounts/CreateAccountButton";
import { AccountsPageClient } from "@/components/crm/accounts/AccountsPageClient";
import { requirePermission } from "@/lib/crm/requirePermission";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { CrmTableContainer } from "@/components/crm/CrmTableContainer";
import type { CrmUserStatus } from "@/lib/crm/accountActions";
import { loadAssignableRoles } from "@/lib/crm/roleActions";

type Row = {
  id: string;
  name: string;
  first_name?: string;
  last_name?: string;
  legacy_name?: string;
  email: string;
  role_id?: string | null;
  role_key: string;
  role_name: string;
  status: string;
  status_raw?: CrmUserStatus;
  lastActivityLabel: string;
  phone?: string | null;
  avatar_url?: string | null;
};

export const dynamic = "force-dynamic";

export default async function PaskyrosPage() {
  const actor = await requirePermission("settings.accounts", { mode: "redirect", redirectTo: "/dashboard" });
  const actorId = actor.id;

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

  const [roles, usersResult] = await Promise.all([
    loadAssignableRoles(),
    admin.auth.admin.listUsers({ perPage: 200, page: 1 }),
  ]);

  const { data: usersData, error: usersErr } = usersResult;
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

  const roleById = new Map(roles.map((r) => [r.id, r]));

  const authUsers = usersData?.users ?? [];
  const ids = authUsers.map((u) => u.id);
  const { data: crmRows } = ids.length
    ? await admin
        .from("crm_users")
        .select("id,name,first_name,last_name,email,role,role_id,status,phone,avatar_url")
        .in("id", ids)
    : {
        data: [] as Array<{
          id: string;
          name: string;
          first_name: string;
          last_name: string;
          email: string;
          role: string;
          role_id: string | null;
          status: CrmUserStatus;
          phone: string | null;
          avatar_url: string | null;
        }>,
      };
  const crmById = new Map((crmRows ?? []).map((r) => [r.id, r]));

  const rows: Row[] = authUsers.map((u) => {
    const p = crmById.get(u.id);
    const fn = p?.first_name?.trim() ?? "";
    const ln = p?.last_name?.trim() ?? "";
    const full = [fn, ln].filter(Boolean).join(" ").trim();
    const legacyName = p?.name?.trim() ?? "";
    const name = full || legacyName || "—";
    const email = (p?.email?.trim() ? p.email : (u.email ?? "")).trim() || "—";
    const roleId = p?.role_id ? String(p.role_id) : null;
    const roleKey = String(p?.role ?? "sales").trim() || "sales";
    const roleMeta = roleId ? roleById.get(roleId) : null;
    const roleName = roleMeta?.name ?? roleKey;
    const statusRaw = String(p?.status ?? "active").toLowerCase();
    const status = statusRaw === "inactive" ? "Neaktyvi" : "Aktyvi";
    const phone = p?.phone == null ? null : String(p.phone);
    const avatar_url = p?.avatar_url == null ? null : String(p.avatar_url);
    return {
      id: u.id,
      name,
      first_name: fn || undefined,
      last_name: ln || undefined,
      legacy_name: legacyName || undefined,
      email,
      role_id: roleId,
      role_key: roleKey,
      role_name: roleName,
      status,
      status_raw: (statusRaw === "inactive" ? "inactive" : "active") as CrmUserStatus,
      lastActivityLabel: "-",
      phone,
      avatar_url,
    };
  });

  const roleOptions = roles.map((r) => ({ id: r.id, key: r.key, name: r.name, color: r.color }));

  return (
    <CrmTableContainer className="pb-10 pt-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Paskyros</h1>
          <p className="mt-1 text-sm text-zinc-600">Vidinės CRM paskyros (be viešo registravimo).</p>
        </div>
        <div className="shrink-0">
          <CreateAccountButton roleOptions={roleOptions} />
        </div>
      </div>

      <div className="mt-6">
        <AccountsPageClient rows={rows} roleOptions={roleOptions} currentUserId={actorId} />
      </div>
    </CrmTableContainer>
  );
}
