import { extractText, getDocumentProxy } from "unpdf";
import { defaultTemplateContent } from "@/lib/commercialProposal/content";
import { generateCommercialProposalPdf } from "@/lib/commercialProposal/generatePdf";
import { applyGlobalDiscount } from "@/lib/commercialProposal/money";
import { buildProposalSnapshot } from "@/lib/commercialProposal/snapshot";
import { CP_TEMPLATE_LT_COMMERCIAL_V2, type CommercialProposalLine } from "@/lib/commercialProposal/types";

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

function line(
  partial: Pick<CommercialProposalLine, "category" | "label"> & Partial<Omit<CommercialProposalLine, "category" | "label">>,
): Omit<CommercialProposalLine, "id" | "proposal_id"> {
  return {
    catalog_item_id: partial.catalog_item_id ?? partial.label,
    sort_order: partial.sort_order ?? 1,
    base_price: partial.base_price ?? 10,
    calculated_price: partial.calculated_price ?? 10,
    final_price: partial.final_price ?? 10,
    is_manual_override: false,
    is_from_price: false,
    is_free: false,
    included: true,
    currency: "EUR",
    unit: "psl.",
    ...partial,
  };
}

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

const lines = [
  line({ category: "translation", label: "LT-EN", catalog_item_id: "LT-EN", sort_order: 1, base_price: 10.8, calculated_price: applyGlobalDiscount(10.8, 0), final_price: 10.8 }),
  line({ category: "ai_translation", label: "AI-LT-EN", catalog_item_id: "AI-LT-EN", sort_order: 1, base_price: 6.48, calculated_price: 6.48, final_price: 6.48 }),
  line({ category: "additional_service", label: "Apostille", catalog_item_id: "apostille", sort_order: 1, base_price: 25, calculated_price: 25, final_price: 25 }),
];

function snap(template = defaultTemplateContent()) {
  return buildProposalSnapshot({
    proposalNumber: "CP-2026-0099",
    createdAt: "2026-08-20T00:00:00.000Z",
    generatedAt: "2026-08-20T00:00:00.000Z",
    templateVersion: CP_TEMPLATE_LT_COMMERCIAL_V2,
    discounts: { translation: 0, ai_translation: 0, additional_service: 0 },
    client: { client_key: "c1", client_id: "c1", company_code: null, name: "Klientas" },
    salesManager: manager,
    history: [{ year: 2020, body: "Istorija.", sort_order: 1 }],
    lines,
    template,
  });
}

async function pdfText(bytes: Uint8Array) {
  const doc = await getDocumentProxy(new Uint8Array(bytes));
  const extracted = await extractText(doc, { mergePages: false });
  const pages = Array.isArray(extracted.text) ? extracted.text : [String(extracted.text ?? "")];
  return { pages: pages.length, text: pages.join("\n") };
}

const published = defaultTemplateContent();
const draft = defaultTemplateContent();
draft.cover.title = "Juodraščio viršelis\nPHASE2";

const publishedPdf = await generateCommercialProposalPdf({ snapshot: snap(published) });
const draftPdf = await generateCommercialProposalPdf({ snapshot: snap(draft) });
const publishedText = await pdfText(publishedPdf);
const draftText = await pdfText(draftPdf);

assert(publishedText.text.includes("Vertimo paslaugų"), "published cover stays default");
assert(!publishedText.text.includes("PHASE2"), "published PDF does not include draft marker");
assert(draftText.text.includes("PHASE2"), "draft preview shows edited cover");
assert(publishedText.pages === draftText.pages, "page count stays the same");
assert(publishedText.pages >= 7, `expected full-ish template, got ${publishedText.pages}`);

console.log(`verify-cp-template-preview-reuse: ok pages=${draftText.pages}`);
