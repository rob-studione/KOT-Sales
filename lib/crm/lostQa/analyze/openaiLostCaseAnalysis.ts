import "server-only";

import { createOpenAIClient } from "@/lib/openai/serverClient";
import {
  LOST_QA_ANALYSIS_INSTRUCTIONS,
  LOST_QA_ANALYSIS_USER_PROMPT_TEMPLATE,
} from "@/lib/crm/lostQa/analyze/lostQaAnalysisPrompt";
import {
  LOST_QA_ANALYSIS_JSON_SCHEMA,
  LOST_QA_ANALYSIS_MODEL,
  type LostQaStructuredAnalysis,
  validateLostQaStructuredAnalysis,
} from "@/lib/crm/lostQa/analyze/lostQaAnalysisSchema";
import { ensureNonEmptyAnalysisLtFields } from "@/lib/crm/lostQa/analyze/analysisLtFallbacks";
import type { ResponseUsage } from "openai/resources/responses/responses";

export type OpenAiLostCaseAnalysisResult = {
  parsed: LostQaStructuredAnalysis;
  model: string;
  response_id: string | null;
  usage: ResponseUsage | null;
};

export async function callOpenAiLostCaseAnalysis(
  preparedText: string,
  preparedPayload: unknown
): Promise<OpenAiLostCaseAnalysisResult> {
  const client = createOpenAIClient();

  // Stage 4 prompt expects only the prepared conversation text.
  void preparedPayload;
  const input = LOST_QA_ANALYSIS_USER_PROMPT_TEMPLATE.replace("{{prepared_messages_text}}", preparedText);

  const response = await client.responses.parse({
    model: LOST_QA_ANALYSIS_MODEL,
    instructions: LOST_QA_ANALYSIS_INSTRUCTIONS,
    input,
    store: false,
    text: {
      format: {
        type: LOST_QA_ANALYSIS_JSON_SCHEMA.type,
        name: LOST_QA_ANALYSIS_JSON_SCHEMA.name,
        strict: LOST_QA_ANALYSIS_JSON_SCHEMA.strict,
        schema: LOST_QA_ANALYSIS_JSON_SCHEMA.schema,
      },
    },
  });

  if (response.status !== "completed") {
    throw new Error(`OpenAI response not completed (status=${response.status}).`);
  }

  const parsed = response.output_parsed;
  if (parsed === null) {
    throw new Error("OpenAI returned no structured output (output_parsed is null).");
  }

  try {
    const validated = ensureNonEmptyAnalysisLtFields(validateLostQaStructuredAnalysis(parsed));
    return {
      parsed: validated,
      model: LOST_QA_ANALYSIS_MODEL,
      response_id: typeof (response as any).id === "string" ? String((response as any).id) : null,
      usage: (response as any).usage ?? null,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[lost-qa analyze] structured output validation failed:", msg, {
      output_text_sample: JSON.stringify(parsed).slice(0, 500),
    });
    throw e;
  }
}
