/**
 * Map factual stop flags to translator_search_jobs.stop_reason.
 * Priority: target → time → cost → source → no_more_sources.
 */

export type TranslatorStopReason =
  | "target_reached"
  | "time_limit"
  | "cost_limit"
  | "source_limit"
  | "no_more_sources";

export type TranslatorStopFlags = {
  targetReached?: boolean;
  timeLimit?: boolean;
  costLimit?: boolean;
  sourceLimit?: boolean;
};

export function resolveTranslatorStopReason(flags: TranslatorStopFlags): TranslatorStopReason {
  if (flags.targetReached) return "target_reached";
  if (flags.timeLimit) return "time_limit";
  if (flags.costLimit) return "cost_limit";
  if (flags.sourceLimit) return "source_limit";
  return "no_more_sources";
}
