import type { CpCategoryDiscounts } from "@/lib/commercialProposal/types";

/** Display-only. Internal template IDs stay unchanged. */
export function templateVersionLabel(version: string): string {
  if (version === "LT_COMMERCIAL_V2") return "LT standartinis";
  if (version === "LT_COMMERCIAL_V1") return "LT V1";
  return version;
}

/** Display-only compact category discounts. Values are not altered. */
export function formatCategoryDiscountsLabel(discounts: CpCategoryDiscounts): string {
  return `Vert. ${discounts.translation}% · AI ${discounts.ai_translation}% · Pap. ${discounts.additional_service}%`;
}
