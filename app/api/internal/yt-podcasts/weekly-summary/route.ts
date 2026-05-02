import { NextResponse } from "next/server";

import { assertCronOrInternalSecret } from "@/lib/crm/lostQa/gmailInternalAuth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { generateYtPodcastWeeklySummary } from "@/lib/ytPodcast/generateWeeklySummary";

/**
 * POST su `Authorization: Bearer $CRON_SECRET` arba `x-cron-secret`.
 * Savaitinė podcastų santrauka (LT) iš `yt_video_insights`.
 */
export async function POST(request: Request) {
  const unauthorized = assertCronOrInternalSecret(request);
  if (unauthorized) return unauthorized;

  try {
    const admin = createSupabaseAdminClient();
    const summary = await generateYtPodcastWeeklySummary(admin);
    const status = summary.ok ? 200 : 500;
    return NextResponse.json(summary, { status });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[yt-podcasts] weekly-summary:", e);
    return NextResponse.json(
      { ok: false, generated: false, reason: msg },
      { status: 500 }
    );
  }
}
