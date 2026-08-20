import {
  categoryDiscount,
  discountsFromSnapshot,
  normalizeCategoryDiscounts,
  uniformDiscountPct,
} from "@/lib/commercialProposal/discounts";
import { applyGlobalDiscount } from "@/lib/commercialProposal/money";
import { recalculateLine } from "@/lib/commercialProposal/snapshot";

function assert(cond: unknown, message: string) {
  if (!cond) throw new Error(message);
}

function almostEqual(a: number, b: number) {
  return Math.abs(a - b) < 1e-9;
}

const case1 = normalizeCategoryDiscounts({ translation: 10, ai_translation: 0, additional_service: 0 });
assert(almostEqual(applyGlobalDiscount(10.8, categoryDiscount(case1, "translation")), 9.72), "T1 translation 10.80-10%");
assert(almostEqual(applyGlobalDiscount(6.48, categoryDiscount(case1, "ai_translation")), 6.48), "T1 AI unchanged");
assert(almostEqual(applyGlobalDiscount(25, categoryDiscount(case1, "additional_service")), 25), "T1 extra unchanged");
assert(uniformDiscountPct(case1) === null, "T1 mixed discounts");

const case2 = normalizeCategoryDiscounts({ translation: 0, ai_translation: 20, additional_service: 15 });
assert(almostEqual(applyGlobalDiscount(10.8, categoryDiscount(case2, "translation")), 10.8), "T2 translation unchanged");
assert(almostEqual(applyGlobalDiscount(6.48, categoryDiscount(case2, "ai_translation")), 5.18), "T2 AI 20%");
assert(almostEqual(applyGlobalDiscount(25, categoryDiscount(case2, "additional_service")), 21.25), "T2 extra 15%");

const calculated = recalculateLine(
  { base_price: 10.8, is_free: false, is_manual_override: false, final_price: null },
  10
);
assert(almostEqual(calculated.calculated_price ?? -1, 9.72), "T3 calculated 9.72");
assert(almostEqual(calculated.final_price ?? -1, 9.72), "T3 final follows discount");
const overridden = recalculateLine(
  { base_price: 10.8, is_free: false, is_manual_override: true, final_price: 9.5 },
  10
);
assert(almostEqual(overridden.calculated_price ?? -1, 9.72), "T3 calculated stays 9.72");
assert(almostEqual(overridden.final_price ?? -1, 9.5), "T3 override 9.50");

const historical = discountsFromSnapshot({ global_discount_pct: 5 });
assert(historical.translation === 5 && historical.ai_translation === 5 && historical.additional_service === 5, "T4 old snapshot fallback");
const frozen = discountsFromSnapshot({
  global_discount_pct: 0,
  discounts: { translation: 10, ai_translation: 0, additional_service: 0 },
});
assert(frozen.translation === 10 && frozen.ai_translation === 0, "T4 frozen category discounts");

console.log("verify-cp-category-discounts: ok");
