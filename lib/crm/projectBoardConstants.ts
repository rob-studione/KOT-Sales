import { vilniusTodayDateString } from "@/lib/crm/vilniusTime";

/**
 * CALL_WORK (Kanban): fiksuoti „kitas veiksmas“ stulpeliai — ne bendras funnel.
 * Kandidatai = dinaminis sąrašas; čia tik priskirti darbo įrašai.
 */

/** Stulpelių eilė (tiksliai kaip Sheets). */
export const KANBAN_NEXT_ACTION_COLUMNS = [
  "Skambinti",
  "Perskambinti",
  "Siųsti laišką",
  "Siųsti komercinį",
  "Skubus veiksmas",
  "Užbaigta",
] as const;

export type KanbanNextActionColumn = (typeof KANBAN_NEXT_ACTION_COLUMNS)[number];

/** Viešųjų pirkimų projekto lentelė (be komercinio ir skubaus). */
export const PROCUREMENT_KANBAN_COLUMNS: readonly KanbanNextActionColumn[] = [
  "Skambinti",
  "Perskambinti",
  "Siųsti laišką",
  "Užbaigta",
] as const;

/** Priskyrus klientą į darbą — pradinis stulpelis. */
export const BOARD_DEFAULT_CALL_STATUS: KanbanNextActionColumn = "Skambinti";

/** Seni „Skambučio statusas“ žodžiai → naujas stulpelis (rodymui ir bucket'inimui). */
const LEGACY_CALL_STATUS_TO_KANBAN: Record<string, KanbanNextActionColumn> = {
  "": "Skambinti",
  Neatsiliepė: "Skambinti",
  Perskambins: "Perskambinti",
  Laukti: "Perskambinti",
  "Susisiekti vėliau": "Perskambinti",
  "Aktualu pagal poreikį": "Perskambinti",
};

export function normalizeCallStatusKey(raw: string | null | undefined): string {
  return raw == null ? "" : String(raw).trim();
}

/**
 * Sugretina įrašą su vienu iš fiksuotų Kanban stulpelių (įskaitant migracijas iš senų reikšmių).
 */
export function normalizeKanbanCallStatus(raw: string | null | undefined): KanbanNextActionColumn {
  const k = normalizeCallStatusKey(raw);
  if ((KANBAN_NEXT_ACTION_COLUMNS as readonly string[]).includes(k)) {
    return k as KanbanNextActionColumn;
  }
  return LEGACY_CALL_STATUS_TO_KANBAN[k] ?? "Skambinti";
}

/**
 * KPI / vadybininkų suvestinė: po skambučio pereita į šiuos Kanban stulpelius → laikoma „atsiliepė“.
 * Naujus statusus pridėti čia (ir atitinkamai į NOT_ANSWERED_STATUSES, jei tai „laukia skambučio“ būsena).
 */
export const ANSWERED_STATUSES: readonly KanbanNextActionColumn[] = [
  "Siųsti laišką",
  "Siųsti komercinį",
  "Skubus veiksmas",
  "Užbaigta",
] as const;

/**
 * KPI: skambutis dar be kontakto — šie stulpeliai = „neatsiliepė“.
 */
export const NOT_ANSWERED_STATUSES: readonly KanbanNextActionColumn[] = ["Skambinti", "Perskambinti"] as const;

const ANSWERED_STATUS_SET = new Set<string>(ANSWERED_STATUSES);
const NOT_ANSWERED_STATUS_SET = new Set<string>(NOT_ANSWERED_STATUSES);

/** Veiklos įrašui: aiškus skambučio rezultatas (ne Kanban stulpelis). */
export const CALL_ACTIVITY_OUTCOME_ANSWERED = "answered" as const;
export const CALL_ACTIVITY_OUTCOME_NOT_ANSWERED = "not_answered" as const;

/** Skambutis analitikoje laikomas „atsiliepė“ pagal `ANSWERED_STATUSES`. */
export function isCallAnsweredByStatus(callStatus: string | null | undefined): boolean {
  const raw = normalizeCallStatusKey(callStatus).toLowerCase();
  if (raw === CALL_ACTIVITY_OUTCOME_ANSWERED || raw === "atsiliepė" || raw === "atsiliepe") return true;
  const k = normalizeKanbanCallStatus(callStatus);
  return ANSWERED_STATUS_SET.has(k);
}

/** Skambutis analitikoje laikomas „neatsiliepė“ pagal `NOT_ANSWERED_STATUSES`. */
export function isCallNotAnsweredByStatus(callStatus: string | null | undefined): boolean {
  const raw = normalizeCallStatusKey(callStatus).toLowerCase();
  if (raw === CALL_ACTIVITY_OUTCOME_NOT_ANSWERED || raw === "neatsiliepė" || raw === "neatsiliepe") return true;
  const k = normalizeKanbanCallStatus(callStatus);
  return NOT_ANSWERED_STATUS_SET.has(k);
}

/** Rezultatas po „Grąžinti į kandidatus“ — nebe Kanban, bet istorija lieka. */
export const RESULT_RETURNED_TO_CANDIDATES = "returned_to_candidates";

export function isReturnedToCandidates(resultStatus: string | null | undefined): boolean {
  return String(resultStatus ?? "")
    .trim()
    .toLowerCase() === RESULT_RETURNED_TO_CANDIDATES;
}

/** Ar darbo eilutė „uždaryta“ (unikalus indeksas kandidatams — nebeblokuoja). */
export function isProjectWorkItemClosed(resultStatus: string | null | undefined): boolean {
  const s = String(resultStatus ?? "")
    .trim()
    .toLowerCase();
  return [
    "completed",
    "closed",
    "cancelled",
    "uždaryta",
    "lost",
    "neaktualus",
    "completion_sent_email",
    "completion_sent_commercial",
    "completion_relevant_as_needed",
    "completion_translations_not_relevant",
    "completion_other_provider",
    "completion_company_liquidated",
    "completion_procurement_invite_participate",
    "completion_procurement_include_purchase",
    "completion_procurement_contact_failed",
    "completion_procurement_not_relevant",
    "completion_procurement_other",
    RESULT_RETURNED_TO_CANDIDATES,
  ].includes(s);
}

/** Ar „grąžinimas“ gali būti paprastas dialogas (tik paėmimas, be kitų veiksmų istorijoje). */
export function isTrivialReturnHistory(activities: { action_type: string }[]): boolean {
  if (activities.length === 0) return true;
  return activities.length === 1 && activities[0].action_type === "picked";
}

export function boardColumnIdFromCallStatus(callStatus: string): string {
  return normalizeKanbanCallStatus(callStatus);
}

export function callStatusFromBoardColumnId(columnId: string): string {
  return columnId;
}

/** Antraštė viešųjų pirkimų lentoje („Laukti“ rodoma kaip „Laukiame“). */
export function procurementKanbanColumnTitle(columnKey: string): string {
  const k = normalizeKanbanCallStatus(columnKey);
  return k;
}

/** Senesnę būseną sugretinti su viešųjų pirkimų stulpeliais (kad kortelė nepranyktų). */
export function mapCallStatusToProcurementBoardColumn(
  raw: string | null | undefined
): KanbanNextActionColumn {
  const k = normalizeKanbanCallStatus(raw);
  const allowed = new Set<string>(PROCUREMENT_KANBAN_COLUMNS as readonly string[]);
  if (allowed.has(k)) return k;
  if (k === "Siųsti komercinį") return "Siųsti laišką";
  if (k === "Skubus veiksmas") return "Perskambinti";
  return "Skambinti";
}

/** Tik fiksuoti stulpeliai — be dinaminių „papildomų“ statusų. */
export function buildBoardColumnOrder(opts?: {
  variant?: "default" | "procurement";
}): KanbanNextActionColumn[] {
  if (opts?.variant === "procurement") {
    return [...PROCUREMENT_KANBAN_COLUMNS];
  }
  return [...KANBAN_NEXT_ACTION_COLUMNS];
}

/**
 * Stulpelio antraštės apatinė riba (~3px, tik antraštė).
 */
export function kanbanColumnHeaderBorderClass(columnKey: string): string {
  const k = normalizeKanbanCallStatus(columnKey);
  switch (k) {
    case "Skambinti":
      return "border-b-[3px] border-b-red-600";
    case "Perskambinti":
      return "border-b-[3px] border-b-amber-500";
    case "Siųsti laišką":
      return "border-b-[3px] border-b-[#7C4A57]";
    case "Siųsti komercinį":
      return "border-b-[3px] border-b-[#7C4A57]";
    case "Skubus veiksmas":
      return "border-b-[3px] border-b-red-500";
    case "Užbaigta":
      return "border-b-[3px] border-b-green-600";
    default:
      return "border-b-[3px] border-b-zinc-300";
  }
}

/** Stulpelio konteineris: „Užbaigta“ — šiek tiek pilkesnis fonas. */
export function kanbanColumnShellClass(columnKey: string): string {
  const k = normalizeKanbanCallStatus(columnKey);
  if (k === "Užbaigta") {
    return "border-zinc-300/90 bg-zinc-100/65";
  }
  return "border-zinc-200/90 bg-zinc-50/50";
}

/** Formos / pasirinkimų sąrašas (tik Kanban stulpeliai). */
export function callStatusSelectOptions(): KanbanNextActionColumn[] {
  return [...KANBAN_NEXT_ACTION_COLUMNS];
}

export function callStatusOptionLabel(key: string): string {
  const raw = normalizeCallStatusKey(key).toLowerCase();
  if (raw === CALL_ACTIVITY_OUTCOME_ANSWERED || raw === "atsiliepė" || raw === "atsiliepe") return "Atsiliepė";
  if (raw === CALL_ACTIVITY_OUTCOME_NOT_ANSWERED || raw === "neatsiliepė" || raw === "neatsiliepe")
    return "Neatsiliepė";
  return normalizeKanbanCallStatus(key);
}

/** Kanban patvirtinimo forma: kas buvo atlikta prieš naują stulpelį. */
export const KANBAN_COMPLETED_ACTION_VALUES = [
  "call_answered",
  "call_not_answered",
  "email",
  "commercial",
  "status_only",
] as const;
export type KanbanCompletedAction = (typeof KANBAN_COMPLETED_ACTION_VALUES)[number];

export function parseKanbanCompletedAction(raw: string | null | undefined): KanbanCompletedAction {
  const v = String(raw ?? "").trim();
  if ((KANBAN_COMPLETED_ACTION_VALUES as readonly string[]).includes(v)) return v as KanbanCompletedAction;
  return "status_only";
}

/**
 * Numatytas „Atliktas veiksmas“ pagal perkėlimą (naudotojas gali pakeisti modale).
 */
export function defaultKanbanCompletedAction(fromColumn: string, toColumn: string): KanbanCompletedAction {
  const from = normalizeKanbanCallStatus(fromColumn);
  const to = normalizeKanbanCallStatus(toColumn);
  if (to === "Perskambinti") return "call_not_answered";
  const postCallTargets: readonly KanbanNextActionColumn[] = [
    "Siųsti laišką",
    "Siųsti komercinį",
    "Užbaigta",
    "Skubus veiksmas",
  ];
  if ((from === "Skambinti" || from === "Perskambinti") && (postCallTargets as readonly string[]).includes(to)) {
    return "call_answered";
  }
  return "status_only";
}

export function kanbanCompletedActionLabel(v: KanbanCompletedAction): string {
  switch (v) {
    case "call_answered":
      return "Skambinta – atsiliepė";
    case "call_not_answered":
      return "Skambinta – neatsiliepė";
    case "email":
      return "Laiškas";
    case "commercial":
      return "Komercinis";
    case "status_only":
      return "Tik pakeisti statusą";
    default:
      return "Tik pakeisti statusą";
  }
}

/** Veiklos laiko juostai: antrinė eilutė (Kanban stulpelis arba skambučio rezultatas). */
export function workItemActivityOutcomeLine(actionType: string, callStatus: string): { label: string; value: string } {
  const at = actionType.trim().toLowerCase();
  const cs = normalizeCallStatusKey(callStatus);
  const csl = cs.toLowerCase();
  if (
    at === "call" &&
    (csl === CALL_ACTIVITY_OUTCOME_ANSWERED ||
      csl === CALL_ACTIVITY_OUTCOME_NOT_ANSWERED ||
      csl === "atsiliepė" ||
      csl === "atsiliepe" ||
      csl === "neatsiliepė" ||
      csl === "neatsiliepe")
  ) {
    return { label: "Skambučio rezultatas", value: callStatusOptionLabel(callStatus) };
  }
  return { label: "Sekantis veiksmas (Kanban)", value: callStatusOptionLabel(callStatus) };
}

/** Pagrindinio darbo srauto veiksmų tipai (istorijoje gali būti ir senesnių tipų, pvz. pastaba). */
export const WORK_ITEM_ACTION_TYPES = ["call", "email", "commercial"] as const;
export type WorkItemTouchActionType = (typeof WORK_ITEM_ACTION_TYPES)[number];

/** Numatytas veiksmo tipas pagal „Sekantis veiksmas (Kanban)“ stulpelį. */
export function defaultWorkItemActionTypeForKanbanColumn(column: string): WorkItemTouchActionType {
  const k = normalizeKanbanCallStatus(column);
  if (k === "Siųsti laišką") return "email";
  if (k === "Siųsti komercinį") return "commercial";
  return "call";
}

export function isCallKpiActionType(actionType: string): boolean {
  return actionType.trim().toLowerCase() === "call";
}

export function workItemActionTypeLabel(t: string): string {
  switch (t.trim().toLowerCase()) {
    case "call":
      return "Skambutis";
    case "email":
      return "Laiškas";
    case "note":
      return "Pastaba";
    case "commercial":
      return "Komercinis";
    case "status_change":
      return "Stulpelio keitimas (lenta)";
    case "picked":
      return "Paėmė į darbą";
    case "returned_to_candidates":
      return "Grąžinta į kandidatus";
    default:
      return t;
  }
}

/** „Laukti“ stulpelis: paryškinti, kai laukiama data jau pasiekta / praleista (neautomatinis perkėlimas). */
export function waitColumnHighlightState(
  callStatus: string | null | undefined,
  nextActionDate: string | null | undefined
): "none" | "today" | "overdue" {
  // "Laukti" status is deprecated; normalize maps it to "Perskambinti".
  if (normalizeKanbanCallStatus(callStatus) !== "Perskambinti") return "none";
  const d = typeof nextActionDate === "string" ? nextActionDate.trim() : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return "none";
  const today = vilniusTodayDateString();
  if (d < today) return "overdue";
  if (d === today) return "today";
  return "none";
}

/** Ar kortelė rodoma Kanban lentoje (įskaitant „Užbaigta“ stulpelį su uždarytu rezultatu). */
export function isWorkItemOnKanbanBoard(item: { call_status: string; result_status: string }): boolean {
  if (normalizeKanbanCallStatus(item.call_status) === "Užbaigta") return true;
  return !isProjectWorkItemClosed(item.result_status);
}
