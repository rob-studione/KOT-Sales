/**
 * Normalize / dedupe / merge seed + web URLs under server limits.
 * Private / invalid URLs are dropped before fetch (sync SSRF gate).
 */

import { TRANSLATOR_SEARCH_LIMITS } from "@/lib/translatorSearch/limits";
import type { TranslatorSourceType } from "@/lib/translatorSearch/types";
import { assertSafeHttpsUrlSync } from "@/lib/translatorSearch/urlSafety";

export type PlannedTranslatorSource = {
  /** Original URL as discovered / entered. */
  originalUrl: string;
  /** Canonical HTTPS URL after sync safety check. */
  canonicalUrl: string;
  sourceType: Extract<TranslatorSourceType, "web" | "manual">;
};

export type CollectSourceUrlsResult = {
  sources: PlannedTranslatorSource[];
  droppedUnsafe: number;
  droppedDuplicate: number;
  truncatedByLimit: number;
};

/**
 * Seeds first (manual), then web. Dedupe by canonical URL (seed wins).
 * Caps at maxUniqueSourceUrls. Does not fetch — only sync HTTPS/SSRF checks.
 */
export function collectTranslatorSourceUrls(params: {
  seedUrls: string[];
  webUrls: string[];
  maxUnique?: number;
}): CollectSourceUrlsResult {
  const maxUnique = params.maxUnique ?? TRANSLATOR_SEARCH_LIMITS.maxUniqueSourceUrls;
  const sources: PlannedTranslatorSource[] = [];
  const seen = new Set<string>();
  let droppedUnsafe = 0;
  let droppedDuplicate = 0;
  let truncatedByLimit = 0;

  const push = (raw: string, sourceType: PlannedTranslatorSource["sourceType"]) => {
    if (sources.length >= maxUnique) {
      truncatedByLimit += 1;
      return;
    }
    const checked = assertSafeHttpsUrlSync(raw, { allowHttp: false });
    if (!checked.ok) {
      droppedUnsafe += 1;
      return;
    }
    const key = checked.canonicalHref.toLowerCase();
    if (seen.has(key)) {
      droppedDuplicate += 1;
      return;
    }
    seen.add(key);
    sources.push({
      originalUrl: raw.trim(),
      canonicalUrl: checked.canonicalHref,
      sourceType,
    });
  };

  for (const u of params.seedUrls) push(u, "manual");
  for (const u of params.webUrls) push(u, "web");

  return { sources, droppedUnsafe, droppedDuplicate, truncatedByLimit };
}
