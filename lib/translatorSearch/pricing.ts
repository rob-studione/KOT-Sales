/**
 * Vertėjų paieška kainodara — tik aiškiai sukonfigūruotam konkrečiam modeliui.
 *
 * Env:
 *   TRANSLATOR_SEARCH_MODEL=...
 *   TRANSLATOR_SEARCH_PRICE_MODEL=...   # must exactly match TRANSLATOR_SEARCH_MODEL
 *   TRANSLATOR_SEARCH_PRICE_EUR_PER_1M="in=2.50,out=10.00"
 *
 * Be pilnos kainodaros konfigūracijos job negali pretenduoti kontroliuoti EUR biudžetą.
 */

import { TranslatorSearchConfigError } from "@/lib/translatorSearch/model";

export type OpenAiUsageLike = {
  input_tokens?: number | null;
  output_tokens?: number | null;
  total_tokens?: number | null;
};

export type TranslatorSearchPricing =
  | { configured: true; model: string; inEurPer1m: number; outEurPer1m: number }
  | { configured: false };

function num(v: unknown, fallback = NaN): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function getTranslatorSearchPricing(): TranslatorSearchPricing {
  const model = process.env.TRANSLATOR_SEARCH_MODEL?.trim();
  const priceModel = process.env.TRANSLATOR_SEARCH_PRICE_MODEL?.trim();
  const raw = process.env.TRANSLATOR_SEARCH_PRICE_EUR_PER_1M?.trim();

  if (!model || !priceModel || priceModel !== model || !raw) {
    return { configured: false };
  }

  const parts = Object.fromEntries(
    raw
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean)
      .map((kv) => {
        const [k, v] = kv.split("=").map((x) => x.trim());
        return [k, v];
      })
  );
  const inEur = num(parts.in);
  const outEur = num(parts.out);
  if (!Number.isFinite(inEur) || !Number.isFinite(outEur) || inEur < 0 || outEur < 0) {
    return { configured: false };
  }
  return { configured: true, model, inEurPer1m: inEur, outEurPer1m: outEur };
}

export function requireTranslatorSearchPricing(): Extract<
  TranslatorSearchPricing,
  { configured: true }
> {
  const pricing = getTranslatorSearchPricing();
  if (!pricing.configured) {
    throw new TranslatorSearchConfigError(
      "pricing_not_configured",
      "Trūksta arba neteisinga TRANSLATOR_SEARCH_PRICE_* konfigūracija."
    );
  }
  return pricing;
}

export function estimateTranslatorSearchCostEur(params: {
  pricing: TranslatorSearchPricing;
  usage?: OpenAiUsageLike | null;
}): { input_tokens: number; output_tokens: number; total_tokens: number; cost_eur: number | null } {
  const usage = params.usage ?? null;
  const input_tokens = num(usage?.input_tokens, 0) || 0;
  let output_tokens = num(usage?.output_tokens, 0) || 0;
  const total_tokens = num(usage?.total_tokens, input_tokens + output_tokens) || 0;
  if (input_tokens === 0 && output_tokens === 0 && total_tokens > 0) {
    output_tokens = total_tokens;
  }

  if (!params.pricing.configured) {
    return { input_tokens, output_tokens, total_tokens, cost_eur: null };
  }

  const cost_eur =
    (input_tokens / 1_000_000) * params.pricing.inEurPer1m +
    (output_tokens / 1_000_000) * params.pricing.outEurPer1m;

  return {
    input_tokens,
    output_tokens,
    total_tokens,
    cost_eur: Number.isFinite(cost_eur) ? cost_eur : null,
  };
}

/**
 * Conservative pre-call EUR reserve from configured rates, bounded input size, and max_output_tokens.
 * Uses ~2 chars/token (conservative for mixed-language text).
 */
export function estimateCallReserveEur(params: {
  pricing: Extract<TranslatorSearchPricing, { configured: true }>;
  maxInputChars: number;
  maxOutputTokens: number;
}): number {
  const inputChars = Math.max(0, Math.floor(params.maxInputChars));
  const inputTokens = Math.ceil(inputChars / 2);
  const outputTokens = Math.max(0, Math.floor(params.maxOutputTokens));
  const reserve =
    (inputTokens / 1_000_000) * params.pricing.inEurPer1m +
    (outputTokens / 1_000_000) * params.pricing.outEurPer1m;
  return Number.isFinite(reserve) ? reserve : Number.POSITIVE_INFINITY;
}

export function canAffordNextCall(params: {
  pricing: TranslatorSearchPricing;
  spentEur: number;
  maxBudgetEur: number;
  maxInputChars: number;
  maxOutputTokens: number;
}): boolean {
  if (!params.pricing.configured) return false;
  const reserve = estimateCallReserveEur({
    pricing: params.pricing,
    maxInputChars: params.maxInputChars,
    maxOutputTokens: params.maxOutputTokens,
  });
  return params.spentEur + reserve <= params.maxBudgetEur;
}
