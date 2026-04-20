import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export type AiUsageLogType = "prepare" | "analyze" | "summary";

export type InsertAiUsageLogParams = {
  type: AiUsageLogType;
  model: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  cost_eur: number;
  meta?: Record<string, unknown>;
};

export async function insertAiUsageLog(admin: SupabaseClient, params: InsertAiUsageLogParams): Promise<void> {
  const { error } = await admin.from("ai_usage_logs").insert({
    type: params.type,
    model: params.model,
    input_tokens: params.input_tokens,
    output_tokens: params.output_tokens,
    total_tokens: params.total_tokens,
    cost_eur: params.cost_eur,
    meta: params.meta ?? {},
  });
  if (error) {
    const msg =
      error && typeof error === "object" && "message" in error && typeof (error as { message: unknown }).message === "string"
        ? String((error as { message: string }).message)
        : JSON.stringify(error);
    throw new Error(msg || "Nežinoma duomenų bazės klaida.");
  }
}
