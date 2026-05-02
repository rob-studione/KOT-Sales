import "server-only";

import { createOpenAIClient } from "@/lib/openai/serverClient";
import {
  YT_WEEKLY_SUMMARY_JSON_SCHEMA,
  YT_WEEKLY_SUMMARY_MODEL,
  validateYtWeeklySummaryParsed,
  type YtWeeklySummaryParsed,
} from "@/lib/ytPodcast/ytWeeklySummarySchema";
import type { ResponseUsage } from "openai/resources/responses/responses";

const SYSTEM_INSTRUCTIONS = [
  "You write a concise weekly intelligence brief in Lithuanian for business readers.",
  "Output must be natural Lithuanian only inside the JSON string values.",
  "Use ONLY the facts and angles present in the supplied input — no outside knowledge, no invented companies, no filler.",
  "Do not fake balance across topics: omit categories that are not represented in the input.",
  "Respond only with valid JSON matching the schema — no markdown, no code fences, no text outside JSON.",
].join(" ");

const USER_INSTRUCTIONS = `You are given pre-filtered podcast-derived notes for one week. They are already grouped under category headings in the input (## …). Only those categories appear in the input.

TASK:

Turn them into a tight weekly brief. Output JSON with "sections": each section has "title" (EXACTLY one of the seven category names below, in Lithuanian) and "items" (1–3 strings per section, never more than 3).

ALLOWED SECTION TITLES (use these strings verbatim when a section is included):

- AI ir technologijos
- Verslas ir strategija
- Marketingas ir pardavimai
- Investavimas
- Produktyvumas
- Sveikata / psichologija
- Kita

RULES:

- Include a section ONLY if that category appears in the input under ## with at least one insight block. Never add a section for a category missing from the input.
- Do not redistribute content into unrelated categories to “balance” the report.
- Max 3 items per section; prefer 2 when enough signal exists. Skip weak or redundant points.
- Do not mention videos, channels, episodes, or “podcastas kalba” — write as a direct brief.
- No generic hype (“AI keičia viską”) unless the input supports a specific claim.

EACH ITEM (one JSON string, use newlines inside the string):

Line 1: short headline (specific, not clickbait).

Next lines: one short paragraph (2–4 sentences) — implication for a decision-maker, grounded in the input.

Final line: exactly one line starting with 👉 (U+1F449) then a space, then one concrete action or check.

EXAMPLE ITEM STRING:

"Mažesnės komandos gali prisiimti daugiau analitikos darbo

Įrankiai sumažina rankinį duomenų tvarkymą; tai keičia kompetencijų ir procesų prioritetus. Sprendimų priėmėjams svarbu žinoti, kur automatizacija jau atperka pastangas.

👉 Suraskite tris pasikartojančias ataskaitas ir įvertinkite, ar jas galima pusiau automatizuoti per vieną ketvirtį."

INPUT:

{{INSIGHTS_BLOCK}}

Return JSON ONLY.`;

export type OpenAiYtWeeklySummaryResult = {
  parsed: YtWeeklySummaryParsed;
  model: string;
  response_id: string | null;
  usage: ResponseUsage | null;
};

export async function callOpenAiYtWeeklySummary(insightsBlock: string): Promise<OpenAiYtWeeklySummaryResult> {
  const client = createOpenAIClient();
  const input = USER_INSTRUCTIONS.replace("{{INSIGHTS_BLOCK}}", insightsBlock.trim() || "(nėra įrašų)");

  const response = await client.responses.parse({
    model: YT_WEEKLY_SUMMARY_MODEL,
    instructions: SYSTEM_INSTRUCTIONS,
    input,
    store: false,
    text: {
      format: {
        type: YT_WEEKLY_SUMMARY_JSON_SCHEMA.type,
        name: YT_WEEKLY_SUMMARY_JSON_SCHEMA.name,
        strict: YT_WEEKLY_SUMMARY_JSON_SCHEMA.strict,
        schema: YT_WEEKLY_SUMMARY_JSON_SCHEMA.schema,
      },
    },
  });

  if (response.status !== "completed") {
    throw new Error(`OpenAI response not completed (status=${response.status}).`);
  }

  const parsedRaw = response.output_parsed;
  if (parsedRaw === null) {
    throw new Error("OpenAI returned no structured output (output_parsed is null).");
  }

  try {
    const parsed = validateYtWeeklySummaryParsed(parsedRaw);
    return {
      parsed,
      model: YT_WEEKLY_SUMMARY_MODEL,
      response_id: typeof (response as { id?: unknown }).id === "string" ? String((response as { id: string }).id) : null,
      usage: (response as { usage?: ResponseUsage | null }).usage ?? null,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[yt-podcast weekly-summary] structured output validation failed:", msg, {
      output_text_sample: JSON.stringify(parsedRaw).slice(0, 500),
    });
    throw e;
  }
}
