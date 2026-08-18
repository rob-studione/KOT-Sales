import Link from "next/link";
import { notFound } from "next/navigation";
import { CrmTableContainer } from "@/components/crm/CrmTableContainer";
import { ProposalEditorClient } from "@/components/crm/commercial-proposal/ProposalEditorClient";
import { loadProposalEditorData } from "@/lib/crm/commercialProposalActions";
import { requirePermission } from "@/lib/crm/requirePermission";

export const dynamic = "force-dynamic";

export default async function CommercialProposalEditorPage({
  params,
}: {
  params: Promise<{ clientId: string; proposalId: string }>;
}) {
  await requirePermission("nav.clients", { mode: "redirect", redirectTo: "/dashboard" });
  const { clientId, proposalId } = await params;
  let data;
  try {
    data = await loadProposalEditorData(proposalId);
  } catch {
    notFound();
  }

  return (
    <CrmTableContainer className="pb-10 pt-5">
      <Link
        href={`/klientai/${encodeURIComponent(clientId)}`}
        className="cursor-pointer rounded-sm text-sm text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 hover:underline"
      >
        ← Atgal į klientą
      </Link>
      <div className="mt-4">
        <ProposalEditorClient initial={data} clientId={clientId} />
      </div>
    </CrmTableContainer>
  );
}
