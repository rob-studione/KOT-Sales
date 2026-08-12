import "server-only";

import { createOpenAIClient } from "@/lib/openai/serverClient";
import { evaluateWebSearchResponse } from "@/lib/translatorSearch/evaluateWebSearch";
import { getTranslatorSearchModel } from "@/lib/translatorSearch/model";
import { buildTranslatorSearchOpenAiRequestOptions } from "@/lib/translatorSearch/openaiRequestOptions";
import { requireTranslatorSearchPricing } from "@/lib/translatorSearch/pricing";
import { buildWebSearchCreateParams } from "@/lib/translatorSearch/webSearchParse";
import type { ResponseUsage } from "openai/resources/responses/responses";

export type TranslatorWebSearchResult = {
  ok: true;
  model: string;
  sourceUrls: string[];
  searchActions: number;
  usage: ResponseUsage | null;
  costFullyKnown: boolean;
  knownCostEur: number;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  /** Assistant text if any — must never be used as candidate evidence. */
  assistantTextIgnored: string;
};

export type TranslatorWebSearchFailure = {
  ok: false;
  code: string;
  searchActions: number;
  usage: ResponseUsage | null;
  costFullyKnown: boolean;
  knownCostEur: number;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
};

/**
 * One Responses API call with required web_search (max_tool_calls=1, maxRetries=0).
 * Success only when completed with exactly one search action.
 */
export async function runTranslatorWebSearch(params: {
  query: string;
  timeoutMs: number;
}): Promise<TranslatorWebSearchResult | TranslatorWebSearchFailure> {
  const client = createOpenAIClient();
  const model = getTranslatorSearchModel();
  const pricing = requireTranslatorSearchPricing();
  const createParams = buildWebSearchCreateParams({ model, query: params.query });
  const requestOptions = buildTranslatorSearchOpenAiRequestOptions(params.timeoutMs);

  let response;
  try {
    response = await client.responses.create(createParams, requestOptions);
  } catch {
    return {
      ok: false,
      code: "web_search_failed",
      searchActions: 0,
      usage: null,
      costFullyKnown: false,
      knownCostEur: 0,
      input_tokens: 0,
      output_tokens: 0,
      total_tokens: 0,
    };
  }

  const usage = (response as { usage?: ResponseUsage | null }).usage ?? null;
  const evaluated = evaluateWebSearchResponse({
    status: response.status ?? "failed",
    output: response.output ?? [],
    usage,
    pricing,
  });

  if (evaluated.ok) {
    return {
      ok: true,
      model,
      sourceUrls: evaluated.sourceUrls,
      searchActions: evaluated.searchActions,
      usage,
      costFullyKnown: evaluated.costFullyKnown,
      knownCostEur: evaluated.knownCostEur,
      input_tokens: evaluated.input_tokens,
      output_tokens: evaluated.output_tokens,
      total_tokens: evaluated.total_tokens,
      assistantTextIgnored: evaluated.assistantTextIgnored,
    };
  }

  return {
    ok: false,
    code: evaluated.code ?? "web_search_failed",
    searchActions: evaluated.searchActions,
    usage,
    costFullyKnown: evaluated.costFullyKnown,
    knownCostEur: evaluated.knownCostEur,
    input_tokens: evaluated.input_tokens,
    output_tokens: evaluated.output_tokens,
    total_tokens: evaluated.total_tokens,
  };
}
