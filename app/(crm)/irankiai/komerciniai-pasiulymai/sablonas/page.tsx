import { CrmTableContainer } from "@/components/crm/CrmTableContainer";
import { ProposalToolNav } from "@/components/crm/commercial-proposal/ProposalToolNav";
import { TemplateEditorClient } from "@/components/crm/commercial-proposal/TemplateEditorClient";
import { loadTemplateEditorData } from "@/lib/crm/commercialProposalActions";
import { requirePermission } from "@/lib/crm/requirePermission";

export const dynamic = "force-dynamic";

export default async function CommercialProposalTemplatePage() {
  await requirePermission("settings.commercial_proposals", { mode: "redirect", redirectTo: "/irankiai/komerciniai-pasiulymai" });
  const data = await loadTemplateEditorData();

  return (
    <CrmTableContainer className="pb-10 pt-5">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Šablonas</h1>
      <p className="mt-1 text-sm text-zinc-600">
        Redaguojamas viso komercinio pasiūlymo tekstas. Maketo koordinatės slepiamos — keičiami tik turinio laukai.
      </p>
      <div className="mt-4">
        <ProposalToolNav active="template" canAdmin />
      </div>
      <div className="mt-6">
        <TemplateEditorClient initial={data.draft.content} history={data.history} />
      </div>
    </CrmTableContainer>
  );
}
