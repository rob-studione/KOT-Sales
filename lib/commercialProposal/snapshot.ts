import { isCommercialProposalTemplateVersion } from "@/lib/commercialProposal/paths";
import { applyGlobalDiscount } from "@/lib/commercialProposal/money";
import {
  ISSUER_COMPANY,
  STANDARD_PAGE_NOTE,
  STATIC_INTRO_PARAGRAPHS,
} from "@/lib/commercialProposal/layout";
import type {
  CommercialProposalLine,
  CommercialProposalSalesManagerSnapshot,
  CommercialProposalSnapshot,
  CpCompanyHistoryEntry,
  CpPriceItem,
} from "@/lib/commercialProposal/types";

export function displayManagerName(first: string, last: string, fallback = ""): string {
  const n = `${first} ${last}`.replace(/\s+/g, " ").trim();
  return n || fallback;
}

export function catalogItemToLineFields(
  item: CpPriceItem,
  discountPct: number
): Pick<
  CommercialProposalLine,
  | "category"
  | "catalog_item_id"
  | "sort_order"
  | "label"
  | "base_price"
  | "calculated_price"
  | "final_price"
  | "is_manual_override"
  | "is_from_price"
  | "is_free"
  | "currency"
  | "unit"
> {
  const base = item.is_free ? null : item.base_price;
  const calculated = base == null ? null : applyGlobalDiscount(base, discountPct);
  return {
    category: item.category,
    catalog_item_id: item.id,
    sort_order: item.sort_order,
    label: item.label,
    base_price: base,
    calculated_price: calculated,
    final_price: calculated,
    is_manual_override: false,
    is_from_price: item.is_from_price,
    is_free: item.is_free,
    currency: item.currency || "EUR",
    unit: item.unit,
  };
}

export function recalculateLine(
  line: Pick<
    CommercialProposalLine,
    "base_price" | "is_free" | "is_manual_override" | "final_price"
  >,
  discountPct: number
): { calculated_price: number | null; final_price: number | null } {
  if (line.is_free || line.base_price == null) {
    return { calculated_price: null, final_price: line.is_free ? null : line.final_price };
  }
  const calculated = applyGlobalDiscount(line.base_price, discountPct);
  return {
    calculated_price: calculated,
    final_price: line.is_manual_override ? line.final_price : calculated,
  };
}

export function buildProposalSnapshot(params: {
  proposalNumber: string | null;
  createdAt: string;
  generatedAt: string | null;
  templateVersion: string;
  globalDiscountPct: number;
  client: CommercialProposalSnapshot["client"];
  salesManager: CommercialProposalSalesManagerSnapshot;
  history: Array<Pick<CpCompanyHistoryEntry, "year" | "body" | "sort_order">>;
  lines: Array<Omit<CommercialProposalLine, "id" | "proposal_id">>;
}): CommercialProposalSnapshot {
  if (!isCommercialProposalTemplateVersion(params.templateVersion)) {
    throw new Error(`Unknown commercial proposal template version: ${params.templateVersion}`);
  }
  return {
    template_version: params.templateVersion,
    proposal_number: params.proposalNumber,
    created_at: params.createdAt,
    generated_at: params.generatedAt,
    global_discount_pct: params.globalDiscountPct,
    client: params.client,
    sales_manager: params.salesManager,
    company_history: params.history.map((h) => ({
      year: h.year,
      body: h.body,
      sort_order: h.sort_order,
    })),
    lines: params.lines,
    content: {
      issuer_company: ISSUER_COMPANY,
      intro_paragraphs: [...STATIC_INTRO_PARAGRAPHS],
      standard_page_note: STANDARD_PAGE_NOTE,
    },
  };
}
