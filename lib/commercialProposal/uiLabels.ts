import type { CpCategoryDiscounts } from "@/lib/commercialProposal/types";

/** Display-only. Internal template IDs stay unchanged. */
export function templateVersionLabel(version: string): string {
  if (version === "LT_COMMERCIAL_V2") return "LT standartinis";
  if (version === "LT_COMMERCIAL_V1") return "LT V1";
  return version;
}

function formatNonZeroDiscount(pct: number): string | null {
  const n = Number(pct);
  if (!Number.isFinite(n) || n <= 0) return null;
  return `−${n}%`;
}

/** Display-only compact category discounts. Values are not altered. */
export function formatCategoryDiscountsLabel(discounts: CpCategoryDiscounts): string {
  const translation = formatNonZeroDiscount(discounts.translation);
  const ai = formatNonZeroDiscount(discounts.ai_translation);
  const extra = formatNonZeroDiscount(discounts.additional_service);
  const parts = [
    translation ? `Vertimas ${translation}` : null,
    ai ? `AI ${ai}` : null,
    extra ? `Papildomos ${extra}` : null,
  ].filter((v): v is string => Boolean(v));
  return parts.length === 0 ? "Be nuolaidų" : parts.join(" · ");
}
