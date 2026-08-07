import Link from "next/link";
import { Pencil } from "lucide-react";
import { notFound } from "next/navigation";
import { createSupabaseSsrReadOnlyClient } from "@/lib/supabase/ssr";
import { formatDate } from "@/lib/crm/format";
import { loadProjectDetailCore } from "@/lib/crm/projectDetailLoad";
import { projectSortLabel, parseProjectSortOption } from "@/lib/crm/projectSnapshot";
import {
  archiveProjectFormAction,
  restoreDeletedProjectFormAction,
  unarchiveProjectFormAction,
} from "@/lib/crm/projectActions";
import { EditableProjectName } from "@/components/crm/EditableProjectName";
import { ProjectOwnerSelect } from "@/components/crm/ProjectOwnerSelect";
import { ProjectRulesEditButton } from "@/components/crm/ProjectRulesEditButton";
import { ProjectArchiveConfirmButton } from "@/components/crm/ProjectArchiveConfirmButton";
import { ProjectDeleteToTrashConfirmButton } from "@/components/crm/ProjectDeleteToTrashConfirmButton";
import { ProjectProcurementNotifications } from "@/components/crm/ProjectProcurementNotifications";
import { isManualProjectType, isProcurementProjectType, projectTypeFromDbRow, projectTypeLabelLt } from "@/lib/crm/projectType";
import type { CrmNotificationRow } from "@/lib/crm/notificationConstants";
import { ProjectDetailTabNav } from "@/app/(crm)/projektai/[id]/ProjectDetailTabNav";

export const dynamic = "force-dynamic";

/**
 * Bendra `/projektai/[id]/*` antraštė + skirtukų navigacija.
 * Persistuoja tarp skirtukų perėjimų (soft nav, be pilno shell perkrovimo).
 */
export default async function ProjektasDetailLayout({
  params,
  children,
}: {
  params: Promise<{ id: string }>;
  children: React.ReactNode;
}) {
  const { id } = await params;

  let supabase: Awaited<ReturnType<typeof createSupabaseSsrReadOnlyClient>>;
  try {
    supabase = await createSupabaseSsrReadOnlyClient();
  } catch (e) {
    const message = e instanceof Error ? e.message : "Klaida";
    return <p className="text-sm text-red-600">Supabase nekonfigūruotas. {message}</p>;
  }

  const { project, projectError, crmUsers } = await loadProjectDetailCore(id);

  if (projectError) {
    return <p className="text-sm text-red-600">Nepavyko įkelti projekto: {projectError}</p>;
  }
  if (!project) {
    notFound();
  }

  const p = project;
  const sort = parseProjectSortOption(p.sort_option);
  const inactivityDays = Number(p.inactivity_days ?? 90);
  const pt = projectTypeFromDbRow(p) ?? p.project_type;
  const isManual = isManualProjectType(pt);
  const isProcurement = isProcurementProjectType(pt);

  let procurementNotificationsForUser: CrmNotificationRow[] = [];
  if (isProcurement) {
    const { data: auth } = await supabase.auth.getUser();
    if (auth.user) {
      const { data: pn } = await supabase
        .from("notifications")
        .select("id,user_id,project_id,contract_id,type,message,is_read,created_at")
        .eq("project_id", id)
        .eq("user_id", auth.user.id)
        .order("created_at", { ascending: false })
        .limit(20);
      procurementNotificationsForUser = (pn ?? []) as CrmNotificationRow[];
    }
  }

  return (
    <div className="min-w-0">
      <div className="mb-3">
        <Link href="/projektai" className="cursor-pointer text-sm text-zinc-600 hover:text-zinc-900 hover:underline">
          ← Visi projektai
        </Link>
      </div>

      <div className="rounded-2xl border border-zinc-200/70 bg-white px-4 py-3 shadow-sm sm:px-5 sm:py-4">
        <div className="flex min-w-0 flex-col gap-2">
          {/* Row 1: title + status + archive (right) */}
          <div className="flex min-w-0 items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <EditableProjectName projectId={p.id} initialName={p.name} canEdit />
              <span
                className={
                  p.status === "deleted"
                    ? "rounded-md bg-red-50 px-2 py-1 text-xs font-medium text-red-800"
                    : p.status === "archived"
                      ? "rounded-md bg-zinc-100 px-2 py-1 text-xs text-zinc-700"
                      : "rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-800"
                }
              >
                {p.status === "deleted" ? "Ištrintas" : p.status === "archived" ? "Archyvuotas" : "Aktyvus"}
              </span>
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {p.status === "active" ? <ProjectArchiveConfirmButton projectId={p.id} /> : null}

              {p.status === "archived" ? (
                <>
                  <form action={unarchiveProjectFormAction.bind(null, p.id)}>
                    <button
                      type="submit"
                      className="cursor-pointer rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                    >
                      Atkurti
                    </button>
                  </form>
                  <ProjectDeleteToTrashConfirmButton projectId={p.id} />
                </>
              ) : null}

              {p.status === "deleted" ? (
                <form action={restoreDeletedProjectFormAction.bind(null, p.id)}>
                  <button
                    type="submit"
                    className="cursor-pointer rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                  >
                    Atkurti
                  </button>
                </form>
              ) : null}
            </div>
          </div>

          {/* Row 2: meta line */}
          <div className="flex min-w-0 flex-wrap items-center gap-3 text-sm text-gray-500">
            <div className="flex min-w-0 items-center gap-2">
              <span className="shrink-0 text-xs font-medium text-gray-500">Atsakingas:</span>
              <ProjectOwnerSelect projectId={p.id} users={crmUsers} currentOwnerId={p.owner_user_id ?? null} />
            </div>
            <span className="text-gray-400" aria-hidden>
              •
            </span>
            <span className="whitespace-nowrap">
              Sukurta: <span className="font-medium text-zinc-900">{formatDate(p.created_at)}</span>
            </span>
            <span className="text-gray-400" aria-hidden>
              •
            </span>
            <span className="whitespace-nowrap">
              Tipas: <span className="font-medium text-zinc-900">{projectTypeLabelLt(pt)}</span>
            </span>
          </div>

          {/* Description: show only when present */}
          {p.description?.trim() ? (
            <p className="text-sm leading-relaxed text-zinc-600">{p.description.trim()}</p>
          ) : null}

          {/* Meta block: interval/min/inactivity/sort + rules button right */}
          {!isManual && !isProcurement ? (
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 text-sm text-gray-500">
              <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                <span className="whitespace-nowrap">
                  Istorinis intervalas: {formatDate(p.filter_date_from)} — {formatDate(p.filter_date_to)}
                </span>
                <span className="text-gray-400" aria-hidden>
                  •
                </span>
                <span className="whitespace-nowrap">Min. sąskaitų: {p.min_order_count}</span>
                <span className="text-gray-400" aria-hidden>
                  •
                </span>
                <span className="whitespace-nowrap">Neaktyvumas: ≥ {inactivityDays} d.</span>
                <span className="text-gray-400" aria-hidden>
                  •
                </span>
                <span className="inline-flex items-center whitespace-nowrap">
                  Rikiavimas: {projectSortLabel(sort)}
                  <ProjectRulesEditButton
                    projectId={p.id}
                    initial={{
                      dateFrom: String(p.filter_date_from).slice(0, 10),
                      dateTo: String(p.filter_date_to).slice(0, 10),
                      minOrderCount: Number(p.min_order_count ?? 1),
                      inactivityDays: Number(p.inactivity_days ?? 90),
                      sortOption: sort,
                      candidatesRequireBusinessId: Boolean(p.candidates_require_business_id),
                    }}
                    triggerAriaLabel="Redaguoti taisykles"
                    triggerClassName="ml-2 inline-flex items-center text-gray-400 hover:text-[#7C4A57] cursor-pointer"
                  >
                    <Pencil size={14} strokeWidth={1.75} aria-hidden />
                  </ProjectRulesEditButton>
                </span>
              </div>
            </div>
          ) : null}
          {isManual ? (
            <p className="text-sm text-zinc-500">Rankinis projektas: kandidatai nepridedami automatiškai pagal sąskaitų taisykles.</p>
          ) : null}
          {isProcurement ? (
            <p className="text-sm text-zinc-500">
              Viešųjų pirkimų projektas: sutartys importuojamos iš CSV; priminimai pagal galiojimo datą ir „Pranešti prieš (dienomis)“.
            </p>
          ) : null}
          {isProcurement ? <ProjectProcurementNotifications projectId={id} notifications={procurementNotificationsForUser} /> : null}
        </div>
      </div>

      <ProjectDetailTabNav projectId={id} isProcurement={isProcurement} />

      {children}
    </div>
  );
}
