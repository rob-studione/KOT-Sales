import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createSupabaseSsrReadOnlyClient } from "@/lib/supabase/ssr";
import { formatDate, formatMoney } from "@/lib/crm/format";
import { defaultProjectActor } from "@/lib/crm/projectEnv";
import { fetchSortedCandidatesForProject } from "@/lib/crm/projectCandidateQuery";
import {
  fetchProjectAnalytics,
  fetchProjectRevenueFeed,
  parseProjectAnalyticsPeriod,
  resolveAnalyticsRange,
} from "@/lib/crm/projectAnalytics";
import { fetchProcurementDashboardAnalytics } from "@/lib/crm/procurementAnalytics";
import {
  buildProjectDetailHref,
  parseManualCandidatesStatus,
  parseProjectDetailTab,
  type ProjectDetailTab,
} from "@/lib/crm/projectPageSearchParams";
import { projectSortLabel, parseProjectSortOption, type SnapshotCandidateRow } from "@/lib/crm/projectSnapshot";
import { archiveProjectFormAction, restoreDeletedProjectFormAction, unarchiveProjectFormAction } from "@/lib/crm/projectActions";
import { ProjectCandidateCallList } from "@/components/crm/ProjectCandidateCallList";
import { CrmListPageIntro, CrmListPageMain } from "@/components/crm/CrmListPageLayout";
import { CrmTableContainer } from "@/components/crm/CrmTableContainer";
import { CRM_UNDERLINE_TAB_NAV_CLASS, crmUnderlineTabClass } from "@/components/crm/crmUnderlineTabStyles";
import { ProjectWorkBoardClientWrapper } from "@/components/crm/ProjectWorkBoardClientWrapper";
import { ProjectWorkQueueCallList } from "@/components/crm/ProjectWorkQueueCallList";
import { ProjectAnalyticsView } from "@/components/crm/project-analytics/ProjectAnalyticsView";
import { ProcurementAnalyticsView } from "@/components/crm/project-analytics/ProcurementAnalyticsView";
import { EditableProjectName } from "@/components/crm/EditableProjectName";
import { ProjectOwnerSelect } from "@/components/crm/ProjectOwnerSelect";
import { ProjectRulesEditButton } from "@/components/crm/ProjectRulesEditButton";
import { ProjectArchiveConfirmButton } from "@/components/crm/ProjectArchiveConfirmButton";
import { ProjectDeleteToTrashConfirmButton } from "@/components/crm/ProjectDeleteToTrashConfirmButton";
import {
  normalizeActivityRow,
  type ProjectWorkItemActivityDto,
} from "@/lib/crm/projectWorkItemActivityDto";
import { fetchCrmUsers } from "@/lib/crm/crmUsers";
import {
  fetchManualProjectCandidatesPage,
  fetchManualProjectCandidatesTotalCount,
  type ManualCandidatePageRow,
} from "@/lib/crm/projectManualLeads";
import { isProjectWorkItemClosed, isReturnedToCandidates } from "@/lib/crm/projectBoardConstants";
import type { ProjectWorkItemDto } from "@/lib/crm/projectWorkItemDto";
import {
  isMissingWorkItemSourceColumnsError,
  PROJECT_WORK_ITEMS_SELECT_LEGACY,
  PROJECT_WORK_ITEMS_SELECT_WITH_SOURCE,
} from "@/lib/crm/projectWorkItemColumns";
import { ManualProjectCandidatesFiltersBar } from "@/components/crm/ManualProjectCandidatesFiltersBar";
import { ManualProjectCandidatesPanel } from "@/components/crm/ManualProjectCandidatesPanel";
import { ProcurementContractsPanel } from "@/components/crm/ProcurementContractsPanel";
import { ProjectProcurementNotifications } from "@/components/crm/ProjectProcurementNotifications";
import {
  fetchProcurementContractsCount,
  fetchProcurementContractsForProject,
  fetchProcurementContractsValueSum,
  type ProcurementContractRow,
} from "@/lib/crm/procurementContracts";
import {
  isManualProjectType,
  isProcurementProjectType,
  projectTypeFromDbRow,
  projectTypeLabelLt,
} from "@/lib/crm/projectType";
import {
  clampPageIndex0,
  parsePageIndex0,
  parsePageSize,
  showingRange1Based,
  totalPagesFromCount,
} from "@/lib/crm/pagination";
import { SimplePagination } from "@/components/crm/SimplePagination";
import type { CrmNotificationRow } from "@/lib/crm/notificationConstants";

export const dynamic = "force-dynamic";

type ProjectRow = {
  id: string;
  name: string;
  description: string;
  project_type?: string | null;
  filter_date_from: string;
  filter_date_to: string;
  min_order_count: number;
  inactivity_days: number | null;
  sort_option: string;
  status: string;
  created_at: string;
  created_by: string | null;
  owner_user_id: string | null;
  procurement_notify_days_before?: number | null;
};

export default async function ProjektasDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    tab?: string | string[];
    view?: string | string[];
    period?: string | string[];
    from?: string | string[];
    to?: string | string[];
    all?: string | string[];
    page?: string | string[];
    pageSize?: string | string[];
    sortBy?: string | string[];
    sortDir?: string | string[];
    org?: string | string[];
    supplier?: string | string[];
    type?: string | string[];
    validFrom?: string | string[];
    validTo?: string | string[];
    status?: string | string[];
    q?: string | string[];
  }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const tabRaw = typeof sp.tab === "string" ? sp.tab : undefined;
  const tabParsed = parseProjectDetailTab(tabRaw);
  const viewRaw = typeof sp.view === "string" ? sp.view : "";
  const darbasView = viewRaw === "list" ? "list" : "board";

  const period = parseProjectAnalyticsPeriod(typeof sp.period === "string" ? sp.period : undefined);
  const customFrom = typeof sp.from === "string" ? sp.from : undefined;
  const customTo = typeof sp.to === "string" ? sp.to : undefined;
  const analyticsRange = resolveAnalyticsRange(period, customFrom, customTo);

  const qOpts = {
    period,
    ...(period === "custom" && customFrom && customTo ? { from: customFrom, to: customTo } : {}),
  };

  let supabase;
  try {
    supabase = await createSupabaseSsrReadOnlyClient();
  } catch (e) {
    const message = e instanceof Error ? e.message : "Klaida";
    return <p className="text-sm text-red-600">Supabase nekonfigūruotas. {message}</p>;
  }

  const [{ data: project, error: pErr }, crmUsers] = await Promise.all([
    supabase.from("projects").select("*").eq("id", id).maybeSingle(),
    fetchCrmUsers(supabase),
  ]);

  if (pErr || !project) {
    if (pErr) {
      return <p className="text-sm text-red-600">Nepavyko įkelti projekto: {pErr.message}</p>;
    }
    notFound();
  }

  const p = project as ProjectRow;
  const sort = parseProjectSortOption(p.sort_option);
  const inactivityDays = Number(p.inactivity_days ?? 90);
  const defaultAssignee = defaultProjectActor();
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

  const PROCUREMENT_PAGE_TABS = new Set<ProjectDetailTab>(["apzvalga", "sutartys", "darbas", "kontaktuota"]);
  if (isProcurement && !PROCUREMENT_PAGE_TABS.has(tabParsed)) {
    redirect(
      buildProjectDetailHref(id, {
        tab: "sutartys",
        ...qOpts,
      })
    );
  }

  const tab = tabParsed;

  /** Visada tas pats kaip „Kandidatai“ skirtuko sąrašas — skaitiklis neturi būti 0 kituose tab’uose. */
  let candidates: SnapshotCandidateRow[] = [];
  let candidatesError: string | null = null;
  if (!isManual && !isProcurement) {
    const candidatesRes = await fetchSortedCandidatesForProject(supabase, p);
    if (candidatesRes.ok) {
      candidates = candidatesRes.rows;
    } else {
      candidatesError = candidatesRes.error;
    }
  }

  const AUTO_CANDIDATES_PAGE_SIZE = 20;
  const requestedAutoCandidatesPageIndex0 =
    !isManual && !isProcurement && tab === "kandidatai" ? parsePageIndex0(sp.page) : 0;
  const autoCandidatesTotalCount = !isManual && !isProcurement ? candidates.length : 0;
  const autoCandidatesTotalPages =
    !isManual && !isProcurement ? totalPagesFromCount(autoCandidatesTotalCount, AUTO_CANDIDATES_PAGE_SIZE) : 0;
  const autoCandidatesPageIndex0 =
    !isManual && !isProcurement && tab === "kandidatai"
      ? clampPageIndex0(requestedAutoCandidatesPageIndex0, autoCandidatesTotalPages)
      : 0;
  const autoCandidatesShowing =
    !isManual && !isProcurement && tab === "kandidatai"
      ? showingRange1Based(autoCandidatesPageIndex0, AUTO_CANDIDATES_PAGE_SIZE, autoCandidatesTotalCount)
      : { from: 0, to: 0, total: 0 };
  const autoCandidatesOffset = autoCandidatesPageIndex0 * AUTO_CANDIDATES_PAGE_SIZE;
  const autoCandidatesPageRows =
    !isManual && !isProcurement && tab === "kandidatai"
      ? candidates.slice(autoCandidatesOffset, autoCandidatesOffset + AUTO_CANDIDATES_PAGE_SIZE)
      : candidates;

  if (
    !isManual &&
    !isProcurement &&
    tab === "kandidatai" &&
    autoCandidatesPageIndex0 !== requestedAutoCandidatesPageIndex0
  ) {
    redirect(
      buildProjectDetailHref(id, {
        tab: "kandidatai",
        ...qOpts,
        page: autoCandidatesPageIndex0,
      })
    );
  }

  const requestedManualPageIndex0 = isManual ? parsePageIndex0(sp.page) : 0;
  const manualCandidatesPageSize = isManual ? parsePageSize(sp.pageSize) : 20;
  const manualStatusFilter = isManual ? parseManualCandidatesStatus(typeof sp.status === "string" ? sp.status : undefined) : null;
  const manualQRaw = typeof sp.q === "string" ? sp.q : "";
  const manualQueryTrim = manualQRaw.trim();
  const manualSearchFilter = manualQueryTrim.length > 0 ? manualQueryTrim : null;
  const manualRpcFilters = { status: manualStatusFilter, search: manualSearchFilter };

  let manualCandidatesTotal = 0;
  let manualCandidatesPage: { rows: ManualCandidatePageRow[]; totalCount: number } = { rows: [], totalCount: 0 };
  let manualPageIndex0 = 0;
  let manualTotalPages = 0;
  let manualShowingFrom = 0;
  let manualShowingTo = 0;

  if (isManual) {
    if (tab === "kandidatai") {
      const first = await fetchManualProjectCandidatesPage(
        supabase,
        id,
        requestedManualPageIndex0,
        manualCandidatesPageSize,
        manualRpcFilters
      );
      manualCandidatesTotal = first.totalCount;
      manualTotalPages = totalPagesFromCount(manualCandidatesTotal, manualCandidatesPageSize);
      manualPageIndex0 = clampPageIndex0(requestedManualPageIndex0, manualTotalPages);
      if (manualPageIndex0 !== requestedManualPageIndex0) {
        redirect(
          buildProjectDetailHref(id, {
            tab: "kandidatai",
            ...qOpts,
            page: manualPageIndex0,
            pageSize: manualCandidatesPageSize,
            ...(manualStatusFilter ? { status: manualStatusFilter } : {}),
            ...(manualQueryTrim !== "" ? { q: manualQueryTrim } : {}),
          })
        );
      }
      manualCandidatesPage = first;
      const sr = showingRange1Based(manualPageIndex0, manualCandidatesPageSize, manualCandidatesTotal);
      manualShowingFrom = sr.from;
      manualShowingTo = sr.to;
    } else {
      manualCandidatesTotal = await fetchManualProjectCandidatesTotalCount(supabase, id, manualRpcFilters);
    }
  }

  let procurementContractsTotal = 0;
  let procurementContracts: ProcurementContractRow[] = [];
  let procurementContractsValueSumEur = 0;
  let procurementFilterOptions: { organizations: string[]; suppliers: string[]; types: string[] } = {
    organizations: [],
    suppliers: [],
    types: [],
  };
  if (isProcurement) {
    function parseCsvList(raw: unknown): string[] {
      const s = typeof raw === "string" ? raw : "";
      return s
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);
    }
    function parseYmd(raw: unknown): string | null {
      const s = typeof raw === "string" ? raw.trim() : "";
      return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
    }

    const procurementAllRaw = typeof sp.all === "string" ? sp.all : "";
    const procurementShowAll = procurementAllRaw === "1" || procurementAllRaw.toLowerCase() === "true";

    const sortByRaw = typeof sp.sortBy === "string" ? sp.sortBy : "";
    const sortDirRaw = typeof sp.sortDir === "string" ? sp.sortDir : "";
    const sortBy = sortByRaw === "value" || sortByRaw === "days_left" ? sortByRaw : "valid_until";
    const sortDir = sortDirRaw === "desc" ? "desc" : "asc";

    const filterOrgs = parseCsvList(typeof sp.org === "string" ? sp.org : "");
    const filterSuppliers = parseCsvList(typeof sp.supplier === "string" ? sp.supplier : "");
    const filterTypes = parseCsvList(typeof sp.type === "string" ? sp.type : "");
    const validFrom = parseYmd(typeof sp.validFrom === "string" ? sp.validFrom : "");
    const validTo = parseYmd(typeof sp.validTo === "string" ? sp.validTo : "");
    const searchQ = typeof sp.q === "string" ? sp.q.trim() : "";

    // Exclude already-picked procurement contracts (open work items).
    const { data: pickedRows } = await supabase
      .from("project_work_items")
      .select("source_id,result_status,source_type")
      .eq("project_id", id)
      .eq("source_type", "procurement_contract");
    const excludeIds = (pickedRows ?? [])
      .filter((r) => !isProjectWorkItemClosed(String((r as any).result_status ?? "")))
      .map((r) => String((r as any).source_id ?? ""))
      .filter(Boolean);

    const pc = await fetchProcurementContractsCount(supabase, id);
    if (pc.ok) procurementContractsTotal = pc.count;
    if (tab === "sutartys") {
      const filters = {
        q: searchQ || null,
        organizationNames: filterOrgs,
        suppliers: filterSuppliers,
        types: filterTypes,
        validFrom,
        validTo,
        excludeIds,
      };

      const pcFiltered = await fetchProcurementContractsCount(supabase, id, filters);
      if (pcFiltered.ok) procurementContractsTotal = pcFiltered.count;

      const vs = await fetchProcurementContractsValueSum(supabase, id, filters);
      if (vs.ok) procurementContractsValueSumEur = vs.sumEur;

      if (procurementShowAll) {
        const full = await fetchProcurementContractsForProject(supabase, id, { sortBy, sortDir, filters });
        if (full.ok) procurementContracts = full.rows;
      } else {
        const requestedProcPageIndex0 = parsePageIndex0(sp.page);
        const procPageSize = parsePageSize(sp.pageSize);
        const procTotalPages = totalPagesFromCount(procurementContractsTotal, procPageSize);
        const procPageIndex0 = clampPageIndex0(requestedProcPageIndex0, procTotalPages);
        if (procPageIndex0 !== requestedProcPageIndex0) {
          redirect(
            buildProjectDetailHref(id, {
              tab: "sutartys",
              ...qOpts,
              page: procPageIndex0,
              pageSize: procPageSize,
            })
          );
        }

        const limit = procPageSize;
        const offset = procPageIndex0 * procPageSize;
        const pageRes = await fetchProcurementContractsForProject(supabase, id, { limit, offset, sortBy, sortDir, filters });
        if (pageRes.ok) procurementContracts = pageRes.rows;
      }
    }

    // Filter options (distinct-ish) for UI panel. Use all contracts excluding picked, no other filters.
    let optsQ = supabase
      .from("project_procurement_contracts")
      .select("organization_name,supplier,type")
      .eq("project_id", id)
      .order("valid_until", { ascending: true })
      .limit(5000);
    if (excludeIds.length > 0) {
      optsQ = optsQ.not("id", "in", `(${excludeIds.map((x) => `"${x.replaceAll('"', "")}"`).join(",")})`);
    }
    const { data: optRows } = await optsQ;
    const orgSet = new Set<string>();
    const supSet = new Set<string>();
    const typeSet = new Set<string>();
    for (const r of (optRows ?? []) as any[]) {
      const org = String(r.organization_name ?? "").trim();
      const sup = String(r.supplier ?? "").trim();
      const typ = String(r.type ?? "").trim();
      if (org) orgSet.add(org);
      if (sup) supSet.add(sup);
      if (typ) typeSet.add(typ);
    }
    procurementFilterOptions = {
      organizations: [...orgSet].sort((a, b) => a.localeCompare(b, "lt")),
      suppliers: [...supSet].sort((a, b) => a.localeCompare(b, "lt")),
      types: [...typeSet].sort((a, b) => a.localeCompare(b, "lt")),
    };
  }

  const kandidataiCount = isManual
    ? manualCandidatesTotal
    : isProcurement
      ? procurementContractsTotal
      : candidates.length;

  let workRaw: Record<string, unknown>[] = [];
  let wErr;
  const full = await supabase
    .from("project_work_items")
    .select(PROJECT_WORK_ITEMS_SELECT_WITH_SOURCE)
    .eq("project_id", id)
    .order("picked_at", { ascending: false });
  if (full.error && isMissingWorkItemSourceColumnsError(full.error)) {
    const leg = await supabase
      .from("project_work_items")
      .select(PROJECT_WORK_ITEMS_SELECT_LEGACY)
      .eq("project_id", id)
      .order("picked_at", { ascending: false });
    workRaw = (leg.data ?? []) as Record<string, unknown>[];
    wErr = leg.error;
  } else {
    workRaw = (full.data ?? []) as Record<string, unknown>[];
    wErr = full.error;
  }

  if (wErr) {
    return <p className="text-sm text-red-600">Nepavyko įkelti darbo eilučių: {wErr.message}</p>;
  }

  const workIds = workRaw.map((r) => String(r.id));
  const activitiesByWorkItemId: Record<string, ProjectWorkItemActivityDto[]> = {};
  if ((tab === "darbas" || tab === "kontaktuota") && workIds.length > 0) {
    const { data: actRows, error: actErr } = await supabase
      .from("project_work_item_activities")
      .select("*")
      .in("work_item_id", workIds)
      .order("occurred_at", { ascending: true });
    if (!actErr && actRows) {
      for (const r of actRows) {
        const a = normalizeActivityRow(r as Record<string, unknown>);
        if (!activitiesByWorkItemId[a.work_item_id]) activitiesByWorkItemId[a.work_item_id] = [];
        activitiesByWorkItemId[a.work_item_id]!.push(a);
      }
    }
  }

  let workItemsAll: ProjectWorkItemDto[] = workRaw.map((row) => {
    const r = row;
    const st = r.source_type;
    return {
    id: String(row.id),
    source_type:
      st === "auto" || st === "manual_lead" || st === "linked_client" || st === "procurement_contract"
        ? st
        : null,
    source_id: r.source_id != null ? String(r.source_id) : null,
    client_key: row.client_key == null ? "" : String(row.client_key),
    client_identifier_display: String(row.client_identifier_display ?? ""),
    client_name_snapshot: String(row.client_name_snapshot ?? ""),
    assigned_to: String(row.assigned_to ?? ""),
    picked_at: String(row.picked_at ?? ""),
    snapshot_order_count: Number(row.snapshot_order_count ?? 0),
    snapshot_revenue: Number(row.snapshot_revenue ?? 0),
    snapshot_last_invoice_date:
      typeof row.snapshot_last_invoice_date === "string"
        ? row.snapshot_last_invoice_date.slice(0, 10)
        : String(row.snapshot_last_invoice_date ?? "").slice(0, 10),
    snapshot_priority: Number(row.snapshot_priority ?? 0),
    call_status: String(row.call_status ?? ""),
    next_action: String(row.next_action ?? ""),
    next_action_date:
      row.next_action_date && typeof row.next_action_date === "string"
        ? row.next_action_date.slice(0, 10)
        : null,
    comment: String(row.comment ?? ""),
    result_status: String(row.result_status ?? ""),
  };
  });

  // Display fix: show live (all-time) revenue in Kanban/list even for older picked items.
  // Snapshot rows in DB are immutable by design, so we only override for rendering.
  const liveRevenueByClientKey = new Map<string, number>();
  const revenueKeys = Array.from(
    new Set(
      workItemsAll
        .filter((w) => (w.source_type === "auto" || w.source_type === "linked_client") && w.client_key.trim() !== "")
        .map((w) => w.client_key)
    )
  );
  for (let i = 0; i < revenueKeys.length; i += 200) {
    const part = revenueKeys.slice(i, i + 200);
    const { data } = await supabase
      .from("v_client_list_from_invoices")
      .select("client_key,total_revenue")
      .in("client_key", part);
    for (const r of (data ?? []) as Array<{ client_key?: unknown; total_revenue?: unknown }>) {
      const ck = String(r.client_key ?? "").trim();
      if (!ck) continue;
      const n = Number(r.total_revenue ?? 0);
      if (Number.isFinite(n)) liveRevenueByClientKey.set(ck, n);
    }
  }
  if (liveRevenueByClientKey.size > 0) {
    workItemsAll = workItemsAll.map((w) => {
      const v = liveRevenueByClientKey.get(w.client_key);
      return v === undefined ? w : { ...w, snapshot_revenue: v };
    });
  }

  /** „Darbas“: tik neuždarytos eilutės (`result_status` ne „completed“ / completion_* ir pan.). */
  const workItems = workItemsAll.filter((w) => !isProjectWorkItemClosed(w.result_status));

  /** „Užbaigta“: uždarytos eilutės, išskyrus grąžintas į kandidatus. */
  const completedWorkItems = workItemsAll.filter(
    (w) => isProjectWorkItemClosed(w.result_status) && !isReturnedToCandidates(w.result_status)
  );
  const completedWorkCount = completedWorkItems.length;

  const procurementOpenPickedContractIds = workItemsAll
    .filter(
      (w) =>
        w.source_type === "procurement_contract" &&
        w.source_id &&
        !isProjectWorkItemClosed(w.result_status)
    )
    .map((w) => String(w.source_id));

  const analyticsData = tab === "apzvalga" && !isProcurement ? await fetchProjectAnalytics(supabase, id, analyticsRange) : null;
  const procurementAnalyticsData =
    tab === "apzvalga" && isProcurement
      ? await fetchProcurementDashboardAnalytics(supabase, id, p.created_at, analyticsRange)
      : null;
  const revenueFeed = await fetchProjectRevenueFeed(supabase, id, analyticsRange);
  const revenueCount = revenueFeed.count;

  return (
    <div className="min-w-0">
      <div className="mb-3">
        <Link href="/projektai" className="cursor-pointer text-sm text-zinc-600 hover:text-zinc-900 hover:underline">
          ← Visi projektai
        </Link>
      </div>

      <div className="rounded-2xl border border-zinc-200/70 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex flex-col">
            {/* LEVEL 1 — pavadinimas ir aprašymas */}
            <div>
              <EditableProjectName projectId={p.id} initialName={p.name} canEdit />
              <p className="mt-1.5 text-sm leading-relaxed text-zinc-600">
                {p.description?.trim() ? p.description : "Be aprašymo"}
              </p>
            </div>

            {/* LEVEL 2 — meta (tik badge’ai, viena eilutė) */}
            <div className="mt-6 flex flex-wrap items-center gap-2 text-xs text-zinc-600">
              <span className="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1">
                <span className="text-zinc-500">Sukurta</span>{" "}
                <span className="font-medium text-zinc-900">{formatDate(p.created_at)}</span>
              </span>
              <span className="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1">
                <span className="text-zinc-500">Projekto tipas</span>{" "}
                <span className="font-medium text-zinc-900">{projectTypeLabelLt(pt)}</span>
              </span>
            </div>

            {/* LEVEL 3 — valdymas (ne badge) */}
            <div className="mt-6 min-w-0">
              <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                <span className="shrink-0 text-xs font-medium text-zinc-500">Atsakingas:</span>
                <ProjectOwnerSelect projectId={p.id} users={crmUsers} currentOwnerId={p.owner_user_id ?? null} />
              </div>
            </div>

            {!isManual && !isProcurement ? (
              <div className="mt-6 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500">
                <span>Istorinis intervalas: {formatDate(p.filter_date_from)} — {formatDate(p.filter_date_to)}</span>
                <span>Min. sąskaitų: {p.min_order_count}</span>
                <span>Neaktyvumas: ≥ {inactivityDays} d.</span>
                <span>Rikiavimas: {projectSortLabel(sort)}</span>
                <ProjectRulesEditButton
                  projectId={p.id}
                  initial={{
                    dateFrom: String(p.filter_date_from).slice(0, 10),
                    dateTo: String(p.filter_date_to).slice(0, 10),
                    minOrderCount: Number(p.min_order_count ?? 1),
                    inactivityDays: Number(p.inactivity_days ?? 90),
                    sortOption: sort,
                  }}
                />
              </div>
            ) : null}
            {isManual ? (
              <p className="mt-6 text-xs text-zinc-500">
                Rankinis projektas: kandidatai nepridedami automatiškai pagal sąskaitų taisykles.
              </p>
            ) : null}
            {isProcurement ? (
              <p className="mt-6 text-xs text-zinc-500">
                Viešųjų pirkimų projektas: sutartys importuojamos iš CSV; priminimai pagal galiojimo datą ir „Pranešti prieš
                (dienomis)“.
              </p>
            ) : null}
            {isProcurement ? (
              <ProjectProcurementNotifications projectId={id} notifications={procurementNotificationsForUser} />
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
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

          {p.status === "active" ? (
            <ProjectArchiveConfirmButton projectId={p.id} />
          ) : null}

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
            <>
              <form action={restoreDeletedProjectFormAction.bind(null, p.id)}>
                <button
                  type="submit"
                  className="cursor-pointer rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                >
                  Atkurti
                </button>
              </form>
            </>
          ) : null}
          </div>
        </div>
      </div>

      <div className={`mt-4 ${CRM_UNDERLINE_TAB_NAV_CLASS}`} role="tablist" aria-label="Projekto skydeliai">
        <Link
          href={buildProjectDetailHref(id, { tab: "apzvalga", ...qOpts })}
          className={crmUnderlineTabClass(tab === "apzvalga")}
          role="tab"
          aria-selected={tab === "apzvalga"}
        >
          Apžvalga
        </Link>
        {isProcurement ? (
          <>
            <Link
              href={buildProjectDetailHref(id, { tab: "sutartys", ...qOpts })}
              className={crmUnderlineTabClass(tab === "sutartys")}
              role="tab"
              aria-selected={tab === "sutartys"}
            >
              Sutartys
              <span className="ml-1 tabular-nums text-gray-400">({procurementContractsTotal})</span>
            </Link>
            <Link
              href={buildProjectDetailHref(id, { tab: "darbas", view: darbasView, ...qOpts })}
              className={crmUnderlineTabClass(tab === "darbas")}
              role="tab"
              aria-selected={tab === "darbas"}
            >
              Darbas
              <span className="ml-1 tabular-nums text-gray-400">({workItems.length})</span>
            </Link>
            <Link
              href={buildProjectDetailHref(id, { tab: "kontaktuota", ...qOpts })}
              className={crmUnderlineTabClass(tab === "kontaktuota")}
              role="tab"
              aria-selected={tab === "kontaktuota"}
            >
              Užbaigta
              <span className="ml-1 tabular-nums text-gray-400">({completedWorkCount})</span>
            </Link>
          </>
        ) : (
          <>
            <Link
              href={buildProjectDetailHref(id, { tab: "kandidatai", ...qOpts })}
              className={crmUnderlineTabClass(tab === "kandidatai")}
              role="tab"
              aria-selected={tab === "kandidatai"}
            >
              Kandidatai
              {!candidatesError || isManual ? (
                <span className="ml-1 tabular-nums text-gray-400">({kandidataiCount})</span>
              ) : null}
            </Link>
            <Link
              href={buildProjectDetailHref(id, { tab: "darbas", view: darbasView, ...qOpts })}
              className={crmUnderlineTabClass(tab === "darbas")}
              role="tab"
              aria-selected={tab === "darbas"}
            >
              Darbas
              <span className="ml-1 tabular-nums text-gray-400">({workItems.length})</span>
            </Link>
            <Link
              href={buildProjectDetailHref(id, { tab: "kontaktuota", ...qOpts })}
              className={crmUnderlineTabClass(tab === "kontaktuota")}
              role="tab"
              aria-selected={tab === "kontaktuota"}
            >
              Užbaigta
              <span className="ml-1 tabular-nums text-gray-400">({completedWorkCount})</span>
            </Link>
            <Link
              href={buildProjectDetailHref(id, { tab: "pajamos", ...qOpts })}
              className={crmUnderlineTabClass(tab === "pajamos")}
              role="tab"
              aria-selected={tab === "pajamos"}
            >
              Pajamos
              <span className="ml-1 tabular-nums text-gray-400">({revenueCount})</span>
            </Link>
          </>
        )}
      </div>

      {tab === "apzvalga" && analyticsData ? (
        <div className="mt-6" role="tabpanel">
          <CrmTableContainer>
            <ProjectAnalyticsView projectId={id} period={period} data={analyticsData} />
          </CrmTableContainer>
        </div>
      ) : null}

      {tab === "apzvalga" && isProcurement && procurementAnalyticsData ? (
        <div className="mt-6" role="tabpanel">
          <CrmTableContainer>
            <ProcurementAnalyticsView projectId={id} period={period} data={procurementAnalyticsData} />
          </CrmTableContainer>
        </div>
      ) : null}

      {tab === "kandidatai" ? (
        <div className="mt-4" role="tabpanel">
          <CrmTableContainer>
            {isManual ? (
              <>
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between lg:gap-6">
                  <div className="min-w-0 flex-1">
                    <CrmListPageIntro
                      title="Kandidatai"
                      description="Rankinis projektas: čia rodomi tik jūsų pridėti kandidatai. Jie nėra įrašomi į „Visų klientų“ sąrašą."
                    />
                  </div>
                  <div className="w-full min-w-0 shrink-0 lg:w-auto">
                    <ManualProjectCandidatesFiltersBar
                      projectId={id}
                      defaultStatus={manualStatusFilter ?? ""}
                      defaultQuery={manualQueryTrim}
                      periodHidden={period}
                      fromHidden={period === "custom" && customFrom ? customFrom : undefined}
                      toHidden={period === "custom" && customTo ? customTo : undefined}
                      pageSizeHidden={manualCandidatesPageSize !== 20 ? String(manualCandidatesPageSize) : undefined}
                    />
                  </div>
                </div>
                <CrmListPageMain>
                  <div className="w-full min-w-0">
                    <ManualProjectCandidatesPanel
                      projectId={p.id}
                      pageRows={manualCandidatesPage.rows}
                      totalCount={manualCandidatesTotal}
                      pageIndex0={manualPageIndex0}
                      pageSize={manualCandidatesPageSize}
                      totalPages={manualTotalPages}
                      showingFrom={manualShowingFrom}
                      showingTo={manualShowingTo}
                      paginationBasePath={`/projektai/${id}`}
                      paginationExtraQuery={{
                        tab: "kandidatai",
                        period,
                        ...(period === "custom" && customFrom && customTo
                          ? { from: customFrom, to: customTo }
                          : {}),
                        ...(manualStatusFilter ? { status: manualStatusFilter } : {}),
                        ...(manualQueryTrim !== "" ? { q: manualQueryTrim } : {}),
                        ...(manualCandidatesPageSize !== 20
                          ? { pageSize: String(manualCandidatesPageSize) }
                          : {}),
                      }}
                      defaultAssignee={defaultAssignee}
                    />
                  </div>
                </CrmListPageMain>
              </>
            ) : (
              <>
                <CrmListPageIntro
                  title="Kandidatai"
                  description="Sąrašas perskaičiuojamas kiekvieną kartą. Jei klientas užsako prieš būdamas paimtas — dingsta iš kandidatų. Uždarius darbo eilutę (rezultatas „Užbaigta“ ir kt.), klientas vėl gali atsirasti čia, jei vis dar tenkina taisykles."
                />
                {candidatesError ? (
                  <CrmListPageMain>
                    <p className="text-sm text-red-600">{candidatesError}</p>
                  </CrmListPageMain>
                ) : (
                  <CrmListPageMain>
                    <div className="w-full min-w-0 overflow-hidden rounded-lg border border-zinc-200 bg-white">
                      <ProjectCandidateCallList
                        mode="pick"
                        projectId={String(p.id ?? id).trim() || id}
                        defaultAssignee={defaultAssignee}
                        candidates={autoCandidatesPageRows}
                      />
                      <SimplePagination
                        basePath={`/projektai/${id}`}
                        pageIndex0={autoCandidatesPageIndex0}
                        totalPages={autoCandidatesTotalPages}
                        extraQuery={{
                          tab: "kandidatai",
                          ...(period ? { period: String(period) } : {}),
                          ...(period === "custom" && customFrom ? { from: String(customFrom) } : {}),
                          ...(period === "custom" && customTo ? { to: String(customTo) } : {}),
                        }}
                        ariaLabel={`Kandidatų sąrašo puslapiai (${autoCandidatesShowing.from}–${autoCandidatesShowing.to} iš ${autoCandidatesShowing.total})`}
                      />
                    </div>
                  </CrmListPageMain>
                )}
              </>
            )}
          </CrmTableContainer>
        </div>
      ) : null}

      {tab === "sutartys" && isProcurement ? (
        <div className="mt-4" role="tabpanel">
          <CrmTableContainer>
            <CrmListPageIntro
              title="Sutartys"
              description="Pilnas viešųjų pirkimų sutarčių backlog. Filtrai ir rikiavimas taikomi visam sąrašui. „Priskirti sau“ sukuria darbo eilutę skirtuke „Darbas“."
            />
            <CrmListPageMain>
              {(() => {
                const procurementAllRaw = typeof sp.all === "string" ? sp.all : "";
                const procurementShowAll = procurementAllRaw === "1" || procurementAllRaw.toLowerCase() === "true";
                const requestedProcPageIndex0 = parsePageIndex0(sp.page);
                const procPageSize = parsePageSize(sp.pageSize);
                const procTotalPages = totalPagesFromCount(procurementContractsTotal, procPageSize);
                const procPageIndex0 = clampPageIndex0(requestedProcPageIndex0, procTotalPages);
                const sr = showingRange1Based(procPageIndex0, procPageSize, procurementContractsTotal);

                const sortBy = typeof sp.sortBy === "string" ? sp.sortBy : "";
                const sortDir = typeof sp.sortDir === "string" ? sp.sortDir : "";
                const org = typeof sp.org === "string" ? sp.org : "";
                const supplier = typeof sp.supplier === "string" ? sp.supplier : "";
                const type = typeof sp.type === "string" ? sp.type : "";
                const validFrom = typeof sp.validFrom === "string" ? sp.validFrom : "";
                const validTo = typeof sp.validTo === "string" ? sp.validTo : "";
                const q = typeof sp.q === "string" ? sp.q : "";

                const baseQuery: Record<string, string> = {
                  tab: "sutartys",
                  ...(period ? { period: String(period) } : {}),
                  ...(period === "custom" && customFrom ? { from: String(customFrom) } : {}),
                  ...(period === "custom" && customTo ? { to: String(customTo) } : {}),
                  ...(procPageSize !== 20 ? { pageSize: String(procPageSize) } : {}),
                  ...(procurementShowAll ? { all: "1" } : {}),
                  ...(sortBy ? { sortBy: String(sortBy) } : {}),
                  ...(sortDir ? { sortDir: String(sortDir) } : {}),
                  ...(org ? { org: String(org) } : {}),
                  ...(supplier ? { supplier: String(supplier) } : {}),
                  ...(type ? { type: String(type) } : {}),
                  ...(validFrom ? { validFrom: String(validFrom) } : {}),
                  ...(validTo ? { validTo: String(validTo) } : {}),
                  ...(q ? { q: String(q) } : {}),
                };

                return (
              <ProcurementContractsPanel
                projectId={id}
                contracts={procurementContracts}
                procurementNotifyDaysBefore={Math.min(
                  365,
                  Math.max(0, Number(p.procurement_notify_days_before ?? 14) || 14)
                )}
                defaultAssignee={defaultAssignee}
                openPickedContractIds={procurementOpenPickedContractIds}
                filterOptions={procurementFilterOptions}
                resultsSummary={{ count: procurementContractsTotal, totalValueEur: procurementContractsValueSumEur }}
                pagination={{
                  showAll: procurementShowAll,
                  pageIndex0: procPageIndex0,
                  pageSize: procPageSize,
                  totalCount: procurementContractsTotal,
                  totalPages: procTotalPages,
                  showingFrom: sr.from,
                  showingTo: sr.to,
                  basePath: `/projektai/${id}`,
                  baseQuery,
                }}
              />
                );
              })()}
            </CrmListPageMain>
          </CrmTableContainer>
        </div>
      ) : null}

      {tab === "darbas" ? (
        <div className="mt-4" role="tabpanel">
          <p className="text-xs text-zinc-500">
            {isProcurement ? (
              <>
                Viešųjų pirkimų darbas: vilkdami kortelę keičiate sekantį veiksmą. Užbaigus stulpelyje „Užbaigta“
                pasirenkamas rezultatas.
              </>
            ) : (
              <>
                Lentoje stulpeliai = „Skambučio statusas“ (kaip Sheets). Vilkdami kortelę keičiate statusą; kiekvienas
                įrašytas veiksmas saugomas istorijoje. Snapshot laukai (apyvarta, sąskaitos) lieka fiksuoti nuo paėmimo.
              </>
            )}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href={buildProjectDetailHref(id, { tab: "darbas", view: "board", ...qOpts })}
              className={
                darbasView === "board"
                  ? "cursor-pointer rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white"
                  : "cursor-pointer rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50"
              }
            >
              Lenta
            </Link>
            <Link
              href={buildProjectDetailHref(id, { tab: "darbas", view: "list", ...qOpts })}
              className={
                darbasView === "list"
                  ? "cursor-pointer rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white"
                  : "cursor-pointer rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50"
              }
            >
              Sąrašas
            </Link>
          </div>
          {darbasView === "board" ? (
            <div className="mt-4 min-w-0">
              {workItems.length === 0 ? (
                <div className="rounded-lg border border-dashed border-zinc-200 bg-zinc-50/50 px-6 py-12 text-center text-sm text-zinc-500">
                  {isProcurement
                    ? "Darbo eilučių nėra — eikite į „Sutartys“ ir spauskite „Priskirti sau“."
                    : "Dar niekas nepaėmė — eikite į „Kandidatai“."}
                </div>
              ) : (
                <div className="w-full min-w-0">
                  <ProjectWorkBoardClientWrapper
                    projectId={p.id}
                    items={workItems}
                    activitiesByWorkItemId={activitiesByWorkItemId}
                    boardVariant={isProcurement ? "procurement" : "default"}
                  />
                </div>
              )}
            </div>
          ) : (
            <div className="mt-4 w-full min-w-0">
              <ProjectWorkQueueCallList
                items={workItems}
                activitiesByWorkItemId={activitiesByWorkItemId}
                emptyHint={isProcurement ? "procurement" : "kandidatai"}
              />
            </div>
          )}
        </div>
      ) : null}

      {tab === "kontaktuota" ? (
        <div className="mt-4" role="tabpanel">
          <p className="text-xs text-zinc-500">
            Darbo įrašai, kurie uždaryti užbaigimo rezultatu (įskaitant „Užbaigta“ stulpelyje pasirinktą baigtį). Neberodomi
            „Darbas“ skirtuke.
          </p>
          <div className="mt-4 w-full min-w-0">
            {workItemsAll.length === 0 ? (
              <div className="rounded-lg border border-dashed border-zinc-200 bg-zinc-50/50 px-6 py-12 text-center text-sm text-zinc-500">
                {isProcurement
                  ? "Dar nėra darbo įrašų — eikite į „Sutartys“."
                  : "Dar nėra darbo įrašų — eikite į „Kandidatai“."}
              </div>
            ) : completedWorkItems.length === 0 ? (
              <div className="rounded-lg border border-dashed border-zinc-200 bg-zinc-50/50 px-6 py-12 text-center text-sm text-zinc-500">
                Nėra užbaigtų įrašų šiame projekte.
              </div>
            ) : (
              <ProjectWorkQueueCallList
                variant="contacted"
                items={completedWorkItems}
                activitiesByWorkItemId={activitiesByWorkItemId}
              />
            )}
          </div>
        </div>
      ) : null}

      {tab === "pajamos" ? (
        <div className="mt-4" role="tabpanel">
          <div className="flex flex-col gap-4">
            <div className="rounded-xl border border-zinc-200/80 bg-white p-4 shadow-sm">
              <div className="text-xs font-medium uppercase tracking-wide text-zinc-400">Santrauka</div>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-zinc-200 bg-zinc-50/40 p-3">
                  <div className="text-xs font-medium uppercase tracking-wide text-zinc-400">Direct pajamos</div>
                  <div className="mt-1 text-2xl font-semibold tabular-nums tracking-tight text-zinc-900">
                    {formatMoney(revenueFeed?.kpi.directEur ?? 0)}
                  </div>
                </div>
                <div className="rounded-lg border border-zinc-200 bg-zinc-50/40 p-3">
                  <div className="text-xs font-medium uppercase tracking-wide text-zinc-400">Indirect pajamos</div>
                  <div className="mt-1 text-2xl font-semibold tabular-nums tracking-tight text-zinc-900">
                    {formatMoney(revenueFeed?.kpi.indirectEur ?? 0)}
                  </div>
                </div>
                <div className="rounded-lg border border-zinc-200 bg-zinc-50/40 p-3">
                  <div className="text-xs font-medium uppercase tracking-wide text-zinc-400">Viso</div>
                  <div className="mt-1 text-2xl font-semibold tabular-nums tracking-tight text-zinc-900">
                    {formatMoney(revenueFeed?.kpi.totalEur ?? 0)}
                  </div>
                </div>
              </div>
            </div>

            {!revenueFeed || revenueFeed.rows.length === 0 ? (
              <div className="rounded-lg border border-dashed border-zinc-200 bg-zinc-50/50 px-6 py-12 text-center text-sm text-zinc-500">
                Nėra pajamų įrašų pagal pasirinktą laikotarpį.
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-zinc-200/80 bg-white shadow-sm">
                <table className="w-full min-w-0 table-fixed">
                  <thead className="bg-zinc-50/60 text-left text-xs font-semibold text-zinc-600">
                    <tr>
                      <th className="w-[42%] px-4 py-3">Klientas</th>
                      <th className="w-[16%] px-4 py-3">Data</th>
                      <th className="w-[18%] px-4 py-3">Nr.</th>
                      <th className="w-[14%] px-4 py-3 text-right">Suma</th>
                      <th className="w-[10%] px-4 py-3">Tipas</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 text-sm">
                    {revenueFeed.rows.map((r) => (
                      <tr key={r.invoice_id} className="hover:bg-zinc-50/50">
                        <td className="truncate px-4 py-3 font-medium text-zinc-900">{r.client_label}</td>
                        <td className="px-4 py-3 tabular-nums text-zinc-700">{formatDate(r.invoice_date)}</td>
                        <td className="truncate px-4 py-3 text-zinc-700">{r.invoice_number?.trim() ? r.invoice_number : "—"}</td>
                        <td className="px-4 py-3 text-right font-medium tabular-nums text-zinc-900">{formatMoney(r.amount_eur)}</td>
                        <td className="px-4 py-3">
                          <span
                            className={
                              r.revenue_type === "direct"
                                ? "inline-flex rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-900 ring-1 ring-inset ring-emerald-100"
                                : "inline-flex rounded-md bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-700 ring-1 ring-inset ring-zinc-200"
                            }
                          >
                            {r.revenue_type === "direct" ? "Direct" : "Indirect"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
