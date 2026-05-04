import Link from "next/link";
import { Pencil } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { createSupabaseSsrReadOnlyClient } from "@/lib/supabase/ssr";
import { formatDate, formatMoney } from "@/lib/crm/format";
import { getCurrentCrmUser } from "@/lib/crm/currentUser";
import { defaultProjectActor } from "@/lib/crm/projectEnv";
import { fetchSortedCandidatesForProject } from "@/lib/crm/projectCandidateQuery";
import { fetchExcludedAutoCandidatesPage } from "@/lib/crm/projectCandidateExclusions";
import {
  fetchProjectAnalytics,
  parseProjectAnalyticsPeriod,
  resolveAnalyticsRange,
} from "@/lib/crm/projectAnalytics";
import { fetchProcurementDashboardAnalytics } from "@/lib/crm/procurementAnalytics";
import {
  buildProjectDetailHref,
  buildProjectPageQueryPreserve,
  parseManualCandidatesStatus,
  parseProjectCompletedPage1Based,
  parseProjectDetailTab,
  type ProjectDetailTab,
} from "@/lib/crm/projectPageSearchParams";
import { projectSortLabel, parseProjectSortOption, type SnapshotCandidateRow } from "@/lib/crm/projectSnapshot";
import { archiveProjectFormAction, restoreDeletedProjectFormAction, unarchiveProjectFormAction } from "@/lib/crm/projectActions";
import { ProjectCandidateCallList } from "@/components/crm/ProjectCandidateCallList";
import { CrmListPageControls, CrmListPageIntro, CrmListPageMain } from "@/components/crm/CrmListPageLayout";
import { CrmTableContainer } from "@/components/crm/CrmTableContainer";
import { CRM_UNDERLINE_TAB_NAV_CLASS, crmUnderlineTabClass } from "@/components/crm/crmUnderlineTabStyles";
import { ProjectWorkBoardClientWrapper } from "@/components/crm/ProjectWorkBoardClientWrapper";
import { ProjectWorkQueueCallList } from "@/components/crm/ProjectWorkQueueCallList";
import { ProcurementAnalyticsView } from "@/components/crm/project-analytics/ProcurementAnalyticsView";
import { ProjectOverviewCritical } from "@/components/crm/project-analytics/ProjectOverviewCritical";
import { ProjectOverviewDeferred } from "@/components/crm/project-analytics/ProjectOverviewDeferred";
import { ProjectOverviewSkeleton } from "@/components/crm/project-analytics/ProjectOverviewSkeleton";
import { EditableProjectName } from "@/components/crm/EditableProjectName";
import { ProjectOwnerSelect } from "@/components/crm/ProjectOwnerSelect";
import { ProjectRulesEditButton } from "@/components/crm/ProjectRulesEditButton";
import { ProjectArchiveConfirmButton } from "@/components/crm/ProjectArchiveConfirmButton";
import { ProjectDeleteToTrashConfirmButton } from "@/components/crm/ProjectDeleteToTrashConfirmButton";
import { Suspense } from "react";
import {
  normalizeActivityRow,
  type ProjectWorkItemActivityDto,
} from "@/lib/crm/projectWorkItemActivityDto";
import type { CrmUser } from "@/lib/crm/crmUsers";
import {
  fetchManualProjectCandidatesPage,
  fetchManualProjectCandidatesTotalCount,
  type ManualCandidatePageRow,
} from "@/lib/crm/projectManualLeads";
import { isProjectWorkItemClosed, isReturnedToCandidates } from "@/lib/crm/projectBoardConstants";
import { isUžbaigtaSameDayCompletionOnDarbas, vilniusTodayDateString } from "@/lib/crm/projectWorkBoardDoneDate";
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
import { ListPageSearchForm } from "@/components/crm/ListPageSearchForm";
import type { CrmNotificationRow } from "@/lib/crm/notificationConstants";
import { RoutePerfMarker } from "@/components/crm/RoutePerfMarker";

export const dynamic = "force-dynamic";

function projectDetailHrefToQueryRecord(href: string): Record<string, string> {
  const i = href.indexOf("?");
  if (i < 0) return {};
  return Object.fromEntries(new URLSearchParams(href.slice(i + 1)).entries());
}

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
    candidateStatus?: string | string[];
    q?: string | string[];
    /** Skirtukas „Užbaigta“ (1-based). */
    completedPage?: string | string[];
  }>;
}) {
  const perfT0 = 0;
  const perf: Record<string, number> = {};
  let roundTripCount = 0;
  const markMs = (k: string, ms: number) => {
    perf[k] = (perf[k] ?? 0) + ms;
  };

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
  const projectQueryPreserve = buildProjectPageQueryPreserve(sp);
  const projectLinkOpts = { ...qOpts, ...projectQueryPreserve };

  let supabase;
  try {
    supabase = await createSupabaseSsrReadOnlyClient();
  } catch (e) {
    const message = e instanceof Error ? e.message : "Klaida";
    return <p className="text-sm text-red-600">Supabase nekonfigūruotas. {message}</p>;
  }

  const projectSelect =
    "id,name,description,project_type,filter_date_from,filter_date_to,min_order_count,inactivity_days,sort_option,status,created_at,created_by,owner_user_id,procurement_notify_days_before";
  const projectT0 = 0;
  roundTripCount += 1;
  const { data: project, error: pErr } = await supabase
    .from("projects")
    .select(projectSelect)
    .eq("id", id)
    .maybeSingle();
  markMs("projectMs", 0 - projectT0);

  // Owner dropdown needs user list, but keep payload minimal (no email/role).
  const crmUsersT0 = 0;
  roundTripCount += 1;
  const { data: crmUsersRaw, error: crmUsersErr } = await supabase
    .from("crm_users")
    .select("id,name,avatar_url")
    .order("name", { ascending: true });
  markMs("crmUsersMs", 0 - crmUsersT0);
  const crmUsers: CrmUser[] = (crmUsersRaw ?? []).map((u: { id?: unknown; name?: unknown; avatar_url?: string | null }) => ({
    id: String(u?.id ?? ""),
    name: String(u?.name ?? ""),
    email: "",
    role: "",
    avatar_url: u?.avatar_url ?? null,
  }));
  if (crmUsersErr && process.env.NODE_ENV === "development") {
    console.warn("[projektai/[id]] crm_users load failed:", crmUsersErr);
  }

  if (pErr || !project) {
    if (pErr) {
      return <p className="text-sm text-red-600">Nepavyko įkelti projekto: {pErr.message}</p>;
    }
    notFound();
  }

  const p = project as ProjectRow;
  const sort = parseProjectSortOption(p.sort_option);
  const inactivityDays = Number(p.inactivity_days ?? 90);
  const currentCrm = await getCurrentCrmUser();
  const defaultAssignee = currentCrm?.id ?? defaultProjectActor();
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
        ...projectLinkOpts,
      })
    );
  }

  const tab = tabParsed;

  const candidateStatusRaw = typeof sp.candidateStatus === "string" ? sp.candidateStatus : undefined;
  const autoCandidateListStatus: "active" | "netinkamas" = parseManualCandidatesStatus(candidateStatusRaw);
  const manualCandidateListStatus: "active" | "netinkamas" = parseManualCandidatesStatus(candidateStatusRaw);

  /** Visada tas pats kaip „Kandidatai“ skirtuko sąrašas — skaitiklis neturi būti 0 kituose tab’uose. */
  let candidates: SnapshotCandidateRow[] = [];
  let candidatesError: string | null = null;
  let kandidataiCount: number | null = null;
  const candidatesT0 = 0;
  if (!isManual && !isProcurement && tab === "kandidatai" && autoCandidateListStatus === "active") {
    const candidatesRes = await fetchSortedCandidatesForProject(supabase, p);
    if (candidatesRes.ok) {
      candidates = candidatesRes.rows;
      kandidataiCount = candidates.length;
    } else {
      candidatesError = candidatesRes.error;
    }
  }
  if (!isManual && !isProcurement && tab === "kandidatai") {
    markMs("candidatesRpcMs", 0 - candidatesT0);
  }

  const AUTO_CANDIDATES_PAGE_SIZE = 20;
  const autoCandidatesQTrim =
    !isManual && !isProcurement && tab === "kandidatai" ? (typeof sp.q === "string" ? sp.q.trim() : "") : "";
  const autoCandidatesQ = autoCandidatesQTrim.toLowerCase();
  const requestedAutoCandidatesPageIndex0 =
    !isManual && !isProcurement && tab === "kandidatai" ? parsePageIndex0(sp.page) : 0;
  const autoCandidatesFiltered =
    autoCandidateListStatus === "active"
      ? autoCandidatesQ.length === 0
        ? candidates
        : candidates.filter((c) => {
            const name = String(c.company_name ?? "").toLowerCase();
            const code = String(c.company_code ?? "").toLowerCase();
            const cid = String(c.client_id ?? "").toLowerCase();
            return name.includes(autoCandidatesQ) || code.includes(autoCandidatesQ) || cid.includes(autoCandidatesQ);
          })
      : [];

  let autoCandidatesTotalCount = !isManual && !isProcurement ? autoCandidatesFiltered.length : 0;
  let autoCandidatesTotalPages =
    !isManual && !isProcurement ? totalPagesFromCount(autoCandidatesTotalCount, AUTO_CANDIDATES_PAGE_SIZE) : 0;
  let autoCandidatesPageIndex0 =
    !isManual && !isProcurement && tab === "kandidatai"
      ? clampPageIndex0(requestedAutoCandidatesPageIndex0, autoCandidatesTotalPages)
      : 0;
  let autoCandidatesShowing =
    !isManual && !isProcurement && tab === "kandidatai"
      ? showingRange1Based(autoCandidatesPageIndex0, AUTO_CANDIDATES_PAGE_SIZE, autoCandidatesTotalCount)
      : { from: 0, to: 0, total: 0 };
  const autoCandidatesOffset = autoCandidatesPageIndex0 * AUTO_CANDIDATES_PAGE_SIZE;
  let autoCandidatesPageRows =
    !isManual && !isProcurement && tab === "kandidatai"
      ? autoCandidatesFiltered.slice(autoCandidatesOffset, autoCandidatesOffset + AUTO_CANDIDATES_PAGE_SIZE)
      : candidates;

  if (!isManual && !isProcurement && tab === "kandidatai" && autoCandidateListStatus === "netinkamas") {
    const ex = await fetchExcludedAutoCandidatesPage(supabase, id, requestedAutoCandidatesPageIndex0, AUTO_CANDIDATES_PAGE_SIZE, {
      search: autoCandidatesQTrim || null,
    });
    autoCandidatesTotalCount = ex.totalCount;
    autoCandidatesTotalPages = totalPagesFromCount(autoCandidatesTotalCount, AUTO_CANDIDATES_PAGE_SIZE);
    autoCandidatesPageIndex0 = clampPageIndex0(requestedAutoCandidatesPageIndex0, autoCandidatesTotalPages);
    autoCandidatesShowing = showingRange1Based(autoCandidatesPageIndex0, AUTO_CANDIDATES_PAGE_SIZE, autoCandidatesTotalCount);
    autoCandidatesPageRows = ex.rows;
  }

  const autoCallListPriorityBasis =
    !isManual && !isProcurement
      ? (() => {
          const rankByClientKey: Record<string, number> = {};
          for (let i = 0; i < autoCandidatesFiltered.length; i++) {
            const ck = autoCandidatesFiltered[i]?.client_key;
            if (ck) rankByClientKey[ck] = i + 1;
          }
          return { total: autoCandidatesFiltered.length, rankByClientKey };
        })()
      : undefined;

  if (
    !isManual &&
    !isProcurement &&
    tab === "kandidatai" &&
    autoCandidatesPageIndex0 !== requestedAutoCandidatesPageIndex0
  ) {
    redirect(
      buildProjectDetailHref(id, {
        tab: "kandidatai",
        ...projectLinkOpts,
        page: autoCandidatesPageIndex0,
        ...(autoCandidatesQTrim ? { q: autoCandidatesQTrim } : {}),
        ...(autoCandidateListStatus === "netinkamas" ? { candidateStatus: "netinkamas" } : {}),
      })
    );
  }

  const requestedManualPageIndex0 = isManual ? parsePageIndex0(sp.page) : 0;
  const manualCandidatesPageSize = isManual ? parsePageSize(sp.pageSize) : 20;
  const manualQRaw = typeof sp.q === "string" ? sp.q : "";
  const manualQueryTrim = manualQRaw.trim();
  const manualSearchFilter = manualQueryTrim.length > 0 ? manualQueryTrim : null;
  const manualRpcFilters = {
    candidateStatus: manualCandidateListStatus,
    search: manualSearchFilter,
  };

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
            ...projectLinkOpts,
            page: manualPageIndex0,
            pageSize: manualCandidatesPageSize,
            ...(manualCandidateListStatus === "netinkamas" ? { candidateStatus: "netinkamas" } : {}),
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
  const procurementT0 = 0;
  let procurementOpenPickedContractIds: string[] = [];
  if (isProcurement && tab === "sutartys") {
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
    roundTripCount += 1;
    const { data: pickedRows } = await supabase
      .from("project_work_items")
      .select("source_id,result_status,source_type")
      .eq("project_id", id)
      .eq("source_type", "procurement_contract");
    const excludeIds = (pickedRows ?? [])
      .filter((r) => !isProjectWorkItemClosed(String((r as { result_status?: unknown } | null)?.result_status ?? "")))
      .map((r) => String((r as { source_id?: unknown } | null)?.source_id ?? ""))
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
              ...projectLinkOpts,
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
    roundTripCount += 1;
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
    for (const r of (optRows ?? []) as Array<Record<string, unknown>>) {
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

    procurementOpenPickedContractIds = excludeIds;
  }
  if (isProcurement && tab === "sutartys") {
    markMs("procurementMs", 0 - procurementT0);
  }

  const kandidataiCountForTabLabel: number | string =
    isManual ? manualCandidatesTotal : isProcurement ? (tab === "sutartys" ? procurementContractsTotal : "…") : tab === "kandidatai" ? autoCandidatesTotalCount : "…";

  let workRaw: Record<string, unknown>[] = [];
  let wErr: { message?: string } | null = null;
  const workItemsT0 = 0;
  if (tab === "darbas" || tab === "kontaktuota") {
    roundTripCount += 1;
    const full = await supabase
      .from("project_work_items")
      .select(PROJECT_WORK_ITEMS_SELECT_WITH_SOURCE)
      .eq("project_id", id)
      .order("picked_at", { ascending: false });
    if (full.error && isMissingWorkItemSourceColumnsError(full.error)) {
      roundTripCount += 1;
      const leg = await supabase
        .from("project_work_items")
        .select(PROJECT_WORK_ITEMS_SELECT_LEGACY)
        .eq("project_id", id)
        .order("picked_at", { ascending: false });
      workRaw = (leg.data ?? []) as Record<string, unknown>[];
      wErr = leg.error ? { message: leg.error.message } : null;
    } else {
      workRaw = (full.data ?? []) as Record<string, unknown>[];
      wErr = full.error ? { message: full.error.message } : null;
    }
    markMs("workItemsMs", 0 - workItemsT0);
  }

  if (wErr) {
    return <p className="text-sm text-red-600">Nepavyko įkelti darbo eilučių: {String(wErr.message ?? "Klaida")}</p>;
  }

  const workIds = workRaw.map((r) => String(r.id));
  const activitiesByWorkItemId: Record<string, ProjectWorkItemActivityDto[]> = {};
  const activitiesT0 = 0;
  if ((tab === "darbas" || tab === "kontaktuota") && workIds.length > 0) {
    roundTripCount += 1;
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
  if (tab === "darbas" || tab === "kontaktuota") {
    markMs("activitiesMs", 0 - activitiesT0);
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
    client_live_all_time_revenue: null,
    client_live_last_invoice_date: null,
    client_last_invoice_number: null,
    client_invoice_email: null,
    client_invoice_phone: null,
  };
  });

  if (tab === "darbas") {
    const kanbanLiveLookupT0 = 0;
    let kanbanVClientLookupMs = 0;
    let kanbanRecentInvoicesRpcMs = 0;
    const liveByKey = new Map<
      string,
      {
        total_revenue: number;
        last_invoice_date: string | null;
        email: string | null;
        phone: string | null;
        invoice_number: string | null;
      }
    >();
    const revenueKeys = Array.from(
      new Set(
        workItemsAll
          .filter((w) => (w.source_type === "auto" || w.source_type === "linked_client") && w.client_key.trim() !== "")
          .map((w) => w.client_key)
      )
    );
    for (let i = 0; i < revenueKeys.length; i += 200) {
      const part = revenueKeys.slice(i, i + 200);
      roundTripCount += 1;
      const tV0 = 0;
      const { data } = await supabase
        .from("v_client_list_from_invoices")
        .select("client_key,total_revenue,last_invoice_date,email,phone")
        .in("client_key", part);
      kanbanVClientLookupMs += 0 - tV0;
      for (const r of (data ?? []) as Array<{
        client_key?: unknown;
        total_revenue?: unknown;
        last_invoice_date?: unknown;
        email?: unknown;
        phone?: unknown;
      }>) {
        const ck = String(r.client_key ?? "").trim();
        if (!ck) continue;
        const total = Number(r.total_revenue ?? 0);
        const lastRaw = r.last_invoice_date;
        const last =
          lastRaw == null || lastRaw === ""
            ? null
            : typeof lastRaw === "string"
              ? lastRaw.slice(0, 10)
              : String(lastRaw).slice(0, 10);
        const em = r.email != null && String(r.email).trim() !== "" ? String(r.email).trim() : null;
        const ph = r.phone != null && String(r.phone).trim() !== "" ? String(r.phone).trim() : null;
        liveByKey.set(ck, {
          total_revenue: Number.isFinite(total) ? total : 0,
          last_invoice_date: last,
          email: em,
          phone: ph,
          invoice_number: null,
        });
      }
      roundTripCount += 1;
      const tR0 = 0;
      const { data: recentInv } = await supabase.rpc("recent_invoices_for_clients", { p_codes: part });
      kanbanRecentInvoicesRpcMs += 0 - tR0;
      const firstLatestNumForKey = new Set<string>();
      for (const row of (recentInv ?? []) as Array<{
        client_key?: unknown;
        invoice_number?: unknown;
      }>) {
        const ck = String(row.client_key ?? "").trim();
        if (!ck || firstLatestNumForKey.has(ck)) continue;
        firstLatestNumForKey.add(ck);
        const entry = liveByKey.get(ck);
        if (!entry) continue;
        const num =
          row.invoice_number != null && String(row.invoice_number).trim() !== ""
            ? String(row.invoice_number).trim()
            : null;
        entry.invoice_number = num;
      }
    }
    const kanbanMapT0 = 0;
    if (liveByKey.size > 0) {
      workItemsAll = workItemsAll.map((w) => {
        if (w.source_type !== "auto" && w.source_type !== "linked_client") return w;
        const row = liveByKey.get(w.client_key);
        if (!row) return w;
        return {
          ...w,
          client_live_all_time_revenue: row.total_revenue,
          client_live_last_invoice_date: row.last_invoice_date,
          client_last_invoice_number: row.invoice_number,
          client_invoice_email: row.email,
          client_invoice_phone: row.phone,
        };
      });
    }
    markMs("kanbanFooterMapMs", 0 - kanbanMapT0);
    markMs("kanbanVClientLookupMs", kanbanVClientLookupMs);
    markMs("kanbanRecentInvoicesRpcMs", kanbanRecentInvoicesRpcMs);
    markMs("kanbanClientLiveLookupMs", 0 - kanbanLiveLookupT0);
  }

  // Display fix: show live (all-time) revenue in Kanban/list even for older picked items.
  // Snapshot rows in DB are immutable by design, so we only override for rendering.
  if (tab === "pajamos") {
    const liveRevenueLookupT0 = 0;
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
      roundTripCount += 1;
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
    markMs("liveRevenueLookupMs", 0 - liveRevenueLookupT0);
  }

  /** „Darbas“: atviros eilutės, taip pat šiandien (Vilnius) Užbaigta uždarytos — lenta iki dienos pabaigos. */
  const todayVilnius = vilniusTodayDateString();
  const workItems = workItemsAll.filter(
    (w) =>
      !isProjectWorkItemClosed(w.result_status) ||
      isUžbaigtaSameDayCompletionOnDarbas(w, activitiesByWorkItemId[w.id], todayVilnius)
  );

  /** „Kontaktuota / Užbaigta“: uždarytos, išskyrus šiandien uždarytas Užbaigta (jos dar „Darbe“). */
  const completedWorkItems = workItemsAll.filter(
    (w) =>
      isProjectWorkItemClosed(w.result_status) &&
      !isReturnedToCandidates(w.result_status) &&
      !isUžbaigtaSameDayCompletionOnDarbas(w, activitiesByWorkItemId[w.id], todayVilnius)
  );

  const UŽBAIGTA_PAGE_SIZE = 20;
  const completedTotal = completedWorkItems.length;
  const completedTotalPages = totalPagesFromCount(completedTotal, UŽBAIGTA_PAGE_SIZE);
  const requestedCompleted1 = parseProjectCompletedPage1Based(
    typeof sp.completedPage === "string" ? sp.completedPage : undefined
  );
  const safeCompleted1 =
    completedTotal === 0
      ? 1
      : Math.min(Math.max(1, requestedCompleted1), Math.max(1, completedTotalPages));

  if (tab === "kontaktuota" && completedTotal === 0 && requestedCompleted1 > 1) {
    const { completedPage: _drop, ...pl } = projectLinkOpts;
    if (_drop != null) {
      redirect(
        buildProjectDetailHref(id, {
          ...pl,
          tab: "kontaktuota",
        })
      );
    }
  }

  if (tab === "kontaktuota" && completedTotal > 0 && safeCompleted1 !== requestedCompleted1) {
    redirect(
      buildProjectDetailHref(id, {
        ...projectLinkOpts,
        tab: "kontaktuota",
        completedPage: safeCompleted1,
      })
    );
  }

  const completedPageIndex0 = safeCompleted1 - 1;
  const pagedCompletedWorkItems = completedWorkItems.slice(
    completedPageIndex0 * UŽBAIGTA_PAGE_SIZE,
    completedPageIndex0 * UŽBAIGTA_PAGE_SIZE + UŽBAIGTA_PAGE_SIZE
  );
  const completedRange = showingRange1Based(completedPageIndex0, UŽBAIGTA_PAGE_SIZE, completedTotal);

  const { completedPage: _omitKontatsuota, ...projectLinkForKontaktuotaList } = projectLinkOpts;
  const kontaktuotaPaginationExtra: Record<string, string | undefined> = {
    ...projectDetailHrefToQueryRecord(
      buildProjectDetailHref(id, { ...projectLinkForKontaktuotaList, tab: "kontaktuota" })
    ),
  };

  const procurementAnalyticsData =
    tab === "apzvalga" && isProcurement
      ? await fetchProcurementDashboardAnalytics(supabase, id, p.created_at, analyticsRange)
      : null;
  let revenueFeed: Awaited<ReturnType<typeof import("@/lib/crm/projectAnalytics").fetchProjectRevenueFeed>> | null = null;
  let revenueCount: number | string = "…";
  if (tab === "pajamos") {
    const { fetchProjectRevenueFeed } = await import("@/lib/crm/projectAnalytics");
    const revenueFeedT0 = 0;
    revenueFeed = await fetchProjectRevenueFeed(supabase, id, analyticsRange);
    markMs("revenueFeedMs", 0 - revenueFeedT0);
    revenueCount = revenueFeed.count;
  }

  if (process.env.CRM_PERF_LOG === "1") {
    console.info("[CRM perf] /projektai/[id] SSR", {
      totalServerMs: 0 - perfT0,
      projectMs: perf.projectMs ?? 0,
      crmUsersMs: perf.crmUsersMs ?? 0,
      candidatesRpcMs: perf.candidatesRpcMs ?? 0,
      workItemsMs: perf.workItemsMs ?? 0,
      activitiesMs: perf.activitiesMs ?? 0,
      revenueFeedMs: perf.revenueFeedMs ?? 0,
      liveRevenueLookupMs: perf.liveRevenueLookupMs ?? 0,
      kanbanClientLiveLookupMs: perf.kanbanClientLiveLookupMs ?? 0,
      kanbanVClientLookupMs: perf.kanbanVClientLookupMs ?? 0,
      kanbanRecentInvoicesRpcMs: perf.kanbanRecentInvoicesRpcMs ?? 0,
      kanbanFooterMapMs: perf.kanbanFooterMapMs ?? 0,
      procurementMs: perf.procurementMs ?? 0,
      roundTripCount,
      tab,
    });
  }

  const serverPerfForClient = {
    totalServerMs: 0 - perfT0,
    projectMs: perf.projectMs ?? 0,
    crmUsersMs: perf.crmUsersMs ?? 0,
    candidatesRpcMs: perf.candidatesRpcMs ?? 0,
    workItemsMs: perf.workItemsMs ?? 0,
    activitiesMs: perf.activitiesMs ?? 0,
    revenueFeedMs: perf.revenueFeedMs ?? 0,
    liveRevenueLookupMs: perf.liveRevenueLookupMs ?? 0,
    kanbanClientLiveLookupMs: perf.kanbanClientLiveLookupMs ?? 0,
    kanbanVClientLookupMs: perf.kanbanVClientLookupMs ?? 0,
    kanbanRecentInvoicesRpcMs: perf.kanbanRecentInvoicesRpcMs ?? 0,
    kanbanFooterMapMs: perf.kanbanFooterMapMs ?? 0,
    procurementMs: perf.procurementMs ?? 0,
    roundTripCount,
    tab,
  } as const;

  return (
    <div className="min-w-0">
      <RoutePerfMarker routeLabel="/projektai/[id]" serverPerf={serverPerfForClient} />
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

      <div className={`mt-4 ${CRM_UNDERLINE_TAB_NAV_CLASS}`} role="tablist" aria-label="Projekto skydeliai">
        <Link
          href={buildProjectDetailHref(id, { tab: "apzvalga", ...projectLinkOpts })}
          className={crmUnderlineTabClass(tab === "apzvalga")}
          role="tab"
          aria-selected={tab === "apzvalga"}
        >
          Apžvalga
        </Link>
        {isProcurement ? (
          <>
            <Link
              href={buildProjectDetailHref(id, { tab: "sutartys", ...projectLinkOpts })}
              className={crmUnderlineTabClass(tab === "sutartys")}
              role="tab"
              aria-selected={tab === "sutartys"}
            >
              Sutartys
            </Link>
            <Link
              href={buildProjectDetailHref(id, { tab: "darbas", view: darbasView, ...projectLinkOpts })}
              className={crmUnderlineTabClass(tab === "darbas")}
              role="tab"
              aria-selected={tab === "darbas"}
            >
              Darbas
            </Link>
            <Link
              href={buildProjectDetailHref(id, { tab: "kontaktuota", ...projectLinkOpts })}
              className={crmUnderlineTabClass(tab === "kontaktuota")}
              role="tab"
              aria-selected={tab === "kontaktuota"}
            >
              Užbaigta
            </Link>
          </>
        ) : (
          <>
            <Link
              href={buildProjectDetailHref(id, { tab: "kandidatai", ...projectLinkOpts })}
              className={crmUnderlineTabClass(tab === "kandidatai")}
              role="tab"
              aria-selected={tab === "kandidatai"}
            >
              Kandidatai
            </Link>
            <Link
              href={buildProjectDetailHref(id, { tab: "darbas", view: darbasView, ...projectLinkOpts })}
              className={crmUnderlineTabClass(tab === "darbas")}
              role="tab"
              aria-selected={tab === "darbas"}
            >
              Darbas
            </Link>
            <Link
              href={buildProjectDetailHref(id, { tab: "kontaktuota", ...projectLinkOpts })}
              className={crmUnderlineTabClass(tab === "kontaktuota")}
              role="tab"
              aria-selected={tab === "kontaktuota"}
            >
              Užbaigta
            </Link>
            <Link
              href={buildProjectDetailHref(id, { tab: "pajamos", ...projectLinkOpts })}
              className={crmUnderlineTabClass(tab === "pajamos")}
              role="tab"
              aria-selected={tab === "pajamos"}
            >
              Pajamos
            </Link>
          </>
        )}
      </div>

      {tab === "apzvalga" && !isProcurement ? (
        <div className="mt-6" role="tabpanel">
          <CrmTableContainer>
            <Suspense fallback={null}>
              <ProjectOverviewCritical projectId={id} period={period} range={analyticsRange} />
            </Suspense>
            <div className="mt-8">
              <Suspense fallback={<ProjectOverviewSkeleton />}>
                <ProjectOverviewDeferred projectId={id} range={analyticsRange} />
              </Suspense>
            </div>
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
                <CrmListPageIntro
                  title="Kandidatai"
                  description="Rankinis projektas: čia rodomi tik jūsų pridėti kandidatai. Jie nėra įrašomi į „Visų klientų“ sąrašą."
                />
                <CrmListPageMain>
                  <div className="w-full min-w-0">
                    <ManualProjectCandidatesPanel
                      key={manualCandidateListStatus}
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
                        ...(manualCandidateListStatus === "netinkamas" ? { candidateStatus: "netinkamas" } : {}),
                        ...(manualQueryTrim !== "" ? { q: manualQueryTrim } : {}),
                        ...(manualCandidatesPageSize !== 20
                          ? { pageSize: String(manualCandidatesPageSize) }
                          : {}),
                      }}
                      defaultAssignee={defaultAssignee}
                      listStatus={manualCandidateListStatus}
                      controlsLeft={
                        <ManualProjectCandidatesFiltersBar
                          projectId={id}
                          defaultCandidateStatus={manualCandidateListStatus}
                          defaultQuery={manualQueryTrim}
                          periodHidden={period}
                          fromHidden={period === "custom" && customFrom ? customFrom : undefined}
                          toHidden={period === "custom" && customTo ? customTo : undefined}
                          pageSizeHidden={manualCandidatesPageSize !== 20 ? String(manualCandidatesPageSize) : undefined}
                        />
                      }
                    />
                  </div>
                </CrmListPageMain>
              </>
            ) : (
              <>
                <CrmListPageIntro
                  title="Kandidatai"
                  description="Sąrašas perskaičiuojamas kiekvieną kartą. Jei klientas užsako prieš būdamas paimtas — dingsta iš kandidatų. Jei klientas jau buvo paimtas į „Darbas“ šiame projekte, jis čia neberodomas (nebent darbo eilutė buvo grąžinta į kandidatus)."
                />
                <CrmListPageControls>
                  <div className="flex flex-wrap items-center justify-end gap-4">
                    <div className="inline-flex h-10 items-center overflow-hidden rounded-md border border-zinc-200 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
                      <Link
                        prefetch={false}
                        href={buildProjectDetailHref(id, {
                          tab: "kandidatai",
                          ...projectLinkOpts,
                          page: 0,
                          ...(autoCandidatesQTrim ? { q: autoCandidatesQTrim } : {}),
                        })}
                        className={[
                          "inline-flex h-full min-w-[6.5rem] items-center justify-center px-4 text-sm font-medium transition-colors",
                          autoCandidateListStatus === "active"
                            ? "bg-[#7C4A57] text-white"
                            : "text-zinc-700 hover:bg-zinc-50",
                        ].join(" ")}
                      >
                        Aktyvūs
                      </Link>
                      <Link
                        prefetch={false}
                        href={buildProjectDetailHref(id, {
                          tab: "kandidatai",
                          ...projectLinkOpts,
                          page: 0,
                          ...(autoCandidatesQTrim ? { q: autoCandidatesQTrim } : {}),
                          candidateStatus: "netinkamas",
                        })}
                        className={[
                          "inline-flex h-full min-w-[6.5rem] items-center justify-center border-l border-zinc-200 px-4 text-sm font-medium transition-colors",
                          autoCandidateListStatus === "netinkamas"
                            ? "bg-[#7C4A57] text-white"
                            : "text-zinc-700 hover:bg-zinc-50",
                        ].join(" ")}
                      >
                        Netinkami
                      </Link>
                    </div>
                    <ListPageSearchForm
                      action={`/projektai/${id}`}
                      defaultQuery={autoCandidatesQTrim}
                      placeholder="Paieška (pavadinimas, kodas, klientas ID)"
                      inputId="crm-project-candidates-search"
                      size="regular"
                      hiddenFields={{
                        tab: "kandidatai",
                        ...(period ? { period: String(period) } : {}),
                        ...(period === "custom" && customFrom ? { from: String(customFrom) } : {}),
                        ...(period === "custom" && customTo ? { to: String(customTo) } : {}),
                        ...(autoCandidateListStatus === "netinkamas" ? { candidateStatus: "netinkamas" } : {}),
                        ...(projectQueryPreserve.completedPage != null && projectQueryPreserve.completedPage > 1
                          ? { completedPage: String(projectQueryPreserve.completedPage) }
                          : {}),
                      }}
                    />
                  </div>
                </CrmListPageControls>
                {candidatesError ? (
                  <CrmListPageMain>
                    <p className="text-sm text-red-600">{candidatesError}</p>
                  </CrmListPageMain>
                ) : (
                  <CrmListPageMain>
                    <p className="mb-2 text-sm text-zinc-600">
                      Rodoma {autoCandidatesShowing.from}–{autoCandidatesShowing.to} iš {autoCandidatesShowing.total}
                      {autoCandidatesTotalPages > 1
                        ? " — likę įrašai kituose puslapiuose (puslapiavimas sąrašo apačioje)."
                        : null}
                    </p>
                    <div className="w-full min-w-0 overflow-hidden rounded-lg border border-zinc-200 bg-white">
                      <ProjectCandidateCallList
                        key={autoCandidateListStatus}
                        mode="pick"
                        projectId={String(p.id ?? id).trim() || id}
                        defaultAssignee={defaultAssignee}
                        candidates={autoCandidatesPageRows}
                        callListPriorityBasis={autoCallListPriorityBasis}
                        listStatus={autoCandidateListStatus}
                      />
                      <SimplePagination
                        basePath={`/projektai/${id}`}
                        pageIndex0={autoCandidatesPageIndex0}
                        totalPages={autoCandidatesTotalPages}
                        extraQuery={{
                          tab: "kandidatai",
                          q: autoCandidatesQTrim || undefined,
                          candidateStatus: autoCandidateListStatus === "netinkamas" ? "netinkamas" : undefined,
                          ...(period ? { period: String(period) } : {}),
                          ...(period === "custom" && customFrom ? { from: String(customFrom) } : {}),
                          ...(period === "custom" && customTo ? { to: String(customTo) } : {}),
                          ...(projectQueryPreserve.completedPage != null && projectQueryPreserve.completedPage > 1
                            ? { completedPage: String(projectQueryPreserve.completedPage) }
                            : {}),
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
          <p className="hidden text-xs text-zinc-500">
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
              href={buildProjectDetailHref(id, { tab: "darbas", view: "board", ...projectLinkOpts })}
              className={
                darbasView === "board"
                  ? "cursor-pointer rounded-lg bg-[#7C4A57] px-3 py-1.5 text-sm font-medium text-white"
                  : "cursor-pointer rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50"
              }
            >
              Lenta
            </Link>
            <Link
              href={buildProjectDetailHref(id, { tab: "darbas", view: "list", ...projectLinkOpts })}
              className={
                darbasView === "list"
                  ? "cursor-pointer rounded-lg bg-[#7C4A57] px-3 py-1.5 text-sm font-medium text-white"
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
            Darbo įrašai, uždaryti užbaigimo rezultatu (įskaitant „Užbaigta“ stulpelyje pasirinktą baigtį). Tą pačią
            dieną uždarytos eilutės matomos „Darbas“ lentoje; čia — nuo kitos dienos.
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
              <div className="w-full min-w-0 overflow-hidden rounded-lg border border-zinc-200 bg-white">
                <ProjectWorkQueueCallList
                  variant="contacted"
                  items={pagedCompletedWorkItems}
                  activitiesByWorkItemId={activitiesByWorkItemId}
                />
                <SimplePagination
                  basePath={`/projektai/${id}`}
                  pageIndex0={completedPageIndex0}
                  totalPages={completedTotalPages}
                  pageQueryParam="completedPage"
                  extraQuery={kontaktuotaPaginationExtra}
                  rangeSummary={
                    completedTotal > 0 && completedTotalPages > 1
                      ? { from: completedRange.from, to: completedRange.to, total: completedRange.total }
                      : undefined
                  }
                  prevNextStyle="wordsLt"
                  ariaLabel="Užbaigtų darbo eilučių puslapiai"
                />
              </div>
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
