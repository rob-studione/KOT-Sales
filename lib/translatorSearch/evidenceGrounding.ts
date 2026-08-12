/** Evidence grounding against untrusted page text. */

import { sanitizeWebsiteUrl } from "@/lib/translatorSearch/urlSafety";
import type { ExtractedCandidateParsed } from "@/lib/translatorSearch/extractSchema";

/** Collapse whitespace for quote presence checks (case-preserving). */
export function normalizeWhitespaceForEvidence(s: string): string {
  return String(s ?? "").replace(/\s+/g, " ").trim();
}

export function quoteExistsInPageText(quote: string, pageText: string): boolean {
  const q = normalizeWhitespaceForEvidence(quote);
  if (q.length < 2) return false;
  const page = normalizeWhitespaceForEvidence(pageText);
  return page.includes(q);
}

function valueCompatibleWithQuote(value: string, quote: string): boolean {
  const v = normalizeWhitespaceForEvidence(value).toLowerCase();
  const q = normalizeWhitespaceForEvidence(quote).toLowerCase();
  if (!v || !q) return false;
  return q.includes(v) || v.includes(q);
}

/**
 * Keep only evidence quotes present in pageText; clear fields without grounded evidence.
 * Email/phone/website must be compatible with their grounded quote; website only http(s).
 */
export function groundExtractedCandidateAgainstPage(
  parsed: ExtractedCandidateParsed,
  pageText: string
): ExtractedCandidateParsed {
  const groundedEvidence = parsed.evidence.filter((e) => quoteExistsInPageText(e.quote, pageText));
  const byField = new Map<string, string>();
  for (const e of groundedEvidence) {
    if (!byField.has(e.field)) byField.set(e.field, e.quote);
  }

  const keepString = (field: string, value: string | null, requireCompat = false): string | null => {
    if (value == null) return null;
    const quote = byField.get(field);
    if (!quote) return null;
    if (requireCompat && !valueCompatibleWithQuote(value, quote)) return null;
    return value;
  };

  let website = keepString("website_url", parsed.website_url, true);
  website = sanitizeWebsiteUrl(website);

  const email = keepString("email", parsed.email, true);
  const phone = keepString("phone", parsed.phone, true);

  return {
    found: parsed.found,
    display_name: keepString("display_name", parsed.display_name, false),
    entity_type: byField.has("entity_type") ? parsed.entity_type : "unknown",
    email,
    phone,
    country: keepString("country", parsed.country, false),
    city: keepString("city", parsed.city, false),
    language_pairs: byField.has("language_pairs") ? parsed.language_pairs : [],
    specializations: byField.has("specializations") ? parsed.specializations : [],
    sworn_status: byField.has("sworn_status") ? parsed.sworn_status : "unknown",
    website_url: website,
    match_summary: keepString("match_summary", parsed.match_summary, false),
    evidence: groundedEvidence,
  };
}
