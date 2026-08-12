/** DB update result helpers (testuojami su fake client). */

export type MinimalUpdateResult = {
  error: { message?: string; code?: string } | null;
  count?: number | null;
  data?: unknown;
};

export class DbUpdateError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "DbUpdateError";
  }
}

export function assertNoDbError(
  result: MinimalUpdateResult,
  code: string,
  safeMessage: string
): void {
  if (result.error) {
    throw new DbUpdateError(code, safeMessage);
  }
}

/** Prefer checking error; optionally require count when provided by client. */
export function assertUpdateApplied(
  result: MinimalUpdateResult,
  code: string,
  safeMessage: string
): void {
  assertNoDbError(result, code, safeMessage);
  if (typeof result.count === "number" && result.count < 1) {
    throw new DbUpdateError(code, safeMessage);
  }
}

export function isUniqueViolation(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false;
  if (err.code === "23505") return true;
  return /duplicate key|unique constraint/i.test(String(err.message ?? ""));
}
