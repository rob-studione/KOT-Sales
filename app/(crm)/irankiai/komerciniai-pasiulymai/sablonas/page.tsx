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
      <ProposalToolNav active="template" canAdmin />
      <div className="mt-6">
        <TemplateEditorClient
          initial={data.draft.content}
          published={data.published.content}
          history={data.history}
        />
      </div>
    </CrmTableContainer>
  );
}
