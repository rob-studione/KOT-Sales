import type { CommercialProposalTemplateVersion } from "@/lib/commercialProposal/paths";

export const CP_TEMPLATE_LT_COMMERCIAL_V1 = "LT_COMMERCIAL_V1" satisfies CommercialProposalTemplateVersion;

export const CP_STATUSES = ["draft", "generated", "sent", "accepted", "rejected", "expired"] as const;
export type CommercialProposalStatus = (typeof CP_STATUSES)[number];

export const CP_V1_STATUSES = ["draft", "generated", "sent"] as const;
export type CommercialProposalV1Status = (typeof CP_V1_STATUSES)[number];

export const CP_CATEGORIES = ["translation", "ai_translation", "additional_service"] as const;
export type CpPriceCategory = (typeof CP_CATEGORIES)[number];

export type CpPriceItem = {
  id: string;
  category: CpPriceCategory;
  sort_order: number;
  label: string;
  base_price: number | null;
  currency: string;
  unit: string | null;
  is_from_price: boolean;
  is_free: boolean;
  active: boolean;
};

export type CpCompanyHistoryEntry = {
  id: string;
  year: number;
  body: string;
  sort_order: number;
  active: boolean;
};

export type CommercialProposalLine = {
  id: string;
  proposal_id: string;
  category: CpPriceCategory;
  catalog_item_id: string | null;
  sort_order: number;
  label: string;
  base_price: number | null;
  calculated_price: number | null;
  final_price: number | null;
  is_manual_override: boolean;
  is_from_price: boolean;
  is_free: boolean;
  currency: string;
  unit: string | null;
};

export type CommercialProposalSalesManagerSnapshot = {
  id: string;
  first_name: string;
  last_name: string;
  display_name: string;
  job_title: string;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
};

export type CommercialProposalSnapshot = {
  template_version: string;
  proposal_number: string | null;
  created_at: string;
  generated_at: string | null;
  global_discount_pct: number;
  client: {
    client_key: string;
    client_id: string | null;
    company_code: string | null;
    name: string;
  };
  sales_manager: CommercialProposalSalesManagerSnapshot;
  company_history: Array<{ year: number; body: string; sort_order: number }>;
  lines: Array<Omit<CommercialProposalLine, "id" | "proposal_id">>;
  content: {
    issuer_company: string;
    intro_paragraphs: string[];
    standard_page_note: string;
  };
};

export type CommercialProposalRow = {
  id: string;
  proposal_number: string | null;
  status: CommercialProposalStatus;
  template_version: string;
  client_key: string;
  client_id: string | null;
  company_code: string | null;
  client_name: string;
  sales_manager_id: string | null;
  global_discount_pct: number;
  created_by: string | null;
  generated_at: string | null;
  pdf_storage_path: string | null;
  snapshot: CommercialProposalSnapshot | null;
  created_at: string;
  updated_at: string;
};

export type GeneratePdfInput = {
  snapshot: CommercialProposalSnapshot;
  managerAvatarBytes?: Uint8Array | null;
};
