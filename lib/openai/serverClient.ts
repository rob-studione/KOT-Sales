import "server-only";

import OpenAI from "openai";

import { isOpenAiGloballyDisabledByEnv, openAiGloballyDisabledMessage } from "@/lib/openai/callGate";

export function requireOpenAiApiKey(): string {
  if (isOpenAiGloballyDisabledByEnv()) {
    throw new Error(openAiGloballyDisabledMessage());
  }
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) {
    throw new Error("Server misconfigured: OPENAI_API_KEY is not set.");
  }
  return key;
}

export function createOpenAIClient(): OpenAI {
  return new OpenAI({ apiKey: requireOpenAiApiKey() });
}
