/**
 * Deterministic search-query builder for translator search (Phase C1).
 * No LLM planning — at most 3 narrow queries from form criteria.
 */

import { TRANSLATOR_SEARCH_LIMITS } from "@/lib/translatorSearch/limits";
import type {
  TranslatorCandidateTypeFilter,
  TranslatorCertificationRequirement,
} from "@/lib/translatorSearch/types";

export type BuildSearchQueriesInput = {
  languageFrom: string;
  languageTo: string;
  country: string;
  city?: string | null;
  certification: TranslatorCertificationRequirement;
  specialization?: string | null;
  candidateType: TranslatorCandidateTypeFilter;
};

function cleanToken(v: string): string {
  return String(v ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

function uniquePush(out: string[], q: string, max: number): void {
  const t = cleanToken(q);
  if (!t || out.includes(t) || out.length >= max) return;
  out.push(t);
}

/**
 * Build up to `maxSearchQueries` narrow English web queries.
 * Order: core pair+country → certification/type narrowing → city or specialization.
 */
export function buildTranslatorSearchQueries(input: BuildSearchQueriesInput): string[] {
  const max = TRANSLATOR_SEARCH_LIMITS.maxSearchQueries;
  const from = cleanToken(input.languageFrom);
  const to = cleanToken(input.languageTo);
  const country = cleanToken(input.country);
  const city = cleanToken(input.city ?? "");
  const specialization = cleanToken(input.specialization ?? "");
  const out: string[] = [];

  if (!from || !to || !country) return out;

  uniquePush(out, `${from} to ${to} translator ${country}`, max);

  const certBits: string[] = [];
  if (input.certification === "required") {
    certBits.push("sworn", "certified");
  }
  if (input.candidateType === "freelancer") {
    certBits.push("freelancer");
  } else if (input.candidateType === "agency") {
    certBits.push("translation agency");
  }
  if (certBits.length) {
    uniquePush(out, `${from} ${to} ${certBits.join(" ")} translator ${country}`, max);
  }

  if (city) {
    uniquePush(out, `${from} ${to} translator ${city} ${country}`, max);
  }
  if (specialization && out.length < max) {
    uniquePush(out, `${from} ${to} ${specialization} translator ${country}`, max);
  }

  // If still under max (e.g. certification=any, type=any, no city/spec), add a directory-style query.
  if (out.length < max) {
    uniquePush(out, `${from}-${to} professional translator contact ${country}`, max);
  }
  if (out.length < max && input.certification === "required") {
    uniquePush(out, `sworn translator ${from} ${to} ${country} directory`, max);
  }

  return out.slice(0, max);
}
