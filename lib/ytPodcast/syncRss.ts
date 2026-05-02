import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { YT_PODCAST_CHANNEL_SEEDS } from "@/lib/ytPodcast/channels";
import { fetchYoutubeChannelRssXml, parseYoutubeChannelRssXml, type ParsedYtRssVideo } from "@/lib/ytPodcast/rss";

/** Naujausių RSS įrašų limitas vienam kanalui vienam paleidimui. */
export const YT_RSS_MAX_VIDEOS_PER_CHANNEL = 10;

/**
 * Būsenos, kurioms nekeičiame apdorojimo laukų (tik RSS metaduomenys).
 * Kitu atveju sinchronizuojame į `pending`.
 */
export const YT_ANALYSIS_PROTECTED_PROCESSING_STATES = new Set([
  "processing",
  "failed",
  "transcript_ready",
  "skipped_no_transcript",
  "skipped_short",
  "analysis_ready",
]);

export type YtPodcastSyncRssError = {
  youtube_channel_id?: string;
  channel_title?: string;
  message: string;
};

export type YtPodcastSyncRssSummary = {
  ok: boolean;
  channelsChecked: number;
  videosFound: number;
  videosInsertedOrUpdated: number;
  errors: YtPodcastSyncRssError[];
};

type ChannelRow = {
  id: string;
  youtube_channel_id: string;
  title: string;
};

type VideoRow = {
  id: string;
  processing_state: string;
};

async function ensureSeedChannels(admin: SupabaseClient): Promise<void> {
  const now = new Date().toISOString();
  for (const row of YT_PODCAST_CHANNEL_SEEDS) {
    const { error } = await admin.from("yt_channels").upsert(
      {
        youtube_channel_id: row.youtube_channel_id,
        title: row.title,
        custom_url: row.custom_url,
        is_active: true,
        updated_at: now,
      },
      { onConflict: "youtube_channel_id" }
    );
    if (error) throw new Error(`Kanalo seed klaida (${row.title}): ${error.message}`);
  }
}

function sliceLatestVideos(videos: ParsedYtRssVideo[]): ParsedYtRssVideo[] {
  return videos.slice(0, YT_RSS_MAX_VIDEOS_PER_CHANNEL);
}

async function upsertVideoFromRss(
  admin: SupabaseClient,
  channelUuid: string,
  v: ParsedYtRssVideo
): Promise<boolean> {
  const { data: existing, error: selErr } = await admin
    .from("yt_videos")
    .select("id, processing_state")
    .eq("youtube_video_id", v.youtube_video_id)
    .maybeSingle();

  if (selErr) throw new Error(selErr.message);

  const now = new Date().toISOString();
  const baseMeta = {
    title: v.title,
    published_at: v.published_at,
    thumbnail_url: v.thumbnail_url,
    video_url: v.video_url,
    ...(v.duration_seconds != null ? { duration_seconds: v.duration_seconds } : {}),
    updated_at: now,
  };

  const row = existing as VideoRow | null;

  if (!row) {
    const { error } = await admin.from("yt_videos").insert({
      channel_id: channelUuid,
      youtube_video_id: v.youtube_video_id,
      ...baseMeta,
      processing_state: "pending",
    });
    if (error) throw new Error(error.message);
    return true;
  }

  if (YT_ANALYSIS_PROTECTED_PROCESSING_STATES.has(row.processing_state)) {
    const { error } = await admin.from("yt_videos").update(baseMeta).eq("id", row.id);
    if (error) throw new Error(error.message);
    return true;
  }

  const { error } = await admin
    .from("yt_videos")
    .update({
      ...baseMeta,
      processing_state: "pending",
    })
    .eq("id", row.id);

  if (error) throw new Error(error.message);
  return true;
}

export async function syncYtPodcastRssForAllActiveChannels(admin: SupabaseClient): Promise<YtPodcastSyncRssSummary> {
  const errors: YtPodcastSyncRssError[] = [];
  let channelsChecked = 0;
  let videosFound = 0;
  let videosInsertedOrUpdated = 0;

  try {
    await ensureSeedChannels(admin);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      channelsChecked: 0,
      videosFound: 0,
      videosInsertedOrUpdated: 0,
      errors: [{ message: `Seed nepavyko: ${message}` }],
    };
  }

  const { data: channels, error: chErr } = await admin
    .from("yt_channels")
    .select("id,youtube_channel_id,title")
    .eq("is_active", true);

  if (chErr) {
    return {
      ok: false,
      channelsChecked: 0,
      videosFound: 0,
      videosInsertedOrUpdated: 0,
      errors: [{ message: chErr.message }],
    };
  }

  const list = (channels ?? []) as ChannelRow[];

  for (const ch of list) {
    channelsChecked += 1;
    let xml: string;
    try {
      xml = await fetchYoutubeChannelRssXml(ch.youtube_channel_id);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      errors.push({
        youtube_channel_id: ch.youtube_channel_id,
        channel_title: ch.title,
        message,
      });
      continue;
    }

    let parsed: ParsedYtRssVideo[];
    try {
      parsed = parseYoutubeChannelRssXml(xml);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      errors.push({
        youtube_channel_id: ch.youtube_channel_id,
        channel_title: ch.title,
        message: `RSS parse: ${message}`,
      });
      continue;
    }

    const batch = sliceLatestVideos(parsed);
    videosFound += batch.length;

    for (const v of batch) {
      try {
        const ok = await upsertVideoFromRss(admin, ch.id, v);
        if (ok) videosInsertedOrUpdated += 1;
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        errors.push({
          youtube_channel_id: ch.youtube_channel_id,
          channel_title: ch.title,
          message: `Video ${v.youtube_video_id}: ${message}`,
        });
      }
    }
  }

  return {
    ok: errors.length === 0,
    channelsChecked,
    videosFound,
    videosInsertedOrUpdated,
    errors,
  };
}
