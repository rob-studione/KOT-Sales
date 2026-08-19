import type { CpTemplateContent } from "@/lib/commercialProposal/content";
import { defaultTemplateContent } from "@/lib/commercialProposal/content";
import { isCommercialProposalTemplateVersion } from "@/lib/commercialProposal/paths";
import { applyGlobalDiscount } from "@/lib/commercialProposal/money";
import {
  ISSUER_COMPANY,
  STANDARD_PAGE_NOTE,
  STATIC_INTRO_PARAGRAPHS,
} from "@/lib/commercialProposal/layout";
import type {
  CommercialProposalLine,
  CommercialProposalRecipientSnapshot,
  CommercialProposalSalesManagerSnapshot,
  CommercialProposalSnapshot,
  CpCompanyHistoryEntry,
  CpPriceItem,
  CpRecipientType,
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

export function recipientFromClientFields(input: {
  recipientType?: CpRecipientType;
  recipientId?: string | null;
  recipientName: string;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  clientKey: string;
  clientId: string | null;
  companyCode: string | null;
}): CommercialProposalRecipientSnapshot {
  const recipientType = input.recipientType === "lead" ? "lead" : "client";
  return {
    recipient_type: recipientType,
    recipient_source_id: (input.recipientId || input.clientId || input.clientKey || "").trim(),
    recipient_name: input.recipientName,
    contact_name: input.contactName ?? null,
    email: input.email ?? null,
    phone: input.phone ?? null,
    client_key: input.clientKey,
    client_id: input.clientId,
    company_code: input.companyCode,
  };
}

export function snapshotRecipient(snapshot: CommercialProposalSnapshot): CommercialProposalRecipientSnapshot {
  if (snapshot.recipient) return snapshot.recipient;
  return recipientFromClientFields({
    recipientType: "client",
    recipientId: snapshot.client.client_id,
    recipientName: snapshot.client.name,
    clientKey: snapshot.client.client_key,
    clientId: snapshot.client.client_id,
    companyCode: snapshot.client.company_code,
  });
}

export function buildProposalSnapshot(params: {
  proposalNumber: string | null;
  createdAt: string;
  generatedAt: string | null;
  templateVersion: string;
  globalDiscountPct: number;
  client: CommercialProposalSnapshot["client"];
  recipient?: CommercialProposalRecipientSnapshot;
  salesManager: CommercialProposalSalesManagerSnapshot;
  history: Array<Pick<CpCompanyHistoryEntry, "year" | "body" | "sort_order">>;
  lines: Array<Omit<CommercialProposalLine, "id" | "proposal_id">>;
  template?: CpTemplateContent;
  templateRevisionId?: string | null;
}): CommercialProposalSnapshot {
  if (!isCommercialProposalTemplateVersion(params.templateVersion)) {
    throw new Error(`Unknown commercial proposal template version: ${params.templateVersion}`);
  }
  const recipient =
    params.recipient ??
    recipientFromClientFields({
      recipientName: params.client.name,
      clientKey: params.client.client_key,
      clientId: params.client.client_id,
      companyCode: params.client.company_code,
    });
  const template = params.template ?? defaultTemplateContent();
  return {
    template_version: params.templateVersion,
    proposal_number: params.proposalNumber,
    created_at: params.createdAt,
    generated_at: params.generatedAt,
    global_discount_pct: params.globalDiscountPct,
    client: params.client,
    recipient,
    sales_manager: params.salesManager,
    company_history: params.history.map((h) => ({
      year: h.year,
      body: h.body,
      sort_order: h.sort_order,
    })),
    lines: params.lines,
    content: {
      issuer_company: template.header_company || ISSUER_COMPANY,
      intro_paragraphs: template.intro.paragraphs.length ? [...template.intro.paragraphs] : [...STATIC_INTRO_PARAGRAPHS],
      standard_page_note: template.translation.footnote || STANDARD_PAGE_NOTE,
      template,
      template_revision_id: params.templateRevisionId ?? null,
    },
  };
}
