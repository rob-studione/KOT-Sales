import "server-only";

import { createHash } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { insertAiUsageLog } from "@/lib/crm/lostQa/aiUsageLogsRepository";
import { estimateOpenAiCostEur } from "@/lib/openai/pricing";
import { assertYtPodcastAiBudgetAvailable } from "@/lib/ytPodcast/aiUsage";
import { resolveYtPodcastAiProcessingGuards } from "@/lib/ytPodcast/aiPipeline";
import { callOpenAiYtPodcastVideoAnalysis } from "@/lib/ytPodcast/openaiYtPodcastVideoAnalysis";
import { YT_TRANSCRIPT_SKIP_SHORT_LT } from "@/lib/ytPodcast/ytVideoProcessingStates";

export type AnalyzeYtPodcastVideosResult = {
  ok: boolean;
  analyzed: number;
  skipped: number;
  failed: number;
  /** Trumpo transkripto filtras (be OpenAI), `content.length` < slenkstis. */
  skippedShort: number;
  errors: Array<{ youtube_video_id?: string; message: string }>;
  /** Early exit: AI disabled or budget blocked before any work. */
  gate?: "disabled" | "budget";
};

const LAST_ERROR_MAX = 500;

/** Minimali trukmė analizei (sek.) — žemiau šio slenksčio AI nevykdoma. */
const YT_ANALYZE_MIN_DURATION_SECONDS = 480;

function shortError(message: string): string {
  const t = message.trim();
  if (t.length <= LAST_ERROR_MAX) return t;
  return `${t.slice(0, LAST_ERROR_MAX)}…`;
}

function sha256Hex(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

function normalizeChannelTitle(embed: unknown): string {
  if (!embed || typeof embed !== "object") return "—";
  if (Array.isArray(embed)) {
    const first = embed[0];
    if (first && typeof first === "object" && "title" in first && typeof (first as { title: unknown }).title === "string") {
      return (first as { title: string }).title.trim() || "—";
    }
    return "—";
  }
  if ("title" in embed && typeof (embed as { title: unknown }).title === "string") {
    return (embed as { title: string }).title.trim() || "—";
  }
  return "—";
}

type TranscriptRow = { content: string; language: string | null };

function pickEnglishTranscript(rows: unknown): TranscriptRow | null {
  if (!Array.isArray(rows)) return null;
  for (const r of rows) {
    if (!r || typeof r !== "object") continue;
    const o = r as { content?: unknown; language?: unknown };
    if (String(o.language ?? "").toLowerCase() !== "en") continue;
    if (typeof o.content === "string" && o.content.trim()) return { content: o.content, language: "en" };
  }
  return null;
}

function isUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const code = "code" in err ? String((err as { code?: unknown }).code ?? "") : "";
  return code === "23505";
}

async function markVideoFailure(
  admin: SupabaseClient,
  videoId: string,
  params: { attempts: number; lastError: string }
): Promise<void> {
  const nextAttempts = params.attempts + 1;
  const failed = nextAttempts >= 3;
  const { error } = await admin
    .from("yt_videos")
    .update({
      attempts: nextAttempts,
      last_error: shortError(params.lastError),
      processing_state: failed ? "failed" : "transcript_ready",
      updated_at: new Date().toISOString(),
    })
    .eq("id", videoId);
  if (error) {
    console.error("[yt-podcast analyze] markVideoFailure update failed", { videoId, error });
  }
}

async function markVideoSkipped(
  admin: SupabaseClient,
  videoId: string,
  params: { processing_state: "skipped_short"; skip_reason: string }
): Promise<{ error: Error | null }> {
  const { error } = await admin
    .from("yt_videos")
    .update({
      processing_state: params.processing_state,
      skip_reason: params.skip_reason,
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", videoId)
    .eq("processing_state", "transcript_ready");
  if (error) {
    console.error("[yt-podcast analyze] markVideoSkipped update failed", { videoId, error });
    return { error: new Error(error.message) };
  }
  return { error: null };
}

async function markVideoSuccess(admin: SupabaseClient, videoId: string): Promise<void> {
  const { error } = await admin
    .from("yt_videos")
    .update({
      processing_state: "analysis_ready",
      attempts: 0,
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", videoId);
  if (error) {
    throw new Error(error.message || "Nepavyko atnaujinti yt_videos.");
  }
}

/** Po sėkmingos analizės: transcript eilutės lieka, `content` išvalomas (žr. migraciją 0108). */
async function clearYtTranscriptContentAfterAnalysis(
  admin: SupabaseClient,
  videoId: string,
  contentSha256: string
): Promise<void> {
  const clearedAt = new Date().toISOString();
  const { error } = await admin
    .from("yt_transcripts")
    .update({
      content: null,
      content_cleared_at: clearedAt,
      content_sha256: contentSha256,
    })
    .eq("video_id", videoId)
    .not("content", "is", null);
  if (error) {
    console.error("[yt-podcast analyze] clearYtTranscriptContentAfterAnalysis failed", { videoId, error });
    throw new Error(error.message || "Nepavyko išvalyti yt_transcripts.content.");
  }
}

/**
 * Transcript-ready YouTube podcast videos → `yt_video_insights` + `analysis_ready`.
 * Saugikliai: `enabled`, mėnesio biudžetas, `maxVideosPerRun`, `maxTranscriptChars`, idempotencija pagal hash + prompt versiją.
 */
export async function analyzeYtPodcastVideos(admin: SupabaseClient): Promise<AnalyzeYtPodcastVideosResult> {
  const emptyErrors: AnalyzeYtPodcastVideosResult["errors"] = [];

  const guards = await resolveYtPodcastAiProcessingGuards(admin);
  const { settings } = guards;

  if (!settings.enabled) {
    return {
      ok: true,
      analyzed: 0,
      skipped: 0,
      failed: 0,
      skippedShort: 0,
      errors: emptyErrors,
      gate: "disabled",
    };
  }
  if (!guards.budget.allowed) {
    return {
      ok: true,
      analyzed: 0,
      skipped: 0,
      failed: 0,
      skippedShort: 0,
      errors: emptyErrors,
      gate: "budget",
    };
  }

  const limit = settings.maxVideosPerRun;
  const { data: rowsRaw, error: fetchError } = await admin
    .from("yt_videos")
    .select(
      "id,youtube_video_id,title,published_at,attempts,video_url,duration_seconds, yt_channels ( title ), yt_transcripts ( content, language )"
    )
    .eq("processing_state", "transcript_ready")
    .order("published_at", { ascending: true, nullsFirst: false })
    .limit(limit);

  if (fetchError) {
    const msg = fetchError.message || String(fetchError);
    return {
      ok: false,
      analyzed: 0,
      skipped: 0,
      failed: 0,
      skippedShort: 0,
      errors: [{ message: msg }],
    };
  }

  const rows = (rowsRaw ?? []) as Array<{
    id: string;
    youtube_video_id: string;
    title: string;
    published_at: string | null;
    attempts: number | null;
    video_url: string | null;
    duration_seconds: number | null;
    yt_channels: unknown;
    yt_transcripts: unknown;
  }>;

  let analyzed = 0;
  let skipped = 0;
  let failed = 0;
  let skippedShort = 0;
  const errors: AnalyzeYtPodcastVideosResult["errors"] = [];

  for (const row of rows) {
    const budgetGate = await assertYtPodcastAiBudgetAvailable(admin);
    if (!budgetGate.allowed) {
      skipped += 1;
      break;
    }

    if (row.video_url?.includes("/shorts/")) {
      const { error: skipErr } = await markVideoSkipped(admin, row.id, {
        processing_state: "skipped_short",
        skip_reason: "youtube_short",
      });
      if (skipErr) {
        errors.push({ youtube_video_id: row.youtube_video_id, message: skipErr.message });
      } else {
        skipped += 1;
      }
      continue;
    }

    if (row.duration_seconds != null && row.duration_seconds < YT_ANALYZE_MIN_DURATION_SECONDS) {
      const { error: skipErr } = await markVideoSkipped(admin, row.id, {
        processing_state: "skipped_short",
        skip_reason: "short_duration",
      });
      if (skipErr) {
        errors.push({ youtube_video_id: row.youtube_video_id, message: skipErr.message });
      } else {
        skipped += 1;
      }
      continue;
    }

    const transcript = pickEnglishTranscript(row.yt_transcripts);
    if (!transcript || typeof transcript.content !== "string") {
      skipped += 1;
      continue;
    }

    const fullContent = transcript.content;
    const contentLen = fullContent.length;

    if (contentLen < YT_TRANSCRIPT_SKIP_SHORT_LT) {
      const { error: skipShortErr } = await admin
        .from("yt_videos")
        .update({
          processing_state: "skipped_short",
          skip_reason: "short_transcript",
          last_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id)
        .eq("processing_state", "transcript_ready");
      if (skipShortErr) {
        errors.push({ youtube_video_id: row.youtube_video_id, message: skipShortErr.message });
      } else {
        skippedShort += 1;
        skipped += 1;
      }
      continue;
    }

    const contentSha256 = sha256Hex(fullContent);
    const promptVersion = settings.analysisPromptVersion;

    const { data: existing } = await admin
      .from("yt_video_insights")
      .select("id")
      .eq("video_id", row.id)
      .eq("analysis_prompt_version", promptVersion)
      .eq("content_sha256", contentSha256)
      .maybeSingle();

    if (existing) {
      skipped += 1;
      const { error: syncErr } = await admin
        .from("yt_videos")
        .update({
          processing_state: "analysis_ready",
          last_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id)
        .eq("processing_state", "transcript_ready");
      if (syncErr) {
        errors.push({ youtube_video_id: row.youtube_video_id, message: syncErr.message });
      } else {
        try {
          await clearYtTranscriptContentAfterAnalysis(admin, row.id, contentSha256);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          errors.push({ youtube_video_id: row.youtube_video_id, message: shortError(msg) });
        }
      }
      continue;
    }

    const maxChars = settings.maxTranscriptChars;
    const truncated = fullContent.length > maxChars;
    const transcriptForModel = truncated ? fullContent.slice(0, maxChars) : fullContent;
    const channelTitle = normalizeChannelTitle(row.yt_channels);

    let ai: Awaited<ReturnType<typeof callOpenAiYtPodcastVideoAnalysis>>;
    try {
      ai = await callOpenAiYtPodcastVideoAnalysis({
        title: row.title || "(be pavadinimo)",
        channelTitle,
        transcript: transcriptForModel,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[yt-podcast analyze] OpenAI failed", { video_id: row.id, youtube_video_id: row.youtube_video_id, error: e });
      await markVideoFailure(admin, row.id, { attempts: row.attempts ?? 0, lastError: msg });
      const nextAttempts = (row.attempts ?? 0) + 1;
      if (nextAttempts >= 3) failed += 1;
      errors.push({ youtube_video_id: row.youtube_video_id, message: shortError(msg) });
      continue;
    }

    const parsed = ai.parsed;

    const action = parsed.action.trim().startsWith("👉") ? parsed.action.trim() : `👉 ${parsed.action.trim()}`;

    const detail: Record<string, unknown> = {
      key_facts: parsed.key_facts,
      why_it_matters: parsed.why_it_matters,
      action,
      category: parsed.category,
      interesting_score: parsed.interesting_score,
      business_relevance_score: parsed.business_relevance_score,
      recommended: parsed.recommended,
      insight_type: parsed.insight_type,
      meta: { truncated, schema_version: "v3_high_signal" },
    };

    const est = estimateOpenAiCostEur({ model: ai.model, usage: ai.usage });

    const { error: insErr } = await admin.from("yt_video_insights").insert({
      video_id: row.id,
      headline: parsed.headline,
      summary: parsed.core_idea,
      detail,
      source: "openai",
      analysis_prompt_version: promptVersion,
      content_sha256: contentSha256,
      model: ai.model,
      tokens_input: est.input_tokens,
      tokens_output: est.output_tokens,
      cost_eur: est.cost_eur,
    });

    if (insErr) {
      if (isUniqueViolation(insErr)) {
        skipped += 1;
        try {
          await markVideoSuccess(admin, row.id);
          await clearYtTranscriptContentAfterAnalysis(admin, row.id, contentSha256);
        } catch (e2) {
          errors.push({
            youtube_video_id: row.youtube_video_id,
            message: e2 instanceof Error ? e2.message : String(e2),
          });
        }
        continue;
      }
      const msg = insErr.message || String(insErr);
      await markVideoFailure(admin, row.id, { attempts: row.attempts ?? 0, lastError: msg });
      const nextAttempts = (row.attempts ?? 0) + 1;
      if (nextAttempts >= 3) failed += 1;
      errors.push({ youtube_video_id: row.youtube_video_id, message: shortError(msg) });
      continue;
    }

    try {
      await markVideoSuccess(admin, row.id);
      await clearYtTranscriptContentAfterAnalysis(admin, row.id, contentSha256);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push({ youtube_video_id: row.youtube_video_id, message: shortError(msg) });
      continue;
    }

    try {
      await insertAiUsageLog(admin, {
        type: "analyze",
        model: ai.model,
        input_tokens: est.input_tokens,
        output_tokens: est.output_tokens,
        total_tokens: est.total_tokens,
        cost_eur: est.cost_eur,
        meta: {
          feature: "yt_podcast_video_analysis",
          video_id: row.id,
          youtube_video_id: row.youtube_video_id,
          response_id: ai.response_id,
        },
      });
    } catch (e) {
      console.error("[yt-podcast analyze] ai usage log insert failed", { video_id: row.id, error: e });
    }

    analyzed += 1;
  }

  return {
    ok: errors.length === 0,
    analyzed,
    skipped,
    failed,
    skippedShort,
    errors,
  };
}
