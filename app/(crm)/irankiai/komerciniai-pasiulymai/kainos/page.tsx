import { CrmTableContainer } from "@/components/crm/CrmTableContainer";
import { PriceCatalogAdminClient } from "@/components/crm/commercial-proposal/PriceCatalogAdminClient";
import { ProposalToolNav } from "@/components/crm/commercial-proposal/ProposalToolNav";
import { listPriceCatalogAdmin } from "@/lib/crm/commercialProposalActions";
import { requirePermission } from "@/lib/crm/requirePermission";

export const dynamic = "force-dynamic";

export default async function CommercialProposalPricesPage() {
  await requirePermission("settings.commercial_proposals", { mode: "redirect", redirectTo: "/irankiai/komerciniai-pasiulymai" });
  const items = await listPriceCatalogAdmin();

  return (
    <CrmTableContainer className="pb-10 pt-5">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Kainos</h1>
      <div className="mt-4">
        <ProposalToolNav active="prices" canAdmin />
      </div>
      <div className="mt-6">
        <PriceCatalogAdminClient initial={items} />
      </div>
    </CrmTableContainer>
  );
}
