import { parsePageIndex0, parsePageSize, type PageSize } from "@/lib/crm/pagination";

/** Bendri projekto puslapio query parametrai (skirtukai + apžvalgos periodas). */

export type ManualCandidateListStatus = "active" | "netinkamas";

/** ?candidateStatus= — manual kandidatų rodinio būsena; default: active. */
export function parseManualCandidatesStatus(raw: string | undefined): ManualCandidateListStatus {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (s === "netinkamas") return "netinkamas";
  return "active";
}

export type ProjectDetailTab = "apzvalga" | "kandidatai" | "sutartys" | "darbas" | "kontaktuota" | "pajamos";

export type ProjectAutoCandidatesListStatus = "active" | "netinkamas";

export function parseProjectDetailTab(raw: string | undefined): ProjectDetailTab {
  if (
    raw === "kandidatai" ||
    raw === "sutartys" ||
    raw === "darbas" ||
    raw === "kontaktuota" ||
    raw === "pajamos"
  )
    return raw;
  return "apzvalga";
}

/** Tab id === URL path segmentas (`/projektai/[id]/[segmentas]`); ateityje gali skirtis, todėl per šią funkciją. */
export function projectDetailTabPathSegment(tab: ProjectDetailTab): string {
  return tab;
}

/** Atvirkščiai — path segmentas → vidinis tab id (default: apzvalga, jei nežinomas). */
export function parseProjectDetailTabFromPath(segment: string | undefined): ProjectDetailTab {
  return parseProjectDetailTab(segment);
}

/**
 * 1-based puslapiavimas „Užbaigta“ (kontaktuota) skirtuke; pirmas puslapis = 1, ne `completedPage` neįdedamas.
 */
export function parseProjectCompletedPage1Based(raw: string | undefined): number {
  if (raw == null || raw === "") return 1;
  const n = parseInt(String(raw).trim(), 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, 1_000_000);
}

/**
 * Išlaikyti kandidatų / užbaigtų / paieškos parametrus keičiant tab’us (sujungiama su apžvalgos `period`).
 */
export function buildProjectPageQueryPreserve(sp: {
  page?: string | string[];
  pageSize?: string | string[];
  q?: string | string[];
  status?: string | string[];
  candidateStatus?: string | string[];
  completedPage?: string | string[];
  completedQ?: string | string[];
  completedStatus?: string | string[];
}): {
  page?: number;
  pageSize?: number;
  q?: string;
  status?: string;
  candidateStatus?: ProjectAutoCandidatesListStatus;
  completedPage?: number;
  completedQ?: string;
  completedStatus?: string;
} {
  const pageRaw = Array.isArray(sp.page) ? sp.page[0] : sp.page;
  const page0 = parsePageIndex0(pageRaw);
  const pSize: PageSize = parsePageSize(Array.isArray(sp.pageSize) ? sp.pageSize[0] : sp.pageSize);
  const out: {
    page?: number;
    pageSize?: number;
    q?: string;
    status?: string;
    candidateStatus?: ProjectAutoCandidatesListStatus;
    completedPage?: number;
    completedQ?: string;
    completedStatus?: string;
  } = {};
  if (page0 > 0) out.page = page0;
  if (pSize !== 20) out.pageSize = pSize;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  if (q) out.q = q;
  const status = typeof sp.status === "string" ? sp.status.trim() : "";
  if (status) out.status = status;
  if (typeof sp.candidateStatus === "string" && sp.candidateStatus === "netinkamas") {
    out.candidateStatus = "netinkamas";
  }
  const c1 = parseProjectCompletedPage1Based(
    Array.isArray(sp.completedPage) ? sp.completedPage[0] : sp.completedPage
  );
  if (c1 > 1) out.completedPage = c1;
  const completedQ = typeof sp.completedQ === "string" ? sp.completedQ.trim() : "";
  if (completedQ) out.completedQ = completedQ;
  const completedStatus = typeof sp.completedStatus === "string" ? sp.completedStatus.trim() : "";
  if (completedStatus) out.completedStatus = completedStatus;
  return out;
}

export function buildProjectDetailHref(
  projectId: string,
  opts: {
    tab: ProjectDetailTab;
    view?: "board" | "list";
    period?: string;
    from?: string;
    to?: string;
    /** Apžvalgos „Pardavimai“ periodo filtrai (atskiri nuo veiklos `period`). */
    salesPeriod?: string;
    salesFrom?: string;
    salesTo?: string;
    /** 0-based; jei > 0 – įdedamas į URL (skirtukas „Kandidatai“ puslapiavimui). */
    page?: number;
    pageSize?: number;
    /** Papildomas rankinio projekto query parametras (paliktas suderinamumui). */
    status?: string;
    /** Auto kandidatų sąrašo filtras (default: active). */
    candidateStatus?: ProjectAutoCandidatesListStatus;
    /** Paieška (company_name / company_code). */
    q?: string;
    /**
     * 1-based, skirtukas „Užbaigta“ (kontaktuota) sąrašui. Jei 1, query ne įdedamas.
     * Kiti tab’ai perduoda `...buildProjectPageQueryPreserve` kad išsaugotų reikšmę.
     */
    completedPage?: number;
    /** Paieška skirtuke „Užbaigta“. */
    completedQ?: string;
    /** Baigties `result_status` filtras skirtuke „Užbaigta“. */
    completedStatus?: string;
  }
): string {
  const params = new URLSearchParams();
  if (opts.tab === "darbas" && opts.view) params.set("view", opts.view);
  if (opts.period) params.set("period", opts.period);
  if (opts.from) params.set("from", opts.from);
  if (opts.to) params.set("to", opts.to);
  if (opts.salesPeriod) params.set("salesPeriod", opts.salesPeriod);
  if (opts.salesFrom) params.set("salesFrom", opts.salesFrom);
  if (opts.salesTo) params.set("salesTo", opts.salesTo);
  if (opts.page !== undefined && opts.page > 0) params.set("page", String(opts.page));
  if (opts.pageSize !== undefined && opts.pageSize !== 20) params.set("pageSize", String(opts.pageSize));
  const st = opts.status !== undefined ? String(opts.status).trim() : "";
  if (st !== "") params.set("status", st);
  const candSt = opts.candidateStatus !== undefined ? String(opts.candidateStatus).trim() : "";
  if (candSt !== "" && candSt !== "active") params.set("candidateStatus", candSt);
  const searchQ = opts.q !== undefined ? String(opts.q).trim() : "";
  if (searchQ !== "") params.set("q", searchQ);
  if (opts.completedPage !== undefined && opts.completedPage > 1) {
    params.set("completedPage", String(Math.floor(opts.completedPage)));
  }
  const completedQ = opts.completedQ !== undefined ? String(opts.completedQ).trim() : "";
  if (completedQ !== "") params.set("completedQ", completedQ);
  const completedStatus = opts.completedStatus !== undefined ? String(opts.completedStatus).trim() : "";
  if (completedStatus !== "") params.set("completedStatus", completedStatus);
  const path = `/projektai/${projectId}/${projectDetailTabPathSegment(opts.tab)}`;
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}
