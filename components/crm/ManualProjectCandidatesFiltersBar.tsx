/** Manual kandidatų valdikliai: status toggle + paieška. */
import { CandidatesListStatusToggle } from "@/components/crm/CandidatesListStatusToggle";
import { ListPageSearchForm } from "@/components/crm/ListPageSearchForm";

export function ManualProjectCandidatesFiltersBar({
  projectId,
  defaultCandidateStatus,
  defaultQuery,
  pageSizeHidden,
}: {
  projectId: string;
  defaultCandidateStatus: "active" | "netinkamas";
  defaultQuery: string;
  pageSizeHidden?: string;
}) {
  const pageSizeNumber =
    pageSizeHidden && Number.isFinite(Number(pageSizeHidden)) ? Math.max(1, Math.floor(Number(pageSizeHidden))) : undefined;

  return (
    <div className="flex flex-wrap items-center gap-4">
      <CandidatesListStatusToggle
        projectId={projectId}
        currentStatus={defaultCandidateStatus}
        q={defaultQuery || undefined}
        pageSize={pageSizeNumber}
      />

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
        }}
      />
    </div>
  );
}
