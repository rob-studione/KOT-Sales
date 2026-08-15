/** Manual cold leads: status + rikiavimas pagal apyvartą + paieška. */
import Link from "next/link";
import { CandidatesListStatusToggle } from "@/components/crm/CandidatesListStatusToggle";
import { ListPageSearchForm } from "@/components/crm/ListPageSearchForm";
import type { ManualLeadRevenueSort } from "@/lib/crm/projectManualLeads";
import { buildProjectDetailHref } from "@/lib/crm/projectPageSearchParams";

export function ManualProjectCandidatesFiltersBar({
  projectId,
  defaultCandidateStatus,
  defaultQuery,
  pageSizeHidden,
  revenueSort = "revenue_desc",
}: {
  projectId: string;
  defaultCandidateStatus: "active" | "netinkamas";
  defaultQuery: string;
  pageSizeHidden?: string;
  revenueSort?: ManualLeadRevenueSort;
}) {
  const pageSizeNumber =
    pageSizeHidden && Number.isFinite(Number(pageSizeHidden)) ? Math.max(1, Math.floor(Number(pageSizeHidden))) : undefined;

  const qsExtra = {
    ...(defaultCandidateStatus === "netinkamas" ? { candidateStatus: "netinkamas" as const } : {}),
    ...(defaultQuery.trim() ? { q: defaultQuery.trim() } : {}),
    ...(pageSizeNumber && pageSizeNumber !== 20 ? { pageSize: pageSizeNumber } : {}),
  };

  const sortOptions: Array<{ value: ManualLeadRevenueSort; label: string }> = [
    { value: "revenue_desc", label: "Didžiausia apyvarta" },
    { value: "revenue_asc", label: "Mažiausia apyvarta" },
  ];

  return (
    <div className="flex flex-wrap items-center gap-4">
      <CandidatesListStatusToggle
        projectId={projectId}
        currentStatus={defaultCandidateStatus}
        q={defaultQuery || undefined}
        pageSize={pageSizeNumber}
        revenueSort={revenueSort}
      />

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-zinc-500">Rikiuoti:</span>
        {sortOptions.map((opt) => {
          const active = opt.value === revenueSort;
          const href = buildProjectDetailHref(projectId, {
            tab: "kandidatai",
            page: 0,
            revenueSort: opt.value,
            ...qsExtra,
          });
          return active ? (
            <span key={opt.value} className="rounded-md bg-[#7C4A57] px-2.5 py-1 text-xs font-medium text-white">
              {opt.label}
            </span>
          ) : (
            <Link
              key={opt.value}
              href={href}
              className="cursor-pointer rounded-md border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
            >
              {opt.label}
            </Link>
          );
        })}
      </div>

      <ListPageSearchForm
        action={`/projektai/${projectId}/kandidatai`}
        defaultQuery={defaultQuery}
        placeholder="Paieška (įmonė, kodas)"
        inputId="manual-candidates-q"
        size="regular"
        hiddenFields={{
          page: "0",
          ...(pageSizeHidden ? { pageSize: pageSizeHidden } : {}),
          ...(defaultCandidateStatus === "netinkamas" ? { candidateStatus: "netinkamas" } : {}),
          ...(revenueSort !== "revenue_desc" ? { sort: revenueSort } : {}),
        }}
      />
    </div>
  );
}
