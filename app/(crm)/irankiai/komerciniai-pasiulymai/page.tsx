import Link from "next/link";
import { CrmTableContainer } from "@/components/crm/CrmTableContainer";
import { CrmListPageControls, CrmListPageIntro, CrmListPageMain } from "@/components/crm/CrmListPageLayout";
import { ListPageSearchForm } from "@/components/crm/ListPageSearchForm";
import { CommercialProposalList } from "@/components/crm/commercial-proposal/CommercialProposalList";
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
            <Link
              href={`${CP_TOOL_PATH}/naujas`}
              className="rounded-lg bg-[#7C4A57] px-4 py-2 text-sm font-medium text-white hover:bg-[#693948]"
            >
              Naujas pasiūlymas
            </Link>
          </div>
        </CrmListPageControls>
        {deleted ? (
          <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            Pasiūlymas ištrintas.
          </p>
        ) : null}
        <CommercialProposalList rows={rows} canAdmin={canAdmin} />
      </CrmListPageMain>
    </CrmTableContainer>
  );
}
