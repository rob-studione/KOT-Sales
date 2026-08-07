import type { SupabaseClient } from "@supabase/supabase-js";
import { isProjectWorkItemClosed, workItemActionTypeLabel } from "@/lib/crm/projectBoardConstants";
import { completionResultLabel, parseCompletionResult } from "@/lib/crm/projectCompletion";
import { projectResultStatusLabel } from "@/lib/crm/projectSnapshot";
import { SYNTHETIC_COMPANY_CODE_PREFIX } from "@/lib/crm/company-code";

export type MatchReason = "company_code" | "vat_code" | "client_id" | "email" | "name";
export type MatchStrength = "strong" | "name";

export type ClientProjectHistoryEntry = {
  work_item_id: string;
  project_id: string;
  project_name: string;
  result_status: string;
  result_label: string;
  picked_at: string;
  last_activity_at: string | null;
  last_action_summary: string | null;
  /** Nuoroda į projektą / darbo kortelę. */
  href: string;
};

export type ExistingClientMatch = {
  client_key: string;
  company_name: string;
  company_code: string | null;
  client_id: string | null;
  email: string | null;
  vat_code: string | null;
  strength: MatchStrength;
  match_reason: MatchReason;
  /** Stipriam match — false (neleisti force create). */
  allow_force_create: boolean;
  project_history: ClientProjectHistoryEntry[];
};

type ViewRow = {
  client_key: string;
  company_code: string | null;
  client_id: string | null;
  company_name: string | null;
  email: string | null;
  vat_code: string | null;
};

const VIEW_SELECT = "client_key,company_code,client_id,company_name,email,vat_code";

function isSyntheticOrPersonVat(raw: string): boolean {
  const u = raw.trim().toUpperCase();
  return u.startsWith(SYNTHETIC_COMPANY_CODE_PREFIX) || u.startsWith("PERSON_");
}

/** Normalizuoja pavadinimą palyginimui (UAB, kabutės, diacritics). */
export function normalizeCompanyNameForMatch(raw: string): string {
  return String(raw ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[„“”"'`]/g, "")
    .replace(/\b(uab|ab|mb|vsi)\b/gi, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function significantNameToken(normalized: string): string | null {
  const parts = normalized.split(" ").filter((p) => p.length >= 3);
  if (parts.length === 0) return null;
  return parts.sort((a, b) => b.length - a.length)[0] ?? null;
}

function normalizeRow(
  r: ViewRow,
  opts: { strength: MatchStrength; match_reason: MatchReason }
): Omit<ExistingClientMatch, "project_history"> {
  return {
    client_key: String(r.client_key ?? ""),
    company_name: String(r.company_name ?? "").trim() || "—",
    company_code: r.company_code != null && String(r.company_code).trim() !== "" ? String(r.company_code).trim() : null,
    client_id: r.client_id != null && String(r.client_id).trim() !== "" ? String(r.client_id).trim() : null,
    email: r.email != null && String(r.email).trim() !== "" ? String(r.email).trim() : null,
    vat_code: r.vat_code != null && String(r.vat_code).trim() !== "" ? String(r.vat_code).trim() : null,
    strength: opts.strength,
    match_reason: opts.match_reason,
    allow_force_create: opts.strength !== "strong",
  };
}

function resultStatusLabel(status: string): string {
  const raw = String(status ?? "").trim();
  if (!raw) return "Vykdoma";
  if (parseCompletionResult(raw)) return completionResultLabel(raw);
  return projectResultStatusLabel(raw);
}

function historyHref(opts: {
  projectId: string;
  workItemId: string;
  resultStatus: string;
  companyName: string;
}): string {
  if (!isProjectWorkItemClosed(opts.resultStatus)) {
    return `/projektai/${opts.projectId}/darbas?wi=${encodeURIComponent(opts.workItemId)}`;
  }
  const q = opts.companyName.trim();
  const base = `/projektai/${opts.projectId}/kontaktuota`;
  return q ? `${base}?completedQ=${encodeURIComponent(q)}` : base;
}

async function loadProjectHistory(
  supabase: SupabaseClient,
  match: Omit<ExistingClientMatch, "project_history">
): Promise<ClientProjectHistoryEntry[]> {
  const keys = new Set<string>();
  if (match.client_key) keys.add(match.client_key);
  if (match.company_code) keys.add(match.company_code);
  if (match.vat_code && !isSyntheticOrPersonVat(match.vat_code)) keys.add(match.vat_code);
  if (match.client_id) keys.add(match.client_id);
  const keyList = [...keys].filter(Boolean);
  if (keyList.length === 0) return [];

  const { data: workRows, error } = await supabase
    .from("project_work_items")
    .select("id,project_id,client_key,result_status,picked_at,work_updated_at,projects(name)")
    .in("client_key", keyList)
    .order("picked_at", { ascending: false })
    .limit(12);

  if (error || !workRows?.length) {
    if (error) console.error("[findMatchingExistingClient] project history", error);
    return [];
  }

  type WorkRow = {
    id: string;
    project_id: string;
    client_key: string;
    result_status: string | null;
    picked_at: string;
    work_updated_at: string | null;
    projects: { name: string | null } | { name: string | null }[] | null;
  };

  const rows = workRows as WorkRow[];
  const workIds = rows.map((r) => r.id);

  const lastByWork = new Map<string, { occurred_at: string; action_type: string; call_status: string | null }>();
  const { data: acts, error: actErr } = await supabase
    .from("project_work_item_activities")
    .select("work_item_id,occurred_at,action_type,call_status")
    .in("work_item_id", workIds)
    .order("occurred_at", { ascending: false })
    .limit(80);

  if (actErr) {
    console.error("[findMatchingExistingClient] activities", actErr);
  } else {
    for (const a of acts ?? []) {
      const wid = String((a as { work_item_id?: string }).work_item_id ?? "");
      if (!wid || lastByWork.has(wid)) continue;
      lastByWork.set(wid, {
        occurred_at: String((a as { occurred_at?: string }).occurred_at ?? ""),
        action_type: String((a as { action_type?: string }).action_type ?? ""),
        call_status:
          (a as { call_status?: string | null }).call_status != null
            ? String((a as { call_status?: string | null }).call_status)
            : null,
      });
    }
  }

  const seenProjects = new Set<string>();
  const out: ClientProjectHistoryEntry[] = [];

  for (const r of rows) {
    const projectId = String(r.project_id ?? "");
    if (!projectId || seenProjects.has(projectId)) continue;
    seenProjects.add(projectId);

    const proj = r.projects;
    const projectName = Array.isArray(proj)
      ? String(proj[0]?.name ?? "").trim() || "Projektas"
      : String(proj?.name ?? "").trim() || "Projektas";

    const last = lastByWork.get(r.id);
    const resultStatus = String(r.result_status ?? "");
    let lastActionSummary: string | null = null;
    if (last?.action_type) {
      const base = workItemActionTypeLabel(last.action_type);
      const cs = last.call_status?.trim();
      lastActionSummary = cs ? `${base}: ${cs}` : base;
    }

    out.push({
      work_item_id: r.id,
      project_id: projectId,
      project_name: projectName,
      result_status: resultStatus,
      result_label: resultStatusLabel(resultStatus),
      picked_at: r.picked_at,
      last_activity_at: last?.occurred_at || r.work_updated_at || null,
      last_action_summary: lastActionSummary,
      href: historyHref({
        projectId,
        workItemId: r.id,
        resultStatus,
        companyName: match.company_name,
      }),
    });

    if (out.length >= 5) break;
  }

  return out;
}

async function withHistory(
  supabase: SupabaseClient,
  base: Omit<ExistingClientMatch, "project_history">
): Promise<ExistingClientMatch> {
  const project_history = await loadProjectHistory(supabase, base);
  return { ...base, project_history };
}

async function findStrongMatch(
  supabase: SupabaseClient,
  input: { companyCode: string | null; email: string | null }
): Promise<Omit<ExistingClientMatch, "project_history"> | null> {
  const codeRaw = input.companyCode?.trim() ?? "";
  const emailRaw = input.email?.trim() ?? "";

  if (codeRaw) {
    const { data: byCode, error: e1 } = await supabase
      .from("v_client_list_from_invoices")
      .select(VIEW_SELECT)
      .eq("company_code", codeRaw)
      .maybeSingle();

    if (!e1 && byCode) {
      return normalizeRow(byCode as ViewRow, { strength: "strong", match_reason: "company_code" });
    }

    if (!isSyntheticOrPersonVat(codeRaw)) {
      const { data: byVat, error: eVat } = await supabase
        .from("v_client_list_from_invoices")
        .select(VIEW_SELECT)
        .eq("vat_code", codeRaw)
        .maybeSingle();

      if (!eVat && byVat) {
        return normalizeRow(byVat as ViewRow, { strength: "strong", match_reason: "vat_code" });
      }
    }

    const { data: byClientId, error: e2 } = await supabase
      .from("v_client_list_from_invoices")
      .select(VIEW_SELECT)
      .eq("client_id", codeRaw)
      .maybeSingle();

    if (!e2 && byClientId) {
      return normalizeRow(byClientId as ViewRow, { strength: "strong", match_reason: "client_id" });
    }
  }

  if (emailRaw) {
    const { data: rows, error: e3 } = await supabase
      .from("v_client_list_from_invoices")
      .select(VIEW_SELECT)
      .ilike("email", emailRaw)
      .limit(5);

    if (!e3 && rows?.length) {
      const exact =
        rows.find((r) => String((r as ViewRow).email ?? "").trim().toLowerCase() === emailRaw.toLowerCase()) ??
        rows[0];
      return normalizeRow(exact as ViewRow, { strength: "strong", match_reason: "email" });
    }
  }

  return null;
}

async function findNameSuggestions(
  supabase: SupabaseClient,
  companyName: string
): Promise<Array<Omit<ExistingClientMatch, "project_history">>> {
  const normalized = normalizeCompanyNameForMatch(companyName);
  const token = significantNameToken(normalized);
  if (!token || token.length < 3) return [];

  const { data: rows, error } = await supabase
    .from("v_client_list_from_invoices")
    .select(VIEW_SELECT)
    .ilike("company_name", `%${token}%`)
    .limit(25);

  if (error || !rows?.length) {
    if (error) console.error("[findMatchingExistingClient] name suggestions", error);
    return [];
  }

  const scored: Array<{ row: ViewRow; score: number }> = [];
  for (const raw of rows) {
    const r = raw as ViewRow;
    const n = normalizeCompanyNameForMatch(String(r.company_name ?? ""));
    if (!n) continue;
    let score = 0;
    if (n === normalized) score = 100;
    else if (n.includes(normalized) || normalized.includes(n)) score = 80;
    else if (n.split(" ").includes(token)) score = 50;
    else continue;
    scored.push({ row: r, score });
  }

  scored.sort((a, b) => b.score - a.score || a.row.company_name!.localeCompare(b.row.company_name!));

  const seen = new Set<string>();
  const out: Array<Omit<ExistingClientMatch, "project_history">> = [];
  for (const s of scored) {
    const key = String(s.row.client_key ?? "");
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(normalizeRow(s.row, { strength: "name", match_reason: "name" }));
    if (out.length >= 5) break;
  }
  return out;
}

export type FindClientMatchResult =
  | { kind: "strong"; match: ExistingClientMatch }
  | { kind: "suggestions"; suggestions: ExistingClientMatch[] }
  | { kind: "none" };

/**
 * Stiprus match (kodas / VAT / client_id / el. paštas) → vienas klientas, force create neleidžiamas.
 * Silpnas (pavadinimas) → pasiūlymai, galima kurti naują.
 */
export async function findClientMatches(
  supabase: SupabaseClient,
  input: { companyCode: string | null; email: string | null; companyName: string | null }
): Promise<FindClientMatchResult> {
  const strong = await findStrongMatch(supabase, {
    companyCode: input.companyCode,
    email: input.email,
  });
  if (strong) {
    return { kind: "strong", match: await withHistory(supabase, strong) };
  }

  const name = input.companyName?.trim() ?? "";
  if (name) {
    const bases = await findNameSuggestions(supabase, name);
    if (bases.length > 0) {
      const suggestions = await Promise.all(bases.map((b) => withHistory(supabase, b)));
      return { kind: "suggestions", suggestions };
    }
  }

  return { kind: "none" };
}

/**
 * @deprecated Naudokite `findClientMatches`. Likę dėl suderinamumo — tik stiprus match be istorijos laukų fallback.
 */
export async function findMatchingExistingClient(
  supabase: SupabaseClient,
  input: { companyCode: string | null; email: string | null; companyName?: string | null }
): Promise<ExistingClientMatch | null> {
  const r = await findClientMatches(supabase, {
    companyCode: input.companyCode,
    email: input.email,
    companyName: input.companyName ?? null,
  });
  if (r.kind === "strong") return r.match;
  if (r.kind === "suggestions" && r.suggestions[0]) return r.suggestions[0];
  return null;
}
