import { CrmTableContainer } from "@/components/crm/CrmTableContainer";
import { CrmListPageControls, CrmListPageIntro, CrmListPageMain } from "@/components/crm/CrmListPageLayout";
import { ListPageSearchForm } from "@/components/crm/ListPageSearchForm";
import { CommercialProposalList } from "@/components/crm/commercial-proposal/CommercialProposalList";
import { NewProposalButton } from "@/components/crm/commercial-proposal/NewProposalButton";
import { ProposalToolNav } from "@/components/crm/commercial-proposal/ProposalToolNav";
import { listAllProposalsAction } from "@/lib/crm/commercialProposalActions";
import { CP_TOOL_PATH } from "@/lib/crm/commercialProposalPaths";
import { getCurrentCrmUser } from "@/lib/crm/currentUser";
import { hasPermission } from "@/lib/crm/permissions/check";
import { requireAnyPermission } from "@/lib/crm/requirePermission";

export const dynamic = "force-dynamic";

export default async function CommercialProposalsToolPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[]; deleted?: string | string[] }>;
}) {
  await requireAnyPermission(["nav.tools.commercial_proposals", "nav.clients"], {
    mode: "redirect",
    redirectTo: "/dashboard",
  });
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const deleted = sp.deleted === "1";
  const rows = await listAllProposalsAction({ search: q });
  const user = await getCurrentCrmUser();
  const canAdmin = hasPermission(user, "settings.commercial_proposals");

  return (
    <CrmTableContainer className="pb-10 pt-5">
      <CrmListPageMain>
        <CrmListPageIntro title="Komerciniai pasiūlymai" count={rows.length} />
        <div className="mt-4">
          <ProposalToolNav active="list" canAdmin={canAdmin} />
        </div>
        <CrmListPageControls>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <ListPageSearchForm
              action={CP_TOOL_PATH}
              defaultQuery={q}
              placeholder="Paieška (numeris, įmonė, asmuo)"
              inputId="cp-search"
              hiddenFields={{}}
            />
            <NewProposalButton />
          </div>
        </CrmListPageControls>
        <CommercialProposalList rows={rows} canAdmin={canAdmin} showDeletedToast={deleted} />
      </CrmListPageMain>
    </CrmTableContainer>
  );
}
