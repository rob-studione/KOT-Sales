import "server-only";

/** Emergency kill-switch: set `OPENAI_API_CALLS_DISABLED=true` on Vercel (key is not removed). */
export function isOpenAiGloballyDisabledByEnv(): boolean {
  const v = process.env.OPENAI_API_CALLS_DISABLED?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export function openAiGloballyDisabledMessage(): string {
  return "OpenAI API kvietimai laikinai išjungti (OPENAI_API_CALLS_DISABLED).";
}
