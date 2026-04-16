/**
 * Lost QA module: DB row shapes + allowed-value constants (Stage 1 — no runtime API).
 */

export const LOST_CASE_STATUSES = [
  "pending_analysis",
  "analyzed",
  "reviewed",
  "feedback_sent",
  "closed",
] as const;

export type LostCaseStatus = (typeof LOST_CASE_STATUSES)[number];

export const LOST_SENDER_ROLES = ["client", "agent", "internal", "system", "unknown"] as const;

export type LostSenderRole = (typeof LOST_SENDER_ROLES)[number];

export const LOST_PRIMARY_REASONS = [
  "price_too_high",
  "slow_response",
  "poor_response_quality",
  "missing_followup",
  "client_not_qualified",
  "client_went_silent",
  "competitor_selected",
  "scope_mismatch",
  "internal_mistake",
  "timeline_not_fit",
  "other",
] as const;

export type LostPrimaryReason = (typeof LOST_PRIMARY_REASONS)[number];

export const LOST_CLIENT_INTENTS = ["high", "medium", "low"] as const;

export type LostClientIntent = (typeof LOST_CLIENT_INTENTS)[number];

export const LOST_DEAL_STAGES = [
  "new_inquiry",
  "quoted",
  "followup",
  "negotiation",
  "late_stage",
  "unknown",
] as const;

export type LostDealStage = (typeof LOST_DEAL_STAGES)[number];

export const LOST_AGENT_MISTAKES = [
  "did_not_answer_question",
  "unclear_pricing",
  "slow_first_response",
  "slow_followup",
  "weak_value_positioning",
  "too_generic",
  "did_not_handle_objection",
  "qualification_missing",
  "tone_issue",
  "process_explanation_missing",
] as const;

export type LostAgentMistake = (typeof LOST_AGENT_MISTAKES)[number];

/** JSONB columns: structure not fixed at Stage 1 */
export type LostQaJsonValue = unknown;

export type GmailMailboxRow = {
  id: string;
  name: string;
  email_address: string;
  google_user_id: string | null;
  is_active: boolean;
  lost_label_id: string;
  watch_topic_name: string;
  watch_history_id: string | null;
  activation_history_id: string | null;
  watch_expiration_at: string | null;
  created_at: string;
  updated_at: string;
};

export type GmailMailboxInsert = Omit<GmailMailboxRow, "id" | "created_at" | "updated_at">;
export type GmailMailboxUpdate = Partial<Omit<GmailMailboxRow, "id" | "created_at">>;

export type GmailThreadRawRow = {
  id: string;
  mailbox_id: string;
  gmail_thread_id: string;
  gmail_history_id: string | null;
  subject: string | null;
  participants: LostQaJsonValue;
  message_count: number;
  last_message_at: string | null;
  has_lost_label: boolean;
  raw_payload: LostQaJsonValue;
  fetched_at: string;
  created_at: string;
  updated_at: string;
};

export type GmailThreadRawInsert = Omit<GmailThreadRawRow, "id" | "created_at" | "updated_at">;
export type GmailThreadRawUpdate = Partial<Omit<GmailThreadRawRow, "id" | "created_at">>;

export type LostCaseRow = {
  id: string;
  mailbox_id: string;
  gmail_thread_id: string;
  gmail_thread_url: string | null;
  subject: string | null;
  client_email: string | null;
  client_name: string | null;
  assigned_agent_email: string | null;
  assigned_agent_name: string | null;
  first_message_at: string | null;
  last_message_at: string | null;
  lost_detected_at: string;
  status: LostCaseStatus;
  analysis_version: number;
  needs_reanalysis: boolean;
  created_at: string;
  updated_at: string;
};

export type LostCaseInsert = Omit<LostCaseRow, "id" | "created_at" | "updated_at"> & {
  status?: LostCaseStatus;
  analysis_version?: number;
  needs_reanalysis?: boolean;
};
export type LostCaseUpdate = Partial<Omit<LostCaseRow, "id" | "created_at">>;

export type LostCaseMessageRow = {
  id: string;
  lost_case_id: string;
  gmail_message_id: string;
  message_index: number;
  sent_at: string | null;
  sender_email: string | null;
  sender_name: string | null;
  sender_role: LostSenderRole;
  to_emails: LostQaJsonValue;
  cc_emails: LostQaJsonValue;
  snippet: string | null;
  body_plain: string | null;
  body_clean: string | null;
  is_inbound: boolean;
  created_at: string;
};

export type LostCaseMessageInsert = Omit<LostCaseMessageRow, "id" | "created_at">;
export type LostCaseMessageUpdate = Partial<Omit<LostCaseMessageRow, "id" | "created_at">>;

export type LostCaseAnalysisRow = {
  id: string;
  lost_case_id: string;
  prepared_input_id: string | null;
  model_name: string;
  prompt_version: number;
  primary_reason: LostPrimaryReason;
  primary_reason_lt: string | null;
  secondary_reason: LostPrimaryReason | null;
  confidence: number;
  client_intent: LostClientIntent;
  deal_stage: LostDealStage;
  price_issue: boolean;
  response_speed_issue: boolean;
  response_quality_issue: boolean;
  followup_issue: boolean;
  qualification_issue: boolean;
  competitor_mentioned: boolean;
  scope_mismatch: boolean;
  agent_mistakes: LostQaJsonValue;
  improvement_actions: LostQaJsonValue;
  evidence_quotes: LostQaJsonValue;
  thread_summary: string;
  manager_feedback_draft: string;
  why_lost_lt: string | null;
  what_to_do_better_lt: string | null;
  key_moments: LostQaJsonValue;
  analysis_json: LostQaJsonValue;
  created_at: string;
  updated_at: string;
};

export type LostCaseAnalysisInsert = Omit<LostCaseAnalysisRow, "id" | "created_at" | "updated_at">;
export type LostCaseAnalysisUpdate = Partial<Omit<LostCaseAnalysisRow, "id" | "created_at">>;

export type LostDailySummaryRow = {
  id: string;
  summary_date: string;
  mailbox_id: string | null;
  total_lost_count: number;
  price_issue_count: number;
  response_speed_issue_count: number;
  response_quality_issue_count: number;
  followup_issue_count: number;
  qualification_issue_count: number;
  competitor_count: number;
  scope_mismatch_count: number;
  top_reasons: LostQaJsonValue;
  top_agents: LostQaJsonValue;
  priority_cases: LostQaJsonValue;
  manager_summary: string;
  team_action_points: LostQaJsonValue;
  created_at: string;
};

export type LostDailySummaryInsert = Omit<LostDailySummaryRow, "id" | "created_at">;
export type LostDailySummaryUpdate = Partial<Omit<LostDailySummaryRow, "id" | "created_at">>;

export type LostManagerReviewRow = {
  id: string;
  lost_case_id: string;
  reviewed_by: string;
  ai_verdict_correct: boolean | null;
  manager_final_reason: string | null;
  manager_comment: string | null;
  feedback_sent_to: string | null;
  feedback_sent_at: string | null;
  created_at: string;
  updated_at: string;
};

export type LostManagerReviewInsert = Omit<LostManagerReviewRow, "id" | "created_at" | "updated_at">;
export type LostManagerReviewUpdate = Partial<Omit<LostManagerReviewRow, "id" | "created_at">>;

export type PreparedLostCaseInputRow = {
  id: string;
  lost_case_id: string;
  preparation_version: number;
  source_message_count: number;
  selected_message_count: number;
  prepared_payload: LostQaJsonValue;
  prepared_text: string;
  prepared_hash: string;
  is_current: boolean;
  created_at: string;
  updated_at: string;
};

export type PreparedLostCaseInputInsert = Omit<
  PreparedLostCaseInputRow,
  "id" | "created_at" | "updated_at"
> & {
  created_at?: string;
  updated_at?: string;
};

export type PreparedLostCaseInputUpdate = Partial<
  Omit<PreparedLostCaseInputRow, "id" | "created_at">
>;
