import Link from "next/link";
import { CrmTableContainer } from "@/components/crm/CrmTableContainer";
import { ProposalCreateClient } from "@/components/crm/commercial-proposal/ProposalCreateClient";
import { getProposalRecipientOptionAction } from "@/lib/crm/commercialProposalActions";
import { CP_TOOL_PATH } from "@/lib/crm/commercialProposalPaths";
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
  const preset =
    recipientType && recipientId
      ? await getProposalRecipientOptionAction({ recipientType, recipientId })
      : null;

  return (
    <CrmTableContainer className="pb-10 pt-5">
      <Link href={CP_TOOL_PATH} className="text-sm text-zinc-600 hover:underline">
        ← Atgal į pasiūlymus
      </Link>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight text-zinc-900">Naujas pasiūlymas</h1>
      <p className="mt-1 text-sm text-zinc-600">Pirmiausia pasirinkite gavėją — esamą klientą arba leadą.</p>
      <div className="mt-6">
        <ProposalCreateClient preset={preset} />
      </div>
    </CrmTableContainer>
  );
}
