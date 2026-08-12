/**
 * Web-search / extraction cost assessment — never treat partial billing as fully known.
 */

import {
  estimateTranslatorSearchCostEur,
  hasReliableOpenAiUsage,
  type OpenAiUsageLike,
  type TranslatorSearchPricing,
} from "@/lib/translatorSearch/pricing";

export const TRANSLATOR_SEARCH_COST_UNKNOWN_WARNING =
  "Rodoma tik žinoma apskaičiuota kainos dalis; biudžetas nepilnai kontroliuotas.";

export function isTranslatorSearchBudgetEnforced(costUnknown: boolean): boolean {
  return !costUnknown;
}

export type CallCostAssessment = {
  /** True only when this call's total EUR is fully determined. */
  costFullyKnown: boolean;
  /** Sum of portions that are safely known (may be partial). */
  knownCostEur: number;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  searchActions: number;
};

/**
 * Web-search call cost:
 * - fully known only with reliable usage AND exactly one search action;
 * - search action(s) without usage → tool portion known, total unknown;
 * - usage without exactly one search action → token portion known, total unknown.
 */
export function assessWebSearchCallCost(params: {
  pricing: Extract<TranslatorSearchPricing, { configured: true }>;
  usage?: OpenAiUsageLike | null;
  searchActions: number;
}): CallCostAssessment {
  const searchActions = Math.max(0, Math.floor(params.searchActions));
  const hasUsage = hasReliableOpenAiUsage(params.usage);
  const tokenOnly = estimateTranslatorSearchCostEur({
    pricing: params.pricing,
    usage: params.usage,
    searchActions: 0,
  });
  const toolOnly =
    searchActions > 0 ? searchActions * params.pricing.webSearchPriceEurPerCall : 0;

  if (hasUsage && searchActions === 1) {
    const full = estimateTranslatorSearchCostEur({
      pricing: params.pricing,
      usage: params.usage,
      searchActions: 1,
    });
    return {
      costFullyKnown: true,
      knownCostEur: full.cost_eur ?? 0,
      input_tokens: full.input_tokens,
      output_tokens: full.output_tokens,
      total_tokens: full.total_tokens,
      searchActions,
    };
  }

  if (!hasUsage && searchActions > 0) {
    return {
      costFullyKnown: false,
      knownCostEur: toolOnly,
      input_tokens: 0,
      output_tokens: 0,
      total_tokens: 0,
      searchActions,
    };
  }

  if (hasUsage && searchActions !== 1) {
    return {
      costFullyKnown: false,
      knownCostEur: tokenOnly.cost_eur ?? 0,
      input_tokens: tokenOnly.input_tokens,
      output_tokens: tokenOnly.output_tokens,
      total_tokens: tokenOnly.total_tokens,
      searchActions,
    };
  }

  return {
    costFullyKnown: false,
    knownCostEur: 0,
    input_tokens: 0,
    output_tokens: 0,
    total_tokens: 0,
    searchActions,
  };
}

/** Extraction has no tool fee — fully known only with reliable usage. */
export function assessExtractionCallCost(params: {
  pricing: Extract<TranslatorSearchPricing, { configured: true }>;
  usage?: OpenAiUsageLike | null;
}): CallCostAssessment {
  const hasUsage = hasReliableOpenAiUsage(params.usage);
  const est = estimateTranslatorSearchCostEur({
    pricing: params.pricing,
    usage: params.usage,
    searchActions: 0,
  });
  return {
    costFullyKnown: hasUsage,
    knownCostEur: hasUsage ? (est.cost_eur ?? 0) : 0,
    input_tokens: est.input_tokens,
    output_tokens: est.output_tokens,
    total_tokens: est.total_tokens,
    searchActions: 0,
  };
}
