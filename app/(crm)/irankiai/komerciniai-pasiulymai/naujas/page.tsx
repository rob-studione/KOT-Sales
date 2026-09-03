import { ProposalCreateClient } from "@/components/crm/commercial-proposal/ProposalCreateClient";
import { ProposalToolNav } from "@/components/crm/commercial-proposal/ProposalToolNav";
import { ProposalToolShell, PROPOSAL_TOOL_CARD } from "@/components/crm/commercial-proposal/ProposalToolShell";
import { getProposalRecipientOptionAction, listPricingGroupsAction } from "@/lib/crm/commercialProposalActions";
import { getCurrentCrmUser } from "@/lib/crm/currentUser";
import { hasPermission } from "@/lib/crm/permissions/check";
import { requireAnyPermission } from "@/lib/crm/requirePermission";
import type { CpRecipientType } from "@/lib/commercialProposal/types";

export const dynamic = "force-dynamic";

export default async function NewCommercialProposalPage({
  searchParams,
}: {
  searchParams: Promise<{ recipientType?: string | string[]; recipientId?: string | string[] }>;
}) {
  await requireAnyPermission(["nav.tools.commercial_proposals", "nav.clients"], {
    mode: "redirect",
    redirectTo: "/dashboard",
  });
  const sp = await searchParams;
  const rawType = typeof sp.recipientType === "string" ? sp.recipientType : "";
  const recipientType: CpRecipientType | null = rawType === "lead" ? "lead" : rawType === "client" ? "client" : null;
  const recipientId = typeof sp.recipientId === "string" ? sp.recipientId.trim() : "";
  const [preset, groups, user] = await Promise.all([
    recipientType && recipientId
      ? getProposalRecipientOptionAction({ recipientType, recipientId })
      : Promise.resolve(null),
    listPricingGroupsAction(),
    getCurrentCrmUser(),
  ]);
  const canAdmin = hasPermission(user, "settings.commercial_proposals");

  return (
    <ProposalToolShell title="Naujas pasiūlymas" nav={<ProposalToolNav active="list" canAdmin={canAdmin} />}>
      <p className="mb-4 text-[13px] text-[#6F7077]">Pirmiausia pasirinkite gavėją — esamą klientą arba leadą.</p>
      <div className={`${PROPOSAL_TOOL_CARD} p-5`}>
        <ProposalCreateClient preset={preset} pricingGroups={groups} />
      </div>
    </ProposalToolShell>
  );
}
