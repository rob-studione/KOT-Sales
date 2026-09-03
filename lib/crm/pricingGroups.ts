import { clampDiscountPct, type CpCategoryDiscounts, ZERO_CATEGORY_DISCOUNTS } from "@/lib/commercialProposal/discounts";

export type CpPricingGroup = {
  id: string;
  name: string;
  sort_order: number;
  active: boolean;
  is_default: boolean;
  discounts: CpCategoryDiscounts;
};

export function discountsFromPricingGroup(row: {
  translation_pct?: unknown;
  ai_translation_pct?: unknown;
  additional_service_pct?: unknown;
}): CpCategoryDiscounts {
  return {
    translation: clampDiscountPct(row.translation_pct),
    ai_translation: clampDiscountPct(row.ai_translation_pct),
    additional_service: clampDiscountPct(row.additional_service_pct),
  };
}

export function mapPricingGroup(row: Record<string, unknown>): CpPricingGroup {
  return {
    id: String(row.id),
    name: String(row.name ?? "").trim() || "Grupė",
    sort_order: Number(row.sort_order) || 0,
    active: Boolean(row.active),
    is_default: Boolean(row.is_default),
    discounts: discountsFromPricingGroup(row),
  };
}

export function defaultPricingGroup(groups: CpPricingGroup[]): CpPricingGroup | null {
  const active = groups.filter((g) => g.active);
  return active.find((g) => g.is_default) ?? active[0] ?? groups[0] ?? null;
}

export { ZERO_CATEGORY_DISCOUNTS };
