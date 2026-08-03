import "server-only";

/**
 * Central kill-switch for automatic Lost QA / Gmail pipeline.
 * Enabled only when `LOST_QA_PIPELINE_ENABLED` is exactly `"true"`.
 * Missing or any other value ⇒ disabled (safe default).
 */
export function isLostQaPipelineEnabled(): boolean {
  return process.env.LOST_QA_PIPELINE_ENABLED?.trim() === "true";
}
