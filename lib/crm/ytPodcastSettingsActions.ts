"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/crm/currentUser";
import { normalizeYtPodcastAiSettings, replaceYtPodcastAiSettings, type YtPodcastAiSettings } from "@/lib/ytPodcast/settings";
import { createSupabaseSsrClient } from "@/lib/supabase/ssr";

function safeBool(v: unknown): boolean {
  if (v === true || v === "true" || v === "1" || v === "on") return true;
  return false;
}

function safeInt(v: unknown, fallback: number): number {
  const n = typeof v === "number" ? v : Number(String(v ?? "").trim().replace(",", "."));
  if (!Number.isFinite(n)) return fallback;
  return Math.floor(n);
}

function safeText(v: unknown): string {
  return String(v ?? "").trim();
}

export async function updateYtPodcastAiSettingsAction(
  formData: FormData
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await requireAdmin({ mode: "throw" });
  } catch {
    return { ok: false, error: "Neturite teisių." };
  }

  const next: YtPodcastAiSettings = normalizeYtPodcastAiSettings({
    enabled: safeBool(formData.get("enabled")),
    costLimitEur: safeInt(formData.get("cost_limit_eur"), 30),
    stopOnLimit: safeBool(formData.get("stop_on_limit")),
    maxVideosPerRun: safeInt(formData.get("max_videos_per_run"), 5),
    maxTranscriptChars: safeInt(formData.get("max_transcript_chars"), 120_000),
    analysisPromptVersion: safeText(formData.get("analysis_prompt_version")) || "v3_high_signal",
  });

  const supabase = await createSupabaseSsrClient();
  try {
    await replaceYtPodcastAiSettings(supabase, next);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }

  revalidatePath("/nustatymai/podcastai-ai");
  return { ok: true };
}
