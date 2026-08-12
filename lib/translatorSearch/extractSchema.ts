import { sanitizeWebsiteUrl } from "@/lib/translatorSearch/urlSafety";

/** OpenAI Structured Outputs schema for translator candidate extraction. */

export const TRANSLATOR_CANDIDATE_EXTRACT_SCHEMA = {
  name: "translator_candidate_extract",
  type: "json_schema" as const,
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: [
      "found",
      "display_name",
      "entity_type",
      "email",
      "phone",
      "country",
      "city",
      "language_pairs",
      "specializations",
      "sworn_status",
      "website_url",
      "match_summary",
      "evidence",
    ],
    properties: {
      found: {
        type: "boolean",
        description: "true only if a concrete translator/agency candidate is evidenced in the text.",
      },
      display_name: {
        anyOf: [{ type: "string", maxLength: 200 }, { type: "null" }],
      },
      entity_type: {
        type: "string",
        enum: ["person", "agency", "unknown"],
      },
      email: {
        anyOf: [{ type: "string", maxLength: 320 }, { type: "null" }],
      },
      phone: {
        anyOf: [{ type: "string", maxLength: 80 }, { type: "null" }],
      },
      country: {
        anyOf: [{ type: "string", maxLength: 120 }, { type: "null" }],
      },
      city: {
        anyOf: [{ type: "string", maxLength: 120 }, { type: "null" }],
      },
      language_pairs: {
        type: "array",
        maxItems: 10,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["from", "to"],
          properties: {
            from: { type: "string", maxLength: 80 },
            to: { type: "string", maxLength: 80 },
          },
        },
      },
      specializations: {
        type: "array",
        maxItems: 12,
        items: { type: "string", maxLength: 120 },
      },
      sworn_status: {
        type: "string",
        enum: ["unknown", "claimed", "verified", "not_found"],
        description: "verified only with clear documentary wording; else claimed/unknown/not_found.",
      },
      website_url: {
        anyOf: [{ type: "string", maxLength: 2000 }, { type: "null" }],
      },
      match_summary: {
        anyOf: [{ type: "string", maxLength: 500 }, { type: "null" }],
      },
      evidence: {
        type: "array",
        maxItems: 20,
        description: "Short quotes tied to fields. No field without a quote.",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["field", "quote"],
          properties: {
            field: {
              type: "string",
              enum: [
                "display_name",
                "email",
                "phone",
                "country",
                "city",
                "language_pairs",
                "specializations",
                "sworn_status",
                "website_url",
                "entity_type",
                "match_summary",
              ],
            },
            quote: { type: "string", maxLength: 400 },
          },
        },
      },
    },
  },
} as const;

export type ExtractedCandidateParsed = {
  found: boolean;
  display_name: string | null;
  entity_type: "person" | "agency" | "unknown";
  email: string | null;
  phone: string | null;
  country: string | null;
  city: string | null;
  language_pairs: Array<{ from: string; to: string }>;
  specializations: string[];
  sworn_status: "unknown" | "claimed" | "verified" | "not_found";
  website_url: string | null;
  match_summary: string | null;
  evidence: Array<{ field: string; quote: string }>;
};

export function validateExtractedCandidate(raw: unknown): ExtractedCandidateParsed {
  if (!raw || typeof raw !== "object") throw new Error("Extraction output is not an object.");
  const o = raw as Record<string, unknown>;
  const found = Boolean(o.found);
  const entity = o.entity_type;
  if (entity !== "person" && entity !== "agency" && entity !== "unknown") {
    throw new Error("Invalid entity_type.");
  }
  const sworn = o.sworn_status;
  if (sworn !== "unknown" && sworn !== "claimed" && sworn !== "verified" && sworn !== "not_found") {
    throw new Error("Invalid sworn_status.");
  }
  const pairs = Array.isArray(o.language_pairs) ? o.language_pairs : [];
  const language_pairs = pairs
    .map((p) => {
      if (!p || typeof p !== "object") return null;
      const from = String((p as { from?: unknown }).from ?? "").trim();
      const to = String((p as { to?: unknown }).to ?? "").trim();
      if (!from || !to) return null;
      return { from, to };
    })
    .filter(Boolean) as Array<{ from: string; to: string }>;

  const specializations = Array.isArray(o.specializations)
    ? o.specializations.map((s) => String(s).trim()).filter(Boolean).slice(0, 12)
    : [];

  const evidenceRaw = Array.isArray(o.evidence) ? o.evidence : [];
  const evidence = evidenceRaw
    .map((e) => {
      if (!e || typeof e !== "object") return null;
      const field = String((e as { field?: unknown }).field ?? "").trim();
      const quote = String((e as { quote?: unknown }).quote ?? "").trim();
      if (!field || !quote) return null;
      return { field, quote: quote.slice(0, 400) };
    })
    .filter(Boolean) as Array<{ field: string; quote: string }>;

  const nullable = (v: unknown) => {
    if (v == null) return null;
    const s = String(v).trim();
    return s ? s : null;
  };

  return {
    found,
    display_name: nullable(o.display_name),
    entity_type: entity,
    email: nullable(o.email)?.toLowerCase() ?? null,
    phone: nullable(o.phone),
    country: nullable(o.country),
    city: nullable(o.city),
    language_pairs,
    specializations,
    sworn_status: sworn,
    website_url: sanitizeWebsiteUrl(nullable(o.website_url)),
    match_summary: nullable(o.match_summary),
    evidence,
  };
}

/** Drop fields that have no evidence quote (pre-grounding helper). */
export function enforceEvidenceOrNull(parsed: ExtractedCandidateParsed): ExtractedCandidateParsed {
  const evidenced = new Set(parsed.evidence.map((e) => e.field));
  const keep = (field: string, value: string | null): string | null => {
    if (value == null) return null;
    return evidenced.has(field) ? value : null;
  };

  return {
    ...parsed,
    display_name: keep("display_name", parsed.display_name),
    email: keep("email", parsed.email),
    phone: keep("phone", parsed.phone),
    country: keep("country", parsed.country),
    city: keep("city", parsed.city),
    website_url: sanitizeWebsiteUrl(keep("website_url", parsed.website_url)),
    match_summary: keep("match_summary", parsed.match_summary),
    language_pairs: evidenced.has("language_pairs") ? parsed.language_pairs : [],
    specializations: evidenced.has("specializations") ? parsed.specializations : [],
    sworn_status: evidenced.has("sworn_status") ? parsed.sworn_status : "unknown",
    entity_type: evidenced.has("entity_type") ? parsed.entity_type : "unknown",
  };
}
