import Link from "next/link";
import { notFound } from "next/navigation";
import { CrmTableContainer } from "@/components/crm/CrmTableContainer";
import { ProposalEditorClient } from "@/components/crm/commercial-proposal/ProposalEditorClient";
import { loadProposalEditorData } from "@/lib/crm/commercialProposalActions";
import { CP_TOOL_PATH } from "@/lib/crm/commercialProposalPaths";
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
    <CrmTableContainer className="pb-10 pt-5">
      <Link href={CP_TOOL_PATH} className="text-sm text-zinc-600 hover:underline">
        ← Atgal į pasiūlymus
      </Link>
      <div className="mt-4">
        <ProposalEditorClient initial={data} />
      </div>
    </CrmTableContainer>
  );
}
