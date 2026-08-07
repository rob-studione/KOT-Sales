import Link from "next/link";
import { ListPageSearchForm } from "@/components/crm/ListPageSearchForm";
import { buildProjectDetailHref } from "@/lib/crm/projectPageSearchParams";
import { projectResultStatusLabel } from "@/lib/crm/projectSnapshot";

export type CompletedStatusCount = {
  status: string;
  count: number;
};

/**
 * „Užbaigta“ skirtuko paieška + baigties statusų chip’ai su skaičiais.
 */
export function CompletedWorkItemsToolbar({
  projectId,
  totalAfterSearch,
  statusCounts,
  completedQ,
  completedStatus,
  linkPreserve,
}: {
  projectId: string;
  /** Po paieškos (prieš statuso filtrą). */
  totalAfterSearch: number;
  statusCounts: CompletedStatusCount[];
  completedQ: string;
  completedStatus: string;
  linkPreserve: {
    period?: string;
    from?: string;
    to?: string;
    q?: string;
    candidateStatus?: "active" | "netinkamas";
    page?: number;
    pageSize?: number;
  };
}) {
  const baseOpts = {
    ...linkPreserve,
    tab: "kontaktuota" as const,
    completedQ: completedQ || undefined,
  };

  const allHref = buildProjectDetailHref(projectId, {
    ...baseOpts,
    completedStatus: undefined,
  });

  const searchHidden: Record<string, string> = {};
  if (linkPreserve.period) searchHidden.period = linkPreserve.period;
  if (linkPreserve.from) searchHidden.from = linkPreserve.from;
  if (linkPreserve.to) searchHidden.to = linkPreserve.to;
  if (linkPreserve.q) searchHidden.q = linkPreserve.q;
  if (linkPreserve.candidateStatus && linkPreserve.candidateStatus !== "active") {
    searchHidden.candidateStatus = linkPreserve.candidateStatus;
  }
  if (completedStatus) searchHidden.completedStatus = completedStatus;

  const chipClass = (active: boolean) =>
    [
      "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
      active
        ? "bg-[#7C4A57] text-white"
        : "bg-zinc-100 text-zinc-700 ring-1 ring-inset ring-zinc-200/80 hover:bg-zinc-200/70",
    ].join(" ");

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-zinc-600">
          Iš viso užbaigta:{" "}
          <span className="font-semibold tabular-nums text-zinc-900">{totalAfterSearch}</span>
        </div>
        <ListPageSearchForm
          action={`/projektai/${projectId}/kontaktuota`}
          defaultQuery={completedQ}
          placeholder="Įmonė, kodas…"
          inputId={`project-${projectId}-completed-q`}
          queryParamName="completedQ"
          size="compact"
          hiddenFields={searchHidden}
          className="sm:ml-auto"
        />
      </div>

      {statusCounts.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filtruoti pagal baigties statusą">
          <Link href={allHref} className={chipClass(!completedStatus)} scroll={false}>
            Visi
            <span className={`tabular-nums ${completedStatus ? "text-zinc-500" : "text-white/80"}`}>
              {totalAfterSearch}
            </span>
          </Link>
          {statusCounts.map((row) => {
            const active = completedStatus === row.status;
            const href = buildProjectDetailHref(projectId, {
              ...baseOpts,
              completedStatus: active ? undefined : row.status,
            });
            return (
              <Link key={row.status} href={href} className={chipClass(active)} scroll={false}>
                {projectResultStatusLabel(row.status)}
                <span className={`tabular-nums ${active ? "text-white/80" : "text-zinc-500"}`}>{row.count}</span>
              </Link>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
