import "server-only";

export type OpenAiUsageLike = {
  input_tokens?: number | null;
  output_tokens?: number | null;
  total_tokens?: number | null;
};

function num(v: unknown, fallback = 0): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function parseEurPer1mTokensEnv(raw: string | undefined, label: string): { inEur: number; outEur: number } | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  // Format: "in=2.50,out=10.00" (EUR per 1M tokens)
  const parts = Object.fromEntries(
    s
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean)
      .map((kv) => {
        const [k, v] = kv.split("=").map((x) => x.trim());
        return [k, v];
      })
  );
  const inEur = num(parts.in, NaN);
  const outEur = num(parts.out, NaN);
  if (!Number.isFinite(inEur) || !Number.isFinite(outEur)) {
    console.warn(`[openai pricing] invalid ${label} override:`, raw);
    return null;
  }
  return { inEur, outEur };
}

/**
 * Very small default pricing map for the models we actually use in this repo.
 * Override per deployment with env vars:
 * - OPENAI_PRICE_EUR_PER_1M_GPT_4O="in=...,out=..."
 */
export function estimateOpenAiCostEur(params: { model: string; usage?: OpenAiUsageLike | null }): {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  cost_eur: number;
} {
  const model = String(params.model ?? "").trim();
  const usage = params.usage ?? null;

  const input_tokens = num(usage?.input_tokens, 0);
  let output_tokens = num(usage?.output_tokens, 0);
  const total_tokens = num(usage?.total_tokens, input_tokens + output_tokens);

  // Some SDK shapes may omit detailed splits; fall back to attributing all tokens as output if needed.
  if (input_tokens === 0 && output_tokens === 0 && total_tokens > 0) {
    output_tokens = total_tokens;
  }

  const override =
    model === "gpt-4o"
      ? parseEurPer1mTokensEnv(process.env.OPENAI_PRICE_EUR_PER_1M_GPT_4O, "OPENAI_PRICE_EUR_PER_1M_GPT_4O")
      : null;

  // Defaults (EUR per 1M tokens) — conservative placeholders; prefer env overrides in prod.
  const defaults =
    model === "gpt-4o"
      ? { inEur: 2.5, outEur: 10.0 }
      : { inEur: 2.5, outEur: 10.0 };

  const rates = override ?? defaults;

  const cost_eur = (input_tokens / 1_000_000) * rates.inEur + (output_tokens / 1_000_000) * rates.outEur;

  return {
    input_tokens,
    output_tokens,
    total_tokens,
    cost_eur: Number.isFinite(cost_eur) ? cost_eur : 0,
  };
}
