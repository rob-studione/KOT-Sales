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
  COLOR,
  COVER,
  EXTRA_TABLE,
  HISTORY,
  INTRO,
  ISSUER_COMPANY,
  LANG_TABLE,
  PAGE_H,
  yBottom,
} from "@/lib/commercialProposal/layout";
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
    if (font.widthOfTextAtSize(next, size) <= maxWidth) {
      current = next;
    } else {
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
  return snapshot.lines.filter((l) => l.category === category).sort((a, b) => a.sort_order - b.sort_order);
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

function drawLangTable(
  page: PDFPage,
  fonts: CpFonts,
  opts: { top: number; rows: Line[]; startIndex: number }
) {
  const t = LANG_TABLE;
  const tableW = t.right - t.x;
  const headerH = t.headerH;
  const rowH = t.rowH;
  const cols = [
    { x: t.x, w: t.colNrRight - t.x },
    { x: t.colNrRight, w: t.colLangRight - t.colNrRight },
    { x: t.colLangRight, w: t.right - t.colLangRight },
  ];

  const totalH = headerH + opts.rows.length * rowH;
  page.drawRectangle({
    x: t.x,
    y: yBottom(opts.top + totalH),
    width: tableW,
    height: totalH,
    color: c(COLOR.white),
  });

  page.drawRectangle({
    x: t.x,
    y: yBottom(opts.top + headerH),
    width: tableW,
    height: headerH,
    color: c(COLOR.tableHeader),
  });

  const gridColor = c(COLOR.tableBorder);
  const stroke = 0.75;
  const bottom = opts.top + totalH;
  const vxs = [t.x, t.colNrRight, t.colLangRight, t.right];
  for (const vx of vxs) {
    page.drawLine({
      start: { x: vx, y: yBottom(opts.top) },
      end: { x: vx, y: yBottom(bottom) },
      thickness: stroke,
      color: gridColor,
    });
  }
  const hCount = opts.rows.length + 1;
  for (let i = 0; i <= hCount; i++) {
    const yTop = opts.top + (i === 0 ? 0 : headerH + (i - 1) * rowH);
    page.drawLine({
      start: { x: t.x, y: yBottom(yTop) },
      end: { x: t.right, y: yBottom(yTop) },
      thickness: stroke,
      color: gridColor,
    });
  }
  page.drawLine({
    start: { x: t.x, y: yBottom(bottom) },
    end: { x: t.right, y: yBottom(bottom) },
    thickness: stroke,
    color: gridColor,
  });

  const headerSize = 11.3;
  drawTextTop(page, "Eil.", {
    x: cols[0]!.x + 6,
    baselineTop: opts.top + 7.9 + headerSize,
    size: headerSize,
    font: fonts.bold,
    color: c(COLOR.black),
  });
  drawTextTop(page, "Nr.", {
    x: cols[0]!.x + 6,
    baselineTop: opts.top + 24.4 + headerSize,
    size: headerSize,
    font: fonts.bold,
    color: c(COLOR.black),
  });
  drawTextTop(page, "Kalbų kombinacijos", {
    x: cols[1]!.x + 5.7,
    baselineTop: opts.top + 7.9 + headerSize,
    size: headerSize,
    font: fonts.bold,
    color: c(COLOR.black),
  });
  drawTextTop(page, "Kaina už standartinį", {
    x: cols[2]!.x + 5.8,
    baselineTop: opts.top + 7.9 + headerSize,
    size: headerSize,
    font: fonts.bold,
    color: c(COLOR.black),
  });
  drawTextTop(page, "puslapį* (be PVM)", {
    x: cols[2]!.x + 5.8,
    baselineTop: opts.top + 24.4 + headerSize,
    size: headerSize,
    font: fonts.bold,
    color: c(COLOR.black),
  });

  opts.rows.forEach((row, i) => {
    const rowTop = opts.top + headerH + i * rowH;
    const baseline = rowTop + 19.5;
    const nr = `${opts.startIndex + i}.`;
    drawTextTop(page, nr, {
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

function drawExtraTable(
  page: PDFPage,
  fonts: CpFonts,
  opts: { top: number; rows: Line[]; startIndex: number }
) {
  const t = EXTRA_TABLE;
  const tableW = t.right - t.x;
  const headerH = t.headerH;
  const rowH = t.rowH;
  const totalH = headerH + opts.rows.length * rowH;

  page.drawRectangle({
    x: t.x,
    y: yBottom(opts.top + totalH),
    width: tableW,
    height: totalH,
    color: c(COLOR.white),
  });
  page.drawRectangle({
    x: t.x,
    y: yBottom(opts.top + headerH),
    width: tableW,
    height: headerH,
    color: c(COLOR.tableHeader),
  });

  const gridColor = c(COLOR.tableBorder);
  const stroke = 0.75;
  const bottom = opts.top + totalH;
  for (const vx of [t.x, t.colNrRight, t.colNameRight, t.right]) {
    page.drawLine({
      start: { x: vx, y: yBottom(opts.top) },
      end: { x: vx, y: yBottom(bottom) },
      thickness: stroke,
      color: gridColor,
    });
  }
  for (let i = 0; i <= opts.rows.length + 1; i++) {
    const yTop = opts.top + (i === 0 ? 0 : headerH + (i - 1) * rowH);
    page.drawLine({
      start: { x: t.x, y: yBottom(yTop) },
      end: { x: t.right, y: yBottom(yTop) },
      thickness: stroke,
      color: gridColor,
    });
  }

  const headerSize = 11.3;
  const headerBaseline = opts.top + 19;
  drawTextTop(page, "Eil. Nr.", {
    x: t.x + 6,
    baselineTop: headerBaseline,
    size: headerSize,
    font: fonts.bold,
    color: c(COLOR.black),
  });
  drawTextTop(page, "Paslaugos pavadinimas", {
    x: t.colNrRight + 6,
    baselineTop: headerBaseline,
    size: headerSize,
    font: fonts.bold,
    color: c(COLOR.black),
  });
  drawTextTop(page, "Kaina EUR (be PVM)", {
    x: t.colNameRight + 6,
    baselineTop: headerBaseline,
    size: headerSize,
    font: fonts.bold,
    color: c(COLOR.black),
  });

  opts.rows.forEach((row, i) => {
    const rowTop = opts.top + headerH + i * rowH;
    const baseline = rowTop + 19.5;
    drawTextTop(page, `${opts.startIndex + i}.`, {
      x: t.x + 6,
      baselineTop: baseline,
      size: t.fontSize,
      font: fonts.regular,
      color: c(COLOR.black),
    });
    drawTextTop(page, row.label, {
      x: t.colNrRight + 6,
      baselineTop: baseline,
      size: t.fontSize,
      font: fonts.regular,
      color: c(COLOR.black),
    });
    drawTextTop(page, priceLabel(row), {
      x: t.colNameRight + 6,
      baselineTop: baseline,
      size: t.fontSize,
      font: fonts.regular,
      color: c(COLOR.black),
    });
  });
}

function paintCoverOverlay(page: PDFPage, fonts: CpFonts, snapshot: CommercialProposalSnapshot) {
  page.drawRectangle({
    x: COVER.overlayLeft,
    y: yBottom(COVER.overlayBottom),
    width: COVER.overlayRight - COVER.overlayLeft,
    height: COVER.overlayBottom - COVER.overlayTop,
    color: c(COLOR.teal),
  });

  const white = c(COLOR.white);
  drawTextTop(page, "Sukūrė:", {
    x: COVER.leftX,
    baselineTop: COVER.labelBaselineTop,
    size: COVER.fontSize,
    font: fonts.bold,
    color: white,
  });
  drawTextTop(page, snapshot.sales_manager.display_name, {
    x: COVER.leftX,
    baselineTop: COVER.nameBaselineTop,
    size: COVER.fontSize,
    font: fonts.regular,
    color: white,
  });
  drawTextTop(page, snapshot.content.issuer_company || ISSUER_COMPANY, {
    x: COVER.leftX,
    baselineTop: COVER.companyBaselineTop,
    size: COVER.fontSize,
    font: fonts.regular,
    color: white,
  });

  drawTextTop(page, "Skirta:", {
    x: COVER.rightX,
    baselineTop: COVER.labelBaselineTop,
    size: COVER.fontSize,
    font: fonts.bold,
    color: white,
  });
  const clientLines = wrapText(fonts.regular, snapshot.client.name, COVER.fontSize, 250);
  clientLines.forEach((line, i) => {
    drawTextTop(page, line, {
      x: COVER.rightX,
      baselineTop: COVER.nameBaselineTop + i * 16,
      size: COVER.fontSize,
      font: fonts.regular,
      color: white,
    });
  });
}

async function paintIntroOverlay(
  page: PDFPage,
  fonts: CpFonts,
  snapshot: CommercialProposalSnapshot,
  avatarBytes?: Uint8Array | null
) {
  page.drawRectangle({
    x: 148,
    y: yBottom(302),
    width: 300,
    height: 48,
    color: c(COLOR.white),
  });
  drawTextTop(page, snapshot.sales_manager.display_name, {
    x: INTRO.nameX,
    baselineTop: INTRO.nameBaselineTop,
    size: INTRO.nameSize,
    font: fonts.bold,
    color: c(COLOR.black),
  });
  drawTextTop(page, snapshot.sales_manager.job_title, {
    x: INTRO.nameX,
    baselineTop: INTRO.titleBaselineTop,
    size: INTRO.titleSize,
    font: fonts.regular,
    color: c(COLOR.jobGray),
  });

  const photo = INTRO.photo;
  const cx = photo.x + photo.w / 2;
  const cy = yBottom(photo.yTop + photo.h / 2);
  const r = photo.overlayRadius;

  page.drawCircle({
    x: cx,
    y: cy,
    size: r,
    color: c(COLOR.teal),
  });

  const painted = await tryPaintManagerAvatar(page, cx, cy, r, avatarBytes);
  if (!painted) {
    paintManagerPhotoPlaceholder(page, fonts, snapshot.sales_manager.display_name, cx, cy);
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
    const size = r * 2;
    page.drawImage(img, {
      x: cx - r,
      y: cy - r,
      width: size,
      height: size,
    });
    page.pushOperators(popGraphicsState());
    return true;
  } catch {
    return false;
  }
}

function managerInitials(displayName: string): string {
  const parts = displayName.split(/\s+/).filter(Boolean);
  const letters = parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "");
  return letters.join("") || "—";
}

function paintManagerPhotoPlaceholder(
  page: PDFPage,
  fonts: CpFonts,
  displayName: string,
  cx: number,
  cy: number
) {
  const initials = managerInitials(displayName);
  const initSize = 18;
  const w = fonts.bold.widthOfTextAtSize(initials, initSize);
  page.drawText(initials, {
    x: cx - w / 2,
    y: cy - initSize / 3,
    size: initSize,
    font: fonts.bold,
    color: c(COLOR.white),
  });
}

function paintHistoryPage(
  page: PDFPage,
  fonts: CpFonts,
  entries: CommercialProposalSnapshot["company_history"],
  opts: { firstPage: boolean }
) {
  const wipeTop = opts.firstPage ? 88 : 48;
  if (opts.firstPage) {
    page.drawRectangle({
      x: 32,
      y: yBottom(HISTORY.artBottomTop + 4),
      width: 365,
      height: HISTORY.artBottomTop + 4 - wipeTop,
      color: c(COLOR.white),
    });
    page.drawRectangle({
      x: 32,
      y: yBottom(HISTORY.pageBottomLimitTop),
      width: 548,
      height: HISTORY.pageBottomLimitTop - HISTORY.artBottomTop,
      color: c(COLOR.white),
    });
  } else {
    page.drawRectangle({
      x: 32,
      y: yBottom(HISTORY.pageBottomLimitTop),
      width: 548,
      height: HISTORY.pageBottomLimitTop - wipeTop,
      color: c(COLOR.white),
    });
    drawTextTop(page, "Mūsų istorija", {
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
    const yearLabel = `${entry.year} metais`;
    const yearW = fonts.bold.widthOfTextAtSize(yearLabel, size);
    const maxW =
      y < HISTORY.artBottomTop && opts.firstPage ? HISTORY.maxWidthBesideArt : HISTORY.maxWidthFull;
    const rest = ` ${entry.body}`.replace(/\s+/g, " ").trimStart();
    const firstLineBudget = Math.max(40, maxW - yearW - 4);
    const restLines = wrapText(fonts.regular, rest, size, maxW);
    // Keep year + first words on same line when they fit.
    const firstWords = wrapText(fonts.regular, rest, size, firstLineBudget);
    const line1Rest = firstWords[0] ?? "";
    const leftover = rest.slice(line1Rest.length).trim();
    const more = leftover ? wrapText(fonts.regular, leftover, size, maxW) : restLines.slice(1);

    const blockH = HISTORY.lineHeight * (1 + more.length) + HISTORY.entryGap;
    if (y + blockH > HISTORY.pageBottomLimitTop) {
      // Caller paginates; leftover handled outside.
      break;
    }

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
      const yearLabel = `${entry.year} metais`;
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

export async function generateCommercialProposalPdf(input: {
  snapshot: CommercialProposalSnapshot;
  managerAvatarBytes?: Uint8Array | null;
}): Promise<Uint8Array> {
  const snapshot = input.snapshot;
  const srcBytes = readFileSync(resolveTemplatePdfPath(snapshot.template_version));
  const src = await PDFDocument.load(srcBytes);
  const out = await PDFDocument.create();
  out.setTitle(snapshot.proposal_number ? `Komercinis pasiūlymas ${snapshot.proposal_number}` : "Komercinis pasiūlymas");
  out.setAuthor(ISSUER_COMPANY);
  const fonts = await embedProposalFonts(out);

  const avatarBytes = input.managerAvatarBytes ?? (await embedAvatar(snapshot.sales_manager.avatar_url));

  const cover = await copyTemplatePage(out, src, 0);
  paintCoverOverlay(cover, fonts, snapshot);

  const intro = await copyTemplatePage(out, src, 1);
  await paintIntroOverlay(intro, fonts, snapshot, avatarBytes);

  const historyPages = paginateHistory(fonts, snapshot.company_history);
  for (let i = 0; i < historyPages.length; i++) {
    const p = await copyTemplatePage(out, src, 2);
    paintHistoryPage(p, fonts, historyPages[i]!, { firstPage: i === 0 });
  }

  await copyTemplatePage(out, src, 3);

  const translation = linesFor(snapshot, "translation");
  const tChunks = chunk(translation, LANG_TABLE.firstPageRows, LANG_TABLE.contPageRows);
  for (let i = 0; i < tChunks.length; i++) {
    const templateIndex = i === 0 ? 4 : 5;
    const p = await copyTemplatePage(out, src, templateIndex);
    const top = i === 0 ? LANG_TABLE.firstPageTop : LANG_TABLE.contPageTop;
    const startIndex = i === 0 ? 1 : LANG_TABLE.firstPageRows + (i - 1) * LANG_TABLE.contPageRows + 1;
    pageWhiteTable(p, top);
    drawLangTable(p, fonts, { top, rows: tChunks[i]!, startIndex });
  }

  const ai = linesFor(snapshot, "ai_translation");
  const aChunks = chunk(ai, LANG_TABLE.firstPageRows, LANG_TABLE.contPageRows);
  for (let i = 0; i < aChunks.length; i++) {
    const templateIndex = i === 0 ? 6 : 7;
    const p = await copyTemplatePage(out, src, templateIndex);
    const top = i === 0 ? LANG_TABLE.firstPageTop : LANG_TABLE.contPageTop;
    const startIndex = i === 0 ? 1 : LANG_TABLE.firstPageRows + (i - 1) * LANG_TABLE.contPageRows + 1;
    pageWhiteTable(p, top);
    drawLangTable(p, fonts, { top, rows: aChunks[i]!, startIndex });
  }

  const extra = linesFor(snapshot, "additional_service");
  const eChunks = chunk(extra, EXTRA_TABLE.firstPageRows, EXTRA_TABLE.firstPageRows);
  for (let i = 0; i < eChunks.length; i++) {
    const p = await copyTemplatePage(out, src, 8);
    const top = i === 0 ? EXTRA_TABLE.firstPageTop : LANG_TABLE.contPageTop;
    pageWhiteTable(p, top);
    drawExtraTable(p, fonts, {
      top,
      rows: eChunks[i]!,
      startIndex: i * EXTRA_TABLE.firstPageRows + 1,
    });
  }

  await copyTemplatePage(out, src, 9);
  await copyTemplatePage(out, src, 10);

  return out.save();
}

function pageWhiteTable(page: PDFPage, top: number) {
  page.drawRectangle({
    x: 34,
    y: yBottom(740),
    width: 546,
    height: 740 - top + 2,
    color: c(COLOR.white),
  });
}
