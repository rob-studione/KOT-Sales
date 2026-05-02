import { NextResponse } from "next/server";

import { assertCronOrInternalSecret } from "@/lib/crm/lostQa/gmailInternalAuth";
import { syncYtPodcastRssForAllActiveChannels } from "@/lib/ytPodcast/syncRss";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * POST su `Authorization: Bearer $CRON_SECRET` arba antraštė `x-cron-secret`.
 * Sinchronizuoja aktyvius `yt_channels` iš YouTube RSS į `yt_videos`.
 */
export async function POST(request: Request) {
  const unauthorized = assertCronOrInternalSecret(request);
  if (unauthorized) return unauthorized;

  try {
    const admin = createSupabaseAdminClient();
    const summary = await syncYtPodcastRssForAllActiveChannels(admin);
    return NextResponse.json(summary, { status: 200 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[yt-podcasts] sync-rss:", e);
    return NextResponse.json(
      {
        ok: false,
        channelsChecked: 0,
        videosFound: 0,
        videosInsertedOrUpdated: 0,
        errors: [{ message: msg }],
      },
      { status: 500 }
    );
  }
}
