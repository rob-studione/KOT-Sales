import { TRANSLATOR_SEARCH_LIMITS } from "@/lib/translatorSearch/limits";
import type {
  TranslatorCandidateTypeFilter,
  TranslatorCertificationRequirement,
  TranslatorSearchRequestParams,
} from "@/lib/translatorSearch/types";
import { assertSafeHttpsUrlSync } from "@/lib/translatorSearch/urlSafety";

export type ValidateRequestResult =
  | { ok: true; params: TranslatorSearchRequestParams; title: string }
  | { ok: false; error: string; code: string };

function asTrimmedString(v: unknown): string {
  return String(v ?? "").trim();
}

function parsePositiveInt(v: unknown, fallback: number): number {
  const n = typeof v === "number" ? v : Number(String(v ?? "").trim().replace(",", "."));
  if (!Number.isFinite(n)) return fallback;
  return Math.floor(n);
}

function parsePositiveNumber(v: unknown, fallback: number): number {
  const n = typeof v === "number" ? v : Number(String(v ?? "").trim().replace(",", "."));
  if (!Number.isFinite(n)) return fallback;
  return n;
}

function parseSeedUrls(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((u) => asTrimmedString(u)).filter(Boolean);
  }
  if (typeof raw === "string") {
    return raw
      .split(/\r?\n|,/)
      .map((u) => u.trim())
      .filter(Boolean);
  }
  return [];
}

/**
 * Server-side validation + clamp. Never trust UI-only limits.
 * Phase B requires 1–3 HTTPS seed URLs.
 */
export function validateTranslatorSearchRequest(body: unknown): ValidateRequestResult {
  const raw = body && typeof body === "object" ? (body as Record<string, unknown>) : {};

  const languageFrom = asTrimmedString(raw.languageFrom ?? raw.language_from);
  const languageTo = asTrimmedString(raw.languageTo ?? raw.language_to);
  const country = asTrimmedString(raw.country);
  const cityRaw = asTrimmedString(raw.city);
  const specializationRaw = asTrimmedString(raw.specialization);

  if (!languageFrom) return { ok: false, code: "validation_language_from", error: "Nurodykite kalbą (iš)." };
  if (!languageTo) return { ok: false, code: "validation_language_to", error: "Nurodykite kalbą (į)." };
  if (!country) return { ok: false, code: "validation_country", error: "Nurodykite šalį." };

  const certificationRaw = asTrimmedString(raw.certification).toLowerCase();
  const certification: TranslatorCertificationRequirement =
    certificationRaw === "required" ? "required" : certificationRaw === "any" || !certificationRaw ? "any" : "any";
  if (certificationRaw && certificationRaw !== "any" && certificationRaw !== "required") {
    return { ok: false, code: "validation_certification", error: "Sertifikavimas: any arba required." };
  }

  const candidateTypeRaw = asTrimmedString(raw.candidateType ?? raw.candidate_type).toLowerCase();
  let candidateType: TranslatorCandidateTypeFilter = "any";
  if (candidateTypeRaw === "freelancer" || candidateTypeRaw === "agency" || candidateTypeRaw === "any") {
    candidateType = candidateTypeRaw;
  } else if (candidateTypeRaw) {
    return { ok: false, code: "validation_candidate_type", error: "Tipas: any, freelancer arba agency." };
  }

  let targetCandidates = parsePositiveInt(raw.targetCandidates ?? raw.target_candidates, TRANSLATOR_SEARCH_LIMITS.defaultTargetCandidates);
  if (targetCandidates < 1) {
    return { ok: false, code: "validation_target", error: "Kandidatų skaičius turi būti bent 1." };
  }
  if (targetCandidates > TRANSLATOR_SEARCH_LIMITS.maxTargetCandidates) {
    targetCandidates = TRANSLATOR_SEARCH_LIMITS.maxTargetCandidates;
  }

  let maxBudgetEur = parsePositiveNumber(raw.maxBudgetEur ?? raw.max_budget_eur, TRANSLATOR_SEARCH_LIMITS.defaultBudgetEur);
  if (!(maxBudgetEur > 0)) {
    return { ok: false, code: "validation_budget", error: "Biudžetas turi būti didesnis už 0." };
  }
  if (maxBudgetEur > TRANSLATOR_SEARCH_LIMITS.maxBudgetEur) {
    maxBudgetEur = TRANSLATOR_SEARCH_LIMITS.maxBudgetEur;
  }

  const seedUrlsRaw = parseSeedUrls(raw.seedUrls ?? raw.seed_urls);
  if (seedUrlsRaw.length < TRANSLATOR_SEARCH_LIMITS.minSeedUrlsPhaseB) {
    return {
      ok: false,
      code: "seed_urls_required_until_phase_c",
      error: "Phase B reikalauja 1–3 HTTPS seed URL.",
    };
  }
  if (seedUrlsRaw.length > TRANSLATOR_SEARCH_LIMITS.maxSeedUrls) {
    return {
      ok: false,
      code: "validation_seed_urls_count",
      error: `Daugiausiai ${TRANSLATOR_SEARCH_LIMITS.maxSeedUrls} seed URL.`,
    };
  }

  const seedUrls: string[] = [];
  for (const u of seedUrlsRaw) {
    const checked = assertSafeHttpsUrlSync(u, { allowHttp: false });
    if (!checked.ok) {
      return { ok: false, code: checked.code, error: `Seed URL atmestas: ${checked.error}` };
    }
    if (!seedUrls.includes(checked.canonicalHref)) {
      seedUrls.push(checked.canonicalHref);
    }
  }

  const params: TranslatorSearchRequestParams = {
    languageFrom,
    languageTo,
    country,
    city: cityRaw || null,
    certification,
    specialization: specializationRaw || null,
    candidateType,
    targetCandidates,
    maxBudgetEur,
    seedUrls,
    appliedLimits: {
      maxSeedUrls: TRANSLATOR_SEARCH_LIMITS.maxSeedUrls,
      maxFetchUrls: TRANSLATOR_SEARCH_LIMITS.maxFetchUrls,
      maxExtractionCalls: TRANSLATOR_SEARCH_LIMITS.maxExtractionCalls,
      maxCharsPerSource: TRANSLATOR_SEARCH_LIMITS.maxCharsPerSource,
      maxBudgetEur: TRANSLATOR_SEARCH_LIMITS.maxBudgetEur,
    },
  };

  const title = `${languageFrom} → ${languageTo} · ${country}${cityRaw ? `, ${cityRaw}` : ""}`;
  return { ok: true, params, title };
}
