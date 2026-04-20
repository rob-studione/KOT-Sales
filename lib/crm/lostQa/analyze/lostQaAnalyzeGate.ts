import "server-only";

import type { LostCaseAnalysisRow } from "@/lib/crm/lostQaDb";
import type { LostQaControlSettings } from "@/lib/crm/lostQa/lostQaControlSettings";

export type LostQaAnalyzeInvoke = "auto" | "manual_endpoint";

export type LostQaAnalyzeGateDecision =
  | { action: "run" }
  | { action: "skip"; outcome: "skipped_settings"; reason: string };

export function decideLostQaAnalyze(params: {
  settings: LostQaControlSettings;
  invoke: LostQaAnalyzeInvoke;
  force: boolean;
  existing: LostCaseAnalysisRow | null;
  preparedInputId: string;
}): LostQaAnalyzeGateDecision {
  const { settings, invoke, force, existing, preparedInputId } = params;

  if (force) {
    if (!settings.enabled) {
      if (invoke === "manual_endpoint") {
        return { action: "skip", outcome: "skipped_settings", reason: "LOST QA analizė išjungta." };
      }
      console.info("[lost-qa analyze] skip (disabled)", { invoke, force: true });
      return { action: "skip", outcome: "skipped_settings", reason: "LOST QA analizė išjungta." };
    }
    return { action: "run" };
  }

  if (!settings.enabled) {
    if (invoke === "manual_endpoint") {
      return { action: "skip", outcome: "skipped_settings", reason: "LOST QA analizė išjungta." };
    }
    console.info("[lost-qa analyze] skip (disabled)", { invoke });
    return { action: "skip", outcome: "skipped_settings", reason: "LOST QA analizė išjungta." };
  }

  if (settings.mode === "manual" && invoke !== "manual_endpoint") {
    console.info("[lost-qa analyze] skip (manual mode)", { invoke });
    return { action: "skip", outcome: "skipped_settings", reason: "Rankinis režimas: automatinė analizė išjungta." };
  }

  if (existing && !force) {
    // Preserve existing "already current" fast path.
    if (existing.prepared_input_id === preparedInputId) {
      return {
        action: "skip",
        outcome: "skipped_settings",
        reason: "Analysis already reflects current prepared input.",
      };
    }

    if (!settings.reanalyze_on_update && invoke !== "manual_endpoint") {
      console.info("[lost-qa analyze] skip (reanalyze_on_update=false)", {
        lost_case_id: existing.lost_case_id,
        prepared_input_id: preparedInputId,
        existing_prepared_input_id: existing.prepared_input_id,
      });
      return {
        action: "skip",
        outcome: "skipped_settings",
        reason: "Peranalizavimas išjungtas: esama analizė nekeičiama automatiškai.",
      };
    }
  }

  return { action: "run" };
}
