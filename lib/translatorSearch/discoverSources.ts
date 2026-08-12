/**
 * C1 source discovery: deterministic queries → web_search → merge with seeds.
 * Injectable search runner for offline verify (no live OpenAI).
 */

import { buildTranslatorSearchQueries } from "@/lib/translatorSearch/buildSearchQueries";
import {
  collectTranslatorSourceUrls,
  type PlannedTranslatorSource,
} from "@/lib/translatorSearch/collectSourceUrls";
import { TRANSLATOR_SEARCH_COST_UNKNOWN_WARNING } from "@/lib/translatorSearch/costAssessment";
import {
  canStartTimedAction,
  createJobDeadline,
  type JobDeadline,
} from "@/lib/translatorSearch/jobDeadline";
import { TRANSLATOR_SEARCH_LIMITS } from "@/lib/translatorSearch/limits";
import {
  canAffordWebSearchCall,
  type OpenAiUsageLike,
  type TranslatorSearchPricing,
} from "@/lib/translatorSearch/pricing";
import type { TranslatorSearchRequestParams } from "@/lib/translatorSearch/types";
import { webSearchInputCharCount } from "@/lib/translatorSearch/webSearchParse";

export type WebSearchRunnerResult =
  | {
      ok: true;
      sourceUrls: string[];
      searchActions: number;
      usage?: OpenAiUsageLike | null;
      costFullyKnown: boolean;
      knownCostEur: number;
      input_tokens: number;
      output_tokens: number;
      total_tokens: number;
      /** Must never feed candidate evidence. */
      assistantTextIgnored?: string;
    }
  | {
      ok: false;
      code: string;
      searchActions: number;
      usage?: OpenAiUsageLike | null;
      costFullyKnown: boolean;
      knownCostEur: number;
      input_tokens: number;
      output_tokens: number;
      total_tokens: number;
    };

export type DiscoverSourcesResult = {
  sources: PlannedTranslatorSource[];
  queries: string[];
  searchCalls: number;
  openaiCalls: number;
  costEur: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  warnings: string[];
  webSearchAttempted: boolean;
  webSearchFailed: boolean;
  timeLimit: boolean;
  costLimit: boolean;
  sourceLimit: boolean;
  /** True when at least one OpenAI call's total cost is not fully known. */
  costUnknown: boolean;
};

function applyCallCost(
  state: {
    searchCalls: number;
    costEur: number;
    spent: number;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  },
  partial: {
    searchActions: number;
    knownCostEur: number;
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
  }
): void {
  state.searchCalls += Math.max(0, Math.floor(partial.searchActions));
  state.inputTokens += partial.input_tokens;
  state.outputTokens += partial.output_tokens;
  state.totalTokens += partial.total_tokens;
  if (Number.isFinite(partial.knownCostEur) && partial.knownCostEur > 0) {
    state.costEur += partial.knownCostEur;
    state.spent += partial.knownCostEur;
  }
}

function pushCostUnknownWarning(warnings: string[]): void {
  if (!warnings.includes(TRANSLATOR_SEARCH_COST_UNKNOWN_WARNING)) {
    warnings.push(TRANSLATOR_SEARCH_COST_UNKNOWN_WARNING);
  }
}

/**
 * Discover HTTPS source URLs via up to maxWebSearchCalls web_search Responses calls,
 * then merge with optional seed URLs under unique-URL limits.
 */
export async function discoverTranslatorSources(params: {
  request: TranslatorSearchRequestParams;
  pricing: Extract<TranslatorSearchPricing, { configured: true }>;
  spentEur?: number;
  deadline?: JobDeadline;
  nowMs?: () => number;
  runWebSearch: (
    query: string,
    ctx: { timeoutMs: number }
  ) => Promise<WebSearchRunnerResult>;
}): Promise<DiscoverSourcesResult> {
  const warnings: string[] = [];
  const queries = buildTranslatorSearchQueries(params.request).filter(
    (q) => webSearchInputCharCount(q) <= TRANSLATOR_SEARCH_LIMITS.maxWebSearchPromptChars
  );
  const webUrls: string[] = [];
  const billing = {
    searchCalls: 0,
    costEur: 0,
    spent: params.spentEur ?? 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
  };
  let openaiCalls = 0;
  let webSearchAttempted = false;
  let webSearchFailed = false;
  let successfulSearch = false;
  let timeLimit = false;
  let costLimit = false;
  let sourceLimit = false;
  let costUnknown = false;
  const nowMs = params.nowMs ?? (() => Date.now());
  const deadline = params.deadline ?? createJobDeadline(nowMs());

  const maxCalls = Math.min(
    TRANSLATOR_SEARCH_LIMITS.maxWebSearchCalls,
    TRANSLATOR_SEARCH_LIMITS.maxSearchQueries,
    queries.length
  );

  for (let i = 0; i < maxCalls; i += 1) {
    const query = queries[i]!;
    if (billing.searchCalls >= TRANSLATOR_SEARCH_LIMITS.maxWebSearchCalls) {
      warnings.push("Pasiektas web search call limitas.");
      sourceLimit = true;
      break;
    }

    const gate = canStartTimedAction({
      deadline,
      preferredTimeoutMs: TRANSLATOR_SEARCH_LIMITS.openaiWebSearchTimeoutMs,
      nowMs: nowMs(),
    });
    if (!gate.ok) {
      warnings.push("Pasiektas vidinis laiko limitas prieš web search.");
      timeLimit = true;
      break;
    }

    if (
      !canAffordWebSearchCall({
        pricing: params.pricing,
        spentEur: billing.spent,
        maxBudgetEur: params.request.maxBudgetEur,
      })
    ) {
      warnings.push("Pasiektas biudžeto rezervas prieš web search.");
      costLimit = true;
      break;
    }

    webSearchAttempted = true;
    openaiCalls += 1;
    const result = await params.runWebSearch(query, { timeoutMs: gate.timeoutMs });

    applyCallCost(billing, {
      searchActions: result.searchActions,
      knownCostEur: result.knownCostEur,
      input_tokens: result.input_tokens,
      output_tokens: result.output_tokens,
      total_tokens: result.total_tokens,
    });

    if (!result.costFullyKnown) {
      costUnknown = true;
      costLimit = true;
      pushCostUnknownWarning(warnings);
    }

    if (!result.ok) {
      webSearchFailed = true;
      warnings.push("Web paieška nepavyko / netinkamas search action skaičius; šaltiniai nenaudoti.");
      // No further OpenAI search calls after failure or unknown cost.
      break;
    }

    successfulSearch = true;
    void result.assistantTextIgnored;
    for (const u of result.sourceUrls) webUrls.push(u);

    if (costUnknown) {
      // Keep discovered URLs, but do not start more OpenAI search calls.
      break;
    }
  }

  const seeds = params.request.seedUrls.slice(0, TRANSLATOR_SEARCH_LIMITS.maxSeedUrls);

  if (webSearchFailed && seeds.length > 0) {
    warnings.push("Web paieška nepavyko; tęsiama su seed / jau atrastais URL.");
  }
  if (webSearchFailed && !successfulSearch && seeds.length === 0 && webUrls.length === 0) {
    warnings.push("Web paieška nepavyko ir nėra seed URL.");
  }
  if (costUnknown) {
    pushCostUnknownWarning(warnings);
  }

  const collected = collectTranslatorSourceUrls({
    seedUrls: seeds,
    webUrls,
    maxUnique: TRANSLATOR_SEARCH_LIMITS.maxUniqueSourceUrls,
  });

  if (collected.droppedUnsafe > 0) {
    warnings.push(`Atmesta nesaugių URL: ${collected.droppedUnsafe}.`);
  }
  if (collected.truncatedByLimit > 0) {
    warnings.push("Pasiektas unikalių source URL limitas.");
    sourceLimit = true;
  }
  if (collected.sources.length === 0) {
    warnings.push("Nerasta tinkamų HTTPS šaltinių.");
  }

  return {
    sources: collected.sources,
    queries,
    searchCalls: billing.searchCalls,
    openaiCalls,
    costEur: billing.costEur,
    inputTokens: billing.inputTokens,
    outputTokens: billing.outputTokens,
    totalTokens: billing.totalTokens,
    warnings,
    webSearchAttempted,
    webSearchFailed: webSearchFailed && !successfulSearch,
    timeLimit,
    costLimit,
    sourceLimit,
    costUnknown,
  };
}
