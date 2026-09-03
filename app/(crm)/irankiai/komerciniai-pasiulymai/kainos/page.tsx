import { ProposalToolNav } from "@/components/crm/commercial-proposal/ProposalToolNav";
import { ProposalToolShell } from "@/components/crm/commercial-proposal/ProposalToolShell";
import { PricesAdminClient } from "@/components/crm/commercial-proposal/PricesAdminClient";
import { listPriceCatalogAdmin, listPricingGroupsAdmin } from "@/lib/crm/commercialProposalActions";
import { requirePermission } from "@/lib/crm/requirePermission";

export const dynamic = "force-dynamic";

export default async function CommercialProposalPricesPage() {
  await requirePermission("settings.commercial_proposals", { mode: "redirect", redirectTo: "/irankiai/komerciniai-pasiulymai" });
  const [items, groups] = await Promise.all([listPriceCatalogAdmin(), listPricingGroupsAdmin()]);

  return (
    <ProposalToolShell title="Kainos" nav={<ProposalToolNav active="prices" canAdmin />}>
      <PricesAdminClient catalog={items} groups={groups} />
    </ProposalToolShell>
  );
}
