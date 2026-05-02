import "server-only";

/**
 * `yt_videos.processing_state` leidžiamos reikšmės (sinchronizuoti su DB CHECK).
 * @see supabase/migrations/0109_yt_videos_skipped_short_state.sql
 */
export const YT_VIDEO_PROCESSING_STATES = [
  "pending",
  "processing",
  "transcript_ready",
  "analysis_ready",
  "skipped_no_transcript",
  "skipped_short",
  "failed",
] as const;

export type YtVideoProcessingState = (typeof YT_VIDEO_PROCESSING_STATES)[number];

/** Trumpas transkriptas (Shorts ir pan.) — `skipped_short`, be AI. */
export const YT_TRANSCRIPT_SKIP_SHORT_LT = 3000;
