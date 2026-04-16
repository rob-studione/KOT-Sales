import "server-only";

import type { LostPrimaryReason } from "@/lib/crm/lostQaDb";

export type TopReasonRow = { reason: LostPrimaryReason; count: number };

export type TopAgentRow = {
  assigned_agent_email: string;
  assigned_agent_name: string | null;
  lost_count: number;
};

export type PriorityCaseRow = {
  lost_case_id: string;
  subject: string | null;
  client_email: string | null;
  assigned_agent_email: string | null;
  primary_reason: LostPrimaryReason;
  confidence: number;
  price_issue: boolean;
  response_speed_issue: boolean;
  response_quality_issue: boolean;
  competitor_mentioned: boolean;
};

export type DailyAggregate = {
  summary_date: string; // YYYY-MM-DD
  mailbox_id: string | null;
  total_lost_count: number;
  price_issue_count: number;
  response_speed_issue_count: number;
  response_quality_issue_count: number;
  followup_issue_count: number;
  qualification_issue_count: number;
  competitor_count: number;
  scope_mismatch_count: number;
  top_reasons: TopReasonRow[];
  top_agents: TopAgentRow[];
  priority_cases: PriorityCaseRow[];
};

export type DailyAiInputCaseExcerpt = {
  lost_case_id: string;
  lost_detected_at: string;
  primary_reason: LostPrimaryReason;
  secondary_reason: LostPrimaryReason | null;
  confidence: number;
  agent_mistakes: unknown;
  improvement_actions: unknown;
  thread_summary: string;
  manager_feedback_draft: string;
};

export type DailyAiInput = {
  scope: { summary_date: string; mailbox_id: string | null };
  aggregates: Omit<DailyAggregate, "summary_date" | "mailbox_id">;
  top_reasons: TopReasonRow[];
  top_agents: TopAgentRow[];
  priority_cases: PriorityCaseRow[];
  case_excerpts: DailyAiInputCaseExcerpt[];
};

