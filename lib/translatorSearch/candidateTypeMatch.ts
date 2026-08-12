/**
 * Deterministic post-extraction candidate type match (C1.2).
 * Primary rule: request filter ↔ entity_type. Optional generic name heuristics
 * only as extra freelancer protection (no brand-specific hardcoding).
 */

import type {
  TranslatorCandidateEntityType,
  TranslatorCandidateTypeFilter,
} from "@/lib/translatorSearch/types";

export const CANDIDATE_TYPE_MISMATCH_CODE = "candidate_type_mismatch" as const;

/** Safe UI/DB warning — no page text. */
export const CANDIDATE_TYPE_MISMATCH_WARNING =
  "Kandidatas atmestas dėl tipo neatitikties." as const;

export type CandidateTypeMatchResult =
  | { ok: true }
  | { ok: false; code: typeof CANDIDATE_TYPE_MISMATCH_CODE };

/**
 * Generic org / product markers (freelancer supplemental check only).
 * No product brand names.
 */
const NON_PERSON_NAME_RE =
  /\b(ltd|llc|inc|gmbh|s\.?a\.?|oy|ab|limited|company|agency|platform|software|machine\s*translation)\b/i;

export function looksLikeNonPersonTranslatorName(displayName: string | null | undefined): boolean {
  const n = String(displayName ?? "").trim();
  if (!n) return false;
  return NON_PERSON_NAME_RE.test(n);
}

/**
 * - any → all entity_type values
 * - freelancer → only person (+ reject generic org/product name markers)
 * - agency → only agency
 * - unknown is rejected when a concrete filter (freelancer|agency) is selected
 */
export function matchesTranslatorCandidateTypeFilter(params: {
  filter: TranslatorCandidateTypeFilter;
  entityType: TranslatorCandidateEntityType;
  displayName?: string | null;
}): CandidateTypeMatchResult {
  if (params.filter === "any") {
    return { ok: true };
  }

  if (params.filter === "freelancer") {
    if (params.entityType !== "person") {
      return { ok: false, code: CANDIDATE_TYPE_MISMATCH_CODE };
    }
    if (looksLikeNonPersonTranslatorName(params.displayName)) {
      return { ok: false, code: CANDIDATE_TYPE_MISMATCH_CODE };
    }
    return { ok: true };
  }

  // agency
  if (params.entityType !== "agency") {
    return { ok: false, code: CANDIDATE_TYPE_MISMATCH_CODE };
  }
  return { ok: true };
}

/** Rejected candidates must not advance the target counter. */
export function nextFoundCandidatesAfterMatch(params: {
  foundSoFar: number;
  accepted: boolean;
}): number {
  return params.accepted ? params.foundSoFar + 1 : params.foundSoFar;
}

export function isTargetReached(params: {
  foundCandidates: number;
  targetCandidates: number;
}): boolean {
  return params.foundCandidates >= params.targetCandidates;
}
