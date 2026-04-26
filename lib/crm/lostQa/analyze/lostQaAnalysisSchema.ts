import "server-only";

import { LOST_AGENT_MISTAKES, LOST_CLIENT_INTENTS, LOST_DEAL_STAGES, LOST_PRIMARY_REASONS } from "@/lib/crm/lostQaDb";

/** Default model for Lost QA Stage 4 (Responses API + structured outputs). */
export const LOST_QA_ANALYSIS_MODEL = "gpt-4o" as const;

export const LOST_QA_ANALYSIS_PROMPT_VERSION = 1 as const;

const primaryReasonCodeEnum = ["scope_mismatch", "price", "competitor", "response_issue"] as const;

const keyMomentTypeEnum = ["client", "agent"] as const;

const primaryEnum = [...LOST_PRIMARY_REASONS] as unknown as string[];
const agentMistakeEnum = [...LOST_AGENT_MISTAKES] as unknown as string[];
const clientIntentEnum = [...LOST_CLIENT_INTENTS] as unknown as string[];
const dealStageEnum = [...LOST_DEAL_STAGES] as unknown as string[];

/**
 * Strict JSON Schema for OpenAI Structured Outputs (Responses API `text.format`).
 * Must stay aligned with `lost_case_analysis` columns + task spec.
 */
export const LOST_QA_ANALYSIS_JSON_SCHEMA = {
  name: "lost_qa_case_analysis",
  type: "json_schema" as const,
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: [
      "primary_reason",
      "secondary_reason",
      "confidence",
      "client_intent",
      "deal_stage",
      "price_issue",
      "response_speed_issue",
      "response_quality_issue",
      "followup_issue",
      "qualification_issue",
      "competitor_mentioned",
      "scope_mismatch",
      "agent_mistakes",
      "improvement_actions",
      "evidence_quotes",
      "primary_reason_code",
      "primary_reason_lt",
      "summary_lt",
      "why_lost_lt",
      "what_to_do_better_lt",
      "key_moments",
      "signals",
    ],
    properties: {
      primary_reason: { type: "string", enum: primaryEnum },
      secondary_reason: {
        anyOf: [{ type: "string", enum: primaryEnum }, { type: "null" }],
      },
      confidence: { type: "number", minimum: 0, maximum: 1 },
      client_intent: { type: "string", enum: clientIntentEnum },
      deal_stage: { type: "string", enum: dealStageEnum },
      price_issue: { type: "boolean" },
      response_speed_issue: { type: "boolean" },
      response_quality_issue: { type: "boolean" },
      followup_issue: { type: "boolean" },
      qualification_issue: { type: "boolean" },
      competitor_mentioned: { type: "boolean" },
      scope_mismatch: { type: "boolean" },
      agent_mistakes: {
        type: "array",
        items: { type: "string", enum: agentMistakeEnum },
      },
      improvement_actions: {
        type: "array",
        maxItems: 5,
        items: { type: "string" },
      },
      evidence_quotes: {
        type: "array",
        maxItems: 5,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["speaker", "quote", "explanation"],
          properties: {
            speaker: { type: "string", enum: ["client", "agent"] },
            quote: { type: "string" },
            explanation: { type: "string" },
          },
        },
      },
      primary_reason_code: { type: "string", enum: [...primaryReasonCodeEnum] },
      primary_reason_lt: { type: "string", minLength: 1 },
      summary_lt: {
        type: "array",
        minItems: 1,
        maxItems: 5,
        items: { type: "string", minLength: 1 },
      },
      why_lost_lt: { type: "string", minLength: 1 },
      what_to_do_better_lt: { type: "string", minLength: 1 },
      key_moments: {
        type: "array",
        minItems: 1,
        maxItems: 10,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["type", "text"],
          properties: {
            type: { type: "string", enum: [...keyMomentTypeEnum] },
            text: { type: "string" },
          },
        },
      },
      signals: {
        type: "object",
        additionalProperties: false,
        required: ["price_issue", "competitor", "response_speed_issue", "response_quality_issue"],
        properties: {
          price_issue: { type: "boolean" },
          competitor: { type: "boolean" },
          response_speed_issue: { type: "boolean" },
          response_quality_issue: { type: "boolean" },
        },
      },
    },
  },
};

export type LostQaStructuredAnalysis = {
  primary_reason: (typeof LOST_PRIMARY_REASONS)[number];
  secondary_reason: (typeof LOST_PRIMARY_REASONS)[number] | null;
  client_intent: (typeof LOST_CLIENT_INTENTS)[number];
  deal_stage: (typeof LOST_DEAL_STAGES)[number];
  price_issue: boolean;
  response_speed_issue: boolean;
  response_quality_issue: boolean;
  followup_issue: boolean;
  qualification_issue: boolean;
  competitor_mentioned: boolean;
  scope_mismatch: boolean;
  agent_mistakes: (typeof LOST_AGENT_MISTAKES)[number][];
  improvement_actions: string[];
  evidence_quotes: Array<{ speaker: "client" | "agent"; quote: string; explanation: string }>;
  primary_reason_code: (typeof primaryReasonCodeEnum)[number];
  primary_reason_lt: string;
  summary_lt: string[];
  why_lost_lt: string;
  what_to_do_better_lt: string;
  key_moments: Array<{ type: (typeof keyMomentTypeEnum)[number]; text: string }>;
  signals: {
    price_issue: boolean;
    competitor: boolean;
    response_speed_issue: boolean;
    response_quality_issue: boolean;
  };
  confidence: number;
};

function isPrimaryReasonCode(v: unknown): v is LostQaStructuredAnalysis["primary_reason_code"] {
  return typeof v === "string" && (primaryReasonCodeEnum as readonly string[]).includes(v);
}

function isKeyMomentType(v: unknown): v is LostQaStructuredAnalysis["key_moments"][number]["type"] {
  return typeof v === "string" && (keyMomentTypeEnum as readonly string[]).includes(v);
}

function isPrimaryReason(v: unknown): v is LostQaStructuredAnalysis["primary_reason"] {
  return typeof v === "string" && (LOST_PRIMARY_REASONS as readonly string[]).includes(v);
}

function isAgentMistake(v: unknown): v is LostQaStructuredAnalysis["agent_mistakes"][number] {
  return typeof v === "string" && (LOST_AGENT_MISTAKES as readonly string[]).includes(v);
}

export function validateLostQaStructuredAnalysis(raw: unknown): LostQaStructuredAnalysis {
  if (!raw || typeof raw !== "object") {
    throw new Error("Lost QA analysis: parsed output is not an object.");
  }
  const o = raw as Record<string, unknown>;

  if (!isPrimaryReason(o.primary_reason)) {
    throw new Error("Lost QA analysis: invalid primary_reason.");
  }
  if (o.secondary_reason !== null && o.secondary_reason !== undefined && !isPrimaryReason(o.secondary_reason)) {
    throw new Error("Lost QA analysis: invalid secondary_reason.");
  }
  const secondary_reason =
    o.secondary_reason === null || o.secondary_reason === undefined ? null : o.secondary_reason;

  if (!isPrimaryReasonCode(o.primary_reason_code)) {
    throw new Error("Lost QA analysis: invalid primary_reason_code.");
  }
  if (typeof o.primary_reason_lt !== "string" || !o.primary_reason_lt.trim()) {
    throw new Error("Lost QA analysis: primary_reason_lt must be a non-empty string.");
  }
  // summary_lt is array (validated below)
  if (!Array.isArray(o.summary_lt) || !o.summary_lt.every((x) => typeof x === "string" && x.trim())) {
    throw new Error("Lost QA analysis: summary_lt must be a non-empty array of strings.");
  }
  if (o.summary_lt.length > 5) {
    throw new Error("Lost QA analysis: summary_lt must have at most 5 items.");
  }
  if (typeof o.why_lost_lt !== "string" || !o.why_lost_lt.trim()) {
    throw new Error("Lost QA analysis: why_lost_lt must be a non-empty string.");
  }
  if (typeof o.what_to_do_better_lt !== "string" || !o.what_to_do_better_lt.trim()) {
    throw new Error("Lost QA analysis: what_to_do_better_lt must be a non-empty string.");
  }

  const confidence = Number(o.confidence);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new Error("Lost QA analysis: confidence must be a number between 0 and 1.");
  }

  if (typeof o.client_intent !== "string" || !(LOST_CLIENT_INTENTS as readonly string[]).includes(o.client_intent)) {
    throw new Error("Lost QA analysis: invalid client_intent.");
  }
  if (typeof o.deal_stage !== "string" || !(LOST_DEAL_STAGES as readonly string[]).includes(o.deal_stage)) {
    throw new Error("Lost QA analysis: invalid deal_stage.");
  }

  const boolKeys = [
    "price_issue",
    "response_speed_issue",
    "response_quality_issue",
    "followup_issue",
    "qualification_issue",
    "competitor_mentioned",
    "scope_mismatch",
  ] as const;
  for (const k of boolKeys) {
    if (typeof o[k] !== "boolean") {
      throw new Error(`Lost QA analysis: ${k} must be boolean.`);
    }
  }

  if (!Array.isArray(o.agent_mistakes) || !o.agent_mistakes.every(isAgentMistake)) {
    throw new Error("Lost QA analysis: agent_mistakes must be an array of allowed mistake codes.");
  }

  if (!Array.isArray(o.improvement_actions) || !o.improvement_actions.every((x) => typeof x === "string")) {
    throw new Error("Lost QA analysis: improvement_actions must be an array of strings.");
  }
  if (o.improvement_actions.length > 5) {
    throw new Error("Lost QA analysis: at most 5 improvement_actions.");
  }

  if (!Array.isArray(o.evidence_quotes)) {
    throw new Error("Lost QA analysis: evidence_quotes must be an array.");
  }
  if (o.evidence_quotes.length > 5) {
    throw new Error("Lost QA analysis: at most 5 evidence_quotes.");
  }
  for (const q of o.evidence_quotes) {
    if (!q || typeof q !== "object") throw new Error("Lost QA analysis: invalid evidence_quote entry.");
    const eq = q as Record<string, unknown>;
    if (eq.speaker !== "client" && eq.speaker !== "agent") {
      throw new Error("Lost QA analysis: evidence_quote.speaker must be client or agent.");
    }
    if (typeof eq.quote !== "string" || typeof eq.explanation !== "string") {
      throw new Error("Lost QA analysis: evidence_quote quote/explanation must be strings.");
    }
  }

  if (!Array.isArray(o.key_moments)) {
    throw new Error("Lost QA analysis: key_moments must be an array.");
  }
  for (const km of o.key_moments) {
    if (!km || typeof km !== "object") throw new Error("Lost QA analysis: key_moments entry must be an object.");
    const kmo = km as Record<string, unknown>;
    if (!isKeyMomentType(kmo.type)) throw new Error("Lost QA analysis: key_moments.type invalid.");
    if (typeof kmo.text !== "string" || !kmo.text.trim()) throw new Error("Lost QA analysis: key_moments.text invalid.");
  }

  if (!o.signals || typeof o.signals !== "object") {
    throw new Error("Lost QA analysis: signals must be an object.");
  }
  const s = o.signals as Record<string, unknown>;
  const sigKeys = ["price_issue", "competitor", "response_speed_issue", "response_quality_issue"] as const;
  for (const k of sigKeys) {
    if (typeof s[k] !== "boolean") throw new Error(`Lost QA analysis: signals.${k} must be boolean.`);
  }

  return {
    primary_reason: o.primary_reason,
    secondary_reason,
    client_intent: o.client_intent as LostQaStructuredAnalysis["client_intent"],
    deal_stage: o.deal_stage as LostQaStructuredAnalysis["deal_stage"],
    price_issue: o.price_issue as boolean,
    response_speed_issue: o.response_speed_issue as boolean,
    response_quality_issue: o.response_quality_issue as boolean,
    followup_issue: o.followup_issue as boolean,
    qualification_issue: o.qualification_issue as boolean,
    competitor_mentioned: o.competitor_mentioned as boolean,
    scope_mismatch: o.scope_mismatch as boolean,
    agent_mistakes: o.agent_mistakes as LostQaStructuredAnalysis["agent_mistakes"],
    improvement_actions: o.improvement_actions as string[],
    evidence_quotes: o.evidence_quotes as LostQaStructuredAnalysis["evidence_quotes"],
    primary_reason_code: o.primary_reason_code,
    confidence,
    primary_reason_lt: String(o.primary_reason_lt),
    summary_lt: o.summary_lt as string[],
    why_lost_lt: String(o.why_lost_lt),
    what_to_do_better_lt: String(o.what_to_do_better_lt),
    key_moments: o.key_moments as LostQaStructuredAnalysis["key_moments"],
    signals: {
      price_issue: Boolean((o.signals as any).price_issue),
      competitor: Boolean((o.signals as any).competitor),
      response_speed_issue: Boolean((o.signals as any).response_speed_issue),
      response_quality_issue: Boolean((o.signals as any).response_quality_issue),
    },
  };
}
