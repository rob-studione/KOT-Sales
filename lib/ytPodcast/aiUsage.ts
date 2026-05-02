import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { fetchYtPodcastAiSettings } from "@/lib/ytPodcast/settings";
import { vilniusStartUtc, vilniusTodayDateString } from "@/lib/crm/vilniusTime";

function ymdParts(ymd: string): { y: number; m: number; d: number } {
  const [y, m, d] = ymd.split("-").map((x) => Number(x));
  return { y, m, d };
}

function monthRangeUtcIsoStrings(todayYmd: string): { fromIso: string; toIso: string } {
  const { y, m } = ymdParts(todayYmd);
  const startYmd = `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-01`;
  const start = vilniusStartUtc(startYmd);
  const nextMonth = m === 12 ? { y: y + 1, m: 1 } : { y, m: m + 1 };
  const nextStartYmd = `${String(nextMonth.y).padStart(4, "0")}-${String(nextMonth.m).padStart(2, "0")}-01`;
  const end = vilniusStartUtc(nextStartYmd);
  return { fromIso: start, toIso: end };
}

function sumCostRows(rows: Array<{ cost_eur: unknown; meta?: unknown }> | null | undefined): number {
  let s = 0;
  for (const r of rows ?? []) {
    const feat = r.meta && typeof r.meta === "object" && r.meta !== null && "feature" in r.meta ? String((r.meta as { feature?: unknown }).feature ?? "") : "";
    if (!feat.startsWith("yt_podcast_")) continue;
    const x = typeof r.cost_eur === "number" ? r.cost_eur : Number(r.cost_eur);
    if (Number.isFinite(x)) s += x;
  }
  return s;
}

function supabaseErrMessage(error: unknown): string {
  const raw =
    error && typeof error === "object" && "message" in error && typeof (error as { message: unknown }).message === "string"
      ? String((error as { message: string }).message)
      : typeof error === "string"
        ? error
        : JSON.stringify(error);
  return raw || "Nežinoma duomenų bazės klaida.";
}

/** Podcast AI sąnaudos (EUR) už einamąjį Vilniaus kalendorinį mėnesį pagal `ai_usage_logs`. */
export async function getYtPodcastCurrentMonthAiCostEur(admin: SupabaseClient, todayYmd?: string): Promise<number> {
  const ymd = todayYmd ?? vilniusTodayDateString();
  const { fromIso: monthFrom, toIso: monthTo } = monthRangeUtcIsoStrings(ymd);
  const { data, error } = await admin
    .from("ai_usage_logs")
    .select("cost_eur, meta")
    .gte("created_at", monthFrom)
    .lt("created_at", monthTo);
  if (error) throw new Error(supabaseErrMessage(error));
  return sumCostRows((data as Array<{ cost_eur: unknown; meta?: unknown }>) ?? []);
}

export type YtPodcastAiBudgetGate = { allowed: true } | { allowed: false; reason: "disabled" | "budget_exceeded" };

/**
 * Ar galima vykdyti podcast AI apdorojimą pagal `crm_settings` ir mėnesio sąnaudas.
 * OpenAI nekviečia.
 */
export async function assertYtPodcastAiBudgetAvailable(admin: SupabaseClient): Promise<YtPodcastAiBudgetGate> {
  const settings = await fetchYtPodcastAiSettings(admin);
  if (!settings.enabled) {
    return { allowed: false, reason: "disabled" };
  }
  if (!settings.stopOnLimit) {
    return { allowed: true };
  }
  const limit = settings.costLimitEur;
  const spent = await getYtPodcastCurrentMonthAiCostEur(admin);
  if (spent >= limit) {
    return { allowed: false, reason: "budget_exceeded" };
  }
  return { allowed: true };
}
