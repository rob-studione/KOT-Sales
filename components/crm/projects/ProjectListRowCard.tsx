import Link from "next/link";
import type { ReactNode } from "react";
import { formatDate } from "@/lib/crm/format";
import { projectWorkItemCount, type ProjectListRow } from "@/lib/crm/projectListHelpers";
import { ProjectOwnerCell } from "@/components/crm/ProjectOwnerCell";
import type { CrmUser } from "@/lib/crm/crmUsers";

export function ProjectListRowCard({
  row,
  href,
  ownerColumnAvailable,
  userById,
  deletedAtAvailable,
  isDeleted,
  renderDeletedAt,
  leftSlot,
}: {
  row: ProjectListRow;
  href: string;
  ownerColumnAvailable: boolean;
  userById: Map<string, CrmUser>;
  deletedAtAvailable: boolean;
  isDeleted: boolean;
  renderDeletedAt: (p: ProjectListRow) => string | null;
  leftSlot: ReactNode;
}) {
  const wc = projectWorkItemCount(row);
  const desc = row.description?.trim() || null;

  return (
    <div className="group relative rounded-xl border border-zinc-200/90 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.05),0_2px_12px_-4px_rgba(15,23,42,0.08)] transition-all duration-200 hover:border-zinc-300/90 hover:bg-white hover:shadow-[0_4px_20px_-6px_rgba(15,23,42,0.12)]">
      <div className="flex items-stretch gap-0">
        {leftSlot}
        <Link href={href} className="block min-w-0 flex-1 p-5">
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-start justify-between gap-3 gap-y-2">
              <h2 className="min-w-0 text-lg font-semibold tracking-tight text-zinc-900 group-hover:text-zinc-800">
                {row.name}
              </h2>
              <span className="inline-flex shrink-0 items-center gap-2 text-sm text-zinc-600">
                <span
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                    row.status === "deleted" ? "bg-red-500/70" : row.status === "archived" ? "bg-zinc-400" : "bg-emerald-600/55"
                  }`}
                  aria-hidden
                />
                <span className="font-medium text-zinc-700">
                  {row.status === "deleted" ? "Ištrintas" : row.status === "archived" ? "Archyvuotas" : "Aktyvus"}
                </span>
              </span>
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
                  <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">Sukurta</span>
                  <p className="mt-1.5 tabular-nums text-base font-medium leading-snug text-zinc-900">
                    {formatDate(String(row.created_at ?? "").slice(0, 10))}
                  </p>
                </div>

                {isDeleted && deletedAtAvailable ? (
                  <div className="min-w-[10rem]">
                    <span className="text-xs font-semibold uppercase tracking-wide text-red-700">Bus pašalintas</span>
                    <p className="mt-1.5 tabular-nums text-base font-semibold leading-snug text-red-800">
                      {renderDeletedAt(row) ?? "—"}
                    </p>
                  </div>
                ) : null}

                {ownerColumnAvailable ? (
                  <div className="min-w-0 sm:max-w-[17rem]">
                    <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">Atsakingas</span>
                    <div className="mt-1.5 text-base font-medium leading-snug text-zinc-900">
                      {!row.owner_user_id ? (
                        <span className="font-normal text-zinc-500">Nepriskirta</span>
                      ) : (
                        <ProjectOwnerCell user={userById.get(row.owner_user_id)} />
                      )}
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="flex flex-col items-stretch gap-5 sm:flex-row sm:items-end sm:gap-7 lg:shrink-0">
                <div className="text-left sm:text-right">
                  <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Aktyvūs kontaktai</p>
                  <p className="mt-1.5 text-3xl font-semibold tabular-nums leading-none tracking-tight text-zinc-900">{wc}</p>
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
      </div>
    </div>
  );
}
