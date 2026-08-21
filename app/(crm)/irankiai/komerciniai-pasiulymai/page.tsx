import Link from "next/link";
import { CrmTableContainer } from "@/components/crm/CrmTableContainer";
import { CrmListPageControls, CrmListPageIntro, CrmListPageMain } from "@/components/crm/CrmListPageLayout";
import { ListPageSearchForm } from "@/components/crm/ListPageSearchForm";
import { ProposalListActions } from "@/components/crm/commercial-proposal/ProposalListActions";
import { ProposalToolNav } from "@/components/crm/commercial-proposal/ProposalToolNav";
import { listAllProposalsAction } from "@/lib/crm/commercialProposalActions";
import { CP_TOOL_PATH } from "@/lib/crm/commercialProposalPaths";
import { formatCategoryDiscountsLabel, templateVersionLabel } from "@/lib/commercialProposal/uiLabels";
import { formatDate } from "@/lib/crm/format";
import { getCurrentCrmUser } from "@/lib/crm/currentUser";
import { hasPermission } from "@/lib/crm/permissions/check";
import { requireAnyPermission } from "@/lib/crm/requirePermission";

export const dynamic = "force-dynamic";

function statusLabel(status: string): string {
  if (status === "draft") return "Juodraštis";
  if (status === "generated") return "Sugeneruotas";
  if (status === "sent") return "Išsiųstas";
  return status;
}

export default async function CommercialProposalsToolPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  await requireAnyPermission(["nav.tools.commercial_proposals", "nav.clients"], {
    mode: "redirect",
    redirectTo: "/dashboard",
  });
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
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
        <div className="mt-4 overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm">
          <table className="w-full min-w-[880px] text-sm">
            <thead className="border-b border-zinc-100 bg-zinc-50/80 text-left text-xs font-medium uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-4 py-3 font-medium text-zinc-700">Numeris</th>
                <th className="px-4 py-3 font-medium text-zinc-700">Gavėjas</th>
                <th className="px-4 py-3 font-medium text-zinc-700">Tipas</th>
                <th className="px-4 py-3 font-medium text-zinc-700">Vadybininkas</th>
                <th className="px-4 py-3 font-medium text-zinc-700">Sukurta</th>
                <th className="px-4 py-3 font-medium text-zinc-700">Nuolaida</th>
                <th className="px-4 py-3 font-medium text-zinc-700">Būsena</th>
                <th className="px-4 py-3 font-medium text-zinc-700">Šablonas</th>
                <th className="px-4 py-3 font-medium text-zinc-700">Veiksmai</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-3 font-medium text-zinc-900">{r.proposal_number ?? "Juodraštis"}</td>
                  <td className="px-4 py-3 text-zinc-800">{r.recipient_name || r.client_name || "—"}</td>
                  <td className="px-4 py-3 text-zinc-700">{r.recipient_type === "lead" ? "Lead" : "Klientas"}</td>
                  <td className="px-4 py-3 text-zinc-700">{r.manager_name ?? "—"}</td>
                  <td className="px-4 py-3 text-zinc-700">{formatDate(r.created_at)}</td>
                  <td className="px-4 py-3 text-zinc-700">{formatCategoryDiscountsLabel(r.discounts)}</td>
                  <td className="px-4 py-3 text-zinc-700">{statusLabel(r.status)}</td>
                  <td className="px-4 py-3 text-zinc-700">{templateVersionLabel(r.template_version)}</td>
                  <td className="px-4 py-3">
                    <ProposalListActions proposalId={r.id} hasPdf={Boolean(r.pdf_storage_path)} />
                  </td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-sm text-zinc-500">
                    Komercinių pasiūlymų dar nėra.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </CrmListPageMain>
    </CrmTableContainer>
  );
}
