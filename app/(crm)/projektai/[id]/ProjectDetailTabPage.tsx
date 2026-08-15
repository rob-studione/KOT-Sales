import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createSupabaseSsrReadOnlyClient } from "@/lib/supabase/ssr";
import { formatDate } from "@/lib/crm/format";
import { getCurrentCrmUser } from "@/lib/crm/currentUser";
import { defaultProjectActor } from "@/lib/crm/projectEnv";
import { fetchSortedCandidatesPageForProject } from "@/lib/crm/projectCandidateQuery";
import { fetchExcludedAutoCandidatesPage } from "@/lib/crm/projectCandidateExclusions";
import {
  fetchProjectFirstActivityDate,
  parseProjectAnalyticsPeriod,
  parseProjectSalesAnalyticsPeriod,
  resolveAnalyticsRange,
} from "@/lib/crm/projectAnalytics";
import { fetchProcurementDashboardAnalytics } from "@/lib/crm/procurementAnalytics";
import {
  buildProjectDetailHref,
  buildProjectPageQueryPreserve,
  parseManualCandidatesStatus,
  parseManualRevenueSort,
  parseProjectCompletedPage1Based,
  type ProjectDetailTab,
} from "@/lib/crm/projectPageSearchParams";
import type { ManualLeadRevenueSort } from "@/lib/crm/projectManualLeads";
import { loadProjectDetailCore } from "@/lib/crm/projectDetailLoad";
import type { SnapshotCandidateRow } from "@/lib/crm/projectSnapshot";
import { ProjectCandidateCallList } from "@/components/crm/ProjectCandidateCallList";
import { CrmListPageControls, CrmListPageIntro, CrmListPageMain } from "@/components/crm/CrmListPageLayout";
import { CrmTableContainer } from "@/components/crm/CrmTableContainer";
import { ProjectWorkBoardClientWrapper } from "@/components/crm/ProjectWorkBoardClientWrapper";
import { ProjectWorkQueueCallList } from "@/components/crm/ProjectWorkQueueCallList";
import { CompletedWorkItemsToolbar } from "@/components/crm/CompletedWorkItemsToolbar";
import { ProcurementAnalyticsView } from "@/components/crm/project-analytics/ProcurementAnalyticsView";
import { ProjectOverviewCritical } from "@/components/crm/project-analytics/ProjectOverviewCritical";
import {
  ProjectOverviewSalesSection,
  ProjectOverviewSalesSectionFallback,
} from "@/components/crm/project-analytics/ProjectOverviewDeferred";
import {
  ProjectPajamosPanel,
  ProjectPajamosPanelFallback,
} from "@/components/crm/project-analytics/ProjectPajamosPanel";
import { ProjectOverviewSkeleton } from "@/components/crm/project-analytics/ProjectOverviewSkeleton";
import { Suspense } from "react";
import {
  fetchManualProjectCandidatesPage,
  type ManualCandidatePageRow,
} from "@/lib/crm/projectManualLeads";
import { fetchCompletedWorkItemsPage } from "@/lib/crm/projectCompletedWorkItems";
import {
  enrichDarbasWorkItems,
  loadActivitiesByWorkItemIds,
  PROJECT_WORK_ITEM_CLOSED_STATUSES,
  PROJECT_WORK_ITEM_COMPLETED_TAB_STATUSES,
  recentWorkUpdatedSinceIso,
} from "@/lib/crm/projectWorkItemsLoad";
import { isProjectWorkItemClosed } from "@/lib/crm/projectBoardConstants";
import { isUžbaigtaSameDayCompletionOnDarbas, vilniusTodayDateString } from "@/lib/crm/projectWorkBoardDoneDate";
import type { ProjectWorkItemDto } from "@/lib/crm/projectWorkItemDto";
import type { ProjectWorkItemActivityDto } from "@/lib/crm/projectWorkItemActivityDto";
import {
  isMissingWorkItemSourceColumnsError,
  PROJECT_WORK_ITEMS_SELECT_LEGACY,
  PROJECT_WORK_ITEMS_SELECT_WITH_SOURCE,
} from "@/lib/crm/projectWorkItemColumns";
import { CandidatesListStatusToggle } from "@/components/crm/CandidatesListStatusToggle";
import { ManualProjectCandidatesFiltersBar } from "@/components/crm/ManualProjectCandidatesFiltersBar";
import { ManualProjectCandidatesPanel } from "@/components/crm/ManualProjectCandidatesPanel";
import { ProcurementContractsPanel } from "@/components/crm/ProcurementContractsPanel";
import {
  fetchProcurementContractsCount,
  fetchProcurementContractsForProject,
  type ProcurementContractRow,
} from "@/lib/crm/procurementContracts";
import {
  fetchBlockedProcurementContractIds,
  fetchProcurementInvalidOrgKeys,
  groupProcurementContractsByOrg,
  type ProcurementOrgGroup,
} from "@/lib/crm/procurementOrgGrouping";
import { isManualProjectType, isProcurementProjectType, projectTypeFromDbRow } from "@/lib/crm/projectType";
import {
  clampPageIndex0,
  parsePageIndex0,
  parsePageSize,
  showingRange1Based,
  totalPagesFromCount,
} from "@/lib/crm/pagination";
import { SimplePagination } from "@/components/crm/SimplePagination";
import { ListPageSearchForm } from "@/components/crm/ListPageSearchForm";
import { RoutePerfMarker } from "@/components/crm/RoutePerfMarker";

function projectDetailHrefToQueryRecord(href: string): Record<string, string> {
  const i = href.indexOf("?");
  if (i < 0) return {};
  return Object.fromEntries(new URLSearchParams(href.slice(i + 1)).entries());
}

export type ProjectDetailTabPageSearchParams = {
  view?: string | string[];
  period?: string | string[];
  from?: string | string[];
  to?: string | string[];
  salesPeriod?: string | string[];
  salesFrom?: string | string[];
  salesTo?: string | string[];
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
  /** Paieška skirtuke „Užbaigta“. */
  completedQ?: string | string[];
  /** Baigties statuso filtras skirtuke „Užbaigta“. */
  completedStatus?: string | string[];
  /** Cold leads rikiavimas: revenue_desc | revenue_asc. */
  sort?: string | string[];
};

/**
 * Vieno projekto skirtuko turinys. Antraštę + skirtukų navigaciją renderina `layout.tsx` —
 * šis komponentas atsakingas tik už duomenų įkėlimą ir konkretaus `tab` panelės turinį.
 * `tab` visada ateina kaip prop (iš thin `page.tsx` failo pagal URL segmentą), o ne iš searchParams.
 */
export async function ProjectDetailTabPage({
  id,
  tab,
  searchParams: sp,
}: {
  id: string;
  tab: ProjectDetailTab;
  searchParams: ProjectDetailTabPageSearchParams;
}) {
  const perfT0 = Date.now();
  const perf: Record<string, number> = {};
  let roundTripCount = 0;
  const markMs = (k: string, ms: number) => {
    perf[k] = (perf[k] ?? 0) + ms;
  };

  const viewRaw = typeof sp.view === "string" ? sp.view : "";
  const darbasView = viewRaw === "list" ? "list" : "board";

  const periodRaw = typeof sp.period === "string" ? sp.period : undefined;
  const period = parseProjectAnalyticsPeriod(periodRaw);
  const customFrom = typeof sp.from === "string" ? sp.from : undefined;
  const customTo = typeof sp.to === "string" ? sp.to : undefined;
  const salesPeriodRaw = typeof sp.salesPeriod === "string" ? sp.salesPeriod : undefined;
  const salesPeriod = parseProjectSalesAnalyticsPeriod(salesPeriodRaw);
  const salesFrom = typeof sp.salesFrom === "string" ? sp.salesFrom : undefined;
  const salesTo = typeof sp.salesTo === "string" ? sp.salesTo : undefined;

  // Be `period` URL — kanoninis default `today`.
  if (tab === "apzvalga" && !periodRaw) {
    const q = new URLSearchParams();
    q.set("period", "today");
    if (salesPeriodRaw) {
      q.set("salesPeriod", salesPeriod);
      if (salesPeriod === "custom" && salesFrom && salesTo) {
        q.set("salesFrom", salesFrom);
        q.set("salesTo", salesTo);
      }
    }
    const preserve = buildProjectPageQueryPreserve(sp);
    if (preserve.page != null && preserve.page > 0) q.set("page", String(preserve.page));
    if (preserve.pageSize != null) q.set("pageSize", String(preserve.pageSize));
    if (preserve.q) q.set("q", preserve.q);
    if (preserve.status) q.set("status", preserve.status);
    if (preserve.candidateStatus) q.set("candidateStatus", preserve.candidateStatus);
    if (preserve.revenueSort === "revenue_asc") q.set("sort", "revenue_asc");
    if (preserve.completedPage != null && preserve.completedPage > 1) {
      q.set("completedPage", String(preserve.completedPage));
    }
    if (preserve.completedQ) q.set("completedQ", preserve.completedQ);
    if (preserve.completedStatus) q.set("completedStatus", preserve.completedStatus);
    redirect(`/projektai/${id}/apzvalga?${q.toString()}`);
  }

  // Pajamos — atskiras salesPeriod (default visas laikotarpis), ne Apžvalgos veiklos `period=today`.
  if (tab === "pajamos" && !salesPeriodRaw) {
    const q = new URLSearchParams();
    // Senas `?period=` ant Pajamų: week/today = sticky iš Apžvalgos → all_time; kitaip perkeliam.
    const legacy =
      periodRaw && periodRaw !== "week" && periodRaw !== "today" ? periodRaw : "all_time";
    q.set("salesPeriod", legacy);
    if (legacy === "custom" && customFrom && customTo) {
      q.set("salesFrom", customFrom);
      q.set("salesTo", customTo);
    }
    redirect(`/projektai/${id}/pajamos?${q.toString()}`);
  }

  // Periodą URL'e laikome tik apžvalgai / pajamoms — ne Darbas/Kandidatai (senas today nebesikabina).
  const analyticsLinkOpts =
    tab === "pajamos"
      ? {
          salesPeriod,
          ...(salesPeriod === "custom" && salesFrom && salesTo
            ? { salesFrom, salesTo }
            : {}),
        }
      : {
          period,
          ...(period === "custom" && customFrom && customTo ? { from: customFrom, to: customTo } : {}),
          salesPeriod,
          ...(salesPeriod === "custom" && salesFrom && salesTo
            ? { salesFrom, salesTo }
            : {}),
        };
  const qOpts = tab === "apzvalga" || tab === "pajamos" ? analyticsLinkOpts : {};
  const projectQueryPreserve = buildProjectPageQueryPreserve(sp);
  const projectLinkOpts = { ...qOpts, ...projectQueryPreserve };

  let supabase: Awaited<ReturnType<typeof createSupabaseSsrReadOnlyClient>>;
  try {
    supabase = await createSupabaseSsrReadOnlyClient();
  } catch (e) {
    const message = e instanceof Error ? e.message : "Klaida";
    return <p className="text-sm text-red-600">Supabase nekonfigūruotas. {message}</p>;
  }

  // Project row + current user in parallel (shared cached Auth session).
  roundTripCount += 3;
  const [{ project, projectError: pErr }, currentCrm] = await Promise.all([
    loadProjectDetailCore(id),
    getCurrentCrmUser(),
  ]);

  if (pErr || !project) {
    if (pErr) {
      return <p className="text-sm text-red-600">Nepavyko įkelti projekto: {pErr}</p>;
    }
    notFound();
  }

  const p = project;
  // Tik veiklos `period=all_time` blokuoja shell'ą (ne Pajamos — ten Suspense viduje).
  const allTimeFrom =
    period === "all_time" && tab !== "pajamos" ? await fetchProjectFirstActivityDate(supabase, id) : null;
  const analyticsRange = resolveAnalyticsRange(period, customFrom, customTo, allTimeFrom);
  const salesAnalyticsRangePreview = resolveAnalyticsRange(salesPeriod, salesFrom, salesTo, null);
  const defaultAssignee = currentCrm?.id ?? defaultProjectActor();
  const pt = projectTypeFromDbRow(p) ?? p.project_type;
  const isManual = isManualProjectType(pt);
  const isProcurement = isProcurementProjectType(pt);

  const PROCUREMENT_PAGE_TABS = new Set<ProjectDetailTab>(["apzvalga", "sutartys", "darbas", "kontaktuota"]);
  if (isProcurement && !PROCUREMENT_PAGE_TABS.has(tab)) {
    redirect(
      buildProjectDetailHref(id, {
        tab: "sutartys",
        ...projectLinkOpts,
      })
    );
  }

  const candidateStatusRaw = typeof sp.candidateStatus === "string" ? sp.candidateStatus : undefined;
  const autoCandidateListStatus: "active" | "netinkamas" = parseManualCandidatesStatus(candidateStatusRaw);
  const manualCandidateListStatus: "active" | "netinkamas" = parseManualCandidatesStatus(candidateStatusRaw);

  let candidatesError: string | null = null;
  const candidatesT0 = Date.now();

  const AUTO_CANDIDATES_PAGE_SIZE = 20;
  const autoCandidatesQTrim =
    !isManual && !isProcurement && tab === "kandidatai" ? (typeof sp.q === "string" ? sp.q.trim() : "") : "";
  const requestedAutoCandidatesPageIndex0 =
    !isManual && !isProcurement && tab === "kandidatai" ? parsePageIndex0(sp.page) : 0;

  let autoCandidatesTotalCount = 0;
  let autoCandidatesTotalPages = 0;
  let autoCandidatesPageIndex0 = 0;
  let autoCandidatesShowing = { from: 0, to: 0, total: 0 };
  let autoCandidatesPageRows: SnapshotCandidateRow[] = [];
  let autoCallListPriorityBasis: { total: number; rankByClientKey: Record<string, number> } | undefined;

  if (!isManual && !isProcurement && tab === "kandidatai" && autoCandidateListStatus === "active") {
    const pageRes = await fetchSortedCandidatesPageForProject(supabase, p, {
      pageIndex0: requestedAutoCandidatesPageIndex0,
      pageSize: AUTO_CANDIDATES_PAGE_SIZE,
      search: autoCandidatesQTrim || null,
    });
    if (!pageRes.ok) {
      candidatesError = pageRes.error;
    } else {
      autoCandidatesTotalCount = pageRes.data.totalCount;
      autoCandidatesTotalPages = totalPagesFromCount(autoCandidatesTotalCount, AUTO_CANDIDATES_PAGE_SIZE);
      autoCandidatesPageIndex0 = clampPageIndex0(requestedAutoCandidatesPageIndex0, autoCandidatesTotalPages);
      autoCandidatesPageRows = pageRes.data.rows;
      autoCandidatesShowing = showingRange1Based(
        autoCandidatesPageIndex0,
        AUTO_CANDIDATES_PAGE_SIZE,
        autoCandidatesTotalCount
      );
      // Globalus rank pagal tą pačią sort tvarką (offset + vietą puslapyje).
      if (autoCandidatesPageIndex0 === requestedAutoCandidatesPageIndex0) {
        const offset = autoCandidatesPageIndex0 * AUTO_CANDIDATES_PAGE_SIZE;
        const rankByClientKey: Record<string, number> = {};
        for (let i = 0; i < autoCandidatesPageRows.length; i++) {
          const ck = autoCandidatesPageRows[i]?.client_key;
          if (ck) rankByClientKey[ck] = offset + i + 1;
        }
        autoCallListPriorityBasis = { total: autoCandidatesTotalCount, rankByClientKey };
      }
    }
  }

  if (!isManual && !isProcurement && tab === "kandidatai" && autoCandidateListStatus === "netinkamas") {
    const ex = await fetchExcludedAutoCandidatesPage(supabase, id, requestedAutoCandidatesPageIndex0, AUTO_CANDIDATES_PAGE_SIZE, {
      search: autoCandidatesQTrim || null,
    });
    autoCandidatesTotalCount = ex.totalCount;
    autoCandidatesTotalPages = totalPagesFromCount(autoCandidatesTotalCount, AUTO_CANDIDATES_PAGE_SIZE);
    autoCandidatesPageIndex0 = clampPageIndex0(requestedAutoCandidatesPageIndex0, autoCandidatesTotalPages);
    autoCandidatesShowing = showingRange1Based(autoCandidatesPageIndex0, AUTO_CANDIDATES_PAGE_SIZE, autoCandidatesTotalCount);
    autoCandidatesPageRows = ex.rows;
    const offset = autoCandidatesPageIndex0 * AUTO_CANDIDATES_PAGE_SIZE;
    const rankByClientKey: Record<string, number> = {};
    for (let i = 0; i < autoCandidatesPageRows.length; i++) {
      const ck = autoCandidatesPageRows[i]?.client_key;
      if (ck) rankByClientKey[ck] = offset + i + 1;
    }
    autoCallListPriorityBasis = { total: autoCandidatesTotalCount, rankByClientKey };
  }

  if (!isManual && !isProcurement && tab === "kandidatai") {
    markMs("candidatesRpcMs", Date.now() - candidatesT0);
  }

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
  const sortRaw = Array.isArray(sp.sort) ? sp.sort[0] : sp.sort;
  const manualRevenueSort: ManualLeadRevenueSort = isManual
    ? parseManualRevenueSort(typeof sortRaw === "string" ? sortRaw : undefined)
    : "revenue_desc";
  const manualRpcFilters = {
    candidateStatus: manualCandidateListStatus,
    search: manualSearchFilter,
    revenueSort: manualRevenueSort,
  };

  let manualCandidatesTotal = 0;
  let manualCandidatesPage: { rows: ManualCandidatePageRow[]; totalCount: number } = { rows: [], totalCount: 0 };
  let manualPageIndex0 = 0;
  let manualTotalPages = 0;
  let manualShowingFrom = 0;
  let manualShowingTo = 0;

  if (isManual && tab === "kandidatai") {
    const manualT0 = Date.now();
    const first = await fetchManualProjectCandidatesPage(
      supabase,
      id,
      requestedManualPageIndex0,
      manualCandidatesPageSize,
      manualRpcFilters
    );
    markMs("candidatesRpcMs", Date.now() - manualT0);
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
          ...(manualRevenueSort !== "revenue_desc" ? { revenueSort: manualRevenueSort } : {}),
        })
      );
    }
    manualCandidatesPage = first;
    const sr = showingRange1Based(manualPageIndex0, manualCandidatesPageSize, manualCandidatesTotal);
    manualShowingFrom = sr.from;
    manualShowingTo = sr.to;
  }

  let procurementContractsTotal = 0;
  let procurementOrgGroupsTotal = 0;
  let procurementContracts: ProcurementContractRow[] = [];
  let procurementOrgGroups: ProcurementOrgGroup[] = [];
  let procurementContractsValueSumEur = 0;
  let procurementFilterOptions: { organizations: string[]; suppliers: string[]; types: string[] } = {
    organizations: [],
    suppliers: [],
    types: [],
  };
  const procurementT0 = 0;
  let procurementOpenPickedContractIds: string[] = [];
  let procurementListStatus: "active" | "netinkamas" = "active";
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

    procurementListStatus = parseManualCandidatesStatus(
      typeof sp.candidateStatus === "string" ? sp.candidateStatus : undefined
    );

    // Aktyvūs: slepiame darbe/užbaigtas + netinkamas. Netinkamos: rodome tik exclusions.
    roundTripCount += 1;
    const blocked = await fetchBlockedProcurementContractIds(supabase, id, {
      includeInvalidExclusions: procurementListStatus === "active",
    });
    const workAndInvalidExcludeIds = blocked.ok ? blocked.contractIds : [];
    procurementOpenPickedContractIds = workAndInvalidExcludeIds;

    const invalidKeysRes = await fetchProcurementInvalidOrgKeys(supabase, id);
    const invalidOrgKeys = new Set(invalidKeysRes.ok ? invalidKeysRes.orgKeys : []);

    const pc = await fetchProcurementContractsCount(supabase, id);
    if (pc.ok) procurementContractsTotal = pc.count;

    const filters = {
      q: searchQ || null,
      organizationNames: filterOrgs,
      suppliers: filterSuppliers,
      types: filterTypes,
      validFrom,
      validTo,
      excludeIds: procurementListStatus === "active" ? workAndInvalidExcludeIds : [],
    };

    const full = await fetchProcurementContractsForProject(supabase, id, { sortBy, sortDir, filters });
    let allRows = full.ok ? full.rows : [];
    let allGroups = groupProcurementContractsByOrg(allRows, { sortBy, sortDir });
    if (procurementListStatus === "netinkamas") {
      allGroups = allGroups.filter((g) => invalidOrgKeys.has(g.orgKey));
      allRows = allGroups.flatMap((g) => g.contracts);
    }
    procurementOrgGroupsTotal = allGroups.length;
    procurementContractsTotal = allRows.length;
    let valueSum = 0;
    for (const g of allGroups) valueSum += g.totalValueEur;
    procurementContractsValueSumEur = valueSum;

    if (procurementShowAll) {
      procurementOrgGroups = allGroups;
      procurementContracts = allRows;
    } else {
      const requestedProcPageIndex0 = parsePageIndex0(sp.page);
      const procPageSize = parsePageSize(sp.pageSize);
      const procTotalPages = totalPagesFromCount(procurementOrgGroupsTotal, procPageSize);
      const procPageIndex0 = clampPageIndex0(requestedProcPageIndex0, procTotalPages);
      if (procPageIndex0 !== requestedProcPageIndex0) {
        redirect(
          buildProjectDetailHref(id, {
            tab: "sutartys",
            ...projectLinkOpts,
            page: procPageIndex0,
            pageSize: procPageSize,
            ...(procurementListStatus === "netinkamas" ? { candidateStatus: "netinkamas" as const } : {}),
          })
        );
      }
      const start = procPageIndex0 * procPageSize;
      procurementOrgGroups = allGroups.slice(start, start + procPageSize);
      procurementContracts = procurementOrgGroups.flatMap((g) => g.contracts);
    }

    // Filter options: all contracts excluding blocked orgs.
    roundTripCount += 1;
    let optsQ = supabase
      .from("project_procurement_contracts")
      .select("organization_name,supplier,type")
      .eq("project_id", id)
      .order("valid_until", { ascending: true })
      .limit(5000);
    if (workAndInvalidExcludeIds.length > 0) {
      optsQ = optsQ.not(
        "id",
        "in",
        `(${workAndInvalidExcludeIds.map((x) => `"${x.replaceAll('"', "")}"`).join(",")})`
      );
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
  }
  if (isProcurement && tab === "sutartys") {
    markMs("procurementMs", 0 - procurementT0);
  }

  let workRaw: Record<string, unknown>[] = [];
  let wErr: { message?: string } | null = null;
  let completedPageRpc: Awaited<ReturnType<typeof fetchCompletedWorkItemsPage>> | null = null;
  const UŽBAIGTA_PAGE_SIZE = 20;
  const completedQRaw = typeof sp.completedQ === "string" ? sp.completedQ.trim() : "";
  const completedStatusRaw = typeof sp.completedStatus === "string" ? sp.completedStatus.trim() : "";
  const requestedCompleted1 = parseProjectCompletedPage1Based(
    typeof sp.completedPage === "string" ? sp.completedPage : undefined
  );

  if (tab === "kontaktuota") {
    completedPageRpc = await fetchCompletedWorkItemsPage(supabase, id, {
      pageIndex0: Math.max(0, requestedCompleted1 - 1),
      pageSize: UŽBAIGTA_PAGE_SIZE,
      search: completedQRaw || null,
      status: completedStatusRaw || null,
    });
    if (!completedPageRpc.ok) {
      return <p className="text-sm text-red-600">Nepavyko įkelti užbaigtų: {completedPageRpc.error}</p>;
    }
  } else if (tab === "darbas") {
    const selectWithSource = PROJECT_WORK_ITEMS_SELECT_WITH_SOURCE;
    const selectLegacy = PROJECT_WORK_ITEMS_SELECT_LEGACY;

    async function loadWorkBySelect(select: string) {
      // Darbas: atviros + neseniai atnaujintos uždarytos (same-day Užbaigta kandidatai).
      const recentSince = recentWorkUpdatedSinceIso(36);
      roundTripCount += 2;
      const closedInFilter = `(${PROJECT_WORK_ITEM_CLOSED_STATUSES.map((s) => `"${s.replace(/"/g, "")}"`).join(",")})`;
      const [openRes, recentClosedRes] = await Promise.all([
        supabase
          .from("project_work_items")
          .select(select)
          .eq("project_id", id)
          .not("result_status", "in", closedInFilter)
          .order("picked_at", { ascending: false }),
        supabase
          .from("project_work_items")
          .select(select)
          .eq("project_id", id)
          .in("result_status", [...PROJECT_WORK_ITEM_COMPLETED_TAB_STATUSES])
          .gte("work_updated_at", recentSince)
          .order("picked_at", { ascending: false }),
      ]);
      if (openRes.error) return openRes;
      if (recentClosedRes.error) return recentClosedRes;
      const byId = new Map<string, Record<string, unknown>>();
      for (const r of (openRes.data ?? []) as unknown as Record<string, unknown>[]) {
        byId.set(String(r.id), r);
      }
      for (const r of (recentClosedRes.data ?? []) as unknown as Record<string, unknown>[]) {
        byId.set(String(r.id), r);
      }
      return {
        data: Array.from(byId.values()) as unknown as typeof openRes.data,
        error: null,
      };
    }

    let res = await loadWorkBySelect(selectWithSource);
    if (res.error && isMissingWorkItemSourceColumnsError(res.error)) {
      res = await loadWorkBySelect(selectLegacy);
    }
    workRaw = (res.data ?? []) as unknown as Record<string, unknown>[];
    wErr = res.error ? { message: res.error.message } : null;
  }

  if (wErr) {
    return <p className="text-sm text-red-600">Nepavyko įkelti darbo eilučių: {String(wErr.message ?? "Klaida")}</p>;
  }

  const mapWorkRow = (row: Record<string, unknown>): ProjectWorkItemDto => {
    const st = row.source_type;
    return {
      id: String(row.id),
      source_type:
        st === "auto" || st === "manual_lead" || st === "linked_client" || st === "procurement_contract"
          ? st
          : null,
      source_id: row.source_id != null ? String(row.source_id) : null,
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
  };

  let workItemsAll: ProjectWorkItemDto[] = workRaw.map(mapWorkRow);

  const todayVilniusEarly = vilniusTodayDateString();
  let activitiesByWorkItemId: Record<string, ProjectWorkItemActivityDto[]> = {};

  if (tab === "darbas") {
    const enriched = await enrichDarbasWorkItems(supabase, workItemsAll);
    workItemsAll = enriched.workItems;
    activitiesByWorkItemId = enriched.activitiesByWorkItemId;
    markMs("activitiesMs", enriched.timings.activitiesMs);
    markMs("kanbanClientLiveLookupMs", enriched.timings.liveMs);
    markMs("darbasEnrichParallelMs", enriched.timings.parallelMs);
  }

  // Display fix: show live (all-time) revenue in Kanban/list even for older picked items.
  // Snapshot rows in DB are immutable by design, so we only override for rendering.
  if (tab === "pajamos") {
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
  }

  /** „Darbas“: atviros eilutės, taip pat šiandien (Vilnius) Užbaigta uždarytos — lenta iki dienos pabaigos. */
  const todayVilnius = todayVilniusEarly;

  const workItems =
    tab === "darbas"
      ? workItemsAll.filter(
          (w) =>
            !isProjectWorkItemClosed(w.result_status) ||
            isUžbaigtaSameDayCompletionOnDarbas(w, activitiesByWorkItemId[w.id], todayVilnius)
        )
      : [];

  // —— Užbaigta (kontaktuota): paged RPC ——
  let completedWorkItemsEmptyProject = false;
  let completedAfterSearchCount = 0;
  let completedStatusCounts: Array<{ status: string; count: number }> = [];
  let completedStatusActive = "";
  let filteredCompletedWorkItems: ProjectWorkItemDto[] = [];
  let pagedCompletedWorkItems: ProjectWorkItemDto[] = [];
  let completedTotal = 0;
  let completedTotalPages = 0;
  let completedPageIndex0 = 0;
  let completedRange = { from: 0, to: 0, total: 0 };

  if (tab === "kontaktuota" && completedPageRpc?.ok) {
    const rpcData = completedPageRpc.data;
    completedAfterSearchCount = rpcData.totalAfterSearch;
    completedStatusCounts = rpcData.statusCounts;
    completedStatusActive =
      completedStatusRaw && completedStatusCounts.some((s) => s.status === completedStatusRaw)
        ? completedStatusRaw
        : "";

    if (completedStatusRaw && !completedStatusActive) {
      const { completedStatus: _dropStatus, completedPage: _dropPage, ...pl } = projectLinkOpts;
      redirect(
        buildProjectDetailHref(id, {
          ...pl,
          tab: "kontaktuota",
          completedQ: completedQRaw || undefined,
        })
      );
    }

    completedTotal = rpcData.filteredTotal;
    completedTotalPages = totalPagesFromCount(completedTotal, UŽBAIGTA_PAGE_SIZE);
    const safeCompleted1 =
      completedTotal === 0
        ? 1
        : Math.min(Math.max(1, requestedCompleted1), Math.max(1, completedTotalPages));

    if (completedTotal === 0 && requestedCompleted1 > 1) {
      const { completedPage: _drop, ...pl } = projectLinkOpts;
      if (_drop != null) {
        redirect(
          buildProjectDetailHref(id, {
            ...pl,
            tab: "kontaktuota",
            completedQ: completedQRaw || undefined,
            completedStatus: completedStatusActive || undefined,
          })
        );
      }
    }

    if (completedTotal > 0 && safeCompleted1 !== requestedCompleted1) {
      redirect(
        buildProjectDetailHref(id, {
          ...projectLinkOpts,
          tab: "kontaktuota",
          completedPage: safeCompleted1,
          completedQ: completedQRaw || undefined,
          completedStatus: completedStatusActive || undefined,
        })
      );
    }

    pagedCompletedWorkItems = rpcData.rows;
    filteredCompletedWorkItems = rpcData.rows;
    completedPageIndex0 = safeCompleted1 - 1;
    completedRange = showingRange1Based(completedPageIndex0, UŽBAIGTA_PAGE_SIZE, completedTotal);

    if (completedAfterSearchCount === 0 && !completedQRaw) {
      const { count } = await supabase
        .from("project_work_items")
        .select("id", { count: "exact", head: true })
        .eq("project_id", id);
      completedWorkItemsEmptyProject = !count || count === 0;
    }

    activitiesByWorkItemId = await loadActivitiesByWorkItemIds(
      supabase,
      pagedCompletedWorkItems.map((w) => w.id)
    );
  }

  const { completedPage: _omitKontatsuota, ...projectLinkForKontaktuotaList } = projectLinkOpts;
  const kontaktuotaPaginationExtra: Record<string, string | undefined> = {
    ...projectDetailHrefToQueryRecord(
      buildProjectDetailHref(id, {
        ...projectLinkForKontaktuotaList,
        tab: "kontaktuota",
        completedQ: completedQRaw || undefined,
        completedStatus: completedStatusActive || undefined,
      })
    ),
  };

  const procurementAnalyticsData =
    tab === "apzvalga" && isProcurement
      ? await fetchProcurementDashboardAnalytics(supabase, id, p.created_at, analyticsRange)
      : null;

  const totalServerMs = Date.now() - perfT0;

  if (process.env.CRM_PERF_LOG === "1") {
    console.info("[CRM perf] /projektai/[id]/[tab] SSR", {
      totalServerMs,
      candidatesRpcMs: perf.candidatesRpcMs ?? 0,
      revenueFeedMs: perf.revenueFeedMs ?? 0,
      procurementMs: perf.procurementMs ?? 0,
      activitiesMs: perf.activitiesMs ?? 0,
      kanbanClientLiveLookupMs: perf.kanbanClientLiveLookupMs ?? 0,
      darbasEnrichParallelMs: perf.darbasEnrichParallelMs ?? 0,
      roundTripCount,
      tab,
    });
  }

  const serverPerfForClient = {
    totalServerMs,
    candidatesRpcMs: perf.candidatesRpcMs ?? 0,
    revenueFeedMs: perf.revenueFeedMs ?? 0,
    procurementMs: perf.procurementMs ?? 0,
    activitiesMs: perf.activitiesMs ?? 0,
    kanbanClientLiveLookupMs: perf.kanbanClientLiveLookupMs ?? 0,
    roundTripCount,
    tab,
  } as const;

  return (
    <div className="min-w-0">
      <RoutePerfMarker routeLabel={`/projektai/[id]/${tab}`} serverPerf={serverPerfForClient} />

      {tab === "apzvalga" && !isProcurement ? (
        <div className="mt-6" role="tabpanel">
          <CrmTableContainer>
            <Suspense fallback={<ProjectOverviewSkeleton />}>
              <ProjectOverviewCritical
                key={`ov-${period}-${analyticsRange.from}-${analyticsRange.to}`}
                projectId={id}
                period={period}
                range={analyticsRange}
              />
            </Suspense>
            <div className="mt-8 space-y-8">
              <section className="overflow-visible rounded-xl border border-zinc-200/80 bg-white p-5 shadow-sm">
                <Suspense
                  fallback={
                    <ProjectOverviewSalesSectionFallback
                      projectId={id}
                      salesPeriod={salesPeriod}
                      rangeFrom={salesAnalyticsRangePreview.from}
                      rangeTo={salesAnalyticsRangePreview.to}
                    />
                  }
                >
                  <ProjectOverviewSalesSection
                    projectId={id}
                    salesPeriod={salesPeriod}
                    salesFrom={salesFrom}
                    salesTo={salesTo}
                  />
                </Suspense>
              </section>
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
                  count={manualCandidatesTotal}
                  description="Cold leads: tik įmonės, kurios niekada nebuvo klientės. Jei atsiranda sąskaita — kandidatas automatiškai išimamas."
                />
                <CrmListPageMain>
                  <div className="w-full min-w-0">
                    <ManualProjectCandidatesPanel
                      key={`${manualCandidateListStatus}-${manualRevenueSort}`}
                      projectId={p.id}
                      pageRows={manualCandidatesPage.rows}
                      totalCount={manualCandidatesTotal}
                      pageIndex0={manualPageIndex0}
                      pageSize={manualCandidatesPageSize}
                      totalPages={manualTotalPages}
                      showingFrom={manualShowingFrom}
                      showingTo={manualShowingTo}
                      paginationBasePath={`/projektai/${id}/kandidatai`}
                      paginationExtraQuery={{
                        ...(manualCandidateListStatus === "netinkamas" ? { candidateStatus: "netinkamas" } : {}),
                        ...(manualQueryTrim !== "" ? { q: manualQueryTrim } : {}),
                        ...(manualRevenueSort !== "revenue_desc" ? { sort: manualRevenueSort } : {}),
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
                          pageSizeHidden={manualCandidatesPageSize !== 20 ? String(manualCandidatesPageSize) : undefined}
                          revenueSort={manualRevenueSort}
                          totalCount={manualCandidatesTotal}
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
                  count={autoCandidatesTotalCount}
                  description="Sąrašas perskaičiuojamas kiekvieną kartą. Jei klientas užsako prieš būdamas paimtas — dingsta iš kandidatų. Jei klientas jau buvo paimtas į „Darbas“ šiame projekte, jis čia neberodomas (nebent darbo eilutė buvo grąžinta į kandidatus)."
                />
                <CrmListPageControls>
                  <div className="flex flex-wrap items-center justify-end gap-4">
                    <CandidatesListStatusToggle
                      projectId={id}
                      currentStatus={autoCandidateListStatus}
                      q={autoCandidatesQTrim || undefined}
                    />
                    <ListPageSearchForm
                      key={`candidates-q-${autoCandidateListStatus}`}
                      action={`/projektai/${id}/kandidatai`}
                      defaultQuery={autoCandidatesQTrim}
                      placeholder="Paieška (pavadinimas, kodas, klientas ID)"
                      inputId="crm-project-candidates-search"
                      size="regular"
                      hiddenFields={{
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
                        basePath={`/projektai/${id}/kandidatai`}
                        pageIndex0={autoCandidatesPageIndex0}
                        totalPages={autoCandidatesTotalPages}
                        extraQuery={{
                          q: autoCandidatesQTrim || undefined,
                          candidateStatus: autoCandidateListStatus === "netinkamas" ? "netinkamas" : undefined,
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
              description="Backlog pagal įstaigą (sutartys — kontekstas). „Priskirti sau“ paima visą įstaigą į darbą vienu kartu."
            />
            <CrmListPageControls>
              <CandidatesListStatusToggle
                projectId={id}
                tab="sutartys"
                currentStatus={procurementListStatus}
                q={typeof sp.q === "string" ? sp.q : undefined}
                pageSize={parsePageSize(sp.pageSize)}
              />
            </CrmListPageControls>
            <CrmListPageMain>
              {(() => {
                const procurementAllRaw = typeof sp.all === "string" ? sp.all : "";
                const procurementShowAll = procurementAllRaw === "1" || procurementAllRaw.toLowerCase() === "true";
                const requestedProcPageIndex0 = parsePageIndex0(sp.page);
                const procPageSize = parsePageSize(sp.pageSize);
                const procTotalPages = totalPagesFromCount(procurementOrgGroupsTotal, procPageSize);
                const procPageIndex0 = clampPageIndex0(requestedProcPageIndex0, procTotalPages);
                const sr = showingRange1Based(procPageIndex0, procPageSize, procurementOrgGroupsTotal);

                const sortBy = typeof sp.sortBy === "string" ? sp.sortBy : "";
                const sortDir = typeof sp.sortDir === "string" ? sp.sortDir : "";
                const org = typeof sp.org === "string" ? sp.org : "";
                const supplier = typeof sp.supplier === "string" ? sp.supplier : "";
                const type = typeof sp.type === "string" ? sp.type : "";
                const validFrom = typeof sp.validFrom === "string" ? sp.validFrom : "";
                const validTo = typeof sp.validTo === "string" ? sp.validTo : "";
                const q = typeof sp.q === "string" ? sp.q : "";

                const baseQuery: Record<string, string> = {
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
                  ...(procurementListStatus === "netinkamas" ? { candidateStatus: "netinkamas" } : {}),
                };

                return (
              <ProcurementContractsPanel
                projectId={id}
                orgGroups={procurementOrgGroups}
                listStatus={procurementListStatus}
                procurementNotifyDaysBefore={Math.min(
                  365,
                  Math.max(0, Number(p.procurement_notify_days_before ?? 14) || 14)
                )}
                defaultAssignee={defaultAssignee}
                openPickedContractIds={procurementOpenPickedContractIds}
                filterOptions={procurementFilterOptions}
                resultsSummary={{
                  orgCount: procurementOrgGroupsTotal,
                  contractCount: procurementContractsTotal,
                  totalValueEur: procurementContractsValueSumEur,
                }}
                pagination={{
                  showAll: procurementShowAll,
                  pageIndex0: procPageIndex0,
                  pageSize: procPageSize,
                  totalCount: procurementOrgGroupsTotal,
                  totalPages: procTotalPages,
                  showingFrom: sr.from,
                  showingTo: sr.to,
                  basePath: `/projektai/${id}/sutartys`,
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
            {!completedQRaw && completedAfterSearchCount === 0 ? (
              <div className="rounded-lg border border-dashed border-zinc-200 bg-zinc-50/50 px-6 py-12 text-center text-sm text-zinc-500">
                {completedWorkItemsEmptyProject
                  ? isProcurement
                    ? "Dar nėra darbo įrašų — eikite į „Sutartys“."
                    : "Dar nėra darbo įrašų — eikite į „Kandidatai“."
                  : "Nėra užbaigtų įrašų šiame projekte."}
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <CompletedWorkItemsToolbar
                  projectId={id}
                  totalAfterSearch={completedAfterSearchCount}
                  statusCounts={completedStatusCounts}
                  completedQ={completedQRaw}
                  completedStatus={completedStatusActive}
                  linkPreserve={{
                    q: projectLinkOpts.q,
                    candidateStatus: projectLinkOpts.candidateStatus,
                    page: projectLinkOpts.page,
                    pageSize: projectLinkOpts.pageSize,
                  }}
                />
                {filteredCompletedWorkItems.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-zinc-200 bg-zinc-50/50 px-6 py-12 text-center text-sm text-zinc-500">
                    Pagal paiešką / filtrą įrašų nerasta.
                  </div>
                ) : (
                  <div className="w-full min-w-0 overflow-hidden rounded-lg border border-zinc-200 bg-white p-2 sm:p-3">
                    <ProjectWorkQueueCallList
                      variant="contacted"
                      items={pagedCompletedWorkItems}
                      activitiesByWorkItemId={activitiesByWorkItemId}
                    />
                    <SimplePagination
                      basePath={`/projektai/${id}/kontaktuota`}
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
            )}
          </div>
        </div>
      ) : null}

      {tab === "pajamos" ? (
        <div className="mt-4" role="tabpanel">
          <Suspense
            fallback={
              <ProjectPajamosPanelFallback
                projectId={id}
                period={salesPeriod}
                rangeFrom={salesAnalyticsRangePreview.from}
                rangeTo={salesAnalyticsRangePreview.to}
              />
            }
          >
            <ProjectPajamosPanel
              key={`pajamos-${salesPeriod}-${salesFrom ?? ""}-${salesTo ?? ""}`}
              projectId={id}
              period={salesPeriod}
              from={salesFrom}
              to={salesTo}
            />
          </Suspense>
        </div>
      ) : null}
    </div>
  );
}
