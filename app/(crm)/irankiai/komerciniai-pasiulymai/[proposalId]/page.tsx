import { notFound } from "next/navigation";
import { ProposalEditorClient } from "@/components/crm/commercial-proposal/ProposalEditorClient";
import { loadProposalEditorData } from "@/lib/crm/commercialProposalActions";
import { requireAnyPermission } from "@/lib/crm/requirePermission";

export const dynamic = "force-dynamic";

export default async function CommercialProposalEditorPage({
  params,
}: {
  params: Promise<{ proposalId: string }>;
}) {
  await requireAnyPermission(["nav.tools.commercial_proposals", "nav.clients"], {
    mode: "redirect",
    redirectTo: "/dashboard",
  });
  const { proposalId } = await params;
  if (proposalId === "naujas" || proposalId === "sablonas" || proposalId === "kainos") {
    notFound();
  }
  let data;
  try {
    data = await loadProposalEditorData(proposalId);
  } catch {
    notFound();
  }

  return (
    <div className="-mx-4 -my-4 h-[calc(100vh-3.5rem)] overflow-hidden bg-[#F7F7F8] px-6 min-[1920px]:px-8">
      <ProposalEditorClient initial={data} />
    </div>
  );
}
