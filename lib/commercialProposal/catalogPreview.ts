import { applyGlobalDiscount } from "@/lib/commercialProposal/money";
import { categoryDiscount, type CpCategoryDiscounts } from "@/lib/commercialProposal/discounts";
import { CP_CATEGORIES, type CpPriceCategory, type CpPriceItem } from "@/lib/commercialProposal/types";

export type CategoryPricePreview = {
  category: CpPriceCategory;
  count: number;
  minBase: number | null;
  minAfter: number | null;
  isFrom: boolean;
  currency: string;
};

export function previewCatalogPrices(
  items: CpPriceItem[],
  discounts: CpCategoryDiscounts
): CategoryPricePreview[] {
  return CP_CATEGORIES.map((category) => {
    const rows = items.filter((item) => item.category === category && item.active && !item.is_free && item.base_price != null);
    const pct = categoryDiscount(discounts, category);
    if (rows.length === 0) {
      return { category, count: 0, minBase: null, minAfter: null, isFrom: false, currency: "EUR" };
    }
    let minBase = rows[0]!.base_price!;
    let anyFrom = false;
    const prices = new Set<number>();
    for (const row of rows) {
      const base = row.base_price!;
      prices.add(base);
      if (base < minBase) minBase = base;
      if (row.is_from_price) anyFrom = true;
    }
    return {
      category,
      count: rows.length,
      minBase,
      minAfter: applyGlobalDiscount(minBase, pct),
      isFrom: anyFrom || prices.size > 1,
      currency: rows[0]!.currency || "EUR",
    };
  });
}
