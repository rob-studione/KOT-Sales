/** Shared OpenAI request options for translator-search (no SDK retries). */

export const TRANSLATOR_SEARCH_OPENAI_MAX_RETRIES = 0 as const;

export type TranslatorSearchOpenAiRequestOptions = {
  timeout: number;
  maxRetries: typeof TRANSLATOR_SEARCH_OPENAI_MAX_RETRIES;
};

/**
 * Per-call HTTP options. maxRetries must stay 0 so timeout is the true wall for one attempt.
 */
export function buildTranslatorSearchOpenAiRequestOptions(
  timeoutMs: number
): TranslatorSearchOpenAiRequestOptions {
  return {
    timeout: Math.max(0, Math.floor(timeoutMs)),
    maxRetries: TRANSLATOR_SEARCH_OPENAI_MAX_RETRIES,
  };
}
