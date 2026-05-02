import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  fetchYoutubeEnglishTranscriptViaYtDlp,
  fetchYoutubeVideoDurationSecondsViaYtDlp,
} from "@/lib/ytPodcast/transcripts";

export const YT_TRANSCRIPT_BATCH_LIMIT = 10;

const LANG_EN = "en";

export type YtProcessTranscriptsError = {
  youtube_video_id?: string;
  message: string;
};

export type YtProcessTranscriptsSummary = {
  ok: boolean;
  checked: number;
  transcriptsSaved: number;
  skippedNoTranscript: number;
  failed: number;
  errors: YtProcessTranscriptsError[];
};

type PendingVideo = {
  id: string;
  youtube_video_id: string;
  attempts: number;
};

type YtVideoDurationPatch = { duration_seconds?: number };

function durationSecondsPatch(seconds: number | null): YtVideoDurationPatch {
  if (seconds != null && Number.isFinite(seconds) && seconds > 0) {
    return { duration_seconds: Math.round(seconds) };
  }
  return {};
}

function truncateError(msg: string, max = 500): string {
  const t = msg.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function toIsoAfterMinutes(base: Date, minutes: number): string {
  const d = new Date(base.getTime() + minutes * 60_000);
  return d.toISOString();
}

function retryDelayMinutes(attemptsAfterIncrement: number): number {
  if (attemptsAfterIncrement <= 1) return 30;
  if (attemptsAfterIncrement === 2) return 120;
  return 720;
}

function isLikelyTransientTranscriptError(message: string): boolean {
  const m = message.toLowerCase();
  if (m.includes("timed out") || m.includes("timeout")) return true;
  if (m.includes("429") || m.includes("too many requests")) return true;
  if (m.includes("500") || m.includes("502") || m.includes("503") || m.includes("504")) return true;
  if (m.includes("econnreset") || m.includes("econnrefused") || m.includes("enotfound") || m.includes("socket")) return true;
  if (m.includes("temporar") || m.includes("try again")) return true;
  return false;
}

async function claimPendingVideos(admin: SupabaseClient): Promise<{ rows: PendingVideo[]; error?: string }> {
  const { data, error } = await admin.rpc("claim_yt_podcast_videos_for_transcript", {
    p_limit: YT_TRANSCRIPT_BATCH_LIMIT,
  });
  if (error) return { rows: [], error: error.message };

  const rows = ((data ?? []) as Array<{ id?: unknown; youtube_video_id?: unknown; attempts?: unknown }>)
    .map((r) => ({
      id: String(r.id ?? ""),
      youtube_video_id: String(r.youtube_video_id ?? ""),
      attempts: Number.isFinite(Number(r.attempts)) ? Number(r.attempts) : 0,
    }))
    .filter((r) => Boolean(r.id) && Boolean(r.youtube_video_id));

  return { rows };
}

async function markTransientFailureForRetry(
  admin: SupabaseClient,
  v: PendingVideo,
  now: Date,
  message: string,
  durationPatch: YtVideoDurationPatch
): Promise<"retried" | "failed"> {
  const nextAttempts = v.attempts + 1;
  const short = truncateError(message);
  if (nextAttempts < 3) {
    await admin
      .from("yt_videos")
      .update({
        ...durationPatch,
        processing_state: "pending",
        attempts: nextAttempts,
        next_attempt_at: toIsoAfterMinutes(now, retryDelayMinutes(nextAttempts)),
        skip_reason: null,
        last_error: short,
        updated_at: now.toISOString(),
      })
      .eq("id", v.id);
    return "retried";
  }

  await admin
    .from("yt_videos")
    .update({
      ...durationPatch,
      processing_state: "failed",
      attempts: nextAttempts,
      next_attempt_at: null,
      skip_reason: null,
      last_error: short,
      updated_at: now.toISOString(),
    })
    .eq("id", v.id);
  return "failed";
}

export async function processYtPendingTranscripts(admin: SupabaseClient): Promise<YtProcessTranscriptsSummary> {
  const errors: YtProcessTranscriptsError[] = [];
  let checked = 0;
  let transcriptsSaved = 0;
  let skippedNoTranscript = 0;
  let failed = 0;

  const claim = await claimPendingVideos(admin);
  if (claim.error) {
    return {
      ok: false,
      checked: 0,
      transcriptsSaved: 0,
      skippedNoTranscript: 0,
      failed: 0,
      errors: [{ message: claim.error }],
    };
  }

  const rows = claim.rows;

  for (const v of rows) {
    checked += 1;
    const now = new Date();
    const nowIso = now.toISOString();

    const durationPatch = durationSecondsPatch(await fetchYoutubeVideoDurationSecondsViaYtDlp(v.youtube_video_id));

    const { data: existingTr, error: trErr } = await admin
      .from("yt_transcripts")
      .select("id")
      .eq("video_id", v.id)
      .eq("language", LANG_EN)
      .maybeSingle();

    if (trErr) {
      const msg = trErr.message;
      errors.push({ youtube_video_id: v.youtube_video_id, message: msg });
      const outcome = await markTransientFailureForRetry(admin, v, now, msg, durationPatch);
      if (outcome === "failed") failed += 1;
      continue;
    }

    if (existingTr?.id) {
      await admin
        .from("yt_videos")
        .update({
          ...durationPatch,
          processing_state: "transcript_ready",
          attempts: 0,
          next_attempt_at: null,
          skip_reason: null,
          last_error: null,
          updated_at: nowIso,
        })
        .eq("id", v.id);
      continue;
    }

    let fetched: Awaited<ReturnType<typeof fetchYoutubeEnglishTranscriptViaYtDlp>>;
    try {
      fetched = await fetchYoutubeEnglishTranscriptViaYtDlp(v.youtube_video_id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push({ youtube_video_id: v.youtube_video_id, message: msg });
      if (isLikelyTransientTranscriptError(msg)) {
        const outcome = await markTransientFailureForRetry(admin, v, now, msg, durationPatch);
        if (outcome === "failed") failed += 1;
      } else {
        failed += 1;
        await admin
          .from("yt_videos")
          .update({
            ...durationPatch,
            processing_state: "failed",
            attempts: v.attempts + 1,
            next_attempt_at: null,
            last_error: truncateError(msg),
            skip_reason: null,
            updated_at: nowIso,
          })
          .eq("id", v.id);
      }
      continue;
    }

    if (!fetched || !fetched.content.trim()) {
      skippedNoTranscript += 1;
      await admin
        .from("yt_videos")
        .update({
          ...durationPatch,
          processing_state: "skipped_no_transcript",
          next_attempt_at: null,
          skip_reason: "no_transcript",
          last_error: null,
          updated_at: nowIso,
        })
        .eq("id", v.id);
      continue;
    }

    const sourceLabel: "ytdlp:manual" | "ytdlp:auto" | "ytdlp:unknown" =
      fetched.source === "ytdlp:manual" || fetched.source === "ytdlp:auto" ? fetched.source : "ytdlp:unknown";

    const { error: upErr } = await admin.from("yt_transcripts").upsert(
      {
        video_id: v.id,
        language: LANG_EN,
        transcript_source: sourceLabel,
        content: fetched.content,
        fetched_at: nowIso,
      },
      { onConflict: "video_id,language" }
    );

    if (upErr) {
      const msg = upErr.message;
      errors.push({ youtube_video_id: v.youtube_video_id, message: msg });
      const outcome = await markTransientFailureForRetry(admin, v, now, msg, durationPatch);
      if (outcome === "failed") failed += 1;
      continue;
    }

    transcriptsSaved += 1;
    await admin
      .from("yt_videos")
      .update({
        ...durationPatch,
        processing_state: "transcript_ready",
        attempts: 0,
        next_attempt_at: null,
        skip_reason: null,
        last_error: null,
        updated_at: nowIso,
      })
      .eq("id", v.id);
  }

  return {
    ok: errors.length === 0,
    checked,
    transcriptsSaved,
    skippedNoTranscript,
    failed,
    errors,
  };
}
