import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  fetchLostCaseAnalysisByCaseAndPrompt,
  upsertLostCaseAnalysis,
} from "@/lib/crm/lostQa/analyze/analysisRepository";
import { callOpenAiLostCaseAnalysis } from "@/lib/crm/lostQa/analyze/openaiLostCaseAnalysis";
import {
  LOST_QA_ANALYSIS_MODEL,
  LOST_QA_ANALYSIS_PROMPT_VERSION,
  type LostQaStructuredAnalysis,
} from "@/lib/crm/lostQa/analyze/lostQaAnalysisSchema";
import type { LostCaseAnalysisInsert, LostCaseRow } from "@/lib/crm/lostQaDb";
import { requireOpenAiApiKey } from "@/lib/openai/serverClient";
import { updateLostCase } from "@/lib/crm/lostQa/lostQaRepository";
import { fetchLostCaseById, getCurrentPreparedInput } from "@/lib/crm/lostQa/prepare/preparedInputRepository";
import { rebuildDailySummaryForLostCase } from "@/lib/crm/lostQa/daily/rebuildDailySummary";
import { fetchLostQaControlSettings } from "@/lib/crm/lostQa/lostQaControlSettings";
import { getLostQaMonthTotalAiCostEur } from "@/lib/crm/lostQa/aiUsageStats";
import { decideLostQaAnalyze, type LostQaAnalyzeInvoke } from "@/lib/crm/lostQa/analyze/lostQaAnalyzeGate";
import { estimateOpenAiCostEur } from "@/lib/openai/pricing";
import { insertAiUsageLog } from "@/lib/crm/lostQa/aiUsageLogsRepository";

export type RunLostCaseAnalysisParams = {
  lostCaseId: string;
  force?: boolean;
  invoke?: LostQaAnalyzeInvoke;
};

export type RunLostCaseAnalysisSuccess =
  | { ok: true; outcome: "skipped_existing"; reason: string }
  | { ok: true; outcome: "skipped_settings"; reason: string }
  | { ok: true; outcome: "analyzed_new"; analysis_id: string }
  | { ok: true; outcome: "updated_existing"; analysis_id: string };

export type RunLostCaseAnalysisResult = RunLostCaseAnalysisSuccess | { ok: false; error: string };

function buildAnalysisInsert(
  lostCaseId: string,
  preparedInputId: string,
  parsed: LostQaStructuredAnalysis
): LostCaseAnalysisInsert {
  return {
    lost_case_id: lostCaseId,
    prepared_input_id: preparedInputId,
    model_name: LOST_QA_ANALYSIS_MODEL,
    prompt_version: LOST_QA_ANALYSIS_PROMPT_VERSION,
    primary_reason: parsed.primary_reason,
    primary_reason_lt: parsed.primary_reason_lt,
    secondary_reason: parsed.secondary_reason,
    confidence: parsed.confidence,
    client_intent: parsed.client_intent,
    deal_stage: parsed.deal_stage,
    price_issue: parsed.price_issue,
    response_speed_issue: parsed.response_speed_issue,
    response_quality_issue: parsed.response_quality_issue,
    followup_issue: parsed.followup_issue,
    qualification_issue: parsed.qualification_issue,
    competitor_mentioned: parsed.competitor_mentioned,
    scope_mismatch: parsed.scope_mismatch,
    agent_mistakes: parsed.agent_mistakes,
    improvement_actions: parsed.improvement_actions,
    evidence_quotes: parsed.evidence_quotes,
    thread_summary: parsed.summary_lt.map((x) => x.trim()).filter(Boolean).join("\n"),
    manager_feedback_draft: parsed.why_lost_lt,
    why_lost_lt: parsed.why_lost_lt,
    what_to_do_better_lt: parsed.what_to_do_better_lt,
    key_moments: parsed.key_moments,
    analysis_json: parsed,
  };
}

async function applyLostCaseStatusAfterAnalysis(
  admin: SupabaseClient,
  lostCaseId: string,
  currentStatus: LostCaseRow["status"]
): Promise<void> {
  const patch: Partial<LostCaseRow> = {
    needs_reanalysis: false,
  };
  if (currentStatus === "pending_analysis") {
    patch.status = "analyzed";
  }
  await updateLostCase(admin, lostCaseId, patch);
}

export async function runLostCaseAnalysis(
  admin: SupabaseClient,
  params: RunLostCaseAnalysisParams
): Promise<RunLostCaseAnalysisResult> {
  const { lostCaseId, force, invoke = "auto" } = params;
  const lostCase = await fetchLostCaseById(admin, lostCaseId);
  if (!lostCase) {
    return { ok: false, error: "Lost case not found." };
  }

  const prepared = await getCurrentPreparedInput(admin, lostCaseId);
  if (!prepared) {
    return { ok: false, error: "No current prepared input for this case." };
  }

  const existing = await fetchLostCaseAnalysisByCaseAndPrompt(
    admin,
    lostCaseId,
    LOST_QA_ANALYSIS_PROMPT_VERSION
  );

  const settings = await fetchLostQaControlSettings(admin);
  const gate = decideLostQaAnalyze({
    settings,
    invoke,
    force: Boolean(force),
    existing,
    preparedInputId: prepared.id,
  });
  if (gate.action === "skip") {
    if (gate.reason === "Analysis already reflects current prepared input.") {
      return { ok: true, outcome: "skipped_existing", reason: gate.reason };
    }
    return { ok: true, outcome: "skipped_settings", reason: gate.reason };
  }

  if (invoke === "auto") {
    const limit = settings.cost_limit_eur;
    if (limit != null && Number.isFinite(limit) && settings.stop_on_limit) {
      const spent = await getLostQaMonthTotalAiCostEur(admin);
      if (spent >= limit) {
        console.info("Skipped analyze – monthly AI cost limit reached", {
          lost_case_id: lostCaseId,
          spent_eur: spent,
          limit_eur: limit,
        });
        return {
          ok: true,
          outcome: "skipped_settings",
          reason: "Pasiektas mėnesio AI išlaidų limitas.",
        };
      }
    }
  }

  let requireKeyError: Error | null = null;
  try {
    requireOpenAiApiKey();
  } catch (e) {
    requireKeyError = e instanceof Error ? e : new Error(String(e));
  }
  if (requireKeyError) {
    return { ok: false, error: requireKeyError.message };
  }

  let ai: Awaited<ReturnType<typeof callOpenAiLostCaseAnalysis>>;
  try {
    ai = await callOpenAiLostCaseAnalysis(prepared.prepared_text, prepared.prepared_payload);
  } catch (e) {
    console.error("[lost-qa analyze] OpenAI run failed", { lost_case_id: lostCaseId, error: e });
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  const insert = buildAnalysisInsert(lostCase.id, prepared.id, ai.parsed);

  try {
    const analysisId = await upsertLostCaseAnalysis(admin, insert);
    await applyLostCaseStatusAfterAnalysis(admin, lostCase.id, lostCase.status);

    try {
      const est = estimateOpenAiCostEur({ model: ai.model, usage: ai.usage });
      await insertAiUsageLog(admin, {
        type: "analyze",
        model: ai.model,
        input_tokens: est.input_tokens,
        output_tokens: est.output_tokens,
        total_tokens: est.total_tokens,
        cost_eur: est.cost_eur,
        meta: {
          feature: "lost_qa_case_analysis",
          lost_case_id: lostCase.id,
          prepared_input_id: prepared.id,
          analysis_id: analysisId,
          response_id: ai.response_id,
        },
      });
    } catch (e) {
      console.error("[lost-qa analyze] ai usage log insert failed", { lost_case_id: lostCase.id, error: e });
    }

    const summaryRefresh = await rebuildDailySummaryForLostCase(admin, lostCase.id);
    if (!summaryRefresh.ok) {
      console.error("[lost-qa analyze] daily summary rebuild failed", {
        lost_case_id: lostCase.id,
        error: summaryRefresh.error,
      });
      return { ok: false, error: summaryRefresh.error };
    }
    if (existing) {
      return { ok: true, outcome: "updated_existing", analysis_id: analysisId };
    }
    return { ok: true, outcome: "analyzed_new", analysis_id: analysisId };
  } catch (e) {
    console.error("[lost-qa analyze] DB write failed", { lost_case_id: lostCaseId, error: e });
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
