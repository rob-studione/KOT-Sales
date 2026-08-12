/**
 * Phase B model config — no hardcoded fallback chain.
 * Require TRANSLATOR_SEARCH_MODEL.
 */

export class TranslatorSearchConfigError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "TranslatorSearchConfigError";
  }
}

export function getTranslatorSearchModel(): string {
  const fromEnv = process.env.TRANSLATOR_SEARCH_MODEL?.trim();
  if (!fromEnv) {
    throw new TranslatorSearchConfigError(
      "model_not_configured",
      "Trūksta TRANSLATOR_SEARCH_MODEL nustatymo."
    );
  }
  return fromEnv;
}
