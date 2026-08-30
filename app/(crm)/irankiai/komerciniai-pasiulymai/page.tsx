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
  const countLabel = String(Math.max(0, rows.length)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");

  return (
    <div
      data-proposal-list="list"
      className="-mx-4 -my-4 min-h-[calc(100vh-3.5rem)] bg-[#F7F7F8] px-6 pb-10 pt-6 min-[1920px]:px-8"
    >
      <div className="w-full min-w-0 min-[1920px]:max-w-[1624px]">
        <header className="flex items-center justify-between gap-4">
          <h1 className="flex min-w-0 items-center gap-2.5 text-[22px] font-semibold tracking-tight text-[#17171B]">
            <span className="truncate">Komerciniai pasiūlymai</span>
            <span className="inline-flex h-6 shrink-0 items-center rounded-full border border-[#E8E8EB] bg-white px-2 text-[12px] font-medium tabular-nums text-[#6F7077]">
              {countLabel}
            </span>
          </h1>
          <NewProposalButton />
        </header>

        <div className="mt-4">
          <ProposalToolNav active="list" canAdmin={canAdmin} />
        </div>

        <section className="mt-4 overflow-hidden rounded-[16px] border border-[#E8E8EB] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
          <div className="border-b border-[#E8E8EB] px-4 py-3">
            <ListPageSearchForm
              action={CP_TOOL_PATH}
              defaultQuery={q}
              placeholder="Ieškoti pagal gavėją, įmonę ar numerį"
              inputId="cp-search"
              hiddenFields={{}}
              size="regular"
              className="max-w-[min(100%,380px)] border-[#E8E8EB] shadow-none"
            />
          </div>
          <CommercialProposalList
            rows={rows}
            canAdmin={canAdmin}
            showDeletedToast={deleted}
            searchQuery={q}
          />
        </section>
      </div>
    </div>
  );
}
