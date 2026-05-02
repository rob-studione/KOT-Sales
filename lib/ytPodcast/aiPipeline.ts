import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { assertYtPodcastAiBudgetAvailable, getYtPodcastCurrentMonthAiCostEur } from "@/lib/ytPodcast/aiUsage";
import { fetchYtPodcastAiSettings, type YtPodcastAiSettings } from "@/lib/ytPodcast/settings";

/**
 * 4 etapui: vienu kvietimu — nustatymai, mėnesio podcast AI sąnaudos, biudžeto gate.
 */
export async function resolveYtPodcastAiProcessingGuards(admin: SupabaseClient): Promise<{
  settings: YtPodcastAiSettings;
  monthYtPodcastCostEur: number;
  budget: Awaited<ReturnType<typeof assertYtPodcastAiBudgetAvailable>>;
}> {
  const [settings, monthYtPodcastCostEur, budget] = await Promise.all([
    fetchYtPodcastAiSettings(admin),
    getYtPodcastCurrentMonthAiCostEur(admin),
    assertYtPodcastAiBudgetAvailable(admin),
  ]);
  return { settings, monthYtPodcastCostEur, budget };
}
