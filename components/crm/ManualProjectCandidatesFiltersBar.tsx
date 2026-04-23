/** Manual kandidatų valdikliai: status toggle + paieška. */
import Link from "next/link";
import { ListPageSearchForm } from "@/components/crm/ListPageSearchForm";
import { buildProjectDetailHref } from "@/lib/crm/projectPageSearchParams";

export function ManualProjectCandidatesFiltersBar({
  projectId,
  defaultCandidateStatus,
  defaultQuery,
  periodHidden,
  fromHidden,
  toHidden,
  pageSizeHidden,
}: {
  projectId: string;
  defaultCandidateStatus: "active" | "netinkamas";
  defaultQuery: string;
  periodHidden: string;
  fromHidden?: string;
  toHidden?: string;
  pageSizeHidden?: string;
}) {
  const pageSizeNumber =
    pageSizeHidden && Number.isFinite(Number(pageSizeHidden)) ? Math.max(1, Math.floor(Number(pageSizeHidden))) : undefined;
  const baseQuery = {
    tab: "kandidatai" as const,
    period: periodHidden,
    ...(fromHidden ? { from: fromHidden } : {}),
    ...(toHidden ? { to: toHidden } : {}),
    ...(pageSizeNumber ? { pageSize: pageSizeNumber } : {}),
    ...(defaultQuery ? { q: defaultQuery } : {}),
  };

  return (
    <div className="flex flex-wrap items-center gap-4">
      <div className="inline-flex h-10 items-center overflow-hidden rounded-md border border-zinc-200 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        <Link
          prefetch={false}
          href={buildProjectDetailHref(projectId, {
            ...baseQuery,
            page: 0,
          })}
          className={[
            "inline-flex h-full min-w-[6.5rem] items-center justify-center px-4 text-sm font-medium transition-colors",
            defaultCandidateStatus === "active" ? "bg-zinc-900 text-white" : "text-zinc-700 hover:bg-zinc-50",
          ].join(" ")}
        >
          Aktyvūs
        </Link>
        <Link
          prefetch={false}
          href={buildProjectDetailHref(projectId, {
            ...baseQuery,
            page: 0,
            candidateStatus: "netinkamas",
          })}
          className={[
            "inline-flex h-full min-w-[6.5rem] items-center justify-center border-l border-zinc-200 px-4 text-sm font-medium transition-colors",
            defaultCandidateStatus === "netinkamas" ? "bg-zinc-900 text-white" : "text-zinc-700 hover:bg-zinc-50",
          ].join(" ")}
        >
          Netinkami
        </Link>
      </div>

      <ListPageSearchForm
        action={`/projektai/${projectId}`}
        defaultQuery={defaultQuery}
        placeholder="Paieška (įmonė, kodas)"
        inputId="manual-candidates-q"
        size="regular"
        hiddenFields={{
          tab: "kandidatai",
          page: "0",
          period: periodHidden,
          ...(fromHidden ? { from: fromHidden } : {}),
          ...(toHidden ? { to: toHidden } : {}),
          ...(pageSizeHidden ? { pageSize: pageSizeHidden } : {}),
          ...(defaultCandidateStatus === "netinkamas" ? { candidateStatus: "netinkamas" } : {}),
        }}
      />
    </div>
  );
}
