import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { requireOpenAiApiKey } from "@/lib/openai/serverClient";
import { buildDailyAggregate, dailyDeterministicFieldsEqual, parseYmdOrThrow } from "@/lib/crm/lostQa/daily/dailySummaryBuild";
import { callOpenAiDailySummary } from "@/lib/crm/lostQa/daily/openaiDailySummary";
import { fetchDailySummary, upsertDailySummary } from "@/lib/crm/lostQa/daily/dailySummaryRepository";
import { estimateOpenAiCostEur } from "@/lib/openai/pricing";
import { insertAiUsageLog } from "@/lib/crm/lostQa/aiUsageLogsRepository";

export type GenerateDailySummaryParams = {
  summaryDate: string; // YYYY-MM-DD
  mailboxId: string | null;
  force?: boolean;
};

export type GenerateDailySummaryResult =
  | { ok: true; outcome: "created_or_updated"; summary_id: string; total_lost_count: number }
  | { ok: true; outcome: "skipped"; reason: string; total_lost_count: number }
  | { ok: false; error: string };

export async function generateDailySummary(
  admin: SupabaseClient,
  params: GenerateDailySummaryParams
): Promise<GenerateDailySummaryResult> {
  const summaryDate = parseYmdOrThrow(params.summaryDate);
  const mailboxId = params.mailboxId?.trim() ? params.mailboxId.trim() : null;
  const force = Boolean(params.force);

  const existing = await fetchDailySummary(admin, summaryDate, mailboxId);
  const { aggregate, aiInput } = await buildDailyAggregate(admin, summaryDate, mailboxId);

  if (!force && existing && dailyDeterministicFieldsEqual(existing, aggregate)) {
    return { ok: true, outcome: "skipped", reason: "No changes in analyzed-case aggregates.", total_lost_count: aggregate.total_lost_count };
  }

  // Zero-case behavior: deterministic row; no OpenAI call.
  if (aggregate.total_lost_count === 0) {
    const id = await upsertDailySummary(admin, {
      summary_date: summaryDate,
      mailbox_id: mailboxId,
      total_lost_count: 0,
      price_issue_count: 0,
      response_speed_issue_count: 0,
      response_quality_issue_count: 0,
      followup_issue_count: 0,
      qualification_issue_count: 0,
      competitor_count: 0,
      scope_mismatch_count: 0,
      top_reasons: [],
      top_agents: [],
      priority_cases: [],
      manager_summary: "No analyzed lost cases for this date.",
      team_action_points: [],
    });
    return { ok: true, outcome: "created_or_updated", summary_id: id, total_lost_count: 0 };
  }

  try {
    requireOpenAiApiKey();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }

  let ai;
  try {
    ai = await callOpenAiDailySummary(aiInput);
  } catch (e) {
    console.error("[lost-qa daily] OpenAI daily summary failed", { summary_date: summaryDate, mailbox_id: mailboxId, error: e });
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  try {
    const est = estimateOpenAiCostEur({ model: ai.model, usage: ai.usage });
    await insertAiUsageLog(admin, {
      type: "summary",
      model: ai.model,
      input_tokens: est.input_tokens,
      output_tokens: est.output_tokens,
      total_tokens: est.total_tokens,
      cost_eur: est.cost_eur,
      meta: {
        feature: "lost_qa_daily_summary",
        summary_date: summaryDate,
        mailbox_id: mailboxId,
        response_id: ai.response_id,
      },
    });
  } catch (e) {
    console.error("[lost-qa daily] ai usage log insert failed", { summary_date: summaryDate, mailbox_id: mailboxId, error: e });
  }

  try {
    const id = await upsertDailySummary(admin, {
      summary_date: summaryDate,
      mailbox_id: mailboxId,
      total_lost_count: aggregate.total_lost_count,
      price_issue_count: aggregate.price_issue_count,
      response_speed_issue_count: aggregate.response_speed_issue_count,
      response_quality_issue_count: aggregate.response_quality_issue_count,
      followup_issue_count: aggregate.followup_issue_count,
      qualification_issue_count: aggregate.qualification_issue_count,
      competitor_count: aggregate.competitor_count,
      scope_mismatch_count: aggregate.scope_mismatch_count,
      top_reasons: aggregate.top_reasons,
      top_agents: aggregate.top_agents,
      priority_cases: aggregate.priority_cases,
      manager_summary: ai.parsed.manager_summary,
      team_action_points: ai.parsed.team_action_points,
    });
    return { ok: true, outcome: "created_or_updated", summary_id: id, total_lost_count: aggregate.total_lost_count };
  } catch (e) {
    console.error("[lost-qa daily] DB upsert failed", { summary_date: summaryDate, mailbox_id: mailboxId, error: e });
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

