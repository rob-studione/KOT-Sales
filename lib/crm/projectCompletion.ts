/**
 * Užbaigus darbo eilutę stulpelyje „Užbaigta“ — privalomas aiškus `result_status` kodas.
 * Senas bendras „completed“ lieka uždarančiu statusu (migracijos / istorija).
 */

export const WORK_ITEM_COMPLETION_RESULT_VALUES = [
  "completion_sent_email",
  "completion_sent_commercial",
  "completion_relevant_as_needed",
  "completion_translations_not_relevant",
  "completion_other_provider",
] as const;

/** Viešųjų pirkimų darbo eilutės užbaigimas (stulpelis „Užbaigta“). */
export const PROCUREMENT_WORK_ITEM_COMPLETION_RESULT_VALUES = [
  "completion_procurement_invite_participate",
  "completion_procurement_include_purchase",
  "completion_procurement_contact_failed",
  "completion_procurement_not_relevant",
  "completion_procurement_other",
] as const;

export type WorkItemCompletionResult = (typeof WORK_ITEM_COMPLETION_RESULT_VALUES)[number];
export type ProcurementWorkItemCompletionResult =
  (typeof PROCUREMENT_WORK_ITEM_COMPLETION_RESULT_VALUES)[number];

const ALLOWED = new Set<string>([
  ...WORK_ITEM_COMPLETION_RESULT_VALUES,
  ...PROCUREMENT_WORK_ITEM_COMPLETION_RESULT_VALUES,
]);

/** Formos / serverio reikšmė → DB laukas arba null. */
export function parseCompletionResult(
  raw: unknown
): WorkItemCompletionResult | ProcurementWorkItemCompletionResult | null {
  const s = String(raw ?? "").trim();
  if (!s || !ALLOWED.has(s)) return null;
  return s as WorkItemCompletionResult | ProcurementWorkItemCompletionResult;
}

export function completionResultLabel(value: string): string {
  switch (String(value).trim()) {
    case "completion_sent_email":
      return "Išsiųstas laiškas";
    case "completion_sent_commercial":
      return "Išsiųstas komercinis";
    case "completion_relevant_as_needed":
      return "Aktualu pagal poreikį";
    case "completion_translations_not_relevant":
      return "Vertimai neaktualūs";
    case "completion_other_provider":
      return "Turi kitą teikėją";
    case "completion_procurement_invite_participate":
      return "Pakvies dalyvauti";
    case "completion_procurement_include_purchase":
      return "Įtrauks į pirkimą";
    case "completion_procurement_contact_failed":
      return "Nepavyko susisiekti";
    case "completion_procurement_not_relevant":
      return "Neaktualu";
    case "completion_procurement_other":
      return "Kita";
    default:
      return value;
  }
}
