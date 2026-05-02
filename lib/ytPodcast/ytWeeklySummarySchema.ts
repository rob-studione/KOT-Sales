import "server-only";

import { PODCAST_INSIGHT_CATEGORY_ENUM, PODCAST_INSIGHT_CATEGORY_LABELS } from "@/lib/ytPodcast/podcastInsightCategories";

export const YT_WEEKLY_SUMMARY_MODEL = "gpt-4o" as const;

const sectionObjectSchema = {
  type: "object" as const,
  additionalProperties: false,
  required: ["title", "items"] as const,
  properties: {
    title: { type: "string" as const, enum: PODCAST_INSIGHT_CATEGORY_ENUM },
    items: {
      type: "array" as const,
      minItems: 1,
      maxItems: 3,
      items: { type: "string" as const },
    },
  },
};

/**
 * Strict JSON Schema for OpenAI Structured Outputs (Responses API `text.format`).
 * Tik kategorijos, kuriose tikrai yra turinio (1–7 sekcijos).
 */
export const YT_WEEKLY_SUMMARY_JSON_SCHEMA = {
  name: "yt_podcast_weekly_summary",
  type: "json_schema" as const,
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["sections"],
    properties: {
      sections: {
        type: "array",
        minItems: 1,
        maxItems: PODCAST_INSIGHT_CATEGORY_LABELS.length,
        items: sectionObjectSchema,
      },
    },
  },
} as const;

export type YtWeeklySummarySection = {
  title: string;
  items: string[];
};

export type YtWeeklySummaryParsed = {
  sections: YtWeeklySummarySection[];
};

export function validateYtWeeklySummaryParsed(v: unknown): YtWeeklySummaryParsed {
  if (!v || typeof v !== "object") throw new Error("Structured output is not an object.");
  const o = v as Record<string, unknown>;
  const raw = o.sections;
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > PODCAST_INSIGHT_CATEGORY_LABELS.length) {
    throw new Error("Invalid sections length.");
  }

  const allowed = new Set(PODCAST_INSIGHT_CATEGORY_ENUM);
  const seen = new Set<string>();
  const sections: YtWeeklySummarySection[] = [];

  for (const entry of raw) {
    if (!entry || typeof entry !== "object") throw new Error("Invalid section entry.");
    const row = entry as Record<string, unknown>;
    const title = String(row.title ?? "").trim();
    if (!allowed.has(title)) throw new Error(`Invalid section title: "${title}".`);
    if (seen.has(title)) throw new Error(`Duplicate section title: "${title}".`);
    seen.add(title);
    if (!Array.isArray(row.items) || row.items.length < 1 || row.items.length > 3) {
      throw new Error(`Invalid items for section "${title}".`);
    }
    const items = row.items.map((s) => String(s).trim()).filter(Boolean);
    if (items.length < 1 || items.length > 3) throw new Error(`Invalid items count for "${title}".`);
    sections.push({ title, items });
  }

  const order = [...PODCAST_INSIGHT_CATEGORY_LABELS];
  const byTitle = new Map(sections.map((s) => [s.title, s.items]));
  const ordered: YtWeeklySummarySection[] = order
    .map((t) => ({ title: t, items: byTitle.get(t) ?? [] }))
    .filter((s) => s.items.length > 0);

  if (ordered.length === 0) throw new Error("No non-empty sections after validation.");

  return { sections: ordered };
}
