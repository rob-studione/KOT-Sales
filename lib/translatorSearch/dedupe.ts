import { createHash } from "node:crypto";

import type {
  TranslatorCandidateEntityType,
  TranslatorCandidateReviewStatus,
  TranslatorLanguagePair,
  TranslatorSwornStatus,
} from "@/lib/translatorSearch/types";
import { canonicalizeUrl } from "@/lib/translatorSearch/urlSafety";

export function normalizeEmail(email: string | null | undefined): string | null {
  const e = String(email ?? "")
    .trim()
    .toLowerCase();
  if (!e || !e.includes("@")) return null;
  return e;
}

export function normalizeDisplayName(name: string | null | undefined): string {
  return String(name ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/**
 * Exact-match dedupe key order (spec §8.4):
 * 1) normalized email
 * 2) canonical website / profile URL
 * 3) fallback: name + canonical source URL + country
 */
export function computeDedupeKey(input: {
  email?: string | null;
  websiteUrl?: string | null;
  displayName?: string | null;
  country?: string | null;
  canonicalSourceUrl?: string | null;
}): string {
  const email = normalizeEmail(input.email);
  if (email) return `email:${email}`;

  const site = String(input.websiteUrl ?? "").trim();
  if (site) {
    try {
      return `site:${canonicalizeUrl(site).toLowerCase()}`;
    } catch {
      /* fall through */
    }
  }

  const name = normalizeDisplayName(input.displayName) || "unknown";
  const country = String(input.country ?? "")
    .trim()
    .toLowerCase();
  const src = String(input.canonicalSourceUrl ?? "")
    .trim()
    .toLowerCase();
  const canonicalSrc = src ? canonicalizeUrl(src).toLowerCase() : "nosrc";
  return `name:${name}|country:${country}|src:${canonicalSrc}`;
}

export type ExistingCandidateForDedupe = {
  id: string;
  dedupe_key: string;
  review_status: TranslatorCandidateReviewStatus;
  display_name: string;
  entity_type: TranslatorCandidateEntityType;
  email: string | null;
  phone: string | null;
  country: string | null;
  city: string | null;
  language_pairs: TranslatorLanguagePair[];
  specializations: string[];
  sworn_status: TranslatorSwornStatus;
  website_url: string | null;
  match_summary: string | null;
};

export type MergeCandidateDecision = {
  action: "insert" | "reuse";
  candidateId: string | null;
  /** When reusing, never overwrite review fields if approved/rejected. */
  preserveReview: boolean;
  /** Soft profile fields that may be filled if currently null (only when pending). */
  mayEnrichProfile: boolean;
};

/**
 * Decide insert vs reuse. Never silently reset approved/rejected → pending.
 */
export function decideCandidateMerge(
  dedupeKey: string,
  existing: ExistingCandidateForDedupe | null
): MergeCandidateDecision {
  if (!existing || existing.dedupe_key !== dedupeKey) {
    return { action: "insert", candidateId: null, preserveReview: false, mayEnrichProfile: false };
  }
  const reviewed = existing.review_status === "approved" || existing.review_status === "rejected";
  return {
    action: "reuse",
    candidateId: existing.id,
    preserveReview: reviewed,
    mayEnrichProfile: existing.review_status === "pending",
  };
}

export function hashRequestParams(params: unknown): string {
  const json = JSON.stringify(params ?? {});
  return createHash("sha256").update(json).digest("hex");
}
