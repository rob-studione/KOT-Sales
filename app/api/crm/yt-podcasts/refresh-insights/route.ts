import { NextResponse } from "next/server";

import { getCurrentCrmUser } from "@/lib/crm/currentUser";
import { analyzeYtPodcastVideos } from "@/lib/ytPodcast/analyzeVideos";
import { generateYtPodcastWeeklySummary } from "@/lib/ytPodcast/generateWeeklySummary";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * CRM: rankinis video analizės + savaitinės santraukos paleidimas (admin).
 * Kviečia tuos pačius helperius kaip internal cron maršrutai.
 */
export async function POST() {
  const actor = await getCurrentCrmUser();
  if (!actor) {
    return NextResponse.json({ ok: false, error: "Neprisijungę." }, { status: 401 });
  }
  if (actor.role !== "admin") {
    return NextResponse.json({ ok: false, error: "Reikia administratoriaus teisių." }, { status: 403 });
  }

  try {
    const admin = createSupabaseAdminClient();
    const analyze = await analyzeYtPodcastVideos(admin);
    const weekly = await generateYtPodcastWeeklySummary(admin);
    return NextResponse.json({ ok: true, analyze, weekly });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[crm yt-podcasts refresh-insights]", e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
