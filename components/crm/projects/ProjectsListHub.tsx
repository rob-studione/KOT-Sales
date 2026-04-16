import Link from "next/link";
import { formatDate } from "@/lib/crm/format";
import { projectWorkItemCount, type ProjectListRow } from "@/lib/crm/projectListHelpers";
import { ProjectOwnerCell } from "@/components/crm/ProjectOwnerCell";
import type { CrmUser } from "@/lib/crm/crmUsers";

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
      <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">{label}</p>
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
}) {
  const isArchived = statusFilter === "archived";
  const isDeleted = statusFilter === "deleted";

  function plusDaysIso(iso: string, days: number): string | null {
    if (!iso || typeof iso !== "string") return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  }

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
          <Link
            href="/projektai/naujas"
            className="inline-flex cursor-pointer items-center justify-center rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-zinc-800"
          >
            + Sukurti projektą
          </Link>
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
          <ul className="flex flex-col gap-4">
            {rows.map((p) => {
              const wc = projectWorkItemCount(p);
              const desc = p.description?.trim();
              return (
                <li key={p.id}>
                  <Link
                    href={`/projektai/${p.id}`}
                    className="group relative block rounded-xl border border-zinc-200/90 bg-white p-5 shadow-[0_1px_3px_rgba(15,23,42,0.05),0_2px_12px_-4px_rgba(15,23,42,0.08)] transition-all duration-200 hover:border-zinc-300/90 hover:bg-white hover:shadow-[0_4px_20px_-6px_rgba(15,23,42,0.12)]"
                  >
                    <div className="flex flex-col gap-3">
                      <div className="flex flex-wrap items-start justify-between gap-3 gap-y-2">
                        <h2 className="min-w-0 text-lg font-semibold tracking-tight text-zinc-900 group-hover:text-zinc-800">
                          {p.name}
                        </h2>
                        <StatusLine status={p.status} />
                      </div>

                      <p
                        className={`text-sm leading-relaxed ${desc ? "text-zinc-600" : "text-zinc-400 italic"}`}
                        title={desc || undefined}
                      >
                        {desc || "Be aprašymo"}
                      </p>

                        <div className="mt-1 flex flex-col gap-6 border-t border-zinc-100 pt-5 lg:flex-row lg:items-end lg:justify-between">
                        <div className="flex min-w-0 flex-1 flex-col gap-4 sm:flex-row sm:flex-wrap sm:gap-x-10 sm:gap-y-3">
                          <div className="min-w-[7.5rem]">
                            <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">Sukurta</span>
                            <p className="mt-1.5 tabular-nums text-[15px] font-medium leading-snug text-zinc-900">
                              {formatDate(String(p.created_at ?? "").slice(0, 10))}
                            </p>
                          </div>
                            {isDeleted && deletedAtAvailable ? (
                              <div className="min-w-[10rem]">
                                <span className="text-[11px] font-semibold uppercase tracking-wide text-red-700">
                                  Bus pašalintas
                                </span>
                                <p className="mt-1.5 tabular-nums text-[15px] font-semibold leading-snug text-red-800">
                                  {formatDate(
                                    plusDaysIso(String((p as { deleted_at?: string | null }).deleted_at ?? ""), 7) ?? ""
                                  )}
                                </p>
                              </div>
                            ) : null}
                          {ownerColumnAvailable ? (
                            <div className="min-w-0 sm:max-w-[17rem]">
                              <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">Atsakingas</span>
                              <div className="mt-1.5 text-[15px] font-medium leading-snug text-zinc-900">
                                {!p.owner_user_id ? (
                                  <span className="font-normal text-zinc-500">Nepriskirta</span>
                                ) : (
                                  <ProjectOwnerCell user={userById.get(p.owner_user_id)} />
                                )}
                              </div>
                            </div>
                          ) : null}
                        </div>

                        <div className="flex flex-col items-stretch gap-5 sm:flex-row sm:items-end sm:gap-7 lg:shrink-0">
                          <div className="text-left sm:text-right">
                            <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">Aktyvūs kontaktai</p>
                            <p className="mt-1.5 text-3xl font-semibold tabular-nums leading-none tracking-tight text-zinc-900">
                              {wc}
                            </p>
                          </div>
                          <span className="pointer-events-none inline-flex items-center justify-center gap-1.5 self-start rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm ring-1 ring-zinc-900/10 transition-all duration-200 group-hover:bg-zinc-800 group-hover:shadow-md sm:self-auto">
                            Atidaryti projektą
                            <svg
                              className="h-4 w-4 opacity-90 transition-transform duration-200 group-hover:translate-x-0.5"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth={2.25}
                              aria-hidden
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                            </svg>
                          </span>
                        </div>
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
