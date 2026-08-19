import { redirect } from "next/navigation";
import { commercialProposalPath } from "@/lib/crm/commercialProposalPaths";

export default async function LegacyCommercialProposalEditorRedirect({
  params,
}: {
  params: Promise<{ proposalId: string }>;
}) {
  const { proposalId } = await params;
  redirect(commercialProposalPath(proposalId));
}
