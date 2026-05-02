import "server-only";

import { PODCAST_INSIGHT_CATEGORY_ENUM } from "@/lib/ytPodcast/podcastInsightCategories";

/** Model for YouTube podcast video structured analysis (Responses API). */
export const YT_PODCAST_VIDEO_ANALYSIS_MODEL = "gpt-4o" as const;

export const PODCAST_INSIGHT_TYPES = ["tactic", "strategy", "trend", "warning"] as const;

export type PodcastInsightType = (typeof PODCAST_INSIGHT_TYPES)[number];

export const PODCAST_INSIGHT_TYPE_ENUM: string[] = [...PODCAST_INSIGHT_TYPES];

/** Feed ir recommended barjerai (sutampa su guardrails). */
export const PODCAST_FEED_MIN_INTERESTING_SCORE = 8;
export const PODCAST_FEED_MIN_BUSINESS_RELEVANCE_SCORE = 7;

/**
 * Strict JSON Schema for OpenAI Structured Outputs (Responses API `text.format`).
 * Tikslas: sprendimų lygio įžvalga (ne aprašymas, ne summary).
 */
export const YT_PODCAST_VIDEO_ANALYSIS_JSON_SCHEMA = {
  name: "yt_podcast_video_analysis",
  type: "json_schema" as const,
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: [
      "headline",
      "core_idea",
      "key_facts",
      "why_it_matters",
      "action",
      "category",
      "interesting_score",
      "business_relevance_score",
      "recommended",
      "insight_type",
    ],
    properties: {
      headline: {
        type: "string",
        maxLength: 120,
        description:
          "Konkretus, net aštrus insight lietuviškai (≤12 žodžių). Ne straipsnio antraštė, ne tema. Jei banalu — recommended=false.",
      },
      core_idea: {
        type: "string",
        maxLength: 720,
        description:
          "Daugiausiai 4 sakiniai lietuviškai; kiekvienas nauja info; be kartojimo ir filler. Ne summary.",
      },
      key_facts: {
        type: "array",
        minItems: 2,
        description:
          "Mažiausiai 2 ne tušti konkretūs faktai (skaičiai, pavyzdžiai, įrankiai, metodai). Jei insight silpnas — recommended=false, bet faktų laukų formatai laikykis.",
        items: { type: "string", minLength: 1, maxLength: 400 },
        maxItems: 8,
      },
      why_it_matters: {
        type: "string",
        maxLength: 900,
        description:
          "Pinigai, rizika, efektyvumas, konkurencinis pranašumas — be filosofijos („pasaulis keičiasi“ ir pan.).",
      },
      action: {
        type: "string",
        maxLength: 400,
        description:
          "Vienas specifinis veiksmas per 24 val., lietuviškai; ne abstrakcija („pagalvok apie strategiją“). Privalo prasidėti 👉 ir tarpu.",
      },
      category: { type: "string", enum: PODCAST_INSIGHT_CATEGORY_ENUM },
      interesting_score: {
        type: "integer",
        minimum: 1,
        maximum: 10,
        description:
          "9–10 retas stiprus netikėtas; 7–8 naudinga ne wow; recommended=true tik jei ≥8 ir visa kita sanaja tenkinama.",
      },
      business_relevance_score: {
        type: "integer",
        minimum: 1,
        maximum: 10,
        description:
          "9–10 pajamos/konversija/pardavimas; 7–8 optimizacija; recommended=true tik jei ≥7 ir visa kita tenkinama.",
      },
      recommended: {
        type: "boolean",
        description:
          "true tik jei interesting≥8, business≥7, ≥2 key_facts, konkretus neabstraktus action, verslo tema (ne lifestyle be tilto).",
      },
      insight_type: {
        type: "string",
        enum: PODCAST_INSIGHT_TYPE_ENUM,
        description: "tactic=strateginis žingsnis; strategy=kryptis; trend=ryškus pokytis; warning=rizika ar klaida.",
      },
    },
  },
} as const;

export type YtPodcastVideoAnalysisParsed = {
  headline: string;
  core_idea: string;
  key_facts: string[];
  why_it_matters: string;
  action: string;
  category: string;
  interesting_score: number;
  business_relevance_score: number;
  recommended: boolean;
  insight_type: PodcastInsightType;
};

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

function asInt(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isInteger(n) ? n : null;
}

export function validateYtPodcastVideoAnalysisParsed(v: unknown): YtPodcastVideoAnalysisParsed {
  if (!v || typeof v !== "object") throw new Error("Structured output is not an object.");
  const o = v as Record<string, unknown>;

  if (typeof o.headline !== "string" || !o.headline.trim()) throw new Error("Missing headline.");
  if (typeof o.core_idea !== "string" || !o.core_idea.trim()) throw new Error("Missing core_idea.");
  if (!isStringArray(o.key_facts)) throw new Error("Invalid key_facts.");
  const key_facts_trimmed = o.key_facts.map((s) => String(s).trim()).filter(Boolean);
  if (key_facts_trimmed.length < 2) throw new Error("At least 2 non-empty key_facts required.");
  if (typeof o.why_it_matters !== "string" || !o.why_it_matters.trim()) throw new Error("Missing why_it_matters.");
  if (typeof o.action !== "string" || !o.action.trim()) throw new Error("Missing action.");
  if (typeof o.category !== "string" || !PODCAST_INSIGHT_CATEGORY_ENUM.includes(o.category)) {
    throw new Error("Invalid category.");
  }
  const interesting = asInt(o.interesting_score);
  if (interesting === null || interesting < 1 || interesting > 10) throw new Error("Invalid interesting_score.");
  const relevance = asInt(o.business_relevance_score);
  if (relevance === null || relevance < 1 || relevance > 10) throw new Error("Invalid business_relevance_score.");
  if (typeof o.recommended !== "boolean") throw new Error("Invalid recommended.");
  if (typeof o.insight_type !== "string" || !PODCAST_INSIGHT_TYPE_ENUM.includes(o.insight_type)) {
    throw new Error("Invalid insight_type.");
  }

  return {
    headline: o.headline.trim(),
    core_idea: o.core_idea.trim(),
    key_facts: key_facts_trimmed,
    why_it_matters: o.why_it_matters.trim(),
    action: o.action.trim(),
    category: o.category.trim(),
    interesting_score: interesting,
    business_relevance_score: relevance,
    recommended: o.recommended,
    insight_type: o.insight_type as PodcastInsightType,
  };
}

/** Minimalus veiksmo tekstas po „👉“ (specifinis 24h veiksmas). */
export const PODCAST_ANALYSIS_MIN_ACTION_BODY_CHARS = 24;

const MIN_RECOMMENDED_INTERESTING = 8;
const MIN_RECOMMENDED_BUSINESS = 7;
const MIN_KEY_FACTS = 2;

const ABSTRACT_ACTION_LT = [
  "pagalvok apie",
  "pagalvok kaip",
  "apsvarstyk savo",
  "apsvarstyk",
  "įvertink savo",
  "pergalvok savo",
  "pamąstyk apie",
  "svarstyk galimybes",
  "susimąstyk apie",
  "pagalvok, ar",
];

/** Feed ir guardrails: per abstraktus LT veiksmo fragmentus. */
export function isPodcastActionBodyAbstractLt(body: string): boolean {
  const b = body.toLowerCase();
  return ABSTRACT_ACTION_LT.some((frag) => b.includes(frag));
}

/**
 * Po modelio išvesties: sutvirtina scoring / recommended taisykles (feed ir kokybė).
 */
export function enforceAnalysisGuardrails(parsed: YtPodcastVideoAnalysisParsed): YtPodcastVideoAnalysisParsed {
  let interesting_score = parsed.interesting_score;
  const facts = parsed.key_facts.filter((s) => s.trim().length > 0);

  if (facts.length < MIN_KEY_FACTS) {
    interesting_score = Math.min(interesting_score, 6);
  }

  const actionBody = parsed.action.replace(/^\s*👉\s*/u, "").trim();
  const hasConcreteAction =
    actionBody.length >= PODCAST_ANALYSIS_MIN_ACTION_BODY_CHARS && !isPodcastActionBodyAbstractLt(actionBody);

  const lifestyleKill = parsed.category === "Sveikata / psichologija";

  const meetsFeedBar =
    !lifestyleKill &&
    interesting_score >= MIN_RECOMMENDED_INTERESTING &&
    parsed.business_relevance_score >= MIN_RECOMMENDED_BUSINESS &&
    facts.length >= MIN_KEY_FACTS &&
    hasConcreteAction;

  const recommended = Boolean(parsed.recommended && meetsFeedBar);

  return {
    ...parsed,
    interesting_score,
    recommended,
  };
}
