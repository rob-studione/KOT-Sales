import {
  PODCAST_INSIGHT_CATEGORY_LABELS,
  type PodcastInsightCategoryLabel,
  isPodcastInsightCategory,
} from "@/lib/ytPodcast/podcastInsightCategories";

/**
 * Normalizuoja `detail.category` į kanoninę LT enum reikšmę (AI pipeline).
 * Palaiko galias angliškas / trumpesnes DB reikšmes — atvaizdavime naudokite originalų tekstą.
 */
const LOWER_ALIAS_TO_LT: ReadonlyArray<readonly [string, PodcastInsightCategoryLabel]> = [
  ["ai", "AI ir technologijos"],
  ["ai and technology", "AI ir technologijos"],
  ["technology", "AI ir technologijos"],
  ["business", "Verslas ir strategija"],
  ["business strategy", "Verslas ir strategija"],
  ["strategy", "Verslas ir strategija"],
  ["startups", "Verslas ir strategija"],
  ["startup", "Verslas ir strategija"],
  ["marketing", "Marketingas ir pardavimai"],
  ["marketing and sales", "Marketingas ir pardavimai"],
  ["sales", "Marketingas ir pardavimai"],
  ["investing", "Investavimas"],
  ["investment", "Investavimas"],
  ["productivity", "Produktyvumas"],
  ["operations", "Produktyvumas"],
  ["health", "Sveikata / psichologija"],
  ["psychology", "Sveikata / psichologija"],
  ["other", "Kita"],
  ["misc", "Kita"],
];

export function canonicalizePodcastInsightCategory(raw: string): PodcastInsightCategoryLabel | null {
  const t = raw.trim();
  if (!t) return null;
  if (isPodcastInsightCategory(t)) return t;
  const lower = t.toLowerCase();
  for (const label of PODCAST_INSIGHT_CATEGORY_LABELS) {
    if (label.toLowerCase() === lower) return label;
  }
  for (const [alias, lt] of LOWER_ALIAS_TO_LT) {
    if (lower === alias) return lt;
  }
  return null;
}
