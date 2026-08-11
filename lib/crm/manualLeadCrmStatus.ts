import {
  LOST_PRESET_MONTHS,
  MANUAL_LEAD_EXISTING_CLIENT_MONTHS,
  calendarDateMonthsAgo,
  type LostPresetMonth,
} from "@/lib/crm/analyticsDates";

export type ManualLeadCrmStatus = "existing_client" | "former_client" | "new_lead";

export const MANUAL_LEAD_EXISTING_MONTH_PRESETS = LOST_PRESET_MONTHS;

export function parseManualLeadExistingMonths(raw: string | undefined | null): LostPresetMonth {
  const n = parseInt(String(raw ?? "").trim(), 10);
  if ((LOST_PRESET_MONTHS as readonly number[]).includes(n)) return n as LostPresetMonth;
  return MANUAL_LEAD_EXISTING_CLIENT_MONTHS as LostPresetMonth;
}

/**
 * Live Esamas / Buvęs / Naujas pagal paskutinę sąskaitą ir pasirinktą langą (mėn.).
 * Naujas = nėra datos; Esamas = last >= cutoff; Buvęs = last < cutoff.
 */
export function computeManualLeadCrmStatus(
  lastOrderAt: string | null | undefined,
  existingMonths: number = MANUAL_LEAD_EXISTING_CLIENT_MONTHS
): ManualLeadCrmStatus {
  const last = typeof lastOrderAt === "string" ? lastOrderAt.trim().slice(0, 10) : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(last)) return "new_lead";
  const months = Number.isFinite(existingMonths) && existingMonths > 0 ? existingMonths : MANUAL_LEAD_EXISTING_CLIENT_MONTHS;
  const cutoff = calendarDateMonthsAgo(months);
  return last >= cutoff ? "existing_client" : "former_client";
}
