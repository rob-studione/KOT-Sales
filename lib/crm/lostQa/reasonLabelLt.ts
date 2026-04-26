import type { LostPrimaryReason } from "@/lib/crm/lostQaDb";
import { LOST_PRIMARY_REASONS } from "@/lib/crm/lostQaDb";

/** Default Lithuanian labels for enum codes (dashboard + analysis fallbacks). */
export const LOST_PRIMARY_REASON_LABEL_LT: Record<LostPrimaryReason, string> = {
  price_too_high: "Kaina per didelė",
  slow_response: "Per lėtas atsakas",
  poor_response_quality: "Prastas atsakymo turinys",
  missing_followup: "Trūko follow-up",
  client_not_qualified: "Netinkamas klientas",
  client_went_silent: "Klientas nebeatsakė",
  competitor_selected: "Pasirinko kitą tiekėją",
  scope_mismatch: "Apimties neatitikimas",
  internal_mistake: "Vidinė klaida",
  timeline_not_fit: "Netiko terminas",
  other: "Kita",
};

export function lostPrimaryReasonLabelLtOrDefault(code: string): string {
  const c = String(code ?? "").trim() as LostPrimaryReason;
  if ((LOST_PRIMARY_REASONS as readonly string[]).includes(c)) {
    return LOST_PRIMARY_REASON_LABEL_LT[c] ?? c;
  }
  return c || "Kita";
}
