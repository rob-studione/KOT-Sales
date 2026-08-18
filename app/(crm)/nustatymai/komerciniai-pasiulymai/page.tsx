import { CrmTableContainer } from "@/components/crm/CrmTableContainer";
import { CompanyHistoryAdminClient } from "@/components/crm/commercial-proposal/CompanyHistoryAdminClient";
import { listCompanyHistoryAdmin } from "@/lib/crm/commercialProposalActions";
import { requirePermission } from "@/lib/crm/requirePermission";

export const dynamic = "force-dynamic";

export default async function CommercialProposalSettingsPage() {
  await requirePermission("settings.commercial_proposals", { mode: "redirect", redirectTo: "/dashboard" });
  const history = await listCompanyHistoryAdmin();

  return (
    <CrmTableContainer className="pb-10 pt-5">
      <div className="mx-auto w-full max-w-[900px]">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Commercial proposal</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Kainos imamos iš pasiūlymų kainyno lentelių. Čia valdoma skiltis „Mūsų istorija“.
        </p>
        <CompanyHistoryAdminClient initial={history} />
      </div>
    </CrmTableContainer>
  );
}
