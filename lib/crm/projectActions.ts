"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseSsrClient } from "@/lib/supabase/ssr";
import { defaultProjectActor } from "@/lib/crm/projectEnv";
import { parseManualImportCsvForImport } from "@/lib/crm/manualImportCsv";
import {
  rpcMatchProjectCandidates,
  rpcMatchProjectCandidateForPick,
  fetchSortedCandidatesForProject,
  type ProjectRulesRow,
} from "@/lib/crm/projectCandidateQuery";
import { fetchCandidateExpandDetails } from "@/lib/crm/candidateExpandDetails";
import type { CandidateExpandDetails } from "@/lib/crm/candidateExpandTypes";
import {
  BOARD_DEFAULT_CALL_STATUS,
  isProjectWorkItemClosed,
  isReturnedToCandidates,
  normalizeKanbanCallStatus,
  RESULT_RETURNED_TO_CANDIDATES,
} from "@/lib/crm/projectBoardConstants";
import { parseCompletionResult } from "@/lib/crm/projectCompletion";
import { crmUserExists, isValidUuid, messageForCrmUserExistsFailure } from "@/lib/crm/crmUsers";
import { findMatchingExistingClient, type ExistingClientMatch } from "@/lib/crm/findMatchingExistingClient";
import { isManualProjectType, isProcurementProjectType, projectTypeFromDbRow } from "@/lib/crm/projectType";
import {
  mapProcurementCsvRows,
  parseProcurementImportCsv,
  resolveProcurementCsvColumnKeys,
} from "@/lib/crm/procurementImportCsv";
import { PROCUREMENT_CONTRACT_STATUSES } from "@/lib/crm/procurementContracts";
import { manualLeadClientKey } from "@/lib/crm/manualLeadClientKey";
import { procurementContractClientKey } from "@/lib/crm/procurementContractClientKey";
import { isMissingWorkItemSourceColumnsError } from "@/lib/crm/projectWorkItemColumns";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseDateInputToIso } from "@/lib/crm/format";
import { ACTIVE_WINDOW_MONTHS, calendarDateMonthsAgo } from "@/lib/crm/analyticsDates";
import {
  aggregateSnapshotTotals,
  parseProjectSortOption,
  sortSnapshotCandidates,
  snapshotClientDisplayName,
  formatProjectClientIdentifier,
  type ProjectSortOption,
  type SnapshotCandidateRow,
} from "@/lib/crm/projectSnapshot";

/** Server-side pick veiksmo segmentai (ms) — naudojama diagnostikai ir UX optimizacijai. */
export type PickClientFromProjectTimings = {
  projectLoadMs: number;
  /** Auto: vieno kliento RPC arba pilnas sąrašas (fallback). */
  rpcMatchMs?: number;
  sortFindMs?: number;
  insertWorkItemMs?: number;
  insertActivityMs?: number;
  revalidateDetailMs?: number;
  totalServerMs: number;
};

export type PickClientFromProjectResult =
  | { ok: true; timings: PickClientFromProjectTimings }
  | { ok: false; error: string; timings: PickClientFromProjectTimings };

type UpdateProjectsSortOrderResult = { ok: true } | { ok: false; error: string };

export type ProjectsSortOrderTabFilter = "active" | "archived" | "deleted";

function uniqueIdsPreserveOrder(ids: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of ids) {
    const id = String(raw ?? "").trim();
    if (!id) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/** Postgres `date`: tik YYYY-MM-DD arba null. */
function activityDateForDb(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return parseDateInputToIso(s);
}

export type ProjectPreviewResult =
  | {
      ok: true;
      clientCount: number;
      totalRevenue: number;
      previewRows: SnapshotCandidateRow[];
    }
  | { ok: false; error: string };

type ProjectCreationType = "automatic" | "manual" | "procurement";

function parseProjectType(formData: FormData): ProjectCreationType {
  const raw = formData.get("project_type");
  const s = raw == null ? "" : String(raw).trim().toLowerCase();
  if (s === "manual") return "manual";
  if (s === "procurement") return "procurement";
  return "automatic";
}

function calendarDateTodayUtc(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/** PostgREST: trūksta stulpelio / pasenęs schema cache dėl `procurement_notify_days_before`. */
function isProjectsProcurementColumnOrCacheError(err: { message?: string; code?: string } | null | undefined): boolean {
  const m = String(err?.message ?? "").toLowerCase();
  return (
    m.includes("procurement_notify_days_before") ||
    m.includes("schema cache") ||
    err?.code === "PGRST204" ||
    (m.includes("could not find") && m.includes("column"))
  );
}

/** DB neleidžia `project_type = procurement` (nepritaikyta migracija su CHECK). */
function isProjectsProjectTypeProcurementRejected(err: { message?: string; code?: string } | null | undefined): boolean {
  const m = String(err?.message ?? "").toLowerCase();
  if (err?.code === "23514" && m.includes("project")) return true;
  return m.includes("projects_project_type_check") || (m.includes("check constraint") && m.includes("project_type"));
}

async function requireExistingCrmUser(
  supabase: Awaited<ReturnType<typeof createSupabaseSsrClient>>,
  ownerUserId: string,
  notFoundMessage: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const r = await crmUserExists(supabase, ownerUserId);
  if (!r.ok) {
    return { ok: false, error: messageForCrmUserExistsFailure(r) };
  }
  if (!r.exists) {
    return { ok: false, error: notFoundMessage };
  }
  return { ok: true };
}

function parseAutomaticCreateForm(formData: FormData): {
  name: string;
  description: string;
  dateFrom: string;
  dateTo: string;
  minOrderCount: number;
  inactivityDays: number;
  sort: ProjectSortOption;
  ownerUserId: string;
} | { error: string } {
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const dateFrom = String(formData.get("date_from") ?? "").trim();
  const dateTo = String(formData.get("date_to") ?? "").trim();
  const minRaw = String(formData.get("min_order_count") ?? "1").trim();
  const inactivityRaw = String(formData.get("inactivity_days") ?? "90").trim();
  const sort = parseProjectSortOption(String(formData.get("sort_option") ?? ""));
  const ownerUserId = String(formData.get("owner_user_id") ?? "").trim();

  if (!name) return { error: "Įveskite projekto pavadinimą." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
    return { error: "Pasirinkite datas (nuo / iki)." };
  }
  if (dateFrom > dateTo) return { error: "Data „nuo“ negali būti vėlesnė už „iki“." };
  const minOrderCount = Math.max(1, parseInt(minRaw, 10) || 1);
  const inactivityDays = Math.min(3650, Math.max(1, parseInt(inactivityRaw, 10) || 90));
  if (!ownerUserId || !isValidUuid(ownerUserId)) {
    return { error: "Pasirinkite atsakingą asmenį." };
  }

  return { name, description, dateFrom, dateTo, minOrderCount, inactivityDays, sort, ownerUserId };
}

function parseManualCreateForm(formData: FormData): { name: string; description: string; ownerUserId: string } | { error: string } {
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const ownerUserId = String(formData.get("owner_user_id") ?? "").trim();

  if (!name) return { error: "Įveskite projekto pavadinimą." };
  if (!ownerUserId || !isValidUuid(ownerUserId)) {
    return { error: "Pasirinkite atsakingą asmenį." };
  }

  return { name, description, ownerUserId };
}

function parseProcurementCreateForm(
  formData: FormData
): { name: string; description: string; ownerUserId: string; notifyDaysBefore: number } | { error: string } {
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const ownerUserId = String(formData.get("owner_user_id") ?? "").trim();
  const notifyRaw = String(formData.get("procurement_notify_days_before") ?? "14").trim();

  if (!name) return { error: "Įveskite projekto pavadinimą." };
  if (!ownerUserId || !isValidUuid(ownerUserId)) {
    return { error: "Pasirinkite atsakingą asmenį." };
  }
  let notifyDaysBefore = parseInt(notifyRaw, 10);
  if (!Number.isFinite(notifyDaysBefore)) notifyDaysBefore = 14;
  notifyDaysBefore = Math.min(365, Math.max(0, notifyDaysBefore));

  return { name, description, ownerUserId, notifyDaysBefore };
}

export async function loadCandidateExpandDetailsAction(clientKey: string): Promise<CandidateExpandDetails> {
  let supabase;
  try {
    supabase = createSupabaseServerClient();
  } catch {
    return { email: null, phone: null, address: null, invoices: [] };
  }
  return fetchCandidateExpandDetails(supabase, clientKey);
}

export async function previewProjectSnapshot(formData: FormData): Promise<ProjectPreviewResult> {
  const pt = parseProjectType(formData);
  if (pt === "manual" || pt === "procurement") {
    return { ok: false, error: "Peržiūra galima tik automatiniam projektui." };
  }
  const parsed = parseAutomaticCreateForm(formData);
  if ("error" in parsed) return { ok: false, error: parsed.error };

  let supabase;
  try {
    supabase = await createSupabaseSsrClient();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Klaida" };
  }

  const loaded = await rpcMatchProjectCandidates(
    supabase,
    parsed.dateFrom,
    parsed.dateTo,
    parsed.minOrderCount,
    parsed.inactivityDays,
    null
  );
  if (!loaded.ok) return { ok: false, error: loaded.error };

  const sorted = sortSnapshotCandidates(loaded.rows, parsed.sort);
  const { clientCount, totalRevenue } = aggregateSnapshotTotals(sorted);
  return {
    ok: true,
    clientCount,
    totalRevenue,
    previewRows: sorted.slice(0, 12),
  };
}

export async function createProjectFromForm(
  formData: FormData
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const creationType = parseProjectType(formData);

  let supabase;
  try {
    supabase = await createSupabaseSsrClient();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Supabase klaida" };
  }

  if (creationType === "manual") {
    const parsed = parseManualCreateForm(formData);
    if ("error" in parsed) {
      return { ok: false, error: parsed.error };
    }

    const ownerCheck = await requireExistingCrmUser(supabase, parsed.ownerUserId, "Pasirinktas naudotojas neegzistuoja.");
    if (!ownerCheck.ok) {
      return { ok: false, error: ownerCheck.error };
    }

    const placeholderDay = calendarDateTodayUtc();

    const { data: project, error: pErr } = await supabase
      .from("projects")
      .insert({
        name: parsed.name,
        description: parsed.description,
        project_type: "manual",
        filter_date_from: placeholderDay,
        filter_date_to: placeholderDay,
        min_order_count: 1,
        inactivity_days: 90,
        sort_option: "revenue_desc",
        status: "active",
        created_by: defaultProjectActor(),
        owner_user_id: parsed.ownerUserId,
      })
      .select("id")
      .single();

    if (pErr || !project?.id) {
      return { ok: false, error: pErr?.message ?? "Nepavyko sukurti projekto" };
    }

    revalidatePath("/projektai");
    return { ok: true, id: project.id as string };
  }

  if (creationType === "procurement") {
    const parsed = parseProcurementCreateForm(formData);
    if ("error" in parsed) {
      return { ok: false, error: parsed.error };
    }

    const ownerCheck = await requireExistingCrmUser(supabase, parsed.ownerUserId, "Pasirinktas naudotojas neegzistuoja.");
    if (!ownerCheck.ok) {
      return { ok: false, error: ownerCheck.error };
    }

    const placeholderDay = calendarDateTodayUtc();

    const baseRow = {
      name: parsed.name,
      description: parsed.description,
      project_type: "procurement" as const,
      filter_date_from: placeholderDay,
      filter_date_to: placeholderDay,
      min_order_count: 1,
      inactivity_days: 90,
      sort_option: "revenue_desc",
      status: "active",
      created_by: defaultProjectActor(),
      owner_user_id: parsed.ownerUserId,
    };

    let ins = await supabase
      .from("projects")
      .insert({
        ...baseRow,
        procurement_notify_days_before: parsed.notifyDaysBefore,
      })
      .select("id")
      .single();

    if (ins.error && isProjectsProcurementColumnOrCacheError(ins.error)) {
      ins = await supabase.from("projects").insert(baseRow).select("id").single();
      if (!ins.error && ins.data?.id) {
        await supabase
          .from("projects")
          .update({ procurement_notify_days_before: parsed.notifyDaysBefore })
          .eq("id", ins.data.id);
      }
    }

    const project = ins.data;
    const pErr = ins.error;

    if (pErr) {
      if (isProjectsProjectTypeProcurementRejected(pErr)) {
        return {
          ok: false,
          error:
            "Duomenų bazėje dar neleidžiama reikšmė project_type = procurement. Paleiskite migraciją 0051_project_procurement.sql (arba 0052) per Supabase SQL Editor ir notify pgrst reload schema.",
        };
      }
      return { ok: false, error: pErr.message ?? "Nepavyko sukurti projekto" };
    }

    if (!project?.id) {
      return { ok: false, error: "Nepavyko sukurti projekto" };
    }

    revalidatePath("/projektai");
    return { ok: true, id: project.id as string };
  }

  const parsed = parseAutomaticCreateForm(formData);
  if ("error" in parsed) {
    return { ok: false, error: parsed.error };
  }

  const ownerCheck = await requireExistingCrmUser(supabase, parsed.ownerUserId, "Pasirinktas naudotojas neegzistuoja.");
  if (!ownerCheck.ok) {
    return { ok: false, error: ownerCheck.error };
  }

  const { data: project, error: pErr } = await supabase
    .from("projects")
    .insert({
      name: parsed.name,
      description: parsed.description,
      project_type: "automatic",
      filter_date_from: parsed.dateFrom,
      filter_date_to: parsed.dateTo,
      min_order_count: parsed.minOrderCount,
      inactivity_days: parsed.inactivityDays,
      sort_option: parsed.sort,
      status: "active",
      created_by: defaultProjectActor(),
      owner_user_id: parsed.ownerUserId,
    })
    .select("id")
    .single();

  if (pErr || !project?.id) {
    return { ok: false, error: pErr?.message ?? "Nepavyko sukurti projekto" };
  }

  revalidatePath("/projektai");
  return { ok: true, id: project.id as string };
}

export async function updateProjectOwnerAction(
  projectId: string,
  ownerUserId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!projectId || !isValidUuid(projectId)) {
    return { ok: false, error: "Neteisingas projektas." };
  }
  if (!ownerUserId || !isValidUuid(ownerUserId)) {
    return { ok: false, error: "Pasirinkite atsakingą asmenį." };
  }

  let supabase;
  try {
    supabase = await createSupabaseSsrClient();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Supabase klaida" };
  }

  const ownerCheck = await requireExistingCrmUser(supabase, ownerUserId, "Naudotojas nerastas.");
  if (!ownerCheck.ok) {
    return { ok: false, error: ownerCheck.error };
  }

  const { error } = await supabase.from("projects").update({ owner_user_id: ownerUserId }).eq("id", projectId);
  if (error) {
    console.error("[projectActions] updateProjectOwner failed", error);
    return { ok: false, error: "Nepavyko pakeisti atsakingo." };
  }

  revalidatePath("/projektai");
  revalidatePath(`/projektai/${projectId}`);
  return { ok: true };
}

type AutomaticRulesInput = {
  dateFrom: string;
  dateTo: string;
  minOrderCount: number;
  inactivityDays: number;
  sort: ProjectSortOption;
};

function parseAutomaticRulesForm(formData: FormData): AutomaticRulesInput | { error: string } {
  const dateFrom = String(formData.get("date_from") ?? "").trim();
  const dateTo = String(formData.get("date_to") ?? "").trim();
  const minRaw = String(formData.get("min_order_count") ?? "1").trim();
  const inactivityRaw = String(formData.get("inactivity_days") ?? "90").trim();
  const sort = parseProjectSortOption(String(formData.get("sort_option") ?? ""));

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
    return { error: "Pasirinkite datas (nuo / iki)." };
  }
  if (dateFrom > dateTo) return { error: "Data „nuo“ negali būti vėlesnė už „iki“." };
  const minOrderCount = Math.max(1, parseInt(minRaw, 10) || 1);
  const inactivityDays = Math.min(3650, Math.max(1, parseInt(inactivityRaw, 10) || 90));
  return { dateFrom, dateTo, minOrderCount, inactivityDays, sort };
}

export async function updateAutomaticProjectRulesAction(
  projectId: string,
  formData: FormData
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!projectId || !isValidUuid(projectId)) {
    return { ok: false, error: "Neteisingas projektas." };
  }
  const parsed = parseAutomaticRulesForm(formData);
  if ("error" in parsed) return { ok: false, error: parsed.error };

  let supabase;
  try {
    supabase = await createSupabaseSsrClient();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Supabase klaida" };
  }

  const { data: proj, error: pErr } = await supabase.from("projects").select("id, project_type").eq("id", projectId).maybeSingle();
  if (pErr || !proj) return { ok: false, error: "Projektas nerastas." };
  const pt = projectTypeFromDbRow(proj);
  if (isManualProjectType(pt) || isProcurementProjectType(pt)) {
    return { ok: false, error: "Taisyklių redagavimas galimas tik automatiniam projektui." };
  }

  const { error } = await supabase
    .from("projects")
    .update({
      filter_date_from: parsed.dateFrom,
      filter_date_to: parsed.dateTo,
      min_order_count: parsed.minOrderCount,
      inactivity_days: parsed.inactivityDays,
      sort_option: parsed.sort,
    })
    .eq("id", projectId);
  if (error) return { ok: false, error: error.message ?? "Nepavyko išsaugoti taisyklių." };

  revalidatePath("/projektai");
  revalidatePath(`/projektai/${projectId}`);
  return { ok: true };
}

export type CreateManualProjectLeadActionResult =
  | { ok: true }
  | { ok: false; error: string }
  | { ok: false; duplicate: true; match: ExistingClientMatch };

export async function createManualProjectLeadAction(formData: FormData): Promise<CreateManualProjectLeadActionResult> {
  const projectId = String(formData.get("project_id") ?? "").trim();
  const companyName = String(formData.get("company_name") ?? "").trim();
  const companyCodeRaw = String(formData.get("company_code") ?? "").trim();
  const emailRaw = String(formData.get("email") ?? "").trim();
  const phoneRaw = String(formData.get("phone") ?? "").trim();
  const contactNameRaw = String(formData.get("contact_name") ?? "").trim();
  const notesRaw = String(formData.get("notes") ?? "").trim();
  const forceNewLead = String(formData.get("force_new_lead") ?? "").trim() === "1";

  const companyCode = companyCodeRaw ? companyCodeRaw : null;
  const email = emailRaw ? emailRaw : null;
  const phone = phoneRaw ? phoneRaw : null;
  const contactName = contactNameRaw ? contactNameRaw : null;
  const notes = notesRaw ? notesRaw : null;

  if (!projectId || !isValidUuid(projectId)) {
    return { ok: false, error: "Neteisingas projektas." };
  }
  if (!companyName) {
    return { ok: false, error: "Įveskite įmonės pavadinimą." };
  }

  let supabase;
  try {
    supabase = await createSupabaseSsrClient();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Supabase klaida" };
  }

  const { data: proj, error: projErr } = await supabase.from("projects").select("id, project_type").eq("id", projectId).maybeSingle();

  if (projErr || !proj) {
    return { ok: false, error: "Projektas nerastas." };
  }
  if (!isManualProjectType(projectTypeFromDbRow(proj))) {
    return { ok: false, error: "Rankiniai kandidatai galimi tik rankiniu projektu." };
  }

  if (!forceNewLead) {
    const match = await findMatchingExistingClient(supabase, {
      companyCode: companyCode,
      email: email,
    });
    if (match) {
      return { ok: false, duplicate: true, match };
    }
  }

  const { error } = await supabase.from("project_manual_leads").insert({
    project_id: projectId,
    company_name: companyName,
    company_code: companyCode,
    email,
    phone,
    contact_name: contactName,
    notes,
  });

  if (error) {
    console.error("[projectActions] createManualProjectLead failed", error);
    return { ok: false, error: error.message ?? "Nepavyko išsaugoti kandidato." };
  }

  revalidatePath(`/projektai/${projectId}`);
  revalidatePath("/projektai");
  return { ok: true };
}

export async function markAutoCandidateAsInvalidAction(
  projectId: string,
  clientKey: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const pid = String(projectId ?? "").trim();
  const ck = String(clientKey ?? "").trim();
  if (!pid || !isValidUuid(pid)) return { ok: false, error: "Neteisingas projektas." };
  if (!ck) return { ok: false, error: "Trūksta kliento rakto." };

  let supabase;
  try {
    supabase = await createSupabaseSsrClient();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Supabase klaida" };
  }

  const { data: proj, error: projErr } = await supabase.from("projects").select("id, project_type").eq("id", pid).maybeSingle();
  if (projErr || !proj) return { ok: false, error: "Projektas nerastas." };
  const pt = projectTypeFromDbRow(proj);
  if (isManualProjectType(pt) || isProcurementProjectType(pt)) {
    return { ok: false, error: "Netinkamo statusas taikomas tik automatiniams projektams." };
  }

  const { error } = await supabase
    .from("project_candidate_exclusions")
    .upsert({ project_id: pid, client_key: ck, updated_at: new Date().toISOString() }, { onConflict: "project_id,client_key" });

  if (error) {
    console.error("[projectActions] markAutoCandidateAsInvalidAction failed", error);
    return { ok: false, error: error.message ?? "Nepavyko pažymėti kandidato kaip netinkamo." };
  }

  return { ok: true };
}

export async function restoreAutoCandidateAction(
  projectId: string,
  clientKey: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const pid = String(projectId ?? "").trim();
  const ck = String(clientKey ?? "").trim();
  if (!pid || !isValidUuid(pid)) return { ok: false, error: "Neteisingas projektas." };
  if (!ck) return { ok: false, error: "Trūksta kliento rakto." };

  let supabase;
  try {
    supabase = await createSupabaseSsrClient();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Supabase klaida" };
  }

  const { data: proj, error: projErr } = await supabase.from("projects").select("id, project_type").eq("id", pid).maybeSingle();
  if (projErr || !proj) return { ok: false, error: "Projektas nerastas." };
  const pt = projectTypeFromDbRow(proj);
  if (isManualProjectType(pt) || isProcurementProjectType(pt)) {
    return { ok: false, error: "Netinkamo statusas taikomas tik automatiniams projektams." };
  }

  const { error } = await supabase
    .from("project_candidate_exclusions")
    .delete()
    .eq("project_id", pid)
    .eq("client_key", ck);

  if (error) {
    console.error("[projectActions] restoreAutoCandidateAction failed", error);
    return { ok: false, error: error.message ?? "Nepavyko grąžinti kandidato." };
  }

  return { ok: true };
}

export type ManualCsvImportMapping = {
  companyNameColumn: string;
  companyCodeColumn: string;
  annualRevenueColumn: string;
  /** Optional: year label, saved to DB for display. */
  annualRevenueYear?: number | null;
};

export type ImportManualProjectLeadsCsvResult =
  | {
      ok: true;
      totalRows: number;
      skippedMissingRequired: number;
      inserted: number;
      updated: number;
      /** Insert-only režime: CSV eilutės (unikalūs kodai), kurie jau buvo projekte ir nebuvo keisti. */
      skippedExisting: number;
      existingClient: number;
      formerClient: number;
      newLead: number;
      invalidRevenue: number;
    }
  | { ok: false; error: string };

export type PreviewManualProjectLeadsCsvResult =
  | {
      ok: true;
      totalRows: number;
      skippedMissingRequired: number;
      invalidRevenue: number;
      /** Nauji įrašai (company_code dar nėra šiame projekte). */
      wouldInsert: number;
      /** Esami įrašai, kuriuos atnaujintų upsert (jei įjungta „Atnaujinti esamus“). */
      wouldUpdate: number;
    }
  | { ok: false; error: string };

type ManualCsvImportPrepared = {
  totalRows: number;
  skippedMissingRequired: number;
  invalidRevenue: number;
  uniqueRows: Array<{ company_name: string; company_code: string; annual_revenue: number | null }>;
  existingInProject: Set<string>;
  viewByCode: Map<string, ClientViewMatch>;
};

function parseUpdateExistingFromFormData(formData: FormData): boolean {
  const raw = formData.get("updateExisting");
  if (raw == null) return true;
  const s = String(raw).trim().toLowerCase();
  return s !== "false" && s !== "0" && s !== "off" && s !== "no";
}

async function loadManualCsvImportPrepared(
  supabase: SupabaseClient,
  projectId: string,
  mapping: ManualCsvImportMapping,
  file: File
): Promise<{ error: string } | ManualCsvImportPrepared> {
  if (!mapping?.companyNameColumn || !mapping?.companyCodeColumn || !mapping?.annualRevenueColumn) {
    return { error: "Nenurodyti stulpelių mapping’ai." };
  }

  const text = await file.text();
  if (!text.trim()) return { error: "CSV failas tuščias." };

  const parsed = parseManualImportCsvForImport(text);

  if (process.env.NODE_ENV === "development") {
    const first = parsed.data[0];
    console.log("[manual CSV import server]", {
      delimiter: parsed.meta?.delimiter,
      fields: parsed.meta?.fields,
      firstRow: first,
    });
  }

  if (parsed.errors?.length) {
    return { error: parsed.errors[0]?.message ?? "Nepavyko perskaityti CSV." };
  }

  const rows = (parsed.data ?? []).filter((r) => r && typeof r === "object");
  const totalRows = rows.length;
  if (totalRows === 0) return { error: "CSV neturi duomenų eilučių." };

  const normalized = rows.map((r) => {
    const company_name = String(r[mapping.companyNameColumn] ?? "").trim();
    const company_code = normalizeCompanyCode(r[mapping.companyCodeColumn]);
    const rev = parseRevenueToNumber(r[mapping.annualRevenueColumn]);
    return { company_name, company_code, annual_revenue: rev.value, invalidRevenue: rev.invalid };
  });

  let skippedMissingRequired = 0;
  let invalidRevenue = 0;

  const usable = normalized.filter((r) => {
    if (!r.company_name || !r.company_code) {
      skippedMissingRequired += 1;
      return false;
    }
    if (r.invalidRevenue) invalidRevenue += 1;
    return true;
  });

  const uniqueByCode = new Map<string, (typeof usable)[number]>();
  for (const r of usable) {
    uniqueByCode.set(r.company_code, r);
  }
  const uniqueRows = Array.from(uniqueByCode.values());

  const viewByCode = new Map<string, ClientViewMatch>();
  for (const part of chunk(uniqueRows.map((r) => r.company_code), 200)) {
    const { data: viewRows, error: vErr } = await supabase
      .from("v_client_list_from_invoices")
      .select("company_code,client_id,last_invoice_date")
      .in("company_code", part);
    if (vErr) return { error: `Nepavyko patikrinti CRM: ${vErr.message}` };
    for (const vr of (viewRows ?? []) as Array<Record<string, unknown>>) {
      const code = normalizeCompanyCode(vr.company_code);
      if (!code) continue;
      viewByCode.set(code, {
        company_code: code,
        client_id: vr.client_id != null ? String(vr.client_id) : null,
        last_invoice_date: vr.last_invoice_date != null ? String(vr.last_invoice_date).slice(0, 10) : null,
      });
    }
  }

  const existingInProject = new Set<string>();
  for (const part of chunk(uniqueRows.map((r) => r.company_code), 200)) {
    const { data: exRows, error: exErr } = await supabase
      .from("project_manual_leads")
      .select("company_code")
      .eq("project_id", projectId)
      .in("company_code", part);
    if (exErr) return { error: `Nepavyko patikrinti dublikatų projekte: ${exErr.message}` };
    for (const er of (exRows ?? []) as { company_code?: unknown }[]) {
      const code = normalizeCompanyCode(er.company_code);
      if (code) existingInProject.add(code);
    }
  }

  return {
    totalRows,
    skippedMissingRequired,
    invalidRevenue,
    uniqueRows,
    existingInProject,
    viewByCode,
  };
}

export async function previewManualProjectLeadsCsvAction(
  projectId: string,
  mapping: ManualCsvImportMapping,
  formData: FormData
): Promise<PreviewManualProjectLeadsCsvResult> {
  if (!projectId || !isValidUuid(projectId)) return { ok: false, error: "Neteisingas projektas." };

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { ok: false, error: "Nepasirinktas CSV failas." };
  }

  let supabase;
  try {
    supabase = await createSupabaseSsrClient();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Supabase klaida" };
  }

  const { data: proj, error: pErr } = await supabase
    .from("projects")
    .select("id,project_type")
    .eq("id", projectId)
    .maybeSingle();
  if (pErr || !proj) return { ok: false, error: "Projektas nerastas." };
  if (!isManualProjectType(projectTypeFromDbRow(proj))) {
    return { ok: false, error: "CSV importas galimas tik rankiniam projektui." };
  }

  const prep = await loadManualCsvImportPrepared(supabase, projectId, mapping, file);
  if ("error" in prep) {
    return { ok: false, error: prep.error };
  }
  const p = prep;

  let wouldInsert = 0;
  let wouldUpdate = 0;
  for (const r of p.uniqueRows) {
    if (p.existingInProject.has(r.company_code)) wouldUpdate += 1;
    else wouldInsert += 1;
  }

  return {
    ok: true,
    totalRows: p.totalRows,
    skippedMissingRequired: p.skippedMissingRequired,
    invalidRevenue: p.invalidRevenue,
    wouldInsert,
    wouldUpdate,
  };
}

function normalizeCompanyCode(raw: unknown): string {
  const s = String(raw ?? "")
    .trim()
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, "");
  return s;
}

function parseRevenueToNumber(raw: unknown): { value: number | null; invalid: boolean } {
  const s0 = String(raw ?? "").trim();
  if (!s0) return { value: null, invalid: false };
  let s = s0.replace(/\u00a0/g, " ").replace(/\s+/g, "");
  // If only comma is present, treat it as decimal separator; otherwise drop commas as thousand separators.
  if (s.includes(",") && !s.includes(".")) {
    s = s.replace(",", ".");
  } else {
    s = s.replace(/,/g, "");
  }
  const n = Number.parseFloat(s);
  if (!Number.isFinite(n)) return { value: null, invalid: true };
  return { value: n, invalid: false };
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

type ClientViewMatch = {
  company_code: string;
  client_id: string | null;
  last_invoice_date: string | null;
};

function crmStatusFromViewRow(row: ClientViewMatch | null): "existing_client" | "former_client" | "new_lead" {
  if (!row) return "new_lead";
  const last = typeof row.last_invoice_date === "string" ? row.last_invoice_date.slice(0, 10) : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(last)) return "former_client";
  const cutoff = calendarDateMonthsAgo(ACTIVE_WINDOW_MONTHS);
  return last >= cutoff ? "existing_client" : "former_client";
}

export async function importManualProjectLeadsCsvAction(
  projectId: string,
  mapping: ManualCsvImportMapping,
  formData: FormData
): Promise<ImportManualProjectLeadsCsvResult> {
  if (!projectId || !isValidUuid(projectId)) return { ok: false, error: "Neteisingas projektas." };

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { ok: false, error: "Nepasirinktas CSV failas." };
  }
  if (!mapping?.companyNameColumn || !mapping?.companyCodeColumn || !mapping?.annualRevenueColumn) {
    return { ok: false, error: "Nenurodyti stulpelių mapping’ai." };
  }

  const updateExisting = parseUpdateExistingFromFormData(formData);

  let supabase;
  try {
    supabase = await createSupabaseSsrClient();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Supabase klaida" };
  }

  const { data: proj, error: pErr } = await supabase
    .from("projects")
    .select("id,project_type")
    .eq("id", projectId)
    .maybeSingle();
  if (pErr || !proj) return { ok: false, error: "Projektas nerastas." };
  if (!isManualProjectType(projectTypeFromDbRow(proj))) {
    return { ok: false, error: "CSV importas galimas tik rankiniam projektui." };
  }

  const prep = await loadManualCsvImportPrepared(supabase, projectId, mapping, file);
  if ("error" in prep) {
    return { ok: false, error: prep.error };
  }

  const { totalRows, skippedMissingRequired, invalidRevenue, uniqueRows, existingInProject, viewByCode } = prep;

  const fullPayload = uniqueRows.map((r) => {
    const match = viewByCode.get(r.company_code) ?? null;
    const crm_status = crmStatusFromViewRow(match);
    return {
      project_id: projectId,
      company_name: r.company_name,
      company_code: r.company_code,
      annual_revenue: r.annual_revenue,
      annual_revenue_year: mapping.annualRevenueYear ?? null,
      crm_status,
      crm_client_id: match?.client_id ?? null,
      last_order_at: match?.last_invoice_date ?? null,
    };
  });

  const payloadToApply = updateExisting
    ? fullPayload
    : fullPayload.filter((row) => !existingInProject.has(row.company_code));

  let existingClient = 0;
  let formerClient = 0;
  let newLead = 0;
  for (const row of payloadToApply) {
    if (row.crm_status === "existing_client") existingClient += 1;
    else if (row.crm_status === "former_client") formerClient += 1;
    else newLead += 1;
  }

  const skippedExisting = updateExisting ? 0 : fullPayload.length - payloadToApply.length;

  if (payloadToApply.length > 0) {
    if (updateExisting) {
      const { error: upErr } = await supabase
        .from("project_manual_leads")
        .upsert(payloadToApply, { onConflict: "project_id,company_code" });
      if (upErr) return { ok: false, error: upErr.message ?? "Nepavyko importuoti." };
    } else {
      const { error: insErr } = await supabase.from("project_manual_leads").insert(payloadToApply);
      if (insErr) return { ok: false, error: insErr.message ?? "Nepavyko importuoti." };
    }
  }

  const updated = updateExisting
    ? payloadToApply.filter((r) => existingInProject.has(r.company_code)).length
    : 0;
  const inserted = updateExisting ? payloadToApply.length - updated : payloadToApply.length;

  revalidatePath(`/projektai/${projectId}`);
  revalidatePath("/projektai");

  return {
    ok: true,
    totalRows,
    skippedMissingRequired,
    inserted,
    updated,
    skippedExisting,
    existingClient,
    formerClient,
    newLead,
    invalidRevenue,
  };
}

export async function linkExistingClientToManualProjectAction(
  projectId: string,
  clientKey: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ck = String(clientKey ?? "").trim();
  if (!projectId || !isValidUuid(projectId)) {
    return { ok: false, error: "Neteisingas projektas." };
  }
  if (!ck) {
    return { ok: false, error: "Trūksta kliento identifikatoriaus." };
  }

  let supabase;
  try {
    supabase = await createSupabaseSsrClient();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Supabase klaida" };
  }

  const { data: proj, error: projErr } = await supabase.from("projects").select("id, project_type").eq("id", projectId).maybeSingle();
  if (projErr || !proj) {
    return { ok: false, error: "Projektas nerastas." };
  }
  if (!isManualProjectType(projectTypeFromDbRow(proj))) {
    return { ok: false, error: "Galima tik rankiniu projektu." };
  }

  const { data: exists } = await supabase
    .from("v_client_list_from_invoices")
    .select("client_key")
    .eq("client_key", ck)
    .maybeSingle();
  if (!exists) {
    return { ok: false, error: "Klientas nerastas CRM sąraše." };
  }

  const { error } = await supabase.from("project_manual_linked_clients").insert({
    project_id: projectId,
    client_key: ck,
  });

  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "Šis klientas jau pridėtas prie šio projekto." };
    }
    console.error("[projectActions] linkExistingClientToManualProject failed", error);
    return { ok: false, error: error.message ?? "Nepavyko prijungti kliento." };
  }

  revalidatePath(`/projektai/${projectId}`);
  revalidatePath("/projektai");
  return { ok: true };
}

const MANUAL_LEAD_PLACEHOLDER_INVOICE_DATE = "2000-01-01";

function parseCandidateType(
  formData: FormData
): "auto" | "manual_lead" | "linked_client" | "procurement_contract" {
  const raw = String(formData.get("candidate_type") ?? "").trim().toLowerCase();
  if (raw === "manual_lead" || raw === "linked_client" || raw === "procurement_contract") return raw;
  return "auto";
}

async function insertPickedWorkItemRow(
  supabase: SupabaseClient,
  projectId: string,
  assignedTo: string,
  pick: {
    client_key: string;
    client_identifier_display: string;
    client_name_snapshot: string;
    snapshot_order_count: number;
    snapshot_revenue: number;
    snapshot_last_invoice_date: string;
    snapshot_priority: number;
    source_type: "auto" | "manual_lead" | "linked_client" | "procurement_contract";
    source_id: string | null;
  },
): Promise<
  | { ok: true; insertWorkItemMs: number; insertActivityMs: number; revalidateDetailMs: number }
  | { ok: false; error: string }
> {
  const baseRow = {
    project_id: projectId,
    client_key: pick.client_key,
    client_identifier_display: pick.client_identifier_display,
    client_name_snapshot: pick.client_name_snapshot,
    assigned_to: assignedTo,
    picked_at: new Date().toISOString(),
    snapshot_order_count: pick.snapshot_order_count,
    snapshot_revenue: pick.snapshot_revenue,
    snapshot_last_invoice_date: pick.snapshot_last_invoice_date,
    snapshot_priority: pick.snapshot_priority,
    call_status: BOARD_DEFAULT_CALL_STATUS,
    next_action: "",
    next_action_date: null,
    comment: "",
    result_status: "",
  };

  const tIns0 = Date.now();
  // Retry without source columns if DB has no migration 0036.
  const first = await supabase
    .from("project_work_items")
    .insert({
      ...baseRow,
      source_type: pick.source_type,
      source_id: pick.source_id,
    })
    .select("id")
    .single();

  let data = first.data;
  let err = first.error;
  if (err && isMissingWorkItemSourceColumnsError(err)) {
    const second = await supabase.from("project_work_items").insert(baseRow).select("id").single();
    data = second.data;
    err = second.error;
  }

  const inserted = data as { id: string } | null;
  const insErrFinal = err;
  const insertWorkItemMs = Date.now() - tIns0;

  if (insErrFinal || !inserted?.id) {
    if (insErrFinal?.code === "23505") {
      return { ok: false, error: "Šiam klientui jau yra atviras darbo įrašas šiame projekte." };
    }
    return { ok: false, error: insErrFinal?.message ?? "Nepavyko sukurti darbo eilutės." };
  }

  const wid = inserted.id;
  const tAct0 = Date.now();
  const { error: actErr } = await supabase.from("project_work_item_activities").insert({
    work_item_id: wid,
    occurred_at: new Date().toISOString(),
    action_type: "picked",
    call_status: BOARD_DEFAULT_CALL_STATUS,
    next_action: "",
    next_action_date: null,
    comment: "",
  });
  const insertActivityMs = Date.now() - tAct0;
  if (actErr) {
    await supabase.from("project_work_items").delete().eq("id", wid);
    return {
      ok: false,
      error: `Veiklos lentelė nepasiekiama arba migracija nepritaikyta: ${actErr.message}`,
    };
  }

  const tRev0 = Date.now();
  revalidatePath(`/projektai/${projectId}`);
  const revalidateDetailMs = Date.now() - tRev0;
  return { ok: true, insertWorkItemMs, insertActivityMs, revalidateDetailMs };
}

function finishPickTimings(
  startedAt: number,
  partial: Omit<PickClientFromProjectTimings, "totalServerMs">,
): PickClientFromProjectTimings {
  return { ...partial, totalServerMs: Date.now() - startedAt };
}

export async function pickClientFromProject(formData: FormData): Promise<PickClientFromProjectResult> {
  const tServer0 = Date.now();
  const projectId = String(formData.get("project_id") ?? "").trim();
  const candidateType = parseCandidateType(formData);
  const candidateId = String(formData.get("candidate_id") ?? "").trim();
  const clientKey = String(formData.get("client_key") ?? "").trim();
  const assignedTo = String(formData.get("assigned_to") ?? "").trim() || defaultProjectActor();

  if (!projectId || !/^[0-9a-f-]{36}$/i.test(projectId)) {
    return { ok: false, error: "Neteisingas projektas.", timings: finishPickTimings(tServer0, { projectLoadMs: 0 }) };
  }

  let supabase;
  try {
    supabase = await createSupabaseSsrClient();
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Supabase klaida",
      timings: finishPickTimings(tServer0, { projectLoadMs: 0 }),
    };
  }

  const tProj = Date.now();
  const { data: proj, error: projErr } = await supabase
    .from("projects")
    .select("id,filter_date_from,filter_date_to,min_order_count,inactivity_days,sort_option,project_type")
    .eq("id", projectId)
    .single();
  const projectLoadMs = Date.now() - tProj;

  if (projErr || !proj) {
    return {
      ok: false,
      error: "Projektas nerastas.",
      timings: finishPickTimings(tServer0, { projectLoadMs }),
    };
  }

  const isManual = isManualProjectType(projectTypeFromDbRow(proj));

  async function wrapInsert(
    partial: Omit<PickClientFromProjectTimings, "totalServerMs" | "insertWorkItemMs" | "insertActivityMs" | "revalidateDetailMs">,
    insertPromise: ReturnType<typeof insertPickedWorkItemRow>,
  ): Promise<PickClientFromProjectResult> {
    const ins = await insertPromise;
    if (!ins.ok) {
      return { ok: false, error: ins.error, timings: finishPickTimings(tServer0, { ...partial }) };
    }
    return {
      ok: true,
      timings: finishPickTimings(tServer0, {
        ...partial,
        insertWorkItemMs: ins.insertWorkItemMs,
        insertActivityMs: ins.insertActivityMs,
        revalidateDetailMs: ins.revalidateDetailMs,
      }),
    };
  }

  if (candidateType === "manual_lead") {
    if (!isManual) {
      return {
        ok: false,
        error: "Rankinio leado priskyrimas galimas tik rankiniame projekte.",
        timings: finishPickTimings(tServer0, { projectLoadMs }),
      };
    }
    if (!candidateId || !isValidUuid(candidateId)) {
      return {
        ok: false,
        error: "Neteisingas rankinio kandidato identifikatorius.",
        timings: finishPickTimings(tServer0, { projectLoadMs }),
      };
    }

    const { data: lead, error: leadErr } = await supabase
      .from("project_manual_leads")
      .select("id,project_id,company_name,company_code")
      .eq("id", candidateId)
      .eq("project_id", projectId)
      .maybeSingle();

    if (leadErr) {
      console.error("[pickClientFromProject] manual_lead", leadErr);
      return {
        ok: false,
        error: leadErr.message ?? "Nepavyko patikrinti kandidato.",
        timings: finishPickTimings(tServer0, { projectLoadMs }),
      };
    }
    if (!lead) {
      return {
        ok: false,
        error: "Rankinis kandidatas nerastas arba nepriklauso šiam projektui.",
        timings: finishPickTimings(tServer0, { projectLoadMs }),
      };
    }

    const ck = manualLeadClientKey(String(lead.id));
    return wrapInsert(
      { projectLoadMs },
      insertPickedWorkItemRow(supabase, projectId, assignedTo, {
        client_key: ck,
        client_identifier_display: formatProjectClientIdentifier(lead.company_code, null),
        client_name_snapshot: snapshotClientDisplayName(String(lead.company_name ?? ""), lead.company_code),
        snapshot_order_count: 0,
        snapshot_revenue: 0,
        snapshot_last_invoice_date: MANUAL_LEAD_PLACEHOLDER_INVOICE_DATE,
        snapshot_priority: 1,
        source_type: "manual_lead",
        source_id: String(lead.id),
      }),
    );
  }

  if (candidateType === "linked_client") {
    if (!isManual) {
      return {
        ok: false,
        error: "Susieto kliento priskyrimas galimas tik rankiniame projekte.",
        timings: finishPickTimings(tServer0, { projectLoadMs }),
      };
    }
    if (!candidateId || !isValidUuid(candidateId)) {
      return {
        ok: false,
        error: "Neteisingas susiejimo įrašo identifikatorius.",
        timings: finishPickTimings(tServer0, { projectLoadMs }),
      };
    }

    const { data: linkRow, error: linkErr } = await supabase
      .from("project_manual_linked_clients")
      .select("id,project_id,client_key")
      .eq("id", candidateId)
      .eq("project_id", projectId)
      .maybeSingle();

    if (linkErr) {
      console.error("[pickClientFromProject] linked_client", linkErr);
      return {
        ok: false,
        error: linkErr.message ?? "Nepavyko patikrinti kandidato.",
        timings: finishPickTimings(tServer0, { projectLoadMs }),
      };
    }
    if (!linkRow) {
      return {
        ok: false,
        error: "Šis klientas nėra šio projekto kandidatų sąraše.",
        timings: finishPickTimings(tServer0, { projectLoadMs }),
      };
    }

    const ck = String(linkRow.client_key ?? "").trim();
    if (!ck) {
      return { ok: false, error: "Trūksta kliento rakto.", timings: finishPickTimings(tServer0, { projectLoadMs }) };
    }

    const { data: viewRow, error: vErr } = await supabase
      .from("v_client_list_from_invoices")
      .select("client_key,company_code,client_id,company_name,invoice_count,total_revenue,last_invoice_date")
      .eq("client_key", ck)
      .maybeSingle();

    if (vErr || !viewRow) {
      return {
        ok: false,
        error: "Klientas nerastas CRM sąraše.",
        timings: finishPickTimings(tServer0, { projectLoadMs }),
      };
    }

    const vr = viewRow as {
      client_key: string;
      company_code: string | null;
      client_id: string | null;
      company_name: string | null;
      invoice_count: number | null;
      total_revenue: number | null;
      last_invoice_date: string | null;
    };

    const lastD =
      typeof vr.last_invoice_date === "string"
        ? vr.last_invoice_date.slice(0, 10)
        : String(vr.last_invoice_date ?? "").slice(0, 10) || MANUAL_LEAD_PLACEHOLDER_INVOICE_DATE;

    return wrapInsert(
      { projectLoadMs },
      insertPickedWorkItemRow(supabase, projectId, assignedTo, {
        client_key: vr.client_key,
        client_identifier_display: formatProjectClientIdentifier(vr.company_code, vr.client_id),
        client_name_snapshot: snapshotClientDisplayName(String(vr.company_name ?? ""), vr.company_code),
        snapshot_order_count: Math.max(0, Number(vr.invoice_count ?? 0)),
        snapshot_revenue: Number(vr.total_revenue ?? 0),
        snapshot_last_invoice_date: lastD,
        snapshot_priority: 1,
        source_type: "linked_client",
        source_id: String(linkRow.id),
      }),
    );
  }

  if (candidateType === "procurement_contract") {
    if (!isProcurementProjectType(projectTypeFromDbRow(proj))) {
      return {
        ok: false,
        error: "Sutarties priskyrimas galimas tik viešųjų pirkimų projekte.",
        timings: finishPickTimings(tServer0, { projectLoadMs }),
      };
    }
    if (!candidateId || !isValidUuid(candidateId)) {
      return {
        ok: false,
        error: "Neteisingas sutarties identifikatorius.",
        timings: finishPickTimings(tServer0, { projectLoadMs }),
      };
    }

    const { data: cRow, error: cErr } = await supabase
      .from("project_procurement_contracts")
      .select("id,project_id,organization_name,organization_code,contract_object,valid_until,value")
      .eq("id", candidateId)
      .eq("project_id", projectId)
      .maybeSingle();

    if (cErr) {
      console.error("[pickClientFromProject] procurement_contract", cErr);
      return {
        ok: false,
        error: cErr.message ?? "Nepavyko įkelti sutarties.",
        timings: finishPickTimings(tServer0, { projectLoadMs }),
      };
    }
    if (!cRow) {
      return {
        ok: false,
        error: "Sutartis nerasta arba nepriklauso šiam projektui.",
        timings: finishPickTimings(tServer0, { projectLoadMs }),
      };
    }

    const c = cRow as {
      id: string;
      organization_name: string | null;
      organization_code: string | null;
      contract_object: string | null;
      valid_until: string | null;
      value: number | null;
    };

    const validUntil =
      typeof c.valid_until === "string"
        ? c.valid_until.slice(0, 10)
        : String(c.valid_until ?? "").slice(0, 10) || MANUAL_LEAD_PLACEHOLDER_INVOICE_DATE;
    const rev = c.value != null && Number.isFinite(Number(c.value)) ? Number(c.value) : 0;
    const orgName = String(c.organization_name ?? "").trim();
    const obj = String(c.contract_object ?? "").trim();
    const title = orgName && obj ? `${orgName} — ${obj}` : orgName || obj || "Sutartis";

    return wrapInsert(
      { projectLoadMs },
      insertPickedWorkItemRow(supabase, projectId, assignedTo, {
        client_key: procurementContractClientKey(String(c.id)),
        client_identifier_display: formatProjectClientIdentifier(c.organization_code, null),
        client_name_snapshot: title,
        snapshot_order_count: 0,
        snapshot_revenue: rev,
        snapshot_last_invoice_date: validUntil,
        snapshot_priority: 1,
        source_type: "procurement_contract",
        source_id: String(c.id),
      }),
    );
  }

  if (isManual) {
    return {
      ok: false,
      error:
        "Pasirinkite kandidatą iš sąrašo. Jei klaida kartojasi, atnaujinkite puslapį (pasenęs priskyrimo tipas).",
      timings: finishPickTimings(tServer0, { projectLoadMs }),
    };
  }

  if (!clientKey) {
    return {
      ok: false,
      error: "Trūksta kliento identifikatoriaus.",
      timings: finishPickTimings(tServer0, { projectLoadMs }),
    };
  }

  const pr = proj as Record<string, unknown>;
  const rules: ProjectRulesRow = {
    id: String(pr.id ?? ""),
    filter_date_from: String(pr.filter_date_from ?? ""),
    filter_date_to: String(pr.filter_date_to ?? ""),
    min_order_count: Number(pr.min_order_count ?? 1),
    inactivity_days: pr.inactivity_days == null ? null : Number(pr.inactivity_days),
    sort_option: String(pr.sort_option ?? ""),
    project_type: projectTypeFromDbRow(proj),
  };

  const snapshotPriorityRaw = formData.get("snapshot_priority");
  let snapshotPriority = parseInt(String(snapshotPriorityRaw ?? ""), 10);
  if (!Number.isFinite(snapshotPriority) || snapshotPriority < 1) {
    snapshotPriority = 1;
  }

  let rpcMatchMs = 0;
  let sortFindMs = 0;
  let row: SnapshotCandidateRow | null = null;

  const tRpc = Date.now();
  const singleRes = await rpcMatchProjectCandidateForPick(
    supabase,
    projectId,
    String(pr.filter_date_from).slice(0, 10),
    String(pr.filter_date_to).slice(0, 10),
    Number(pr.min_order_count ?? 1),
    Number(pr.inactivity_days ?? 90),
    clientKey,
  );
  rpcMatchMs += Date.now() - tRpc;

  const rpcMissingMigration =
    !singleRes.ok && String(singleRes.error).includes("0082_match_project_candidate_for_pick");

  if (singleRes.ok && singleRes.row) {
    const tSort = Date.now();
    const sort = parseProjectSortOption(String(pr.sort_option ?? ""));
    const sortedOne = sortSnapshotCandidates([singleRes.row], sort);
    row = sortedOne[0] ?? null;
    sortFindMs = Date.now() - tSort;
  } else if (rpcMissingMigration) {
    const tLegacy = Date.now();
    const sortedRes = await fetchSortedCandidatesForProject(supabase, rules);
    rpcMatchMs += Date.now() - tLegacy;
    if (!sortedRes.ok) {
      return {
        ok: false,
        error: sortedRes.error,
        timings: finishPickTimings(tServer0, { projectLoadMs, rpcMatchMs }),
      };
    }
    const tSort = Date.now();
    const sorted = sortedRes.rows;
    const idx = sorted.findIndex((r) => r.client_key === clientKey);
    sortFindMs = Date.now() - tSort;
    if (idx < 0) {
      return {
        ok: false,
        error:
          "Klientas šiuo metu nėra kandidatų sąraše (gali būti jau priskirtas, užsakė arba nebetenkina taisyklių).",
        timings: finishPickTimings(tServer0, { projectLoadMs, rpcMatchMs, sortFindMs }),
      };
    }
    row = sorted[idx]!;
    snapshotPriority = idx + 1;
  } else if (!singleRes.ok) {
    return {
      ok: false,
      error: singleRes.error,
      timings: finishPickTimings(tServer0, { projectLoadMs, rpcMatchMs }),
    };
  } else {
    return {
      ok: false,
      error:
        "Klientas šiuo metu nėra kandidatų sąraše (gali būti jau priskirtas, užsakė arba nebetenkina taisyklių).",
      timings: finishPickTimings(tServer0, { projectLoadMs, rpcMatchMs, sortFindMs }),
    };
  }

  if (!row) {
    return {
      ok: false,
      error:
        "Klientas šiuo metu nėra kandidatų sąraše (gali būti jau priskirtas, užsakė arba nebetenkina taisyklių).",
      timings: finishPickTimings(tServer0, { projectLoadMs, rpcMatchMs, sortFindMs }),
    };
  }

  return wrapInsert(
    { projectLoadMs, rpcMatchMs, sortFindMs },
    insertPickedWorkItemRow(supabase, projectId, assignedTo, {
      client_key: row.client_key,
      client_identifier_display: formatProjectClientIdentifier(row.company_code, row.client_id),
      client_name_snapshot: snapshotClientDisplayName(row.company_name, row.company_code),
      snapshot_order_count: row.order_count,
      snapshot_revenue: row.total_revenue,
      snapshot_last_invoice_date: row.last_invoice_date,
      snapshot_priority: snapshotPriority,
      source_type: "auto",
      source_id: null,
    }),
  );
}

/** Naujas veiksmas istorijoje + dabartinė būsena ant darbo eilutės (kaip Sheets eilutės papildymas). */
export async function saveWorkItemTouchpoint(
  workItemId: string,
  formData: FormData
): Promise<{ error: string | null }> {
  let action_type = String(formData.get("action_type") ?? "call").trim();
  if (!["call", "email", "commercial"].includes(action_type)) {
    action_type = "call";
  }

  const call_status = normalizeKanbanCallStatus(String(formData.get("call_status") ?? ""));
  const next_action = "";
  const next_action_date_raw = String(formData.get("next_action_date") ?? "").trim();
  const comment = String(formData.get("comment") ?? "").trim();

  const next_action_date = next_action_date_raw ? parseDateInputToIso(next_action_date_raw) : null;
  if (next_action_date_raw && !next_action_date) {
    return { error: "Neteisinga data. Naudokite formatą YYYY-MM-DD (pvz. 2026-04-15)." };
  }

  if (call_status === "Skambinti") {
    return {
      error:
        "Po įrašyto veiksmo negalite likti stulpelyje „Skambinti“. Pasirinkite kitą stulpelį (kitą veiksmą).",
    };
  }
  if (call_status === "Laukti" && !next_action_date) {
    return { error: "Stulpeliui „Laukti“ nurodykite datą (laukimo pabaiga)." };
  }

  let supabase;
  try {
    supabase = createSupabaseServerClient();
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Supabase klaida" };
  }

  const { data: existing, error: exErr } = await supabase
    .from("project_work_items")
    .select("call_status")
    .eq("id", workItemId)
    .single();
  if (exErr || !existing) return { error: exErr?.message ?? "Darbo eilutė nerasta." };

  const prevCol = normalizeKanbanCallStatus(existing.call_status as string);
  const goingDone = call_status === "Užbaigta";
  const leavingDone = prevCol === "Užbaigta" && !goingDone;

  let nextResultStatus: string | undefined;
  if (goingDone) {
    const parsed = parseCompletionResult(formData.get("completion_result"));
    if (!parsed) {
      return { error: "Pasirinkite užbaigimo rezultatą." };
    }
    if (parsed === "completion_procurement_other" && !comment.trim()) {
      return { error: "Pasirinkus „Kita“, įveskite komentarą." };
    }
    nextResultStatus = parsed;
  } else if (leavingDone) {
    nextResultStatus = "in_progress";
  }

  const { error: insErr } = await supabase.from("project_work_item_activities").insert({
    work_item_id: workItemId,
    occurred_at: new Date().toISOString(),
    action_type,
    call_status,
    next_action,
    next_action_date,
    comment,
  });
  if (insErr) return { error: insErr.message };

  const updatePayload: Record<string, unknown> = {
    call_status,
    next_action,
    next_action_date,
    comment,
    work_updated_at: new Date().toISOString(),
  };
  if (nextResultStatus !== undefined) {
    updatePayload.result_status = nextResultStatus;
  }

  const { error } = await supabase.from("project_work_items").update(updatePayload).eq("id", workItemId);

  if (error) return { error: error.message };

  const { data: row } = await supabase
    .from("project_work_items")
    .select("project_id")
    .eq("id", workItemId)
    .single();
  const pid = row?.project_id as string | undefined;
  if (pid) {
    revalidatePath(`/projektai/${pid}`);
    revalidatePath("/projektai");
  }
  return { error: null };
}

/** Sąrašo forma be `action_type` — numatytai skambutis. */
export async function updateProjectWorkItem(
  workItemId: string,
  formData: FormData
): Promise<{ error: string | null }> {
  if (!formData.has("action_type")) {
    formData.append("action_type", "call");
  }
  return saveWorkItemTouchpoint(workItemId, formData);
}

/**
 * Kanban: perkėlimas po patvirtinimo formoje. Jei veiklos lentelės insert nepavyksta,
 * darbo eilutė grąžinama į ankstesnę būseną.
 */
export async function confirmKanbanMove(formData: FormData): Promise<{ error: string | null }> {
  const workItemId = String(formData.get("work_item_id") ?? "").trim();
  const newCallStatus = normalizeKanbanCallStatus(
    String(formData.get("call_status") ?? formData.get("new_call_status") ?? "")
  );
  let action_type = String(formData.get("action_type") ?? "call").trim();
  if (!["call", "email", "commercial"].includes(action_type)) {
    action_type = "call";
  }
  const comment = String(formData.get("comment") ?? "").trim();
  const next_action = "";
  const next_action_date_raw = String(formData.get("next_action_date") ?? "").trim();
  const next_action_date = next_action_date_raw ? parseDateInputToIso(next_action_date_raw) : null;
  if (next_action_date_raw && !next_action_date) {
    return { error: "Neteisinga data. Naudokite formatą YYYY-MM-DD." };
  }

  if (!workItemId || !/^[0-9a-f-]{36}$/i.test(workItemId)) {
    return { error: "Neteisingas darbo įrašas." };
  }
  if (newCallStatus === "Laukti" && !next_action_date) {
    return { error: "Stulpeliui „Laukti“ nurodykite datą (YYYY-MM-DD)." };
  }

  const completionForDone =
    newCallStatus === "Užbaigta" ? parseCompletionResult(formData.get("completion_result")) : null;
  if (newCallStatus === "Užbaigta" && !completionForDone) {
    return { error: "Pasirinkite užbaigimo rezultatą." };
  }
  if (
    completionForDone === "completion_procurement_other" &&
    !String(formData.get("comment") ?? "").trim()
  ) {
    return { error: "Pasirinkus „Kita“, įveskite komentarą." };
  }

  let supabase;
  try {
    supabase = createSupabaseServerClient();
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Supabase klaida" };
  }

  const { data: row, error: fErr } = await supabase
    .from("project_work_items")
    .select("id,project_id,next_action,next_action_date,result_status,call_status,comment,work_updated_at")
    .eq("id", workItemId)
    .maybeSingle();

  if (fErr || !row) return { error: fErr?.message ?? "Darbo eilutė nerasta." };

  const currentCol = normalizeKanbanCallStatus(row.call_status as string);
  if (isProjectWorkItemClosed(row.result_status as string) && currentCol !== "Užbaigta") {
    return { error: "Uždarytos eilutės negalima perkelti lentoje." };
  }

  const prevCol = normalizeKanbanCallStatus(row.call_status as string);
  if (prevCol === newCallStatus) {
    return { error: null };
  }

  const goingDone = newCallStatus === "Užbaigta";
  const leavingDone = prevCol === "Užbaigta" && !goingDone;

  const snapshot = {
    call_status: row.call_status,
    next_action: row.next_action,
    next_action_date: row.next_action_date,
    result_status: row.result_status,
    comment: row.comment,
    work_updated_at: row.work_updated_at,
  };

  const updateRow: Record<string, unknown> = {
    call_status: newCallStatus,
    next_action,
    next_action_date: activityDateForDb(next_action_date),
    comment,
    work_updated_at: new Date().toISOString(),
  };
  if (goingDone && completionForDone) {
    updateRow.result_status = completionForDone;
  } else if (leavingDone) {
    updateRow.result_status = "in_progress";
  }

  const { error: uErr } = await supabase.from("project_work_items").update(updateRow).eq("id", workItemId);
  if (uErr) return { error: uErr.message };

  const { error: aErr } = await supabase.from("project_work_item_activities").insert({
    work_item_id: workItemId,
    occurred_at: new Date().toISOString(),
    action_type,
    call_status: newCallStatus,
    next_action,
    next_action_date: activityDateForDb(next_action_date),
    comment,
  });

  if (aErr) {
    console.error("[confirmKanbanMove] activity log insert failed, reverting row", aErr);
    const { error: revErr } = await supabase
      .from("project_work_items")
      .update({
        call_status: snapshot.call_status,
        next_action: snapshot.next_action,
        next_action_date: snapshot.next_action_date,
        result_status: snapshot.result_status,
        comment: snapshot.comment,
        work_updated_at: snapshot.work_updated_at,
      })
      .eq("id", workItemId);
    if (revErr) {
      console.error("[confirmKanbanMove] revert failed", revErr);
    }
    return { error: `Nepavyko išsaugoti istorijos: ${aErr.message}` };
  }

  const pid = row.project_id as string;
  revalidatePath(`/projektai/${pid}`);
  revalidatePath("/projektai");
  return { error: null };
}

/**
 * Pašalina darbo eilutę iš „Darbas“ (Kanban), nepašalina istorijos.
 * `result_status` = returned_to_candidates; įrašas lieka su activities.
 */
export async function returnWorkItemToCandidates(workItemId: string): Promise<{ error: string | null }> {
  let supabase;
  try {
    supabase = createSupabaseServerClient();
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Supabase klaida" };
  }

  if (!workItemId || !/^[0-9a-f-]{36}$/i.test(workItemId)) {
    return { error: "Neteisingas darbo įrašas." };
  }

  const { data: row, error: fErr } = await supabase
    .from("project_work_items")
    .select("id,project_id,call_status,next_action,next_action_date,result_status,comment,work_updated_at")
    .eq("id", workItemId)
    .maybeSingle();

  if (fErr || !row) return { error: fErr?.message ?? "Darbo eilutė nerasta." };

  if (isReturnedToCandidates(row.result_status as string)) {
    return { error: "Šis darbo įrašas jau pažymėtas kaip grąžintas į kandidatus." };
  }

  const snapshot = {
    result_status: row.result_status,
    work_updated_at: row.work_updated_at,
  };

  const { error: uErr } = await supabase
    .from("project_work_items")
    .update({
      result_status: RESULT_RETURNED_TO_CANDIDATES,
      work_updated_at: new Date().toISOString(),
    })
    .eq("id", workItemId);

  if (uErr) return { error: uErr.message };

  const { error: aErr } = await supabase.from("project_work_item_activities").insert({
    work_item_id: workItemId,
    occurred_at: new Date().toISOString(),
    action_type: "returned_to_candidates",
    call_status: String(row.call_status ?? ""),
    next_action: String(row.next_action ?? ""),
    next_action_date: activityDateForDb(row.next_action_date),
    comment: "Grąžinta į kandidatus (darbo eilutė pašalinta iš lentos).",
  });

  if (aErr) {
    console.error("[returnWorkItemToCandidates] activity insert failed, reverting", aErr);
    await supabase
      .from("project_work_items")
      .update({
        result_status: snapshot.result_status,
        work_updated_at: snapshot.work_updated_at,
      })
      .eq("id", workItemId);
    return { error: `Nepavyko išsaugoti istorijos: ${aErr.message}` };
  }

  const pid = row.project_id as string;
  revalidatePath(`/projektai/${pid}`);
  revalidatePath("/projektai");
  return { error: null };
}

export async function setProjectStatus(
  projectId: string,
  status: "active" | "archived" | "deleted"
): Promise<{ error: string | null }> {
  let supabase;
  try {
    supabase = createSupabaseServerClient();
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Supabase klaida" };
  }

  const { error } = await supabase.from("projects").update({ status }).eq("id", projectId);
  if (error) return { error: error.message };
  revalidatePath("/projektai");
  revalidatePath(`/projektai/${projectId}`);
  return { error: null };
}

export async function moveProjectToTrashAction(projectId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!projectId || !isValidUuid(projectId)) return { ok: false, error: "Neteisingas projektas." };
  let supabase;
  try {
    supabase = await createSupabaseSsrClient();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Supabase klaida" };
  }
  const { data: proj, error: pErr } = await supabase.from("projects").select("id,status").eq("id", projectId).maybeSingle();
  if (pErr || !proj) return { ok: false, error: "Projektas nerastas." };
  const st = String((proj as { status?: string }).status ?? "");
  if (st !== "archived") {
    return { ok: false, error: "Ištrinti galima tik archyvuotą projektą. Pirma suarchyvuokite." };
  }
  const res = await setProjectStatus(projectId, "deleted");
  if (res.error) return { ok: false, error: res.error };
  return { ok: true };
}

export async function restoreDeletedProjectAction(projectId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!projectId || !isValidUuid(projectId)) return { ok: false, error: "Neteisingas projektas." };
  let supabase;
  try {
    supabase = await createSupabaseSsrClient();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Supabase klaida" };
  }
  const { data: proj, error: pErr } = await supabase.from("projects").select("id,status").eq("id", projectId).maybeSingle();
  if (pErr || !proj) return { ok: false, error: "Projektas nerastas." };
  const st = String((proj as { status?: string }).status ?? "");
  if (st !== "deleted") {
    return { ok: false, error: "Atkurti galima tik ištrintą projektą." };
  }
  // Safety: restore to archived, so user must explicitly activate.
  const res = await setProjectStatus(projectId, "archived");
  if (res.error) return { ok: false, error: res.error };
  return { ok: true };
}

export async function hardDeleteProjectForeverAction(
  projectId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!projectId || !isValidUuid(projectId)) return { ok: false, error: "Neteisingas projektas." };
  let supabase;
  try {
    supabase = await createSupabaseSsrClient();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Supabase klaida" };
  }
  const { data: proj, error: pErr } = await supabase.from("projects").select("id,status").eq("id", projectId).maybeSingle();
  if (pErr || !proj) return { ok: false, error: "Projektas nerastas." };
  const st = String((proj as { status?: string }).status ?? "");
  if (st !== "deleted") {
    return { ok: false, error: "Naikinti visam laikui galima tik ištrintą (trash) projektą." };
  }
  const { error } = await supabase.from("projects").delete().eq("id", projectId);
  if (error) return { ok: false, error: error.message ?? "Nepavyko ištrinti projekto." };
  revalidatePath("/projektai");
  return { ok: true };
}

export type ImportProcurementContractsCsvResult =
  | { ok: true; merged: number; issueCount: number; issues: string[] }
  | { ok: false; error: string };

export async function importProcurementContractsCsvAction(
  formData: FormData
): Promise<ImportProcurementContractsCsvResult> {
  const projectId = String(formData.get("project_id") ?? "").trim();
  if (!projectId || !isValidUuid(projectId)) {
    return { ok: false, error: "Neteisingas projektas." };
  }

  const file = formData.get("csv_file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Pasirinkite CSV failą." };
  }

  let supabase;
  try {
    supabase = await createSupabaseSsrClient();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Supabase klaida" };
  }

  const { data: proj, error: pErr } = await supabase
    .from("projects")
    .select("id, project_type, owner_user_id, procurement_notify_days_before")
    .eq("id", projectId)
    .maybeSingle();

  if (pErr || !proj) return { ok: false, error: "Projektas nerastas." };
  if (!isProcurementProjectType(projectTypeFromDbRow(proj))) {
    return { ok: false, error: "CSV importas galimas tik viešųjų pirkimų projekte." };
  }

  const ownerId = (proj as { owner_user_id?: string | null }).owner_user_id ?? null;
  const notifyDaysBefore = Math.min(
    365,
    Math.max(0, Number((proj as { procurement_notify_days_before?: number | null }).procurement_notify_days_before ?? 14) || 14)
  );

  let text: string;
  try {
    text = await file.text();
  } catch {
    return { ok: false, error: "Nepavyko perskaityti failo." };
  }

  const parsed = parseProcurementImportCsv(text);
  const first = (parsed.data ?? [])[0];
  if (!first || typeof first !== "object") {
    return { ok: false, error: "CSV tuščias arba be antraštės." };
  }
  const keys = resolveProcurementCsvColumnKeys(first as Record<string, unknown>);
  const { rows, issues } = mapProcurementCsvRows(parsed, keys);
  const issueSamples = issues.slice(0, 12).map((i) => `${i.line}: ${i.message}`);

  if (rows.length === 0) {
    return {
      ok: false,
      error:
        issues.length > 0
          ? `Nepavyko importuoti eilučių. Pvz.: ${issueSamples[0] ?? "—"}`
          : "Nėra tinkamų eilučių.",
    };
  }

  /** Ta pati CSV eilutė du kartus → paskutinė laimi (vengia Postgres „ON CONFLICT“ tos pačios partijos klaidos). */
  const byDedupe = new Map<string, (typeof rows)[number]>();
  for (const r of rows) {
    byDedupe.set(r.import_dedupe_key, r);
  }
  const uniqueRows = [...byDedupe.values()];

  const payload = uniqueRows.map((r) => ({
    import_dedupe_key: r.import_dedupe_key,
    contract_uid: r.contract_uid,
    contract_number: r.contract_number,
    contract_object: r.contract_object,
    organization_name: r.organization_name,
    organization_code: r.organization_code,
    supplier: r.supplier,
    value: r.value,
    valid_until: r.valid_until,
    type: r.type,
    assigned_to: ownerId,
    notify_days_before: notifyDaysBefore,
  }));

  const { data: merged, error: rpcErr } = await supabase.rpc("merge_project_procurement_contracts_json", {
    p_project_id: projectId,
    p_rows: payload,
  });

  if (rpcErr) {
    return { ok: false, error: rpcErr.message ?? "Importo klaida." };
  }

  revalidatePath(`/projektai/${projectId}`);
  return {
    ok: true,
    merged: typeof merged === "number" ? merged : uniqueRows.length,
    issueCount: issues.length,
    issues: issueSamples,
  };
}

function isProcurementContractStatus(v: string): v is (typeof PROCUREMENT_CONTRACT_STATUSES)[number] {
  return (PROCUREMENT_CONTRACT_STATUSES as readonly string[]).includes(v);
}

export async function updateProcurementContractStatusAction(
  contractId: string,
  status: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!contractId || !isValidUuid(contractId)) {
    return { ok: false, error: "Neteisinga sutartis." };
  }
  const st = String(status ?? "").trim().toLowerCase();
  if (!isProcurementContractStatus(st)) {
    return { ok: false, error: "Neteisingas statusas." };
  }

  let supabase;
  try {
    supabase = await createSupabaseSsrClient();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Supabase klaida" };
  }

  const { data: row, error: fErr } = await supabase
    .from("project_procurement_contracts")
    .select("id, project_id")
    .eq("id", contractId)
    .maybeSingle();
  if (fErr || !row) return { ok: false, error: "Sutartis nerasta." };

  const { data: proj } = await supabase.from("projects").select("project_type").eq("id", row.project_id).maybeSingle();
  if (!proj || !isProcurementProjectType(projectTypeFromDbRow(proj))) {
    return { ok: false, error: "Projektas netinkamas." };
  }

  const { error } = await supabase.from("project_procurement_contracts").update({ status: st }).eq("id", contractId);
  if (error) return { ok: false, error: error.message ?? "Nepavyko išsaugoti." };

  revalidatePath(`/projektai/${row.project_id}`);
  return { ok: true };
}

export async function updateProcurementContractAssigneeAction(
  contractId: string,
  assigneeUserId: string | null | undefined
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!contractId || !isValidUuid(contractId)) {
    return { ok: false, error: "Neteisinga sutartis." };
  }
  let target: string | null = assigneeUserId ?? null;
  if (target === "") target = null;
  if (target != null && !isValidUuid(target)) {
    return { ok: false, error: "Neteisingas naudotojas." };
  }

  let supabase;
  try {
    supabase = await createSupabaseSsrClient();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Supabase klaida" };
  }

  const { data: row, error: fErr } = await supabase
    .from("project_procurement_contracts")
    .select("id, project_id")
    .eq("id", contractId)
    .maybeSingle();
  if (fErr || !row) return { ok: false, error: "Sutartis nerasta." };

  const { data: proj } = await supabase.from("projects").select("project_type").eq("id", row.project_id).maybeSingle();
  if (!proj || !isProcurementProjectType(projectTypeFromDbRow(proj))) {
    return { ok: false, error: "Projektas netinkamas." };
  }

  if (target) {
    const u = await crmUserExists(supabase, target);
    if (!u.ok) return { ok: false, error: messageForCrmUserExistsFailure(u) };
    if (!u.exists) return { ok: false, error: "Naudotojas nerastas." };
  }

  const { error } = await supabase
    .from("project_procurement_contracts")
    .update({ assigned_to: target })
    .eq("id", contractId);
  if (error) return { ok: false, error: error.message ?? "Nepavyko išsaugoti." };

  revalidatePath(`/projektai/${row.project_id}`);
  return { ok: true };
}

export async function updateProjectProcurementNotifyDaysAction(
  projectId: string,
  formData: FormData
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!projectId || !isValidUuid(projectId)) {
    return { ok: false, error: "Neteisingas projektas." };
  }
  const raw = String(formData.get("procurement_notify_days_before") ?? "").trim();
  let n = parseInt(raw, 10);
  if (!Number.isFinite(n)) n = 14;
  n = Math.min(365, Math.max(0, n));

  let supabase;
  try {
    supabase = await createSupabaseSsrClient();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Supabase klaida" };
  }

  const { data: proj, error: pErr } = await supabase.from("projects").select("id, project_type").eq("id", projectId).maybeSingle();
  if (pErr || !proj) return { ok: false, error: "Projektas nerastas." };
  if (!isProcurementProjectType(projectTypeFromDbRow(proj))) {
    return { ok: false, error: "Netinkamas projekto tipas." };
  }

  const { error } = await supabase
    .from("projects")
    .update({ procurement_notify_days_before: n })
    .eq("id", projectId);
  if (error) return { ok: false, error: error.message ?? "Nepavyko išsaugoti." };

  revalidatePath(`/projektai/${projectId}`);
  return { ok: true };
}

export async function renameProjectNameAction(
  projectId: string,
  rawName: string
): Promise<{ ok: true; name: string } | { ok: false; error: string }> {
  const name = String(rawName ?? "").trim();
  if (!name) return { ok: false, error: "Pavadinimas negali būti tuščias." };
  if (name.length > 100) return { ok: false, error: "Maks. 100 simbolių." };

  let supabase;
  try {
    supabase = await createSupabaseSsrClient();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Supabase klaida" };
  }

  const { error } = await supabase.from("projects").update({ name }).eq("id", projectId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/projektai");
  revalidatePath(`/projektai/${projectId}`);
  return { ok: true, name };
}

function compareProjectsForStableOrder(
  a: { sort_order: number | null; created_at: string | null },
  b: { sort_order: number | null; created_at: string | null },
): number {
  const ao = a.sort_order ?? Number.MAX_SAFE_INTEGER;
  const bo = b.sort_order ?? Number.MAX_SAFE_INTEGER;
  if (ao !== bo) return ao - bo;
  return String(b.created_at ?? "").localeCompare(String(a.created_at ?? ""));
}

/**
 * Persists drag-and-drop order for one status tab without creating duplicate `sort_order`
 * values across the whole `projects` table (which breaks global `.order("sort_order")`).
 */
export async function updateProjectsSortOrderAction(
  orderedProjectIds: string[],
  statusFilter: ProjectsSortOrderTabFilter,
): Promise<UpdateProjectsSortOrderResult> {
  const ids = uniqueIdsPreserveOrder(Array.isArray(orderedProjectIds) ? orderedProjectIds : []);
  if (ids.length === 0) return { ok: false, error: "Trūksta projektų." };
  if (ids.some((id) => !isValidUuid(id))) return { ok: false, error: "Neteisingas projekto identifikatorius." };

  let supabase;
  try {
    supabase = await createSupabaseSsrClient();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Supabase klaida" };
  }

  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false, error: "Prisijungimas baigėsi. Perkraukite puslapį." };

  const { data: rows, error: selectError } = await supabase
    .from("projects")
    .select("id,status,sort_order,created_at");
  if (selectError) {
    console.error("[projectActions] updateProjectsSortOrder select failed", selectError);
    return { ok: false, error: selectError.message ?? "Nepavyko nuskaityti projektų." };
  }
  if (!rows?.length) return { ok: false, error: "Nerasta projektų." };

  const sameStatus = rows.filter((r) => r.status === statusFilter);
  if (sameStatus.length !== ids.length) {
    return { ok: false, error: "Nepilnas projektų sąrašas rikiavimui." };
  }
  const sameSet = new Set(sameStatus.map((r) => r.id));
  for (const id of ids) {
    if (!sameSet.has(id)) return { ok: false, error: "Projektų statusas neatitinka skirtuko." };
  }

  const others = rows
    .filter((r) => r.status !== statusFilter)
    .sort((a, b) => compareProjectsForStableOrder(a, b));

  const finalOrder = [...ids, ...others.map((r) => r.id)];

  for (let i = 0; i < finalOrder.length; i++) {
    const id = finalOrder[i];
    const { error } = await supabase.from("projects").update({ sort_order: i }).eq("id", id);
    if (error) {
      console.error("[projectActions] updateProjectsSortOrder update failed", error);
      return { ok: false, error: error.message ?? "Nepavyko išsaugoti tvarkos." };
    }
  }

  revalidatePath("/projektai");
  return { ok: true };
}

export async function archiveProjectFormAction(projectId: string, _formData?: FormData): Promise<void> {
  const res = await setProjectStatus(projectId, "archived");
  if (res.error) throw new Error(res.error);
}

export async function unarchiveProjectFormAction(projectId: string, _formData?: FormData): Promise<void> {
  const res = await setProjectStatus(projectId, "active");
  if (res.error) throw new Error(res.error);
}

export async function restoreDeletedProjectFormAction(projectId: string, _formData?: FormData): Promise<void> {
  const r = await restoreDeletedProjectAction(projectId);
  if (!r.ok) throw new Error(r.error);
}
