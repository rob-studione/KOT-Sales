/**
 * Text-only PDF extraction (C2) — no OCR / Vision / file upload.
 * Pure-JS via `unpdf` (serverless PDF.js). Page markers kept for grounding.
 */

import { extractText, getDocumentProxy } from "unpdf";

import { normalizeWhitespaceForEvidence } from "@/lib/translatorSearch/evidenceGrounding";
import { TRANSLATOR_SEARCH_LIMITS } from "@/lib/translatorSearch/limits";

export const PDF_TEXT_ERROR_CODES = [
  "pdf_invalid",
  "pdf_too_large",
  "pdf_page_limit",
  "pdf_no_text",
  "pdf_encrypted",
  "pdf_parse_failed",
] as const;

export type PdfTextErrorCode = (typeof PDF_TEXT_ERROR_CODES)[number];

export type PdfPageText = {
  page: number;
  text: string;
};

export type PdfTextOk = {
  ok: true;
  pageCount: number;
  pages: PdfPageText[];
  /** Combined page texts for model / grounding (whitespace-normalized per page). */
  text: string;
};

export type PdfTextErr = {
  ok: false;
  code: PdfTextErrorCode;
};

export type PdfTextResult = PdfTextOk | PdfTextErr;

const PDF_MAGIC = Buffer.from("%PDF-", "ascii");

export function bufferLooksLikePdf(buf: Buffer): boolean {
  if (!buf || buf.byteLength < PDF_MAGIC.byteLength) return false;
  return buf.subarray(0, PDF_MAGIC.byteLength).equals(PDF_MAGIC);
}

/** Normalize whitespace without joining words across newlines. */
export function normalizePdfPageText(raw: string): string {
  return String(raw ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isPasswordError(err: unknown): boolean {
  const name =
    err && typeof err === "object" && "name" in err ? String((err as { name?: unknown }).name ?? "") : "";
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return /password|encrypted/i.test(name) || /password|encrypted/i.test(msg);
}

async function destroyPdfDocument(doc: unknown): Promise<void> {
  if (!doc || typeof doc !== "object") return;
  const destroy = (doc as { destroy?: () => Promise<void> | void }).destroy;
  if (typeof destroy !== "function") return;
  try {
    await destroy.call(doc);
  } catch {
    // Never override the primary PDF result or leak into UI.
  }
}

/**
 * Extract selectable text from a PDF buffer.
 * `pagesUsedSoFar` + this document's page count must stay within `maxPdfPagesTotal`.
 * PDF.js document is destroyed on every path after a successful open.
 */
export async function extractPdfTextFromBuffer(params: {
  bytes: Buffer;
  maxBytes?: number;
  maxPagesTotal?: number;
  pagesUsedSoFar?: number;
  maxChars?: number;
}): Promise<PdfTextResult> {
  const maxBytes = params.maxBytes ?? TRANSLATOR_SEARCH_LIMITS.maxPdfBytes;
  const maxPagesTotal = params.maxPagesTotal ?? TRANSLATOR_SEARCH_LIMITS.maxPdfPagesTotal;
  const pagesUsedSoFar = Math.max(0, params.pagesUsedSoFar ?? 0);
  const maxChars = params.maxChars ?? TRANSLATOR_SEARCH_LIMITS.maxCharsPerSource;

  if (!params.bytes || params.bytes.byteLength <= 0) {
    return { ok: false, code: "pdf_invalid" };
  }
  if (params.bytes.byteLength > maxBytes) {
    return { ok: false, code: "pdf_too_large" };
  }
  if (!bufferLooksLikePdf(params.bytes)) {
    return { ok: false, code: "pdf_invalid" };
  }

  let doc: Awaited<ReturnType<typeof getDocumentProxy>> | null = null;
  try {
    doc = await getDocumentProxy(new Uint8Array(params.bytes));
  } catch (e) {
    if (isPasswordError(e)) return { ok: false, code: "pdf_encrypted" };
    return { ok: false, code: "pdf_parse_failed" };
  }

  try {
    const pageCount = Number(doc.numPages ?? 0);
    if (!Number.isFinite(pageCount) || pageCount < 1) {
      return { ok: false, code: "pdf_invalid" };
    }
    if (pagesUsedSoFar + pageCount > maxPagesTotal) {
      return { ok: false, code: "pdf_page_limit" };
    }

    let extracted: { totalPages: number; text: string | string[] };
    try {
      extracted = await extractText(doc, { mergePages: false });
    } catch (e) {
      if (isPasswordError(e)) return { ok: false, code: "pdf_encrypted" };
      return { ok: false, code: "pdf_parse_failed" };
    }

    const rawPages = Array.isArray(extracted.text) ? extracted.text : [String(extracted.text ?? "")];
    const pages: PdfPageText[] = [];
    for (let i = 0; i < pageCount; i++) {
      const normalized = normalizePdfPageText(rawPages[i] ?? "");
      pages.push({ page: i + 1, text: normalized });
    }

    const nonEmpty = pages.filter((p) => p.text.length > 0);
    if (!nonEmpty.length) {
      return { ok: false, code: "pdf_no_text" };
    }

    let combined = pages.map((p) => p.text).filter(Boolean).join("\n\n");
    if (combined.length > maxChars) {
      combined = combined.slice(0, maxChars);
    }

    // Re-slice page texts to stay consistent with combined char budget for grounding.
    let remaining = maxChars;
    const boundedPages: PdfPageText[] = [];
    for (const p of pages) {
      if (remaining <= 0) break;
      if (!p.text) {
        boundedPages.push(p);
        continue;
      }
      const slice = p.text.slice(0, remaining);
      boundedPages.push({ page: p.page, text: slice });
      remaining -= slice.length;
      if (remaining > 0) remaining -= 2; // account for \n\n joiners roughly
    }

    return {
      ok: true,
      pageCount,
      pages: boundedPages.length ? boundedPages : pages,
      text: combined,
    };
  } finally {
    await destroyPdfDocument(doc);
  }
}

/**
 * Resolve `pdf_page` from grounded evidence quotes against per-page text.
 * Prefer display_name, then first matching evidence quote; else null.
 */
export function resolvePdfPageFromEvidence(params: {
  pages: PdfPageText[];
  evidence: Array<{ field: string; quote: string }>;
}): number | null {
  if (!params.pages.length || !params.evidence.length) return null;

  const ordered = [
    ...params.evidence.filter((e) => e.field === "display_name"),
    ...params.evidence.filter((e) => e.field !== "display_name"),
  ];

  for (const ev of ordered) {
    const q = normalizeWhitespaceForEvidence(ev.quote);
    if (q.length < 2) continue;
    for (const page of params.pages) {
      const hay = normalizeWhitespaceForEvidence(page.text);
      if (hay.includes(q)) return page.page;
    }
  }
  return null;
}
