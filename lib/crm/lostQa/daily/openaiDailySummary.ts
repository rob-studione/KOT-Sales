import "server-only";

import { createOpenAIClient } from "@/lib/openai/serverClient";
import { LOST_QA_DAILY_SUMMARY_INSTRUCTIONS } from "@/lib/crm/lostQa/daily/dailySummaryPrompt";
import {
  LOST_QA_DAILY_SUMMARY_JSON_SCHEMA,
  LOST_QA_DAILY_SUMMARY_MODEL,
  validateLostQaDailyAiOutput,
  type LostQaDailyAiOutput,
} from "@/lib/crm/lostQa/daily/dailySummarySchema";
import type { DailyAiInput } from "@/lib/crm/lostQa/daily/dailySummaryTypes";

export async function callOpenAiDailySummary(inputObj: DailyAiInput): Promise<LostQaDailyAiOutput> {
  const client = createOpenAIClient();
  const input = JSON.stringify(inputObj);

  const response = await client.responses.parse({
    model: LOST_QA_DAILY_SUMMARY_MODEL,
    instructions: LOST_QA_DAILY_SUMMARY_INSTRUCTIONS,
    input,
    store: false,
    text: {
      format: {
        type: LOST_QA_DAILY_SUMMARY_JSON_SCHEMA.type,
        name: LOST_QA_DAILY_SUMMARY_JSON_SCHEMA.name,
        strict: LOST_QA_DAILY_SUMMARY_JSON_SCHEMA.strict,
        schema: LOST_QA_DAILY_SUMMARY_JSON_SCHEMA.schema,
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
  return validateLostQaDailyAiOutput(parsed);
}

