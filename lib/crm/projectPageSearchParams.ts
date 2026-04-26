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
  candidateStatus?: string | string[];
  completedPage?: string | string[];
}): {
  page?: number;
  pageSize?: number;
  q?: string;
  candidateStatus?: ProjectAutoCandidatesListStatus;
  completedPage?: number;
} {
  const pageRaw = Array.isArray(sp.page) ? sp.page[0] : sp.page;
  const page0 = parsePageIndex0(pageRaw);
  const pSize: PageSize = parsePageSize(Array.isArray(sp.pageSize) ? sp.pageSize[0] : sp.pageSize);
  const out: {
    page?: number;
    pageSize?: number;
    q?: string;
    candidateStatus?: ProjectAutoCandidatesListStatus;
    completedPage?: number;
  } = {};
  if (page0 > 0) out.page = page0;
  if (pSize !== 20) out.pageSize = pSize;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  if (q) out.q = q;
  if (typeof sp.candidateStatus === "string" && sp.candidateStatus === "netinkamas") {
    out.candidateStatus = "netinkamas";
  }
  const c1 = parseProjectCompletedPage1Based(
    Array.isArray(sp.completedPage) ? sp.completedPage[0] : sp.completedPage
  );
  if (c1 > 1) out.completedPage = c1;
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
  }
): string {
  const params = new URLSearchParams();
  params.set("tab", opts.tab);
  if (opts.tab === "darbas" && opts.view) params.set("view", opts.view);
  if (opts.period) params.set("period", opts.period);
  if (opts.from) params.set("from", opts.from);
  if (opts.to) params.set("to", opts.to);
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
  return `/projektai/${projectId}?${params.toString()}`;
}
