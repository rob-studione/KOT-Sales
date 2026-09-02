import { ProposalToolNav } from "@/components/crm/commercial-proposal/ProposalToolNav";
import { TemplateEditorClient } from "@/components/crm/commercial-proposal/TemplateEditorClient";
import { TEMPLATE_STUDIO_INNER_CLASS } from "@/components/crm/commercial-proposal/studio/layoutClasses";
import { loadTemplateEditorData } from "@/lib/crm/commercialProposalActions";
import { requirePermission } from "@/lib/crm/requirePermission";

export const dynamic = "force-dynamic";

export default async function CommercialProposalTemplatePage() {
  await requirePermission("settings.commercial_proposals", { mode: "redirect", redirectTo: "/irankiai/komerciniai-pasiulymai" });
  const data = await loadTemplateEditorData();

  return (
    <div className="-mx-4 -my-4 flex h-[calc(100vh-3.5rem)] flex-col overflow-hidden bg-[#F7F7F8] px-6 min-[1920px]:px-8">
      <div className={TEMPLATE_STUDIO_INNER_CLASS}>
        <div className="shrink-0">
          <ProposalToolNav active="template" canAdmin />
        </div>
        <TemplateEditorClient
          initial={data.draft.content}
          published={data.published.content}
          history={data.history}
        />
      </div>
    </div>
  );
}
