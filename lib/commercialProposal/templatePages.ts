export const TEMPLATE_EDITOR_PAGES = [
  { id: "cover", number: 1, label: "Viršelis", en: "Cover" },
  { id: "intro", number: 2, label: "Įžanga", en: "Introduction" },
  { id: "history", number: 3, label: "Istorija", en: "History" },
  { id: "technology", number: 4, label: "Technologijos", en: "Technologies" },
  { id: "translation", number: 5, label: "Vertimas raštu", en: "Translation" },
  { id: "translation_cont", number: 6, label: "Vertimas raštu (tęsinys)", en: "Translation continued" },
  { id: "ai", number: 7, label: "AI vertimas", en: "AI Translation" },
  { id: "ai_cont", number: 8, label: "AI vertimas (tęsinys)", en: "AI Translation continued" },
  { id: "extras", number: 9, label: "Papildomos paslaugos", en: "Additional services" },
  { id: "advantages", number: 10, label: "Išskirtinumas", en: "Advantages" },
  { id: "quality", number: 11, label: "Kokybės procesas", en: "Quality process" },
] as const;

export type TemplatePageId = (typeof TEMPLATE_EDITOR_PAGES)[number]["id"];

export function isTemplatePageId(value: string): value is TemplatePageId {
  return TEMPLATE_EDITOR_PAGES.some((p) => p.id === value);
}

/**
 * Template preview uses the real V2 renderer with the full catalog, so the
 * usual document is 11 pages. Extra pages are history overflow inserted after
 * the first history page — they do not change the editor's 11-page model.
 */
export function pdfIndexForEditorPage(pageId: TemplatePageId, pdfPageCount: number): number {
  const order = TEMPLATE_EDITOR_PAGES.map((p) => p.id);
  const idx = order.indexOf(pageId);
  if (idx < 0) return 0;
  const extra = Math.max(0, pdfPageCount - TEMPLATE_EDITOR_PAGES.length);
  if (idx <= 2) return Math.min(idx, Math.max(0, pdfPageCount - 1));
  return Math.min(idx + extra, Math.max(0, pdfPageCount - 1));
}

export function editorPageForPdfIndex(pdfIndex: number, pdfPageCount: number): TemplatePageId {
  const extra = Math.max(0, pdfPageCount - TEMPLATE_EDITOR_PAGES.length);
  if (pdfIndex <= 2) return TEMPLATE_EDITOR_PAGES[pdfIndex]?.id ?? "cover";
  if (extra > 0 && pdfIndex > 2 && pdfIndex <= 2 + extra) return "history";
  const mapped = pdfIndex - extra;
  return TEMPLATE_EDITOR_PAGES[mapped]?.id ?? "quality";
}

export function labelForPdfIndex(pdfIndex: number, pdfPageCount: number): string {
  const extra = Math.max(0, pdfPageCount - TEMPLATE_EDITOR_PAGES.length);
  if (extra > 0 && pdfIndex > 2 && pdfIndex <= 2 + extra) {
    return `Istorija (${pdfIndex - 1})`;
  }
  const pageId = editorPageForPdfIndex(pdfIndex, pdfPageCount);
  return TEMPLATE_EDITOR_PAGES.find((p) => p.id === pageId)?.label ?? `Puslapis ${pdfIndex + 1}`;
}
