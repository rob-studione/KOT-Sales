import type { PodcastInsightCategoryLabel } from "@/lib/ytPodcast/podcastInsightCategories";

/** URL / UI tab slug (DB `detail.category` nekeičiama). */
export type PodcastFeedCategorySlug = "all" | "ai" | "pardavimai" | "marketing" | "business_strategy";

/** Insight `created_at` laikotarpis URL query `period`. */
export type PodcastFeedPeriodSlug = "7d" | "30d" | "all";

export const PODCAST_FEED_PATH = "/irankiai/podcastai" as const;

export const PODCAST_FEED_CATEGORY_TAB_ORDER: ReadonlyArray<{
  slug: PodcastFeedCategorySlug;
  label: string;
}> = [
  { slug: "all", label: "Visi" },
  { slug: "ai", label: "AI" },
  { slug: "pardavimai", label: "Pardavimai" },
  { slug: "marketing", label: "Marketingas" },
  { slug: "business_strategy", label: "Strategija" },
] as const;

export const PODCAST_FEED_PERIOD_OPTIONS: ReadonlyArray<{
  slug: PodcastFeedPeriodSlug;
  label: string;
}> = [
  { slug: "7d", label: "7 d." },
  { slug: "30d", label: "30 d." },
  { slug: "all", label: "Visi" },
] as const;

/** Teminis tab → kanoninės `detail.category` reikšmės (LT enum). */
const TAB_TO_CANONICAL: Record<
  Exclude<PodcastFeedCategorySlug, "all">,
  readonly PodcastInsightCategoryLabel[]
> = {
  ai: ["AI ir technologijos"],
  pardavimai: ["Marketingas ir pardavimai"],
  marketing: ["Marketingas ir pardavimai"],
  business_strategy: ["Verslas ir strategija", "Investavimas", "Produktyvumas", "Kita"],
};

const CATEGORY_SLUGS = new Set<PodcastFeedCategorySlug>(
  PODCAST_FEED_CATEGORY_TAB_ORDER.map((x) => x.slug)
);

const PERIOD_SLUGS = new Set<PodcastFeedPeriodSlug>(PODCAST_FEED_PERIOD_OPTIONS.map((x) => x.slug));

/** Seni URL slug → naujas tab (nelūžta). */
const LEGACY_CATEGORY_SLUG_MAP: Readonly<Record<string, PodcastFeedCategorySlug>> = {
  top: "all",
  sales: "pardavimai",
  startups: "business_strategy",
  startupai: "business_strategy",
  investing: "business_strategy",
  investment: "business_strategy",
  invest: "business_strategy",
  product: "business_strategy",
  operations: "business_strategy",
  verslo_strategija: "business_strategy",
  strategy: "business_strategy",
};

function firstString(v: string | string[] | undefined): string | undefined {
  if (v === undefined) return undefined;
  return Array.isArray(v) ? v[0] : v;
}

export function parsePodcastFeedCategorySlug(raw: string | undefined): PodcastFeedCategorySlug {
  const s = (raw ?? "").trim().toLowerCase();
  if (!s) return "all";

  const legacy = LEGACY_CATEGORY_SLUG_MAP[s];
  if (legacy) return legacy;

  if (CATEGORY_SLUGS.has(s as PodcastFeedCategorySlug)) return s as PodcastFeedCategorySlug;
  return "all";
}

export function parsePodcastFeedPeriodSlug(raw: string | undefined): PodcastFeedPeriodSlug {
  const s = (raw ?? "").trim().toLowerCase();
  if (PERIOD_SLUGS.has(s as PodcastFeedPeriodSlug)) return s as PodcastFeedPeriodSlug;
  return "30d";
}

export function parsePodcastFeedSearchParams(sp: {
  category?: string | string[];
  period?: string | string[];
  /** Seni bookmark’ai — ignoruojama. */
  sort?: string | string[];
}): { category: PodcastFeedCategorySlug; period: PodcastFeedPeriodSlug } {
  return {
    category: parsePodcastFeedCategorySlug(firstString(sp.category)),
    period: parsePodcastFeedPeriodSlug(firstString(sp.period)),
  };
}

export function insightMatchesCategoryTab(
  tab: PodcastFeedCategorySlug,
  categoryCanonical: PodcastInsightCategoryLabel
): boolean {
  if (tab === "all") return true;
  const allowed = TAB_TO_CANONICAL[tab];
  return allowed.includes(categoryCanonical);
}

export function buildPodcastFeedHref(next: {
  category: PodcastFeedCategorySlug;
  period: PodcastFeedPeriodSlug;
}): string {
  const params = new URLSearchParams();
  if (next.category !== "all") params.set("category", next.category);
  if (next.period !== "30d") params.set("period", next.period);
  const q = params.toString();
  return q ? `${PODCAST_FEED_PATH}?${q}` : PODCAST_FEED_PATH;
}
