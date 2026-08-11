/** Manual kandidatų valdikliai: status toggle + Esamas/Buvęs langas + paieška. */
import Link from "next/link";
import { CandidatesListStatusToggle } from "@/components/crm/CandidatesListStatusToggle";
import { ListPageSearchForm } from "@/components/crm/ListPageSearchForm";
import { MANUAL_LEAD_EXISTING_CLIENT_MONTHS } from "@/lib/crm/analyticsDates";
import {
  MANUAL_LEAD_EXISTING_MONTH_PRESETS,
} from "@/lib/crm/manualLeadCrmStatus";
import { buildProjectDetailHref } from "@/lib/crm/projectPageSearchParams";

export function ManualProjectCandidatesFiltersBar({
  projectId,
  defaultCandidateStatus,
  defaultQuery,
  pageSizeHidden,
  existingMonths = MANUAL_LEAD_EXISTING_CLIENT_MONTHS,
}: {
  projectId: string;
  defaultCandidateStatus: "active" | "netinkamas";
  defaultQuery: string;
  pageSizeHidden?: string;
  existingMonths?: number;
}) {
  const pageSizeNumber =
    pageSizeHidden && Number.isFinite(Number(pageSizeHidden)) ? Math.max(1, Math.floor(Number(pageSizeHidden))) : undefined;

  const monthsQsExtra = {
    ...(defaultCandidateStatus === "netinkamas" ? { candidateStatus: "netinkamas" as const } : {}),
    ...(defaultQuery.trim() ? { q: defaultQuery.trim() } : {}),
    ...(pageSizeNumber && pageSizeNumber !== 20 ? { pageSize: pageSizeNumber } : {}),
  };

  return (
    <div className="flex flex-wrap items-center gap-4">
      <CandidatesListStatusToggle
        projectId={projectId}
        currentStatus={defaultCandidateStatus}
        q={defaultQuery || undefined}
        pageSize={pageSizeNumber}
        existingMonths={existingMonths}
      />

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-zinc-500">Esamas jei per:</span>
        {MANUAL_LEAD_EXISTING_MONTH_PRESETS.map((m) => {
          const active = m === existingMonths;
          const href = buildProjectDetailHref(projectId, {
            tab: "kandidatai",
            page: 0,
            existingMonths: m,
            ...monthsQsExtra,
          });
          return active ? (
            <span key={m} className="rounded-md bg-[#7C4A57] px-2.5 py-1 text-xs font-medium text-white">
              {m} mėn.{m === MANUAL_LEAD_EXISTING_CLIENT_MONTHS ? " (numatytasis)" : ""}
            </span>
          ) : (
            <Link
              key={m}
              href={href}
              className="cursor-pointer rounded-md border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
            >
              {m} mėn.
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
          ...(existingMonths !== MANUAL_LEAD_EXISTING_CLIENT_MONTHS
            ? { existingMonths: String(existingMonths) }
            : {}),
        }}
      />
    </div>
  );
}
