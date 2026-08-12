/**
 * Internal job deadline — shorter than route maxDuration, leaves reserve for terminal DB write.
 */

import { TRANSLATOR_SEARCH_LIMITS } from "@/lib/translatorSearch/limits";

export type JobDeadline = {
  startedAtMs: number;
  deadlineAtMs: number;
};

export function createJobDeadline(nowMs: number = Date.now()): JobDeadline {
  return {
    startedAtMs: nowMs,
    deadlineAtMs: nowMs + TRANSLATOR_SEARCH_LIMITS.jobInternalDeadlineMs,
  };
}

export function remainingJobMs(deadline: JobDeadline, nowMs: number = Date.now()): number {
  return Math.max(0, deadline.deadlineAtMs - nowMs);
}

export function isJobDeadlineReached(deadline: JobDeadline, nowMs: number = Date.now()): boolean {
  return nowMs >= deadline.deadlineAtMs;
}

/**
 * Decide whether there is enough time to start an action and which timeout to use.
 * Timeout is min(preferred, remaining) and must be >= minTimeoutMs.
 */
export function canStartTimedAction(params: {
  deadline: JobDeadline;
  preferredTimeoutMs: number;
  minTimeoutMs?: number;
  nowMs?: number;
}): { ok: true; timeoutMs: number } | { ok: false; reason: "time_limit" } {
  const nowMs = params.nowMs ?? Date.now();
  const minTimeoutMs = params.minTimeoutMs ?? TRANSLATOR_SEARCH_LIMITS.minTimedActionMs;
  const remaining = remainingJobMs(params.deadline, nowMs);
  if (remaining < minTimeoutMs) {
    return { ok: false, reason: "time_limit" };
  }
  const timeoutMs = Math.min(Math.max(0, Math.floor(params.preferredTimeoutMs)), remaining);
  if (timeoutMs < minTimeoutMs) {
    return { ok: false, reason: "time_limit" };
  }
  return { ok: true, timeoutMs };
}
