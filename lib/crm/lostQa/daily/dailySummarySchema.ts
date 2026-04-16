import "server-only";

import { LOST_QA_ANALYSIS_MODEL } from "@/lib/crm/lostQa/analyze/lostQaAnalysisSchema";

/** Reuse Stage 4 model choice for Stage 5 daily summaries. */
export const LOST_QA_DAILY_SUMMARY_MODEL = LOST_QA_ANALYSIS_MODEL;

export const LOST_QA_DAILY_SUMMARY_JSON_SCHEMA = {
  name: "lost_qa_daily_summary",
  type: "json_schema" as const,
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["manager_summary", "team_action_points"],
    properties: {
      manager_summary: { type: "string", maxLength: 1500 },
      team_action_points: {
        type: "array",
        maxItems: 5,
        items: { type: "string" },
      },
    },
  },
};

export type LostQaDailyAiOutput = {
  manager_summary: string;
  team_action_points: string[];
};

export function validateLostQaDailyAiOutput(raw: unknown): LostQaDailyAiOutput {
  if (!raw || typeof raw !== "object") throw new Error("Daily summary: parsed output is not an object.");
  const o = raw as Record<string, unknown>;
  if (typeof o.manager_summary !== "string") throw new Error("Daily summary: manager_summary must be a string.");
  if (o.manager_summary.length > 1500) throw new Error("Daily summary: manager_summary too long.");
  if (!Array.isArray(o.team_action_points) || !o.team_action_points.every((x) => typeof x === "string")) {
    throw new Error("Daily summary: team_action_points must be an array of strings.");
  }
  if (o.team_action_points.length > 5) throw new Error("Daily summary: at most 5 team_action_points.");
  return { manager_summary: o.manager_summary, team_action_points: o.team_action_points as string[] };
}

