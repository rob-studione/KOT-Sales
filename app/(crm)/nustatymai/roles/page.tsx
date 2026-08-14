import { CrmTableContainer } from "@/components/crm/CrmTableContainer";
import { RolesPageClient } from "@/components/crm/roles/RolesPageClient";
import { loadRolesManagementData } from "@/lib/crm/roleActions";
import { requirePermission } from "@/lib/crm/requirePermission";

export const dynamic = "force-dynamic";

export default async function RolesSettingsPage() {
  await requirePermission("settings.roles", { mode: "redirect", redirectTo: "/dashboard" });

  const data = await loadRolesManagementData();
  if (!data.ok) {
    return (
      <CrmTableContainer className="pb-10 pt-5">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Rolės</h1>
        <p className="mt-3 text-sm text-red-600">{data.error}</p>
      </CrmTableContainer>
    );
  }

  return (
    <CrmTableContainer className="pb-10 pt-5">
      <RolesPageClient initialRoles={data.roles} />
    </CrmTableContainer>
  );
}
