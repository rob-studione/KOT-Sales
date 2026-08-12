import { TRANSLATOR_SEARCH_LIMITS } from "@/lib/translatorSearch/limits";

/**
 * Minimal HTML → text: strip script/style/noscript, tags, collapse whitespace.
 * No cheerio / jsdom dependency.
 */
export function htmlToText(html: string, maxChars = TRANSLATOR_SEARCH_LIMITS.maxCharsPerSource): string {
  let s = String(html ?? "");
  s = s.replace(/<script[\s\S]*?<\/script>/gi, " ");
  s = s.replace(/<style[\s\S]*?<\/style>/gi, " ");
  s = s.replace(/<noscript[\s\S]*?<\/noscript>/gi, " ");
  s = s.replace(/<!--[\s\S]*?-->/g, " ");
  s = s.replace(/<\/(p|div|br|li|h[1-6]|tr|section|article)>/gi, "\n");
  s = s.replace(/<br\s*\/?>/gi, "\n");
  s = s.replace(/<[^>]+>/g, " ");
  s = s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
  s = s.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n");
  s = s.replace(/[ \t]{2,}/g, " ").trim();
  if (s.length > maxChars) s = s.slice(0, maxChars);
  return s;
}
