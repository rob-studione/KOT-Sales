/**
 * Vertėjų paieška — serverio limitai (01-mvp-spec §10).
 * UI rodo tik target kandidatų skaičių ir EUR biudžetą; likę — serverio konfigūracija.
 */

export const TRANSLATOR_SEARCH_LIMITS = {
  /** Norimi kandidatai formoje / serveryje. */
  maxTargetCandidates: 20,
  defaultTargetCandidates: 20,
  /** Maksimalus vartotojo nurodomas biudžetas (EUR). */
  maxBudgetEur: 5,
  defaultBudgetEur: 5,
  /** Pradiniai HTTPS URL (seed) formoje. Phase C1: 0–3 optional. */
  maxSeedUrls: 3,
  minSeedUrls: 0,
  /** Paieškos užklausos ir OpenAI web_search Responses calls. */
  maxSearchQueries: 3,
  maxWebSearchCalls: 3,
  /** URL ribos. */
  maxUniqueSourceUrls: 30,
  maxFetchUrls: 20,
  maxPagesPerDomain: 3,
  maxRedirects: 3,
  fetchTimeoutMs: 15_000,
  maxHtmlBytes: 1_500_000,
  /** PDF (C2+; not used in C1). */
  maxPdfFiles: 3,
  maxPdfBytes: 10 * 1024 * 1024,
  maxPdfPagesTotal: 30,
  /** Tekstas modeliui. */
  maxCharsPerSource: 40_000,
  maxCharsTotalToModel: 200_000,
  /** Extraction. */
  maxExtractionCalls: 10,
  /** Structured extraction max output tokens (Responses API). */
  maxExtractionOutputTokens: 1200,
  /** Web search Responses call: short output (tool call only). */
  maxWebSearchOutputTokens: 400,
  /** Conservative char bound for web-search prompt reserve / input. */
  maxWebSearchPromptChars: 2_000,
  /**
   * Conservative token reserve for OpenAI `search_context_size: "low"`.
   * Not a billed guarantee — used only for pre-call EUR budget gating.
   */
  webSearchLowContextReserveTokens: 8_000,
  /** Criterion field length caps (server validation). */
  maxLanguageFieldChars: 64,
  maxCountryFieldChars: 64,
  maxCityFieldChars: 64,
  maxSpecializationFieldChars: 96,
  /**
   * Internal job wall clock (ms). Must stay below route maxDuration (120s)
   * with enough reserve for the terminal DB update.
   */
  jobInternalDeadlineMs: 100_000,
  /** Preferred OpenAI HTTP timeouts (capped by remaining deadline). */
  openaiWebSearchTimeoutMs: 45_000,
  openaiExtractionTimeoutMs: 60_000,
  /** Minimum remaining ms required to start search/fetch/extraction. */
  minTimedActionMs: 2_000,
  /** Transient retry vienam veiksmui. */
  maxTransientRetries: 1,
  /** Idempotency: aktyvaus job langas. */
  activeJobDedupeWindowMinutes: 15,
} as const;

export type TranslatorSearchLimits = typeof TRANSLATOR_SEARCH_LIMITS;
