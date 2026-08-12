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
  /** Pradiniai HTTPS URL (seed) formoje. Phase B: 1–3 privalomi. */
  maxSeedUrls: 3,
  minSeedUrlsPhaseB: 1,
  /** Paieškos užklausos ir OpenAI web_search calls. */
  maxSearchQueries: 3,
  maxWebSearchCalls: 3,
  /** URL ribos. */
  maxUniqueSourceUrls: 30,
  maxFetchUrls: 20,
  maxPagesPerDomain: 3,
  maxRedirects: 3,
  fetchTimeoutMs: 15_000,
  maxHtmlBytes: 1_500_000,
  /** PDF (C fazė). */
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
  /** Transient retry vienam veiksmui. */
  maxTransientRetries: 1,
  /** Idempotency: aktyvaus job langas. */
  activeJobDedupeWindowMinutes: 15,
} as const;

export type TranslatorSearchLimits = typeof TRANSLATOR_SEARCH_LIMITS;
