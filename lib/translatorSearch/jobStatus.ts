import type { TranslatorSearchJobStatus } from "@/lib/translatorSearch/types";

export type JobTransition =
  | { from: "pending"; to: "running" }
  | { from: "running"; to: "completed" }
  | { from: "running"; to: "failed" };

const ALLOWED: Record<string, TranslatorSearchJobStatus[]> = {
  pending: ["running"],
  running: ["completed", "failed"],
  completed: [],
  failed: [],
};

export function canTransitionJobStatus(
  from: TranslatorSearchJobStatus,
  to: TranslatorSearchJobStatus
): boolean {
  return (ALLOWED[from] ?? []).includes(to);
}

export function assertJobTransition(
  from: TranslatorSearchJobStatus,
  to: TranslatorSearchJobStatus
): void {
  if (!canTransitionJobStatus(from, to)) {
    throw new Error(`Netinkamas job statuso perėjimas: ${from} → ${to}`);
  }
}

export type TerminalJobPatch = {
  status: "completed" | "failed";
  finished_at: string;
  stop_reason?: string | null;
  warning?: string | null;
  error_code?: string | null;
  error_message?: string | null;
};

export function buildTerminalJobPatch(
  status: "completed" | "failed",
  extras?: Omit<TerminalJobPatch, "status" | "finished_at">
): TerminalJobPatch {
  return {
    status,
    finished_at: new Date().toISOString(),
    stop_reason: extras?.stop_reason ?? null,
    warning: extras?.warning ?? null,
    error_code: extras?.error_code ?? null,
    error_message: extras?.error_message ?? null,
  };
}
