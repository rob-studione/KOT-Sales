import { readFileSync } from "fs";
import {
  PDFDocument,
  rgb,
  type PDFFont,
  type PDFPage,
  type RGB,
  pushGraphicsState,
  popGraphicsState,
  moveTo,
  appendBezierCurve,
  closePath,
  clip,
  endPath,
} from "pdf-lib";
import { embedProposalFonts, type CpFonts } from "@/lib/commercialProposal/fonts";
import {
  interpolateTemplateContent,
  TEMPLATE_OVERFLOW_MESSAGE,
  type CpOverflowWarning,
  type CpTemplateContent,
  type CpTemplateVariables,
} from "@/lib/commercialProposal/content";
import {
  COLOR,
  COVER,
  EXTRA_TABLE,
  HISTORY,
  INTRO,
  LANG_TABLE,
  yBottom,
} from "@/lib/commercialProposal/layout";
import {
  V2_COVER_TITLE,
  V2_HEADER,
  V2_PAGE_TITLE_ACCENT,
  V2_QUALITY_STEPS,
  V2_TECH_BLOCKS,
  V2_TECH_TITLE_GREEN_PREFIX,
  V2_UNIQUE_BLOCKS,
  type V2Box,
  type V2HeadingAccent,
} from "@/lib/commercialProposal/layoutV2";
import { formatProposalPriceCell } from "@/lib/commercialProposal/money";
import { resolveTemplatePdfPath } from "@/lib/commercialProposal/paths";
import type { CommercialProposalLine, CommercialProposalSnapshot, CpPriceCategory } from "@/lib/commercialProposal/types";

type Line = Omit<CommercialProposalLine, "id" | "proposal_id">;

function c(color: { r: number; g: number; b: number }): RGB {
  return rgb(color.r, color.g, color.b);
}

function wrapText(font: PDFFont, text: string, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];
  const lines: string[] = [];
  let current = words[0]!;
  for (let i = 1; i < words.length; i++) {
    const next = `${current} ${words[i]}`;
    if (font.widthOfTextAtSize(next, size) <= maxWidth) current = next;
    else {
      lines.push(current);
      current = words[i]!;
    }
  }
  lines.push(current);
  return lines;
}

function drawTextTop(
  page: PDFPage,
  text: string,
  opts: { x: number; baselineTop: number; size: number; font: PDFFont; color: RGB }
) {
  page.drawText(text, {
    x: opts.x,
    y: yBottom(opts.baselineTop),
    size: opts.size,
    font: opts.font,
    color: opts.color,
  });
}

function splitLastWord(text: string): { lead: string; last: string } | null {
  const trimmed = text.replace(/\s+/g, " ").trim();
  const idx = trimmed.lastIndexOf(" ");
  if (idx <= 0) return null;
  return { lead: trimmed.slice(0, idx), last: trimmed.slice(idx + 1) };
}

function drawAccentHeading(
  page: PDFPage,
  fonts: CpFonts,
  text: string,
  opts: { x: number; baselineTop: number; size: number; accent: V2HeadingAccent }
) {
  const parts = splitLastWord(text);
  const green = c(COLOR.green);
  const black = c(COLOR.black);
  if (!parts) {
    drawTextTop(page, text.replace(/\s+/g, " ").trim(), {
      x: opts.x,
      baselineTop: opts.baselineTop,
      size: opts.size,
      font: fonts.bold,
      color: opts.accent === "last-black" ? green : black,
    });
    return;
  }
  const lead = `${parts.lead} `;
  const leadColor = opts.accent === "last-green" ? black : green;
  const lastColor = opts.accent === "last-green" ? green : black;
  drawTextTop(page, lead, {
    x: opts.x,
    baselineTop: opts.baselineTop,
    size: opts.size,
    font: fonts.bold,
    color: leadColor,
  });
  drawTextTop(page, parts.last, {
    x: opts.x + fonts.bold.widthOfTextAtSize(lead, opts.size),
    baselineTop: opts.baselineTop,
    size: opts.size,
    font: fonts.bold,
    color: lastColor,
  });
}

function drawTechTitle(
  page: PDFPage,
  fonts: CpFonts,
  text: string,
  box: V2Box,
  warnings: CpOverflowWarning[],
  path: string
) {
  const normalized = text.replace(/\s+/g, " ").trim();
  const prefix = V2_TECH_TITLE_GREEN_PREFIX[normalized];
  if (!prefix || !normalized.startsWith(prefix)) {
    drawFittedBox(page, fonts, text, box, warnings, path);
    return;
  }
  const rest = normalized.slice(prefix.length).trim();
  const font = fonts.bold;
  const size = box.size;
  const lead = rest ? `${prefix} ` : prefix;
  const totalW = font.widthOfTextAtSize(lead, size) + (rest ? font.widthOfTextAtSize(rest, size) : 0);
  if (totalW > box.width + 0.5) {
    drawFittedBox(page, fonts, text, box, warnings, path);
    return;
  }
  const x = box.align === "center" ? box.x + (box.width - totalW) / 2 : box.x;
  const baselineTop = box.yTop + size;
  drawTextTop(page, lead, {
    x,
    baselineTop,
    size,
    font,
    color: c(COLOR.green),
  });
  if (rest) {
    drawTextTop(page, rest, {
      x: x + font.widthOfTextAtSize(lead, size),
      baselineTop,
      size,
      font,
      color: c(COLOR.black),
    });
  }
}

function clipCircle(page: PDFPage, cx: number, cy: number, r: number) {
  const k = 0.552284749831;
  page.pushOperators(
    pushGraphicsState(),
    moveTo(cx, cy + r),
    appendBezierCurve(cx + k * r, cy + r, cx + r, cy + k * r, cx + r, cy),
    appendBezierCurve(cx + r, cy - k * r, cx + k * r, cy - r, cx, cy - r),
    appendBezierCurve(cx - k * r, cy - r, cx - r, cy - k * r, cx - r, cy),
    appendBezierCurve(cx - r, cy + k * r, cx - k * r, cy + r, cx, cy + r),
    closePath(),
    clip(),
    endPath()
  );
}

async function copyTemplatePage(out: PDFDocument, src: PDFDocument, index: number): Promise<PDFPage> {
  const [page] = await out.copyPages(src, [index]);
  if (!page) throw new Error(`Template page ${index + 1} missing`);
  out.addPage(page);
  return page;
}

function linesFor(snapshot: CommercialProposalSnapshot, category: CpPriceCategory): Line[] {
  return snapshot.lines
    .filter((l) => l.category === category && l.included !== false)
    .sort((a, b) => a.sort_order - b.sort_order);
}

function priceLabel(line: Line): string {
  return formatProposalPriceCell({
    is_free: line.is_free,
    is_from_price: line.is_from_price,
    final_price: line.final_price,
    currency: line.currency || "EUR",
    unit: line.unit,
  });
}

function drawFittedBox(
  page: PDFPage,
  fonts: CpFonts,
  text: string,
  box: V2Box,
  warnings: CpOverflowWarning[],
  path: string
) {
  const font = box.weight === "bold" ? fonts.bold : fonts.regular;
  let size = box.size;
  let lines = wrapText(font, text.replace(/\s+/g, " ").trim(), size, box.width);
  const maxLines = Math.max(1, Math.floor(box.height / box.lineHeight));
  while ((lines.length > maxLines || lines.some((ln) => font.widthOfTextAtSize(ln, size) > box.width + 0.5)) && size > box.minSize) {
    size -= 0.4;
    lines = wrapText(font, text.replace(/\s+/g, " ").trim(), size, box.width);
  }
  if (lines.length > maxLines) {
    lines = lines.slice(0, maxLines);
    warnings.push({ path, message: TEMPLATE_OVERFLOW_MESSAGE });
  }
  lines.forEach((ln, i) => {
    const w = font.widthOfTextAtSize(ln, size);
    const x = box.align === "center" ? box.x + (box.width - w) / 2 : box.x;
    drawTextTop(page, ln, {
      x,
      baselineTop: box.yTop + size + i * box.lineHeight,
      size,
      font,
      color: c(box.color),
    });
  });
}

function drawHeader(page: PDFPage, fonts: CpFonts, company: string) {
  drawTextTop(page, company, {
    x: V2_HEADER.x,
    baselineTop: V2_HEADER.baselineTop,
    size: V2_HEADER.size,
    font: fonts.bold,
    color: c(V2_HEADER.color),
  });
}

/** Cell text only. Header fills and grid stay in the V2 design layer. */
function drawLangTable(
  page: PDFPage,
  fonts: CpFonts,
  labels: { colNr: string; colLang: string; colPrice: string },
  opts: { top: number; rows: Line[]; startIndex: number }
) {
  const t = LANG_TABLE;
  const headerH = t.headerH;
  const rowH = t.rowH;
  const cols = [
    { x: t.x, w: t.colNrRight - t.x },
    { x: t.colNrRight, w: t.colLangRight - t.colNrRight },
    { x: t.colLangRight, w: t.right - t.colLangRight },
  ];
  const nrLines = labels.colNr.split("\n");
  nrLines.forEach((ln, i) => {
    drawTextTop(page, ln, {
      x: cols[0]!.x + 6,
      baselineTop: opts.top + 7.9 + 11.3 + i * 16.5,
      size: 11.3,
      font: fonts.bold,
      color: c(COLOR.black),
    });
  });
  drawTextTop(page, labels.colLang, {
    x: cols[1]!.x + 5.7,
    baselineTop: opts.top + 7.9 + 11.3,
    size: 11.3,
    font: fonts.bold,
    color: c(COLOR.black),
  });
  const priceLines = labels.colPrice.split("\n");
  priceLines.forEach((ln, i) => {
    drawTextTop(page, ln, {
      x: cols[2]!.x + 5.8,
      baselineTop: opts.top + 7.9 + 11.3 + i * 16.5,
      size: 11.3,
      font: fonts.bold,
      color: c(COLOR.black),
    });
  });

  opts.rows.forEach((row, i) => {
    const baseline = opts.top + headerH + i * rowH + 19.5;
    drawTextTop(page, `${opts.startIndex + i}.`, {
      x: cols[0]!.x + 6,
      baselineTop: baseline,
      size: t.fontSize,
      font: fonts.regular,
      color: c(COLOR.black),
    });
    drawTextTop(page, row.label, {
      x: cols[1]!.x + 5.7,
      baselineTop: baseline,
      size: t.fontSize,
      font: fonts.regular,
      color: c(COLOR.black),
    });
    drawTextTop(page, priceLabel(row), {
      x: cols[2]!.x + 5.8,
      baselineTop: baseline,
      size: t.fontSize,
      font: fonts.regular,
      color: c(COLOR.black),
    });
  });
}

/** Cell text only. Header fills and grid stay in the V2 design layer. */
function drawExtraTable(
  page: PDFPage,
  fonts: CpFonts,
  labels: { colNr: string; colName: string; colPrice: string },
  opts: { top: number; rows: Line[]; startIndex: number }
) {
  const t = EXTRA_TABLE;
  const headerH = t.headerH;
  const rowH = t.rowH;
  drawTextTop(page, labels.colNr, {
    x: t.x + 6,
    baselineTop: opts.top + 19,
    size: 11.3,
    font: fonts.bold,
    color: c(COLOR.black),
  });
  drawTextTop(page, labels.colName, {
    x: 101.65,
    baselineTop: opts.top + 19,
    size: 11.3,
    font: fonts.bold,
    color: c(COLOR.black),
  });
  drawTextTop(page, labels.colPrice, {
    x: 400.98,
    baselineTop: opts.top + 19,
    size: 11.3,
    font: fonts.bold,
    color: c(COLOR.black),
  });
  opts.rows.forEach((row, i) => {
    const baseline = opts.top + headerH + i * rowH + 19.5;
    drawTextTop(page, `${opts.startIndex + i}.`, {
      x: t.x + 6,
      baselineTop: baseline,
      size: t.fontSize,
      font: fonts.regular,
      color: c(COLOR.black),
    });
    drawTextTop(page, row.label, {
      x: 101.65,
      baselineTop: baseline,
      size: t.fontSize,
      font: fonts.regular,
      color: c(COLOR.black),
    });
    drawTextTop(page, priceLabel(row), {
      x: 400.98,
      baselineTop: baseline,
      size: t.fontSize,
      font: fonts.regular,
      color: c(COLOR.black),
    });
  });
}

function paintHistory(
  page: PDFPage,
  fonts: CpFonts,
  heading: string,
  yearSuffix: string,
  entries: CommercialProposalSnapshot["company_history"],
  firstPage: boolean
) {
  if (!firstPage) {
    drawTextTop(page, heading, {
      x: HISTORY.leftX,
      baselineTop: HISTORY.titleBaselineTop,
      size: 22.5,
      font: fonts.bold,
      color: c(COLOR.black),
    });
  } else {
    drawTextTop(page, heading, {
      x: HISTORY.leftX,
      baselineTop: HISTORY.titleBaselineTop,
      size: 22.5,
      font: fonts.bold,
      color: c(COLOR.black),
    });
  }
  let y = HISTORY.firstBaselineTop;
  const size = HISTORY.bodySize;
  for (const entry of entries) {
    const yearLabel = `${entry.year} ${yearSuffix}`.trim();
    const yearW = fonts.bold.widthOfTextAtSize(yearLabel, size);
    const maxW = y < HISTORY.artBottomTop && firstPage ? HISTORY.maxWidthBesideArt : HISTORY.maxWidthFull;
    const rest = ` ${entry.body}`.replace(/\s+/g, " ").trimStart();
    const firstWords = wrapText(fonts.regular, rest, size, Math.max(40, maxW - yearW - 4));
    const line1Rest = firstWords[0] ?? "";
    const leftover = rest.slice(line1Rest.length).trim();
    const more = leftover ? wrapText(fonts.regular, leftover, size, maxW) : [];
    drawTextTop(page, yearLabel, {
      x: HISTORY.leftX,
      baselineTop: y,
      size,
      font: fonts.bold,
      color: c(COLOR.black),
    });
    drawTextTop(page, ` ${line1Rest}`, {
      x: HISTORY.leftX + yearW,
      baselineTop: y,
      size,
      font: fonts.regular,
      color: c(COLOR.black),
    });
    more.forEach((ln, i) => {
      drawTextTop(page, ln, {
        x: HISTORY.leftX,
        baselineTop: y + HISTORY.lineHeight * (i + 1),
        size,
        font: fonts.regular,
        color: c(COLOR.black),
      });
    });
    y += HISTORY.lineHeight * (1 + more.length) + HISTORY.entryGap;
  }
}

function paginateHistory(
  fonts: CpFonts,
  yearSuffix: string,
  entries: CommercialProposalSnapshot["company_history"]
): CommercialProposalSnapshot["company_history"][] {
  const pages: CommercialProposalSnapshot["company_history"][] = [];
  let remaining = [...entries];
  let first = true;
  while (remaining.length) {
    const size = HISTORY.bodySize;
    let y = HISTORY.firstBaselineTop;
    const take: typeof remaining = [];
    let i = 0;
    for (; i < remaining.length; i++) {
      const entry = remaining[i]!;
      const yearLabel = `${entry.year} ${yearSuffix}`.trim();
      const yearW = fonts.bold.widthOfTextAtSize(yearLabel, size);
      const maxW = y < HISTORY.artBottomTop && first ? HISTORY.maxWidthBesideArt : HISTORY.maxWidthFull;
      const rest = entry.body.replace(/\s+/g, " ").trim();
      const firstWords = wrapText(fonts.regular, rest, size, Math.max(40, maxW - yearW - 4));
      const leftover = rest.slice((firstWords[0] ?? "").length).trim();
      const extra = leftover ? wrapText(fonts.regular, leftover, size, maxW).length : 0;
      const blockH = HISTORY.lineHeight * (1 + extra) + HISTORY.entryGap;
      if (take.length > 0 && y + blockH > HISTORY.pageBottomLimitTop) break;
      take.push(entry);
      y += blockH;
    }
    if (take.length === 0) {
      take.push(remaining[0]!);
      i = 1;
    }
    pages.push(take);
    remaining = remaining.slice(i);
    first = false;
  }
  return pages.length ? pages : [[]];
}

function chunk<T>(arr: T[], first: number, rest: number): T[][] {
  if (arr.length === 0) return [[]];
  const out: T[][] = [];
  out.push(arr.slice(0, first));
  let i = first;
  while (i < arr.length) {
    out.push(arr.slice(i, i + rest));
    i += rest;
  }
  return out;
}

async function embedAvatar(url: string | null | undefined): Promise<Uint8Array | null> {
  const u = (url ?? "").trim();
  if (!u) return null;
  try {
    const res = await fetch(u);
    if (!res.ok) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    return buf.byteLength > 0 ? buf : null;
  } catch {
    return null;
  }
}

async function tryPaintManagerAvatar(
  page: PDFPage,
  cx: number,
  cy: number,
  r: number,
  avatarBytes?: Uint8Array | null
): Promise<boolean> {
  if (!avatarBytes || avatarBytes.byteLength <= 0) return false;
  try {
    const head = avatarBytes.slice(0, 4);
    const isPng = head[0] === 0x89 && head[1] === 0x50;
    const img = isPng ? await page.doc.embedPng(avatarBytes) : await page.doc.embedJpg(avatarBytes);
    clipCircle(page, cx, cy, r);
    page.drawImage(img, { x: cx - r, y: cy - r, width: r * 2, height: r * 2 });
    page.pushOperators(popGraphicsState());
    return true;
  } catch {
    return false;
  }
}

function paintPlaceholder(page: PDFPage, fonts: CpFonts, name: string, cx: number, cy: number, r: number) {
  page.drawCircle({ x: cx, y: cy, size: r, color: c(COLOR.teal) });
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "—";
  const w = fonts.bold.widthOfTextAtSize(initials, 18);
  page.drawText(initials, {
    x: cx - w / 2,
    y: cy - 6,
    size: 18,
    font: fonts.bold,
    color: c(COLOR.white),
  });
}

function varsFromSnapshot(snapshot: CommercialProposalSnapshot): CpTemplateVariables {
  const recipient = snapshot.recipient ?? {
    recipient_name: snapshot.client.name,
    contact_name: null,
  };
  return {
    recipient_name: recipient.recipient_name || snapshot.client.name,
    contact_name: recipient.contact_name ?? "",
    sales_manager_name: snapshot.sales_manager.display_name,
    sales_manager_job_title: snapshot.sales_manager.job_title,
    issuer_company: snapshot.content.issuer_company || "Vertimų karaliai, UAB",
    proposal_number: snapshot.proposal_number || "CP-XXXX-0000",
    proposal_date: snapshot.generated_at || snapshot.created_at,
  };
}

export async function generateCommercialProposalPdfV2(input: {
  snapshot: CommercialProposalSnapshot;
  template: CpTemplateContent;
  managerAvatarBytes?: Uint8Array | null;
}): Promise<{ bytes: Uint8Array; warnings: CpOverflowWarning[] }> {
  const snapshot = input.snapshot;
  const warnings: CpOverflowWarning[] = [];
  const content = interpolateTemplateContent(input.template, varsFromSnapshot(snapshot));
  const srcBytes = readFileSync(resolveTemplatePdfPath("LT_COMMERCIAL_V2"));
  const src = await PDFDocument.load(srcBytes);
  const out = await PDFDocument.create();
  out.setTitle(snapshot.proposal_number ? `Komercinis pasiūlymas ${snapshot.proposal_number}` : "Komercinis pasiūlymas");
  out.setAuthor(content.header_company);
  const fonts = await embedProposalFonts(out);
  const avatarBytes = input.managerAvatarBytes ?? (await embedAvatar(snapshot.sales_manager.avatar_url));

  const cover = await copyTemplatePage(out, src, 0);
  // Design layer has static cover glyphs removed. Draw text on the original
  // teal only — no background rectangles (they show as darker patches).
  const titleLines = content.cover.title.split("\n");
  titleLines.forEach((ln, i) => {
    drawTextTop(cover, ln, {
      x: V2_COVER_TITLE.x,
      baselineTop: V2_COVER_TITLE.firstBaselineTop + i * V2_COVER_TITLE.lineHeight,
      size: V2_COVER_TITLE.size,
      font: fonts.bold,
      color: c(V2_COVER_TITLE.color),
    });
  });
  const white = c(COLOR.white);
  drawTextTop(cover, content.cover.created_label, {
    x: COVER.leftX,
    baselineTop: COVER.labelBaselineTop,
    size: COVER.fontSize,
    font: fonts.bold,
    color: white,
  });
  drawTextTop(cover, snapshot.sales_manager.display_name, {
    x: COVER.leftX,
    baselineTop: COVER.nameBaselineTop,
    size: COVER.fontSize,
    font: fonts.regular,
    color: white,
  });
  drawTextTop(cover, content.cover.issuer_line, {
    x: COVER.leftX,
    baselineTop: COVER.companyBaselineTop,
    size: COVER.fontSize,
    font: fonts.regular,
    color: white,
  });
  drawTextTop(cover, content.cover.dedicated_label, {
    x: COVER.rightX,
    baselineTop: COVER.labelBaselineTop,
    size: COVER.fontSize,
    font: fonts.bold,
    color: white,
  });
  wrapText(fonts.regular, snapshot.recipient?.recipient_name || snapshot.client.name, COVER.fontSize, 250).forEach(
    (line, i) => {
      drawTextTop(cover, line, {
        x: COVER.rightX,
        baselineTop: COVER.nameBaselineTop + i * 16,
        size: COVER.fontSize,
        font: fonts.regular,
        color: white,
      });
    }
  );

  const intro = await copyTemplatePage(out, src, 1);
  drawHeader(intro, fonts, content.header_company);
  drawTextTop(intro, content.intro.greeting, {
    x: 37.5,
    baselineTop: 96.5,
    size: 22.5,
    font: fonts.bold,
    color: c(COLOR.black),
  });
  let paraTop = 137.6;
  content.intro.paragraphs.forEach((para) => {
    const lines = wrapText(fonts.regular, para, 11.25, 360);
    lines.forEach((ln) => {
      drawTextTop(intro, ln, {
        x: 37.5,
        baselineTop: paraTop,
        size: 11.25,
        font: fonts.regular,
        color: c(COLOR.black),
      });
      paraTop += 16.88;
    });
    paraTop += 18;
  });
  drawTextTop(intro, content.intro.manager_name, {
    x: INTRO.nameX,
    baselineTop: INTRO.nameBaselineTop,
    size: INTRO.nameSize,
    font: fonts.bold,
    color: c(COLOR.black),
  });
  drawTextTop(intro, content.intro.job_title, {
    x: INTRO.nameX,
    baselineTop: INTRO.titleBaselineTop,
    size: INTRO.titleSize,
    font: fonts.regular,
    color: c(COLOR.jobGray),
  });
  const photo = INTRO.photo;
  const cx = photo.x + photo.w / 2;
  const cy = yBottom(photo.yTop + photo.h / 2);
  const r = Math.max(photo.overlayRadius, Math.min(photo.w, photo.h) / 2 + 2);
  pageTealCover(intro, cx, cy, r);
  const painted = await tryPaintManagerAvatar(intro, cx, cy, r, avatarBytes);
  if (!painted) paintPlaceholder(intro, fonts, snapshot.sales_manager.display_name, cx, cy, r);

  const historyPages = paginateHistory(fonts, content.history.year_suffix, snapshot.company_history);
  for (let i = 0; i < historyPages.length; i++) {
    const p = await copyTemplatePage(out, src, 2);
    drawHeader(p, fonts, content.header_company);
    paintHistory(p, fonts, content.history.heading, content.history.year_suffix, historyPages[i]!, i === 0);
  }

  const tech = await copyTemplatePage(out, src, 3);
  drawHeader(tech, fonts, content.header_company);
  drawTextTop(tech, content.technology.heading, {
    x: 37.5,
    baselineTop: 70.75,
    size: 22.5,
    font: fonts.bold,
    color: c(COLOR.black),
  });
  content.technology.blocks.forEach((block, i) => {
    const titleBox = V2_TECH_BLOCKS[i * 2];
    const bodyBox = V2_TECH_BLOCKS[i * 2 + 1];
    if (titleBox) drawTechTitle(tech, fonts, block.title, titleBox, warnings, `technology.blocks.${i}.title`);
    if (bodyBox) drawFittedBox(tech, fonts, block.body, bodyBox, warnings, `technology.blocks.${i}.body`);
  });

  const translation = linesFor(snapshot, "translation");
  const tChunks = translation.length ? chunk(translation, LANG_TABLE.firstPageRows, LANG_TABLE.contPageRows) : [];
  for (let i = 0; i < tChunks.length; i++) {
    const p = await copyTemplatePage(out, src, i === 0 ? 4 : 5);
    drawHeader(p, fonts, content.header_company);
    if (i === 0) {
      drawAccentHeading(p, fonts, content.translation.heading, {
        x: 37.5,
        baselineTop: 82,
        size: 27,
        accent: V2_PAGE_TITLE_ACCENT.translation,
      });
      wrapText(fonts.regular, content.translation.description, 11.25, 530).forEach((ln, li) => {
        drawTextTop(p, ln, {
          x: 37.5,
          baselineTop: 129 + li * 16.75,
          size: 11.25,
          font: fonts.regular,
          color: c(COLOR.black),
        });
      });
      drawTextTop(p, content.translation.prices_heading, {
        x: 37.5,
        baselineTop: 188,
        size: 18,
        font: fonts.bold,
        color: c(COLOR.black),
      });
      drawTextTop(p, content.translation.footnote, {
        x: 37.5,
        baselineTop: 224,
        size: 11.25,
        font: fonts.bold,
        color: c(COLOR.green),
      });
    }
    const top = i === 0 ? LANG_TABLE.firstPageTop : LANG_TABLE.contPageTop;
    const startIndex = i === 0 ? 1 : LANG_TABLE.firstPageRows + (i - 1) * LANG_TABLE.contPageRows + 1;
    drawLangTable(
      p,
      fonts,
      { colNr: content.translation.col_nr, colLang: content.translation.col_lang, colPrice: content.translation.col_price },
      { top, rows: tChunks[i]!, startIndex }
    );
  }

  const ai = linesFor(snapshot, "ai_translation");
  const aChunks = ai.length ? chunk(ai, LANG_TABLE.firstPageRows, LANG_TABLE.contPageRows) : [];
  for (let i = 0; i < aChunks.length; i++) {
    const p = await copyTemplatePage(out, src, i === 0 ? 6 : 7);
    drawHeader(p, fonts, content.header_company);
    if (i === 0) {
      drawAccentHeading(p, fonts, content.ai.heading, {
        x: 37.5,
        baselineTop: 82,
        size: 27,
        accent: V2_PAGE_TITLE_ACCENT.ai,
      });
      drawTextTop(p, content.ai.prices_heading, {
        x: 37.5,
        baselineTop: 128,
        size: 18,
        font: fonts.bold,
        color: c(COLOR.black),
      });
      drawTextTop(p, content.ai.footnote, {
        x: 37.5,
        baselineTop: 167,
        size: 11.25,
        font: fonts.bold,
        color: c(COLOR.green),
      });
    }
    const top = i === 0 ? LANG_TABLE.firstPageTop : LANG_TABLE.contPageTop;
    const startIndex = i === 0 ? 1 : LANG_TABLE.firstPageRows + (i - 1) * LANG_TABLE.contPageRows + 1;
    drawLangTable(
      p,
      fonts,
      { colNr: content.ai.col_nr, colLang: content.ai.col_lang, colPrice: content.ai.col_price },
      { top, rows: aChunks[i]!, startIndex }
    );
  }

  const extra = linesFor(snapshot, "additional_service");
  const eChunks = extra.length ? chunk(extra, EXTRA_TABLE.firstPageRows, EXTRA_TABLE.firstPageRows) : [];
  for (let i = 0; i < eChunks.length; i++) {
    const p = await copyTemplatePage(out, src, 8);
    drawHeader(p, fonts, content.header_company);
    if (i === 0) {
      drawAccentHeading(p, fonts, content.extras.heading, {
        x: 37.5,
        baselineTop: 78,
        size: 27,
        accent: V2_PAGE_TITLE_ACCENT.extras,
      });
    }
    const top = i === 0 ? EXTRA_TABLE.firstPageTop : LANG_TABLE.contPageTop;
    drawExtraTable(
      p,
      fonts,
      { colNr: content.extras.col_nr, colName: content.extras.col_name, colPrice: content.extras.col_price },
      { top, rows: eChunks[i]!, startIndex: i * EXTRA_TABLE.firstPageRows + 1 }
    );
  }

  const unique = await copyTemplatePage(out, src, 9);
  drawHeader(unique, fonts, content.header_company);
  drawTextTop(unique, content.uniqueness.heading, {
    x: 37.5,
    baselineTop: 70.75,
    size: 22.5,
    font: fonts.bold,
    color: c(COLOR.black),
  });
  content.uniqueness.blocks.forEach((block, i) => {
    const slot = V2_UNIQUE_BLOCKS[i];
    if (!slot) return;
    drawFittedBox(unique, fonts, block.title, slot.title, warnings, `uniqueness.blocks.${i}.title`);
    drawFittedBox(unique, fonts, block.body, slot.body, warnings, `uniqueness.blocks.${i}.body`);
  });

  const quality = await copyTemplatePage(out, src, 10);
  drawHeader(quality, fonts, content.header_company);
  drawAccentHeading(quality, fonts, content.quality.heading, {
    x: 37.5,
    baselineTop: 82,
    size: 27,
    accent: V2_PAGE_TITLE_ACCENT.quality,
  });
  content.quality.steps.forEach((step, i) => {
    const slot = V2_QUALITY_STEPS[i];
    if (!slot) return;
    drawFittedBox(quality, fonts, step.number, slot.num, warnings, `quality.steps.${i}.number`);
    drawFittedBox(quality, fonts, step.title, slot.title, warnings, `quality.steps.${i}.title`);
    drawFittedBox(quality, fonts, step.body, slot.body, warnings, `quality.steps.${i}.body`);
  });

  return { bytes: await out.save(), warnings };
}

function pageTealCover(page: PDFPage, cx: number, cy: number, r: number) {
  page.drawCircle({ x: cx, y: cy, size: r, color: c(COLOR.teal) });
}
