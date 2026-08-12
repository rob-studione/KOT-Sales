import type { TranslatorSearchPageTab } from "@/lib/translatorSearch/types";

export const TRANSLATOR_SEARCH_PAGE_PATH = "/irankiai/verteju-paieska" as const;

const TAB_SLUGS = new Set<TranslatorSearchPageTab>(["nauja", "kandidatai", "istorija"]);

export function parseTranslatorSearchTab(raw: string | string[] | undefined): TranslatorSearchPageTab {
  const s = (Array.isArray(raw) ? raw[0] : raw)?.trim().toLowerCase() ?? "";
  if (TAB_SLUGS.has(s as TranslatorSearchPageTab)) return s as TranslatorSearchPageTab;
  return "nauja";
}
