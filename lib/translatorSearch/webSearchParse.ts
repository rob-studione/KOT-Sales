/**
 * Pure helpers: web_search request shape + action.sources parsing.
 * No live OpenAI calls here (safe for offline verify).
 */

import { TRANSLATOR_SEARCH_LIMITS } from "@/lib/translatorSearch/limits";
import type { ResponseFunctionWebSearch } from "openai/resources/responses/responses";

export const WEB_SEARCH_INCLUDE = ["web_search_call.action.sources"] as const;

export type WebSearchCreateParamsShape = {
  model: string;
  instructions: string;
  input: string;
  store: false;
  max_output_tokens: number;
  max_tool_calls: 1;
  tool_choice: "required";
  tools: Array<{
    type: "web_search";
    search_context_size: "low";
  }>;
  include: Array<(typeof WEB_SEARCH_INCLUDE)[number]>;
};

const WEB_SEARCH_INSTRUCTIONS = [
  "You must call the web_search tool exactly once for the given query.",
  "Do not invent or rewrite source URLs.",
  "Do not open pages or run additional tool calls.",
  "After the single search, stop. Do not produce candidate evidence from search snippets.",
].join(" ");

/** Responses `input` string for a query (must stay within pricing reserve chars). */
export function buildWebSearchInput(query: string): string {
  return `Search query:\n${query}`;
}

export function webSearchInputCharCount(query: string): number {
  return buildWebSearchInput(query).length;
}

/**
 * Exact Responses API params for one C1 web search call.
 * Uses tool_choice required, max_tool_calls 1, search_context_size low.
 */
export function buildWebSearchCreateParams(params: {
  model: string;
  query: string;
}): WebSearchCreateParamsShape {
  return {
    model: params.model,
    instructions: WEB_SEARCH_INSTRUCTIONS,
    input: buildWebSearchInput(params.query),
    store: false,
    max_output_tokens: TRANSLATOR_SEARCH_LIMITS.maxWebSearchOutputTokens,
    max_tool_calls: 1,
    tool_choice: "required",
    tools: [
      {
        type: "web_search",
        search_context_size: "low",
      },
    ],
    include: [...WEB_SEARCH_INCLUDE],
  };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

/**
 * Count factual search actions (`action.type === "search"`) in a Responses output.
 * open_page / find are not counted as search_calls.
 */
export function countWebSearchActions(output: unknown): number {
  if (!Array.isArray(output)) return 0;
  let n = 0;
  for (const item of output) {
    if (!isRecord(item)) continue;
    if (item.type !== "web_search_call") continue;
    const action = item.action;
    if (isRecord(action) && action.type === "search") n += 1;
  }
  return n;
}

/**
 * Collect only `action.sources[].url` from web_search_call Search actions.
 * Ignores model message text and open_page/find URLs.
 */
export function parseWebSearchActionSourceUrls(output: unknown): string[] {
  if (!Array.isArray(output)) return [];
  const urls: string[] = [];
  for (const item of output) {
    if (!isRecord(item)) continue;
    if (item.type !== "web_search_call") continue;
    const action = item.action as ResponseFunctionWebSearch["action"] | unknown;
    if (!isRecord(action) || action.type !== "search") continue;
    const sources = action.sources;
    if (!Array.isArray(sources)) continue;
    for (const src of sources) {
      if (!isRecord(src)) continue;
      if (src.type !== "url") continue;
      const url = typeof src.url === "string" ? src.url.trim() : "";
      if (url) urls.push(url);
    }
  }
  return urls;
}

/** Message / assistant text from a Responses payload — never use as candidate evidence. */
export function extractWebSearchAssistantText(output: unknown): string {
  if (!Array.isArray(output)) return "";
  const parts: string[] = [];
  for (const item of output) {
    if (!isRecord(item) || item.type !== "message") continue;
    const content = item.content;
    if (!Array.isArray(content)) continue;
    for (const c of content) {
      if (!isRecord(c)) continue;
      if (c.type === "output_text" && typeof c.text === "string") parts.push(c.text);
    }
  }
  return parts.join("\n").trim();
}
