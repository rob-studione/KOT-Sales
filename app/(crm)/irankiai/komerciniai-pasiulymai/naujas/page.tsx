import Link from "next/link";
import { CrmTableContainer } from "@/components/crm/CrmTableContainer";
import { ProposalCreateClient } from "@/components/crm/commercial-proposal/ProposalCreateClient";
import { CP_TOOL_PATH } from "@/lib/crm/commercialProposalPaths";
import { requireAnyPermission } from "@/lib/crm/requirePermission";

export const dynamic = "force-dynamic";

export default async function NewCommercialProposalPage() {
  await requireAnyPermission(["nav.tools.commercial_proposals", "nav.clients"], {
    mode: "redirect",
    redirectTo: "/dashboard",
  });

  return (
    <CrmTableContainer className="pb-10 pt-5">
      <Link href={CP_TOOL_PATH} className="text-sm text-zinc-600 hover:underline">
        ← Atgal į pasiūlymus
      </Link>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight text-zinc-900">Naujas pasiūlymas</h1>
      <p className="mt-1 text-sm text-zinc-600">Pirmiausia pasirinkite gavėją — esamą klientą arba lead.</p>
      <div className="mt-6">
        <ProposalCreateClient />
      </div>
    </CrmTableContainer>
  );
}
