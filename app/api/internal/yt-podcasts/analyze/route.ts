import { NextResponse } from "next/server";

import { assertCronOrInternalSecret } from "@/lib/crm/lostQa/gmailInternalAuth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { analyzeYtPodcastVideos } from "@/lib/ytPodcast/analyzeVideos";

/**
 * POST su `Authorization: Bearer $CRON_SECRET` arba `x-cron-secret`.
 * AI analizė: `transcript_ready` → pre-filtras (trumpas transkriptas) → `yt_video_insights` + `analysis_ready`.
 */
export async function POST(request: Request) {
  const unauthorized = assertCronOrInternalSecret(request);
  if (unauthorized) return unauthorized;

  try {
    const admin = createSupabaseAdminClient();
    const summary = await analyzeYtPodcastVideos(admin);
    const status = summary.ok ? 200 : 500;
    return NextResponse.json(summary, { status });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[yt-podcasts] analyze:", e);
    return NextResponse.json(
      {
        ok: false,
        analyzed: 0,
        skipped: 0,
        failed: 0,
        skippedShort: 0,
        errors: [{ message: msg }],
      },
      { status: 500 }
    );
  }
}
