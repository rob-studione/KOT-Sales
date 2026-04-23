/** Bendri projekto puslapio query parametrai (skirtukai + apžvalgos periodas). */

export type ManualCandidateCrmStatusFilter = "new_lead" | "former_client" | "existing_client";

/** ?status= — tik CRM lead statusai; tuščia / nežinoma → visi. */
export function parseManualCandidatesStatus(raw: string | undefined): ManualCandidateCrmStatusFilter | null {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (s === "new_lead" || s === "former_client" || s === "existing_client") return s;
  return null;
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
    /** Rankinio projekto kandidatų filtras (crm_status). */
    status?: ManualCandidateCrmStatusFilter | string;
    /** Auto kandidatų sąrašo filtras (default: active). */
    candidateStatus?: ProjectAutoCandidatesListStatus;
    /** Paieška (company_name / company_code). */
    q?: string;
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
  return `/projektai/${projectId}?${params.toString()}`;
}
