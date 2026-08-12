/**
 * Pure evaluation of a web_search Responses payload (offline-testable).
 */

import {
  assessWebSearchCallCost,
  type CallCostAssessment,
} from "@/lib/translatorSearch/costAssessment";
import type { TranslatorSearchPricing } from "@/lib/translatorSearch/pricing";
import type { OpenAiUsageLike } from "@/lib/translatorSearch/pricing";
import {
  countWebSearchActions,
  extractWebSearchAssistantText,
  parseWebSearchActionSourceUrls,
} from "@/lib/translatorSearch/webSearchParse";

export type EvaluatedWebSearchResponse = CallCostAssessment & {
  /** completed + exactly one search action. */
  ok: boolean;
  code: string | null;
  sourceUrls: string[];
  assistantTextIgnored: string;
};

/**
 * Success only when status is completed and there is exactly one factual search action.
 * Sources are returned only on success; cost may still be only partially known.
 */
export function evaluateWebSearchResponse(params: {
  status: string;
  output: unknown;
  usage?: OpenAiUsageLike | null;
  pricing: Extract<TranslatorSearchPricing, { configured: true }>;
}): EvaluatedWebSearchResponse {
  const searchActions = countWebSearchActions(params.output);
  const cost = assessWebSearchCallCost({
    pricing: params.pricing,
    usage: params.usage,
    searchActions,
  });
  const assistantTextIgnored = extractWebSearchAssistantText(params.output);
  const completed = params.status === "completed";
  const ok = completed && searchActions === 1;

  if (ok) {
    return {
      ok: true,
      code: null,
      sourceUrls: parseWebSearchActionSourceUrls(params.output),
      assistantTextIgnored,
      ...cost,
    };
  }

  let code = "web_search_failed";
  if (params.status === "incomplete") code = "web_search_incomplete";
  else if (params.status === "cancelled") code = "web_search_failed";
  else if (completed && searchActions !== 1) code = "web_search_bad_action_count";

  return {
    ok: false,
    code,
    sourceUrls: [],
    assistantTextIgnored,
    ...cost,
  };
}
