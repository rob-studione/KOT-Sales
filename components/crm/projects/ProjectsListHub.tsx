import Link from "next/link";
import { projectWorkItemCount, type ProjectListRow } from "@/lib/crm/projectListHelpers";
import type { CrmUser } from "@/lib/crm/crmUsers";
import { ProjectsSortableListLoader } from "@/components/crm/projects/ProjectsSortableListLoader";
import { ListPageSearchForm } from "@/components/crm/ListPageSearchForm";

function StatusLine({ status }: { status: string }) {
  const archived = status === "archived";
  const deleted = status === "deleted";
  return (
    <span className="inline-flex shrink-0 items-center gap-2 text-sm text-zinc-600">
      <span
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${
          deleted ? "bg-red-500/70" : archived ? "bg-zinc-400" : "bg-emerald-600/55"
        }`}
        aria-hidden
      />
      <span className="font-medium text-zinc-700">{deleted ? "Ištrintas" : archived ? "Archyvuotas" : "Aktyvus"}</span>
    </span>
  );
}

function KpiCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-zinc-200/90 bg-white px-5 py-4 shadow-[0_1px_3px_rgba(15,23,42,0.06)]">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight text-zinc-900">{value}</p>
    </div>
  );
}

export function ProjectsListHub({
  rows,
  userById,
  ownerColumnAvailable,
  statusFilter,
  counts,
  deletedAtAvailable,
  kpi,
  qTrim,
}: {
  rows: ProjectListRow[];
  userById: Map<string, CrmUser>;
  ownerColumnAvailable: boolean;
  statusFilter: "active" | "archived" | "deleted";
  counts: { active: number; archived: number; deleted: number };
  deletedAtAvailable: boolean;
  kpi: {
    projectCount: number;
    totalWorkItems: number;
    assignedProjects: number;
  };
  qTrim: string;
}) {
  const isArchived = statusFilter === "archived";
  const isDeleted = statusFilter === "deleted";

  return (
    <div className="mx-auto w-full min-w-0 max-w-[1320px] px-4 pb-14 pt-2 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-4 border-b border-zinc-200/80 pb-8 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-[1.65rem]">Visi projektai</h1>
          {/* intentionally removed per request */}
          <div className="mt-4">
            <div
              className="inline-flex w-fit rounded-lg border border-zinc-200 bg-zinc-50/80 p-0.5"
              role="group"
              aria-label="Projektų filtras"
            >
              <Link
                href="/projektai"
                className={
                  !isArchived && !isDeleted
                    ? "rounded-md bg-white px-3 py-1.5 text-sm font-medium text-zinc-900 shadow-sm"
                    : "rounded-md px-3 py-1.5 text-sm font-medium text-zinc-600 hover:text-zinc-900"
                }
                aria-current={!isArchived && !isDeleted ? "page" : undefined}
              >
                Aktyvūs <span className="tabular-nums text-zinc-400">({counts.active})</span>
              </Link>
              <Link
                href="/projektai?status=archived"
                className={
                  isArchived
                    ? "rounded-md bg-white px-3 py-1.5 text-sm font-medium text-zinc-900 shadow-sm"
                    : "rounded-md px-3 py-1.5 text-sm font-medium text-zinc-600 hover:text-zinc-900"
                }
                aria-current={isArchived ? "page" : undefined}
              >
                Archyvas <span className="tabular-nums text-zinc-400">({counts.archived})</span>
              </Link>
              {counts.deleted > 0 ? (
                <Link
                  href="/projektai?status=deleted"
                  className={
                    isDeleted
                      ? "rounded-md bg-white px-3 py-1.5 text-sm font-medium text-zinc-900 shadow-sm"
                      : "rounded-md px-3 py-1.5 text-sm font-medium text-zinc-600 hover:text-zinc-900"
                  }
                  aria-current={isDeleted ? "page" : undefined}
                >
                  Šiukšlinė{" "}
                  <span className="tabular-nums text-red-700">({counts.deleted})</span>
                </Link>
              ) : null}
            </div>
          </div>
        </div>
        <div className="shrink-0 sm:pt-0.5">
          <div className="flex flex-col items-start gap-3 sm:items-end">
            <Link
              href="/projektai/naujas"
              className="inline-flex cursor-pointer items-center justify-center rounded-xl bg-[#7C4A57] px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-[#693948]"
            >
              + Sukurti projektą
            </Link>
            <ListPageSearchForm
              action="/projektai"
              defaultQuery={qTrim}
              placeholder="Paieška (pavadinimas, aprašymas)"
              inputId="crm-projektai-search"
              hiddenFields={{
                ...(isArchived ? { status: "archived" } : {}),
                ...(isDeleted ? { status: "deleted" } : {}),
              }}
            />
          </div>
        </div>
      </header>

      <section className="mt-8 grid gap-4 sm:grid-cols-3" aria-label="Santrauka">
        <KpiCard
          label={isDeleted ? "Projektai šiukšlinėje" : isArchived ? "Archyvuoti projektai" : "Aktyvūs projektai"}
          value={kpi.projectCount}
        />
        <KpiCard
          label={isDeleted ? "Kontaktai (ištrintuose)" : isArchived ? "Kontaktai (archyvuotuose)" : "Aktyvūs kontaktai iš viso"}
          value={kpi.totalWorkItems}
        />
        <KpiCard label="Projektai su atsakingu" value={kpi.assignedProjects} />
      </section>

      <section className="mt-10" aria-label="Projektų sąrašas">
        {rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-200 bg-white px-6 py-14 text-center text-sm text-zinc-500 shadow-[0_1px_3px_rgba(15,23,42,0.05)]">
            {isDeleted ? (
              "Ištrintų projektų nėra."
            ) : isArchived ? (
              "Archyvuotų projektų nėra."
            ) : (
              <>
                Projektų dar nėra.{" "}
                <Link href="/projektai/naujas" className="font-medium text-zinc-800 underline-offset-2 hover:underline">
                  Sukurkite pirmą
                </Link>
                .
              </>
            )}
          </div>
        ) : (
          <ProjectsSortableListLoader
            initialRows={rows}
            userById={userById}
            ownerColumnAvailable={ownerColumnAvailable}
            deletedAtAvailable={deletedAtAvailable}
            statusFilter={statusFilter}
          />
        )}
      </section>
    </div>
  );
}
