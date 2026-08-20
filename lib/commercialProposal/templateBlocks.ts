import type { CpTemplateContent } from "@/lib/commercialProposal/content";
import { COVER, EXTRA_TABLE, HISTORY, INTRO, LANG_TABLE, PAGE_H, PAGE_W } from "@/lib/commercialProposal/layout";
import { V2_COVER_TITLE, V2_HEADER, V2_QUALITY_STEPS, V2_TECH_BLOCKS, V2_UNIQUE_BLOCKS, type V2Box } from "@/lib/commercialProposal/layoutV2";
import type { TemplatePageId } from "@/lib/commercialProposal/templatePages";

export const TEMPLATE_PAGE_SIZE = { width: PAGE_W, height: PAGE_H };

export type TemplateLayoutRef = {
  kind: "box";
  x: number;
  yTop: number;
  width: number;
  height: number;
};

export type TemplateBlockKind = "text" | "history_entries";

export type TemplateBlock = {
  id: string;
  pageId: TemplatePageId;
  label: string;
  hint?: string;
  multiline?: boolean;
  kind: TemplateBlockKind;
  path: Array<string | number>;
  layout: TemplateLayoutRef;
};

function box(x: number, yTop: number, width: number, height: number): TemplateLayoutRef {
  return { kind: "box", x, yTop, width, height };
}

function fromV2(slot: V2Box | undefined, fallback: TemplateLayoutRef): TemplateLayoutRef {
  if (!slot) return fallback;
  return box(slot.x, slot.yTop, slot.width, slot.height);
}

function fromBaseline(x: number, baselineTop: number, width: number, size: number, lines = 1): TemplateLayoutRef {
  const height = size * lines + Math.max(0, lines - 1) * 6 + 8;
  return box(x, Math.max(0, baselineTop - size), width, height);
}

function langHeaderBox(col: "nr" | "lang" | "price", top: number): TemplateLayoutRef {
  const t = LANG_TABLE;
  if (col === "nr") return box(t.x, top, t.colNrRight - t.x, t.headerH);
  if (col === "lang") return box(t.colNrRight, top, t.colLangRight - t.colNrRight, t.headerH);
  return box(t.colLangRight, top, t.right - t.colLangRight, t.headerH);
}

function extraHeaderBox(col: "nr" | "name" | "price"): TemplateLayoutRef {
  const t = EXTRA_TABLE;
  if (col === "nr") return box(t.x, t.firstPageTop, t.colNrRight - t.x, t.headerH);
  if (col === "name") return box(t.colNrRight, t.firstPageTop, t.colNameRight - t.colNrRight, t.headerH);
  return box(t.colNameRight, t.firstPageTop, t.right - t.colNameRight, t.headerH);
}

export function getTemplateString(content: CpTemplateContent, path: Array<string | number>): string {
  let cur: unknown = content;
  for (const key of path) {
    if (cur == null || typeof cur !== "object") return "";
    cur = (cur as Record<string | number, unknown>)[key];
  }
  return typeof cur === "string" ? cur : "";
}

export function setTemplateString(
  content: CpTemplateContent,
  path: Array<string | number>,
  value: string
): CpTemplateContent {
  const next = structuredClone(content);
  let cur: Record<string | number, unknown> = next as unknown as Record<string | number, unknown>;
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i]!;
    const child = cur[key];
    if (child == null || typeof child !== "object") return content;
    cur = child as Record<string | number, unknown>;
  }
  cur[path[path.length - 1]!] = value;
  return next;
}

export function templateBlocks(content: CpTemplateContent): TemplateBlock[] {
  const blocks: TemplateBlock[] = [
    {
      id: "cover.title",
      pageId: "cover",
      label: "Pavadinimas",
      multiline: true,
      kind: "text",
      path: ["cover", "title"],
      layout: box(V2_COVER_TITLE.x, V2_COVER_TITLE.firstBaselineTop - V2_COVER_TITLE.size, V2_COVER_TITLE.width, V2_COVER_TITLE.maxHeight),
    },
    {
      id: "cover.created_label",
      pageId: "cover",
      label: "Sukūrė",
      hint: "Dinaminis: vadybininkas",
      kind: "text",
      path: ["cover", "created_label"],
      layout: fromBaseline(COVER.leftX, COVER.labelBaselineTop, 160, COVER.fontSize),
    },
    {
      id: "cover.dedicated_label",
      pageId: "cover",
      label: "Skirta",
      hint: "Dinaminis: gavėjas",
      kind: "text",
      path: ["cover", "dedicated_label"],
      layout: fromBaseline(COVER.rightX, COVER.labelBaselineTop, 220, COVER.fontSize),
    },
    {
      id: "cover.issuer_line",
      pageId: "cover",
      label: "Mūsų įmonė",
      kind: "text",
      path: ["cover", "issuer_line"],
      layout: fromBaseline(COVER.leftX, COVER.companyBaselineTop, 250, COVER.fontSize),
    },
    {
      id: "header.company",
      pageId: "intro",
      label: "Antraštė kituose puslapiuose",
      kind: "text",
      path: ["header_company"],
      layout: fromBaseline(V2_HEADER.x, V2_HEADER.baselineTop, 280, V2_HEADER.size),
    },
    {
      id: "intro.greeting",
      pageId: "intro",
      label: "Pasveikinimas",
      kind: "text",
      path: ["intro", "greeting"],
      layout: fromBaseline(37.5, 96.5, 360, 22.5),
    },
    {
      id: "intro.manager_name",
      pageId: "intro",
      label: "Vadybininko vardas",
      hint: "Paprastai {{sales_manager_name}}",
      kind: "text",
      path: ["intro", "manager_name"],
      layout: fromBaseline(INTRO.nameX, INTRO.nameBaselineTop, 220, INTRO.nameSize),
    },
    {
      id: "intro.job_title",
      pageId: "intro",
      label: "Pareigos",
      hint: "Paprastai {{sales_manager_job_title}}",
      kind: "text",
      path: ["intro", "job_title"],
      layout: fromBaseline(INTRO.nameX, INTRO.titleBaselineTop, 220, INTRO.titleSize),
    },
    {
      id: "history.heading",
      pageId: "history",
      label: "Antraštė",
      kind: "text",
      path: ["history", "heading"],
      layout: fromBaseline(HISTORY.leftX, HISTORY.titleBaselineTop, 360, 22.5),
    },
    {
      id: "history.year_suffix",
      pageId: "history",
      label: "Metų priesaga",
      kind: "text",
      path: ["history", "year_suffix"],
      layout: fromBaseline(HISTORY.leftX, HISTORY.firstBaselineTop, 160, HISTORY.bodySize),
    },
    {
      id: "history.entries",
      pageId: "history",
      label: "Istorijos įrašai",
      kind: "history_entries",
      path: ["history", "entries"],
      layout: box(HISTORY.leftX, HISTORY.firstBaselineTop - 8, HISTORY.maxWidthFull, HISTORY.pageBottomLimitTop - HISTORY.firstBaselineTop + 16),
    },
    {
      id: "technology.heading",
      pageId: "technology",
      label: "Antraštė",
      kind: "text",
      path: ["technology", "heading"],
      layout: fromBaseline(37.5, 70.75, 360, 22.5),
    },
    {
      id: "translation.heading",
      pageId: "translation",
      label: "Antraštė",
      kind: "text",
      path: ["translation", "heading"],
      layout: fromBaseline(37.5, 82, 420, 27),
    },
    {
      id: "translation.description",
      pageId: "translation",
      label: "Aprašymas",
      multiline: true,
      kind: "text",
      path: ["translation", "description"],
      layout: box(37.5, 118, 530, 56),
    },
    {
      id: "translation.prices_heading",
      pageId: "translation",
      label: "Kainos antraštė",
      kind: "text",
      path: ["translation", "prices_heading"],
      layout: fromBaseline(37.5, 188, 200, 18),
    },
    {
      id: "translation.footnote",
      pageId: "translation",
      label: "Išnaša",
      kind: "text",
      path: ["translation", "footnote"],
      layout: fromBaseline(37.5, 224, 500, 11.25),
    },
    {
      id: "translation.col_nr",
      pageId: "translation",
      label: "Stulpelis Nr.",
      kind: "text",
      path: ["translation", "col_nr"],
      layout: langHeaderBox("nr", LANG_TABLE.firstPageTop),
    },
    {
      id: "translation.col_lang",
      pageId: "translation",
      label: "Stulpelis kalbos",
      kind: "text",
      path: ["translation", "col_lang"],
      layout: langHeaderBox("lang", LANG_TABLE.firstPageTop),
    },
    {
      id: "translation.col_price",
      pageId: "translation",
      label: "Stulpelis kaina",
      kind: "text",
      path: ["translation", "col_price"],
      layout: langHeaderBox("price", LANG_TABLE.firstPageTop),
    },
    {
      id: "translation.col_nr.cont",
      pageId: "translation_cont",
      label: "Stulpelis Nr.",
      kind: "text",
      path: ["translation", "col_nr"],
      layout: langHeaderBox("nr", LANG_TABLE.contPageTop),
    },
    {
      id: "translation.col_lang.cont",
      pageId: "translation_cont",
      label: "Stulpelis kalbos",
      kind: "text",
      path: ["translation", "col_lang"],
      layout: langHeaderBox("lang", LANG_TABLE.contPageTop),
    },
    {
      id: "translation.col_price.cont",
      pageId: "translation_cont",
      label: "Stulpelis kaina",
      kind: "text",
      path: ["translation", "col_price"],
      layout: langHeaderBox("price", LANG_TABLE.contPageTop),
    },
    {
      id: "ai.heading",
      pageId: "ai",
      label: "Antraštė",
      kind: "text",
      path: ["ai", "heading"],
      layout: fromBaseline(37.5, 82, 420, 27),
    },
    {
      id: "ai.prices_heading",
      pageId: "ai",
      label: "Kainos antraštė",
      kind: "text",
      path: ["ai", "prices_heading"],
      layout: fromBaseline(37.5, 128, 200, 18),
    },
    {
      id: "ai.footnote",
      pageId: "ai",
      label: "Išnaša",
      kind: "text",
      path: ["ai", "footnote"],
      layout: fromBaseline(37.5, 167, 500, 11.25),
    },
    {
      id: "ai.col_nr",
      pageId: "ai",
      label: "Stulpelis Nr.",
      kind: "text",
      path: ["ai", "col_nr"],
      layout: langHeaderBox("nr", LANG_TABLE.firstPageTop),
    },
    {
      id: "ai.col_lang",
      pageId: "ai",
      label: "Stulpelis kalbos",
      kind: "text",
      path: ["ai", "col_lang"],
      layout: langHeaderBox("lang", LANG_TABLE.firstPageTop),
    },
    {
      id: "ai.col_price",
      pageId: "ai",
      label: "Stulpelis kaina",
      kind: "text",
      path: ["ai", "col_price"],
      layout: langHeaderBox("price", LANG_TABLE.firstPageTop),
    },
    {
      id: "ai.col_nr.cont",
      pageId: "ai_cont",
      label: "Stulpelis Nr.",
      kind: "text",
      path: ["ai", "col_nr"],
      layout: langHeaderBox("nr", LANG_TABLE.contPageTop),
    },
    {
      id: "ai.col_lang.cont",
      pageId: "ai_cont",
      label: "Stulpelis kalbos",
      kind: "text",
      path: ["ai", "col_lang"],
      layout: langHeaderBox("lang", LANG_TABLE.contPageTop),
    },
    {
      id: "ai.col_price.cont",
      pageId: "ai_cont",
      label: "Stulpelis kaina",
      kind: "text",
      path: ["ai", "col_price"],
      layout: langHeaderBox("price", LANG_TABLE.contPageTop),
    },
    {
      id: "extras.heading",
      pageId: "extras",
      label: "Antraštė",
      kind: "text",
      path: ["extras", "heading"],
      layout: fromBaseline(37.5, 78, 420, 27),
    },
    {
      id: "extras.col_nr",
      pageId: "extras",
      label: "Stulpelis Nr.",
      kind: "text",
      path: ["extras", "col_nr"],
      layout: extraHeaderBox("nr"),
    },
    {
      id: "extras.col_name",
      pageId: "extras",
      label: "Stulpelis pavadinimas",
      kind: "text",
      path: ["extras", "col_name"],
      layout: extraHeaderBox("name"),
    },
    {
      id: "extras.col_price",
      pageId: "extras",
      label: "Stulpelis kaina",
      kind: "text",
      path: ["extras", "col_price"],
      layout: extraHeaderBox("price"),
    },
    {
      id: "advantages.heading",
      pageId: "advantages",
      label: "Antraštė",
      kind: "text",
      path: ["uniqueness", "heading"],
      layout: fromBaseline(37.5, 70.75, 360, 22.5),
    },
    {
      id: "quality.heading",
      pageId: "quality",
      label: "Antraštė",
      kind: "text",
      path: ["quality", "heading"],
      layout: fromBaseline(37.5, 82, 500, 27),
    },
  ];

  const introBodies: TemplateBlock[] = content.intro.paragraphs.map((_, i) => ({
    id: i === 0 ? "intro.body" : `intro.body.${i + 1}`,
    pageId: "intro",
    label: content.intro.paragraphs.length > 1 ? `Tekstas ${i + 1}` : "Tekstas",
    multiline: true,
    kind: "text",
    path: ["intro", "paragraphs", i],
    layout: box(37.5, 126 + i * 72, 360, 68),
  }));
  const greetingAt = blocks.findIndex((b) => b.id === "intro.greeting");
  if (greetingAt >= 0) blocks.splice(greetingAt + 1, 0, ...introBodies);
  else blocks.push(...introBodies);

  content.technology.blocks.forEach((_, i) => {
    const n = i + 1;
    blocks.push({
      id: `technology.block${n}.title`,
      pageId: "technology",
      label: `Blokas ${n} — pavadinimas`,
      kind: "text",
      path: ["technology", "blocks", i, "title"],
      layout: fromV2(V2_TECH_BLOCKS[i * 2], box(37.5, 140 + i * 80, 240, 24)),
    });
    blocks.push({
      id: `technology.block${n}.text`,
      pageId: "technology",
      label: `Blokas ${n} — tekstas`,
      multiline: true,
      kind: "text",
      path: ["technology", "blocks", i, "body"],
      layout: fromV2(V2_TECH_BLOCKS[i * 2 + 1], box(37.5, 164 + i * 80, 240, 54)),
    });
  });

  content.uniqueness.blocks.forEach((_, i) => {
    const n = i + 1;
    const slot = V2_UNIQUE_BLOCKS[i];
    blocks.push({
      id: `advantages.item${n}.title`,
      pageId: "advantages",
      label: `Punktas ${n} — pavadinimas`,
      kind: "text",
      path: ["uniqueness", "blocks", i, "title"],
      layout: fromV2(slot?.title, box(100, 130 + i * 40, 165, 20)),
    });
    blocks.push({
      id: `advantages.item${n}.text`,
      pageId: "advantages",
      label: `Punktas ${n} — tekstas`,
      multiline: true,
      kind: "text",
      path: ["uniqueness", "blocks", i, "body"],
      layout: fromV2(slot?.body, box(100, 150 + i * 40, 165, 40)),
    });
  });

  content.quality.steps.forEach((_, i) => {
    const n = i + 1;
    const slot = V2_QUALITY_STEPS[i];
    blocks.push({
      id: `quality.step${n}.number`,
      pageId: "quality",
      label: `Žingsnis ${n} — numeris`,
      kind: "text",
      path: ["quality", "steps", i, "number"],
      layout: fromV2(slot?.num, box(47, 120 + i * 70, 22, 34)),
    });
    blocks.push({
      id: `quality.step${n}.title`,
      pageId: "quality",
      label: `Žingsnis ${n} — pavadinimas`,
      kind: "text",
      path: ["quality", "steps", i, "title"],
      layout: fromV2(slot?.title, box(94, 119 + i * 70, 430, 20)),
    });
    blocks.push({
      id: `quality.step${n}.text`,
      pageId: "quality",
      label: `Žingsnis ${n} — tekstas`,
      multiline: true,
      kind: "text",
      path: ["quality", "steps", i, "body"],
      layout: fromV2(slot?.body, box(94, 137 + i * 70, 470, 40)),
    });
  });

  return blocks;
}

export function blocksForPage(content: CpTemplateContent, pageId: TemplatePageId): TemplateBlock[] {
  return templateBlocks(content).filter((block) => block.pageId === pageId);
}

export function findTemplateBlock(content: CpTemplateContent, id: string | null): TemplateBlock | null {
  if (!id) return null;
  return templateBlocks(content).find((block) => block.id === id) ?? null;
}

export function highlightBoxesForBlock(block: TemplateBlock | null): TemplateLayoutRef[] {
  return block ? [block.layout] : [];
}
