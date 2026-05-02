import "server-only";

import { createSupabaseSsrReadOnlyClient } from "@/lib/supabase/ssr";
import { canonicalizePodcastInsightCategory } from "@/lib/ytPodcast/podcastInsightCategoryAliases";
import type { PodcastInsightCategoryLabel } from "@/lib/ytPodcast/podcastInsightCategories";
import {
  insightMatchesCategoryTab,
  type PodcastFeedCategorySlug,
  type PodcastFeedPeriodSlug,
} from "@/lib/ytPodcast/podcastFeedTabs";
import type { PodcastFeedInsight } from "@/lib/ytPodcast/podcastFeedInsightTypes";
import {
  PODCAST_ANALYSIS_MIN_ACTION_BODY_CHARS,
  PODCAST_FEED_MIN_BUSINESS_RELEVANCE_SCORE,
  PODCAST_FEED_MIN_INTERESTING_SCORE,
  isPodcastActionBodyAbstractLt,
} from "@/lib/ytPodcast/ytPodcastAnalysisSchema";

const FEED_LIMIT = 30;
const POOL_LIMIT = 220;
const MIN_INTERESTING_SCORE = PODCAST_FEED_MIN_INTERESTING_SCORE;
const MIN_RELEVANCE_SCORE = PODCAST_FEED_MIN_BUSINESS_RELEVANCE_SCORE;

const LIFESTYLE_HINT = /\b(santykiai|sutuoktini|meilė|saviugda|motyvacija|vidinė ramybė|asmeninė laimė)\b/i;
const BIZ_WRAP_HINT =
  /\b(verslas|pajamos|konversija|klientai|pardavim|komanda|roi|biudžetas|projekt|įmonė|verslo|darbuotoj)\b/i;

export type FeedInsight = PodcastFeedInsight;

type RawInsightRow = {
  id: string;
  headline: string | null;
  summary: string | null;
  detail: unknown;
  created_at: string;
  yt_videos: unknown;
};

type DetailParsed = {
  categoryDisplay: string;
  categoryCanonical: PodcastInsightCategoryLabel;
  interestingScore: number;
  relevanceScore: number;
  recommended: boolean;
  whyItMatters: string;
  action: string;
  keyFacts: string[];
};

function parseDetail(detail: unknown): DetailParsed | null {
  if (!detail || typeof detail !== "object") return null;
  const d = detail as Record<string, unknown>;

  const categoryRaw = typeof d.category === "string" ? d.category.trim() : "";
  const categoryCanonical = canonicalizePodcastInsightCategory(categoryRaw);
  if (!categoryCanonical) return null;

  const interestingRaw = d.interesting_score;
  const relevanceRaw = d.business_relevance_score;
  const interestingNum = typeof interestingRaw === "number" ? interestingRaw : Number(interestingRaw);
  const relevanceNum = typeof relevanceRaw === "number" ? relevanceRaw : Number(relevanceRaw);
  if (!Number.isFinite(interestingNum) || !Number.isFinite(relevanceNum)) return null;
  const interestingScore = Math.round(interestingNum);
  const relevanceScore = Math.round(relevanceNum);

  const rec = d.recommended;
  const recommended = rec === true || rec === "true" || rec === 1;

  const whyItMatters = typeof d.why_it_matters === "string" ? d.why_it_matters.trim() : "";
  const actionRaw = typeof d.action === "string" ? d.action.trim() : "";
  const keyFacts = Array.isArray(d.key_facts)
    ? d.key_facts.map((s) => String(s).trim()).filter(Boolean)
    : [];

  const action = actionRaw ? (actionRaw.startsWith("👉") ? actionRaw : `👉 ${actionRaw}`) : "";

  return {
    categoryDisplay: categoryRaw || categoryCanonical,
    categoryCanonical,
    interestingScore,
    relevanceScore,
    recommended,
    whyItMatters,
    action,
    keyFacts,
  };
}

type VideoEmbed = {
  id: string;
  title: string;
  published_at: string | null;
  video_url: string | null;
  yt_channels: unknown;
};

function pickVideo(embed: unknown): VideoEmbed | null {
  if (!embed || typeof embed !== "object") return null;
  const v = Array.isArray(embed) ? (embed[0] ?? null) : embed;
  if (!v || typeof v !== "object") return null;
  const r = v as Record<string, unknown>;
  return {
    id: typeof r.id === "string" ? r.id : "",
    title: typeof r.title === "string" ? r.title : "",
    published_at: typeof r.published_at === "string" ? r.published_at : null,
    video_url: typeof r.video_url === "string" ? r.video_url : null,
    yt_channels: r.yt_channels,
  };
}

function pickChannelTitle(embed: unknown): string {
  if (!embed || typeof embed !== "object") return "—";
  const v = Array.isArray(embed) ? (embed[0] ?? null) : embed;
  if (!v || typeof v !== "object") return "—";
  const r = v as Record<string, unknown>;
  if (typeof r.title === "string" && r.title.trim()) return r.title.trim();
  return "—";
}

function createdAtLowerBoundIso(period: PodcastFeedPeriodSlug): string | undefined {
  if (period === "all") return undefined;
  const days = period === "7d" ? 7 : 30;
  const d = new Date();
  d.setTime(d.getTime() - days * 24 * 60 * 60 * 1000);
  return d.toISOString();
}

function dedupeInsightsByVideoSorted(rows: FeedInsight[]): FeedInsight[] {
  const keyOf = (r: FeedInsight) => `${r.videoTitle}|${r.channelTitle}|${r.videoUrl ?? ""}`;
  const seen = new Set<string>();
  const out: FeedInsight[] = [];
  for (const r of rows) {
    const k = keyOf(r);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return out;
}

function passesBaseQuality(detail: DetailParsed): boolean {
  if (!detail.recommended) return false;
  if (detail.interestingScore < MIN_INTERESTING_SCORE) return false;
  if (detail.relevanceScore < MIN_RELEVANCE_SCORE) return false;
  return true;
}

function passesLifestyleBusinessWrap(detail: DetailParsed, headline: string, coreIdea: string): boolean {
  const hay = `${headline} ${coreIdea} ${detail.whyItMatters}`;
  if (!LIFESTYLE_HINT.test(hay)) return true;
  return BIZ_WRAP_HINT.test(hay);
}

function passesFeedStructuralQuality(detail: DetailParsed, headline: string, coreIdea: string): boolean {
  if (detail.categoryCanonical === "Sveikata / psichologija") return false;
  if (!passesLifestyleBusinessWrap(detail, headline, coreIdea)) return false;
  if (detail.keyFacts.length < 2) return false;
  const actionBody = detail.action.replace(/^\s*👉\s*/u, "").trim();
  if (actionBody.length < PODCAST_ANALYSIS_MIN_ACTION_BODY_CHARS) return false;
  if (isPodcastActionBodyAbstractLt(actionBody)) return false;
  return true;
}

function sortByCreatedAtDesc(rows: FeedInsight[]): FeedInsight[] {
  return [...rows].sort(
    (a, b) => new Date(b.insightCreatedAt).getTime() - new Date(a.insightCreatedAt).getTime()
  );
}

export async function buildPodcastInsightsFeed(opts: {
  category: PodcastFeedCategorySlug;
  period: PodcastFeedPeriodSlug;
}): Promise<{ feed: FeedInsight[]; loadError: string | null }> {
  let loadError: string | null = null;
  let feed: FeedInsight[] = [];

  try {
    const supabase = await createSupabaseSsrReadOnlyClient();
    const lowerBound = createdAtLowerBoundIso(opts.period);

    let q = supabase
      .from("yt_video_insights")
      .select(
        "id,headline,summary,detail,created_at, yt_videos ( id, title, published_at, video_url, yt_channels ( title ) )"
      )
      .order("created_at", { ascending: false })
      .limit(POOL_LIMIT);

    if (lowerBound) {
      q = q.gte("created_at", lowerBound);
    }

    const res = await q;

    if (res.error) {
      loadError = res.error.message;
      return { feed, loadError };
    }

    const rows = (res.data ?? []) as RawInsightRow[];
    const candidates: FeedInsight[] = [];

    for (const r of rows) {
      const detail = parseDetail(r.detail);
      if (!detail) continue;

      const headline = (r.headline ?? "").trim();
      const coreIdea = (r.summary ?? "").trim();
      if (!headline || !coreIdea) continue;

      if (!passesBaseQuality(detail)) continue;
      if (!passesFeedStructuralQuality(detail, headline, coreIdea)) continue;

      if (opts.category !== "all") {
        if (!insightMatchesCategoryTab(opts.category, detail.categoryCanonical)) continue;
      }

      const video = pickVideo(r.yt_videos);
      const channelTitle = pickChannelTitle(video?.yt_channels);

      candidates.push({
        id: r.id,
        headline,
        coreIdea,
        whyItMatters: detail.whyItMatters,
        action: detail.action,
        keyFacts: detail.keyFacts,
        category: detail.categoryDisplay,
        categoryCanonical: detail.categoryCanonical,
        interestingScore: detail.interestingScore,
        relevanceScore: detail.relevanceScore,
        videoTitle: (video?.title ?? "").trim(),
        videoUrl: video?.video_url ?? null,
        channelTitle,
        publishedAt: video?.published_at ?? null,
        insightCreatedAt: r.created_at,
      });
    }

    const sorted = sortByCreatedAtDesc(candidates);
    feed = dedupeInsightsByVideoSorted(sorted).slice(0, FEED_LIMIT);
  } catch (e) {
    loadError = e instanceof Error ? e.message : "Klaida";
  }

  return { feed, loadError };
}
