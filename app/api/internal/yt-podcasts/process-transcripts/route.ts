import { NextResponse } from "next/server";

import { assertCronOrInternalSecret } from "@/lib/crm/lostQa/gmailInternalAuth";
import { processYtPendingTranscripts } from "@/lib/ytPodcast/processTranscripts";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * POST su `Authorization: Bearer $CRON_SECRET` arba `x-cron-secret`.
 * Apdoroja iki 10 `pending` įrašų: `yt-dlp` subtitrai → `yt_transcripts`, būsena `transcript_ready` / skip / failed.
 */
export async function POST(request: Request) {
  const unauthorized = assertCronOrInternalSecret(request);
  if (unauthorized) return unauthorized;

  try {
    const admin = createSupabaseAdminClient();
    const summary = await processYtPendingTranscripts(admin);
    return NextResponse.json(summary, { status: 200 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[yt-podcasts] process-transcripts:", e);
    return NextResponse.json(
      {
        ok: false,
        checked: 0,
        transcriptsSaved: 0,
        skippedNoTranscript: 0,
        failed: 0,
        errors: [{ message: msg }],
      },
      { status: 500 }
    );
  }
}
