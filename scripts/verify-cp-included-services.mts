import {
  includedServicesFromLines,
  isLineIncluded,
  normalizeCategoryDiscounts,
} from "@/lib/commercialProposal/discounts";
import { applyGlobalDiscount } from "@/lib/commercialProposal/money";
import { buildProposalSnapshot } from "@/lib/commercialProposal/snapshot";
import { CP_TEMPLATE_LT_COMMERCIAL_V2, type CommercialProposalLine } from "@/lib/commercialProposal/types";

function assert(cond: unknown, message: string) {
  if (!cond) throw new Error(message);
}

function line(
  partial: Pick<CommercialProposalLine, "category" | "label"> &
    Partial<Omit<CommercialProposalLine, "category" | "label">>
): Omit<CommercialProposalLine, "id" | "proposal_id"> {
  return {
    catalog_item_id: partial.catalog_item_id ?? partial.label,
    sort_order: partial.sort_order ?? 1,
    base_price: partial.base_price ?? 10,
    calculated_price: partial.calculated_price ?? 10,
    final_price: partial.final_price ?? 10,
    is_manual_override: partial.is_manual_override ?? false,
    is_from_price: false,
    is_free: false,
    included: partial.included,
    currency: "EUR",
    unit: "psl.",
    ...partial,
  };
}

const catalog = [
  line({ category: "translation", label: "LT-EN", catalog_item_id: "LT-EN", sort_order: 1, base_price: 10.8, calculated_price: 10.8, final_price: 10.8 }),
  line({ category: "translation", label: "LT-RU", catalog_item_id: "LT-RU", sort_order: 2, base_price: 10.8, calculated_price: 10.8, final_price: 10.8 }),
  line({ category: "translation", label: "LT-DE", catalog_item_id: "LT-DE", sort_order: 3, base_price: 12, calculated_price: 12, final_price: 12 }),
  line({ category: "ai_translation", label: "AI-LT-EN", catalog_item_id: "AI-LT-EN", sort_order: 1, base_price: 6.48, calculated_price: 6.48, final_price: 6.48 }),
  line({ category: "ai_translation", label: "AI-LT-DE", catalog_item_id: "AI-LT-DE", sort_order: 2, base_price: 7, calculated_price: 7, final_price: 7 }),
  line({ category: "additional_service", label: "Apostille", catalog_item_id: "apostille", sort_order: 1, base_price: 25, calculated_price: 25, final_price: 25 }),
  line({ category: "additional_service", label: "Interpreting", catalog_item_id: "interpreting", sort_order: 2, base_price: 40, calculated_price: 40, final_price: 40 }),
];

assert(catalog.every((l) => isLineIncluded(l)), "T1 default: missing included means included");
assert(
  includedServicesFromLines(catalog).translation &&
    includedServicesFromLines(catalog).ai_translation &&
    includedServicesFromLines(catalog).additional_service,
  "T1 default: all categories included"
);

const manager = {
  id: "m1",
  first_name: "Ada",
  last_name: "Vadybininkė",
  display_name: "Ada Vadybininkė",
  job_title: "Pardavimų vadybininkė",
  email: null,
  phone: null,
  avatar_url: null,
};

function snap(lines: typeof catalog) {
  return buildProposalSnapshot({
    proposalNumber: "CP-2026-0001",
    createdAt: "2026-08-20T00:00:00.000Z",
    generatedAt: "2026-08-20T00:00:00.000Z",
    templateVersion: CP_TEMPLATE_LT_COMMERCIAL_V2,
    globalDiscountPct: 0,
    discounts: normalizeCategoryDiscounts({ translation: 10, ai_translation: 0, additional_service: 15 }),
    client: { client_key: "c1", client_id: "c1", company_code: null, name: "Klientas" },
    salesManager: manager,
    history: [],
    lines,
  });
}

const defaultSnap = snap(catalog);
assert(defaultSnap.lines.length === catalog.length, "T1 snapshot keeps every default line");
assert(defaultSnap.included_services?.translation === true, "T1 included_services.translation");
assert(defaultSnap.included_services?.ai_translation === true, "T1 included_services.ai_translation");
assert(defaultSnap.included_services?.additional_service === true, "T1 included_services.additional_service");

const translationOnly = catalog.map((l) => ({
  ...l,
  included: l.category === "translation" && (l.catalog_item_id === "LT-EN" || l.catalog_item_id === "LT-RU"),
}));
const t2 = snap(translationOnly);
assert(t2.lines.length === 2, "T2 only LT-EN and LT-RU");
assert(t2.lines.every((l) => l.category === "translation"), "T2 no AI or extras");
assert(t2.included_services?.translation === true, "T2 translation category on");
assert(t2.included_services?.ai_translation === false, "T2 AI off");
assert(t2.included_services?.additional_service === false, "T2 extras off");
assert(!t2.lines.some((l) => l.label === "LT-DE"), "T2 unused language omitted");

const aiOnly = catalog.map((l) => ({ ...l, included: l.category === "ai_translation" }));
const t3 = snap(aiOnly);
assert(t3.lines.length === 2 && t3.lines.every((l) => l.category === "ai_translation"), "T3 AI only");
assert(t3.included_services?.translation === false, "T3 standard translation absent");

const apostilleOnly = catalog.map((l) => ({ ...l, included: l.catalog_item_id === "apostille" }));
const t4 = snap(apostilleOnly);
assert(t4.lines.length === 1 && t4.lines[0]?.catalog_item_id === "apostille", "T4 apostille only");
assert(t4.included_services?.additional_service === true, "T4 extras category on");
assert(t4.included_services?.translation === false && t4.included_services?.ai_translation === false, "T4 other categories off");

const discounted = catalog.map((l) => {
  const included =
    l.category === "translation" || l.catalog_item_id === "apostille";
  const pct = l.category === "translation" ? 10 : l.category === "additional_service" ? 15 : 0;
  const calculated = applyGlobalDiscount(l.base_price ?? 0, pct);
  return { ...l, included, calculated_price: calculated, final_price: calculated };
});
const t5 = snap(discounted);
assert(t5.lines.length === 4, "T5 included translation + apostille");
assert(!t5.lines.some((l) => l.category === "ai_translation"), "T5 excluded AI not in snapshot");
assert(!t5.lines.some((l) => l.catalog_item_id === "interpreting"), "T5 excluded extra not in snapshot");
assert(t5.discounts?.translation === 10 && t5.discounts?.ai_translation === 0 && t5.discounts?.additional_service === 15, "T5 discounts stored");
assert(Math.abs((t5.lines.find((l) => l.catalog_item_id === "LT-EN")?.final_price ?? 0) - 9.72) < 1e-9, "T5 translation 10%");
assert(Math.abs((t5.lines.find((l) => l.catalog_item_id === "apostille")?.final_price ?? 0) - 21.25) < 1e-9, "T5 apostille 15%");

const frozen = structuredClone(t2);
const mutatedCatalog = catalog.map((l) => ({ ...l, final_price: 99, included: true }));
const later = snap(mutatedCatalog);
assert(frozen.lines.length === 2, "T6 old snapshot length unchanged");
assert(frozen.lines.every((l) => l.final_price !== 99), "T6 old prices unchanged");
assert(later.lines.length === catalog.length, "T6 new snapshot can include catalog changes");

console.log("verify-cp-included-services: ok");
