/**
 * Podcast įžvalgos / savaitės ataskaitos kategorijos (LT).
 * Turi sutapti su video analizės JSON enum ir savaitės santraukos sekcijomis.
 */
export const PODCAST_INSIGHT_CATEGORY_LABELS = [
  "AI ir technologijos",
  "Verslas ir strategija",
  "Marketingas ir pardavimai",
  "Investavimas",
  "Produktyvumas",
  "Sveikata / psichologija",
  "Kita",
] as const;

export type PodcastInsightCategoryLabel = (typeof PODCAST_INSIGHT_CATEGORY_LABELS)[number];

/** JSON Schema `enum` masyvas (OpenAI structured output). */
export const PODCAST_INSIGHT_CATEGORY_ENUM: string[] = [...PODCAST_INSIGHT_CATEGORY_LABELS];

export function isPodcastInsightCategory(s: string): s is PodcastInsightCategoryLabel {
  return (PODCAST_INSIGHT_CATEGORY_LABELS as readonly string[]).includes(s);
}
