import type { PodcastInsightCategoryLabel } from "@/lib/ytPodcast/podcastInsightCategories";

/** Podcast feed kortelės duomenys (bendras serveriui ir klientui). */
export type PodcastFeedInsight = {
  id: string;
  headline: string;
  coreIdea: string;
  whyItMatters: string;
  action: string;
  keyFacts: string[];
  category: string;
  categoryCanonical: PodcastInsightCategoryLabel;
  interestingScore: number;
  relevanceScore: number;
  videoTitle: string;
  videoUrl: string | null;
  channelTitle: string;
  publishedAt: string | null;
  insightCreatedAt: string;
};

export function decodeHtmlEntities(s: string): string {
  return s
    .replaceAll("&quot;", '"')
    .replaceAll("&amp;", "&")
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

export function formatInsightDateLt(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("lt-LT", { year: "numeric", month: "short", day: "numeric" });
}

/** Apytikslė skaitymo trukmė (~200 žodžių / min). */
export function estimateInsightReadingMinutes(insight: PodcastFeedInsight): number {
  const parts = [
    insight.headline,
    insight.coreIdea,
    insight.whyItMatters,
    insight.action,
    ...insight.keyFacts,
  ];
  const words = parts
    .join(" ")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
  const mins = Math.ceil(words / 200);
  return Math.max(1, Math.min(12, mins));
}

/** Vienas „👉“ priekyje, be dublikato. */
export function normalizeActionForDisplay(raw: string): string {
  const t = raw.trim();
  const body = t.replace(/^(\s*👉\s*)+/u, "").trim();
  if (!body) return t;
  return `👉 ${body}`;
}
