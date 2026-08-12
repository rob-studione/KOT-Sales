/** Vertėjų paieška — bendri tipai (MVP). */

export type TranslatorSearchJobStatus = "pending" | "running" | "completed" | "failed";

export type TranslatorCandidateReviewStatus = "pending" | "approved" | "rejected";

export type TranslatorCandidateEntityType = "person" | "agency" | "unknown";

export type TranslatorSwornStatus = "unknown" | "claimed" | "verified" | "not_found";

export type TranslatorSourceType = "web" | "pdf" | "manual";

export type TranslatorSearchPageTab = "nauja" | "kandidatai" | "istorija";

export type TranslatorCertificationRequirement = "any" | "required";

export type TranslatorCandidateTypeFilter = "any" | "freelancer" | "agency";

/** Formos / job request_params semantika (validuojama serveryje). */
export type TranslatorSearchRequestParams = {
  languageFrom: string;
  languageTo: string;
  country: string;
  city: string | null;
  certification: TranslatorCertificationRequirement;
  specialization: string | null;
  candidateType: TranslatorCandidateTypeFilter;
  targetCandidates: number;
  maxBudgetEur: number;
  /** Phase C1: 0–3 optional HTTPS seed URL. */
  seedUrls: string[];
  /** Snapshot of server limits at job creation. */
  appliedLimits: {
    maxSeedUrls: number;
    maxFetchUrls: number;
    maxExtractionCalls: number;
    maxCharsPerSource: number;
    maxBudgetEur: number;
    maxWebSearchCalls: number;
    maxUniqueSourceUrls: number;
    maxPdfFiles: number;
    maxPdfBytes: number;
    maxPdfPagesTotal: number;
  };
};

export type TranslatorLanguagePair = {
  from: string;
  to: string;
};

export type FieldEvidence = {
  quote: string;
  field: string;
};

export type TranslatorCandidateEvidence = Record<string, FieldEvidence>;

export type TranslatorSearchJobRow = {
  id: string;
  requested_by: string;
  title: string;
  request_params: TranslatorSearchRequestParams | Record<string, unknown>;
  status: TranslatorSearchJobStatus;
  stop_reason: string | null;
  warning: string | null;
  error_code: string | null;
  error_message: string | null;
  search_calls: number;
  fetch_url_count: number;
  pdf_count: number;
  openai_calls: number;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  cost_eur_estimated: number;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
};

export type TranslatorCandidateRow = {
  id: string;
  display_name: string;
  entity_type: TranslatorCandidateEntityType;
  email: string | null;
  phone: string | null;
  country: string | null;
  city: string | null;
  language_pairs: TranslatorLanguagePair[];
  specializations: string[];
  sworn_status: TranslatorSwornStatus;
  website_url: string | null;
  match_summary: string | null;
  review_status: TranslatorCandidateReviewStatus;
  dedupe_key: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
  updated_at: string;
};

export type TranslatorCandidateSourceRow = {
  id: string;
  candidate_id: string;
  job_id: string;
  source_type: TranslatorSourceType;
  original_url: string;
  canonical_url: string;
  title: string | null;
  snippet: string | null;
  evidence: TranslatorCandidateEvidence;
  pdf_page: number | null;
  retrieved_at: string;
};
