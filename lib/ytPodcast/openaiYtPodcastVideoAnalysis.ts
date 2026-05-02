import "server-only";

import { createOpenAIClient } from "@/lib/openai/serverClient";
import {
  YT_PODCAST_VIDEO_ANALYSIS_JSON_SCHEMA,
  YT_PODCAST_VIDEO_ANALYSIS_MODEL,
  enforceAnalysisGuardrails,
  validateYtPodcastVideoAnalysisParsed,
  type YtPodcastVideoAnalysisParsed,
} from "@/lib/ytPodcast/ytPodcastAnalysisSchema";
import type { ResponseUsage } from "openai/resources/responses/responses";

const SYSTEM_INSTRUCTIONS = [
  "You extract at most one high-signal, decision-grade business insight from a podcast transcript.",
  "Default is to reject: output recommended=false unless the bar is clearly cleared.",
  "All JSON string values MUST be in Lithuanian.",
  "Do not summarize the episode; do not describe that it is a podcast.",
  "Respond only with valid JSON matching the schema — no markdown, no code fences, no extra text.",
].join("\n");

const USER_RULES = [
  "Tavo tikslas – atmesti kuo daugiau video ir palikti tik aukščiausios vertės įžvalgas.",
  "Geriau grąžinti recommended=false nei išleisti vidutinę „insight“ imitaciją.",
  "",
  "Griežtos taisyklės:",
  "- Jei kyla bent menkiausia abejonė dėl vertės → recommended = false.",
  "- Jei insight nėra akivaizdžiai pritaikomas versle → recommended = false.",
  "- Jei nėra konkretaus veiksmo (24 val. horizonas, specifinis) → recommended = false.",
  "- Jei insight gali būti suprastas per 1 sakinį (be mechanizmo / be use-case) → per silpnas → recommended = false.",
  "",
  "CORE FILTRAS (insight VALID tik jei VISKAS tenkinama vienu metu):",
  "- turi konkretų mechanizmą (kaip kažkas veikia);",
  "- turi konkretų use-case (kur tai pritaikyti);",
  "- turi konkretų veiksmą (ką daryti).",
  "Jei bent vieno trūksta ar abejotina → recommended = false.",
  "",
  "HEADLINE:",
  "Blogas: „AI padeda verslui augti“, „Svarbu turėti strategiją“ — banalu, neįžvalga.",
  "Geras: „Cold email atsakymai krenta, kai subject > 6 žodžių“ — konkretu, net aštru.",
  "Taisyklė: turi būti konkretus, net šiek tiek „aštrus“; jei skamba kaip straipsnio pavadinimas ar tema — blogai → recommended = false.",
  "Ne daugiau kaip 12 žodžių.",
  "",
  "CORE IDEA:",
  "- daugiausiai 4 sakiniai;",
  "- kiekvienas sakinys turi pridėti NAUJĄ informaciją;",
  "- jokio pakartojimo, jokio „vandens“;",
  "- jei yra filler → mažink interesting_score ir dažniausiai recommended = false.",
  "",
  "KEY FACTS (kietas reikalavimas):",
  "- minimum 2 konkretūs faktai (skaičiai, pavyzdžiai, įrankiai, metodai, atvejai);",
  "- be 2 stiprių faktų → recommended = false.",
  "",
  "WHY IT MATTERS (be filosofijos):",
  "Leidžiama: pinigai, rizika, efektyvumas, konkurencinis pranašumas, sprendimo pasekmės.",
  "Draudžiama: „tai svarbu, nes pasaulis keičiasi“, abstraktūs motyvai be verslo pasekmių.",
  "",
  "ACTION (kritinis blokas):",
  "- vienas konkretus veiksmas, įgyvendinamas per 24 val.;",
  "- specifinis (kas tikrinama, kiek, kur, kokį sąrašą);",
  "Blogas: 👉 „Pagalvok apie savo strategiją“ — per abstraktu → recommended = false.",
  "Geras: 👉 „Patikrink paskutinius 50 el. laiškų subject ir sutrumpink iki <6 žodžių“.",
  "Privalo prasidėti „👉 “.",
  "",
  "SCORING (1–10, perkalibruota):",
  "- interesting_score: 9–10 retas, stiprus, netikėtas; 7–8 naudinga bet ne wow; <8 beveik visada recommended = false.",
  "- business_relevance_score: 9–10 tiesiogiai pajamos / konversija / pardavimas; 7–8 optimizacija; <7 recommended = false.",
  "",
  "recommended = true TIK jei VISOS sąlygos:",
  "- interesting_score ≥ 8",
  "- business_relevance_score ≥ 7",
  "- key_facts ≥ 2 konkretūs",
  "- action konkretus, ne abstraktus, 24h horizonas",
  "- tema verslas (ne lifestyle): santykiai, psichologija be aiškaus business tiltų, gryna motyvacija → recommended = false",
  "",
  "KILL FILTER: jei įžvalga liečia santykius, psichologiją be aiškaus verslo pritaikymo, ar gryną motyvaciją be mechanizmo — recommended = false (category parink tinkamai).",
  "",
  "Tu analizuoji podcasto transkriptą žemiau. NEGALIMA bendrinių frazių, NEGALIMA perpasakoti video, NEGALIMA summary stiliaus.",
  "GERAS = mechanizmas + leverage + use-case + galima pritaikyti. BLOGAS = filosofija, aprašymas, tušti trendai.",
  "",
  "Output: tik JSON pagal schemą.",
  "",
  "- insight_type: tactic | strategy | trend | warning.",
].join("\n");

function buildUserPrompt(params: { title: string; channelTitle: string; transcript: string }): string {
  return [
    USER_RULES,
    "",
    "---",
    "",
    "Video title:",
    params.title,
    "",
    "Channel:",
    params.channelTitle,
    "",
    "Transcript:",
    params.transcript,
  ].join("\n");
}

export type OpenAiYtPodcastVideoAnalysisResult = {
  parsed: YtPodcastVideoAnalysisParsed;
  model: string;
  response_id: string | null;
  usage: ResponseUsage | null;
};

export async function callOpenAiYtPodcastVideoAnalysis(params: {
  title: string;
  channelTitle: string;
  transcript: string;
}): Promise<OpenAiYtPodcastVideoAnalysisResult> {
  const client = createOpenAIClient();
  const input = buildUserPrompt(params);

  const response = await client.responses.parse({
    model: YT_PODCAST_VIDEO_ANALYSIS_MODEL,
    instructions: SYSTEM_INSTRUCTIONS,
    input,
    store: false,
    text: {
      format: {
        type: YT_PODCAST_VIDEO_ANALYSIS_JSON_SCHEMA.type,
        name: YT_PODCAST_VIDEO_ANALYSIS_JSON_SCHEMA.name,
        strict: YT_PODCAST_VIDEO_ANALYSIS_JSON_SCHEMA.strict,
        schema: YT_PODCAST_VIDEO_ANALYSIS_JSON_SCHEMA.schema,
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
    const validated = validateYtPodcastVideoAnalysisParsed(parsedRaw);
    const parsed = enforceAnalysisGuardrails(validated);
    return {
      parsed,
      model: YT_PODCAST_VIDEO_ANALYSIS_MODEL,
      response_id: typeof (response as { id?: unknown }).id === "string" ? String((response as { id: string }).id) : null,
      usage: (response as { usage?: ResponseUsage | null }).usage ?? null,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[yt-podcast analyze] structured output validation failed:", msg, {
      output_text_sample: JSON.stringify(parsedRaw).slice(0, 500),
    });
    throw e;
  }
}
