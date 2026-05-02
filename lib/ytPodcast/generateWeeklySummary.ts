import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { addCivilDaysVilnius, vilniusEndUtc, vilniusStartUtc, vilniusTodayDateString } from "@/lib/crm/vilniusTime";
import { insertAiUsageLog } from "@/lib/crm/lostQa/aiUsageLogsRepository";
import { estimateOpenAiCostEur } from "@/lib/openai/pricing";
import { PODCAST_INSIGHT_CATEGORY_ENUM, PODCAST_INSIGHT_CATEGORY_LABELS } from "@/lib/ytPodcast/podcastInsightCategories";
import { resolveYtPodcastAiProcessingGuards } from "@/lib/ytPodcast/aiPipeline";
import { callOpenAiYtWeeklySummary } from "@/lib/ytPodcast/openaiYtWeeklySummary";
import type { YtWeeklySummaryParsed } from "@/lib/ytPodcast/ytWeeklySummarySchema";

const WEEKLY_TITLE = "Savaitės podcastų įžvalgos";
const MAX_VIDEOS_FETCH = 80;
const MIN_RELEVANCE_FOR_WEEKLY = 7;
const MAX_INSIGHTS_PER_CATEGORY_FOR_INPUT = 3;

export type GenerateYtPodcastWeeklySummaryResult = {
  ok: boolean;
  generated: boolean;
  reason?: string;
};

type InsightRow = {
  headline: string | null;
  summary: string | null;
  detail: unknown;
  created_at: string;
};

type VideoRow = {
  id: string;
  title: string;
  published_at: string | null;
  youtube_video_id: string;
  yt_channels: unknown;
  yt_video_insights: InsightRow[] | null;
};

type QualifyingInsight = {
  videoTitle: string;
  channel: string;
  headline: string;
  summary: string;
  keyPoints: string[];
  applications: string[];
  category: string;
  score: number;
};

function normalizeChannelTitle(embed: unknown): string {
  if (!embed || typeof embed !== "object") return "—";
  if (Array.isArray(embed)) {
    const first = embed[0];
    if (first && typeof first === "object" && "title" in first && typeof (first as { title: unknown }).title === "string") {
      return String((first as { title: string }).title).trim() || "—";
    }
    return "—";
  }
  if ("title" in embed && typeof (embed as { title: unknown }).title === "string") {
    return String((embed as { title: string }).title).trim() || "—";
  }
  return "—";
}

function pickLatestInsight(insights: InsightRow[] | null): InsightRow | null {
  if (!Array.isArray(insights) || insights.length === 0) return null;
  const sorted = [...insights].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return sorted[0] ?? null;
}

function extractKeyPointsApplications(detail: unknown): { keyPoints: string[]; applications: string[] } {
  if (!detail || typeof detail !== "object") return { keyPoints: [], applications: [] };
  const o = detail as Record<string, unknown>;
  const kp = Array.isArray(o.key_points) ? o.key_points.filter((x): x is string => typeof x === "string") : [];
  const ap = Array.isArray(o.applications) ? o.applications.filter((x): x is string => typeof x === "string") : [];
  return { keyPoints: kp, applications: ap };
}

/** Savaitinei santraukai: tik įžvalgos su flagu ir pakankamu įvertinimu. */
function readWeeklyEligibility(detail: unknown): { category: string; score: number } | null {
  if (!detail || typeof detail !== "object") return null;
  const d = detail as Record<string, unknown>;
  const cat = typeof d.category === "string" ? d.category.trim() : "";
  if (!cat || !PODCAST_INSIGHT_CATEGORY_ENUM.includes(cat)) return null;
  const rawScore = d.business_relevance_score;
  const score = typeof rawScore === "number" ? rawScore : Number(rawScore);
  if (!Number.isFinite(score)) return null;
  const rounded = Math.round(score);
  if (rounded < MIN_RELEVANCE_FOR_WEEKLY || rounded > 10) return null;
  const rec = d.recommended_for_weekly;
  const ok = rec === true || rec === "true" || rec === 1;
  if (!ok) return null;
  return { category: cat, score: rounded };
}

function buildGroupedInputText(byCategory: Map<string, QualifyingInsight[]>): string {
  const parts: string[] = [
    "Žemiau pateiktos iš anksto atrinktos įžvalgos iš podcastų (vienas langas = 7 kalendorinės dienos).",
    "Filtras: recommended_for_weekly = true IR business_relevance_score >= " + String(MIN_RELEVANCE_FOR_WEEKLY) + ".",
    "Kiekvienoje kategorijoje ne daugiau kaip " + String(MAX_INSIGHTS_PER_CATEGORY_FOR_INPUT) + " stipriausių įrašų (pagal įvertinimą).",
    "Nekurk papildomų kategorijų ir neiteruok tuščių skirsnių.",
    "",
  ];

  for (const cat of PODCAST_INSIGHT_CATEGORY_LABELS) {
    const list = byCategory.get(cat);
    if (!list || list.length === 0) continue;
    parts.push(`## ${cat}`);
    for (let i = 0; i < list.length; i++) {
      const q = list[i]!;
      const kp = q.keyPoints.length ? q.keyPoints.map((s) => `• ${s}`).join("\n") : "—";
      const ap = q.applications.length ? q.applications.map((s) => `• ${s}`).join("\n") : "—";
      parts.push(
        [
          `### Įžvalga ${i + 1} (įvertinimas ${q.score}/10)`,
          `Video: ${q.videoTitle}`,
          `Kanalas: ${q.channel}`,
          `Antraštė: ${q.headline}`,
          `Santrauka: ${q.summary}`,
          `Pagrindinės mintys:\n${kp}`,
          `Pritaikymas:\n${ap}`,
          "---",
        ].join("\n")
      );
    }
    parts.push("");
  }

  return parts.join("\n").trim();
}

/**
 * Savaitinė podcastų santrauka (LT) iš atrinktų `yt_video_insights` (detail + filtrai), be transkriptų.
 */
export async function generateYtPodcastWeeklySummary(admin: SupabaseClient): Promise<GenerateYtPodcastWeeklySummaryResult> {
  const guards = await resolveYtPodcastAiProcessingGuards(admin);
  if (!guards.settings.enabled) {
    return { ok: true, generated: false, reason: "disabled" };
  }
  if (!guards.budget.allowed) {
    return { ok: true, generated: false, reason: "budget" };
  }

  const weekEnd = vilniusTodayDateString();
  const weekStart = addCivilDaysVilnius(weekEnd, -6);
  const publishedFrom = vilniusStartUtc(weekStart);
  const publishedTo = vilniusEndUtc(weekEnd);

  const { data: existing } = await admin
    .from("yt_weekly_summaries")
    .select("id")
    .eq("week_start", weekStart)
    .eq("week_end", weekEnd)
    .is("channel_id", null)
    .maybeSingle();

  if (existing) {
    return { ok: true, generated: false, reason: "already_exists" };
  }

  const { data: rawRows, error: fetchErr } = await admin
    .from("yt_videos")
    .select(
      "id,title,published_at,youtube_video_id, yt_channels ( title ), yt_video_insights ( headline, summary, detail, created_at )"
    )
    .eq("processing_state", "analysis_ready")
    .gte("published_at", publishedFrom)
    .lte("published_at", publishedTo)
    .order("published_at", { ascending: false })
    .limit(MAX_VIDEOS_FETCH);

  if (fetchErr) {
    return { ok: false, generated: false, reason: fetchErr.message || "fetch_failed" };
  }

  const rows = (rawRows ?? []) as VideoRow[];

  const qualifying: QualifyingInsight[] = [];
  for (const row of rows) {
    const ins = pickLatestInsight(row.yt_video_insights ?? []);
    if (!ins) continue;
    const meta = readWeeklyEligibility(ins.detail);
    if (!meta) continue;
    const { keyPoints, applications } = extractKeyPointsApplications(ins.detail);
    qualifying.push({
      videoTitle: (row.title || "(be pavadinimo)").trim(),
      channel: normalizeChannelTitle(row.yt_channels),
      headline: (ins.headline ?? "").trim() || "—",
      summary: (ins.summary ?? "").trim() || "—",
      keyPoints,
      applications,
      category: meta.category,
      score: meta.score,
    });
  }

  if (qualifying.length === 0) {
    return { ok: true, generated: false, reason: "no_insights" };
  }

  qualifying.sort((a, b) => b.score - a.score);

  const byCategory = new Map<string, QualifyingInsight[]>();
  for (const q of qualifying) {
    const arr = byCategory.get(q.category) ?? [];
    arr.push(q);
    byCategory.set(q.category, arr);
  }

  for (const [cat, arr] of byCategory) {
    arr.sort((a, b) => b.score - a.score);
    byCategory.set(cat, arr.slice(0, MAX_INSIGHTS_PER_CATEGORY_FOR_INPUT));
  }

  const insightsBlock = buildGroupedInputText(byCategory);
  if (!insightsBlock.trim()) {
    return { ok: true, generated: false, reason: "no_insights" };
  }

  let ai: Awaited<ReturnType<typeof callOpenAiYtWeeklySummary>>;
  try {
    ai = await callOpenAiYtWeeklySummary(insightsBlock);
  } catch (e) {
    console.error("[yt-podcast weekly-summary] OpenAI failed", e);
    return { ok: false, generated: false, reason: "openai_failed" };
  }

  const allowedSectionTitles = new Set(
    [...byCategory.entries()].filter(([, list]) => list.length > 0).map(([t]) => t)
  );
  const intersected = ai.parsed.sections.filter((s) => allowedSectionTitles.has(s.title) && s.items.length > 0);
  if (intersected.length === 0) {
    console.error("[yt-podcast weekly-summary] no sections after category guard");
    return { ok: false, generated: false, reason: "weekly_guard_empty" };
  }
  const byTitle = new Map(intersected.map((s) => [s.title, s.items]));
  const orderedSections = PODCAST_INSIGHT_CATEGORY_LABELS.map((t) => ({
    title: t,
    items: byTitle.get(t) ?? [],
  })).filter((s) => s.items.length > 0);
  const bodyPayload: YtWeeklySummaryParsed = { sections: orderedSections };
  const bodyJson = JSON.stringify(bodyPayload);
  const nowIso = new Date().toISOString();

  const { error: insErr } = await admin.from("yt_weekly_summaries").insert({
    week_start: weekStart,
    week_end: weekEnd,
    channel_id: null,
    title: WEEKLY_TITLE,
    body: bodyJson,
    status: "ready",
    updated_at: nowIso,
  });

  if (insErr) {
    const code = "code" in insErr ? String((insErr as { code?: unknown }).code ?? "") : "";
    if (code === "23505") {
      return { ok: true, generated: false, reason: "already_exists" };
    }
    console.error("[yt-podcast weekly-summary] insert failed", insErr);
    return { ok: false, generated: false, reason: insErr.message || "insert_failed" };
  }

  try {
    const est = estimateOpenAiCostEur({ model: ai.model, usage: ai.usage });
    await insertAiUsageLog(admin, {
      type: "summary",
      model: ai.model,
      input_tokens: est.input_tokens,
      output_tokens: est.output_tokens,
      total_tokens: est.total_tokens,
      cost_eur: est.cost_eur,
      meta: {
        feature: "yt_podcast_weekly_summary",
        week_start: weekStart,
        week_end: weekEnd,
        insights_used: qualifying.length,
        response_id: ai.response_id,
      },
    });
  } catch (e) {
    console.error("[yt-podcast weekly-summary] ai usage log insert failed", e);
  }

  return { ok: true, generated: true };
}
