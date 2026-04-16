import "server-only";

import type { gmail_v1 } from "googleapis";

function decodeBase64Url(data: string): string {
  const pad = data.length % 4 === 0 ? "" : "=".repeat(4 - (data.length % 4));
  const b64 = (data + pad).replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(b64, "base64").toString("utf8");
}

function collectLeafParts(part: gmail_v1.Schema$MessagePart | undefined, out: gmail_v1.Schema$MessagePart[]) {
  if (!part) return;
  if (part.parts?.length) {
    for (const p of part.parts) collectLeafParts(p, out);
    return;
  }
  out.push(part);
}

function htmlToPlain(html: string): string {
  let t = html.replace(/\r/g, "");
  t = t.replace(/<\s*br\s*\/?>/gi, "\n");
  t = t.replace(/<\/\s*p\s*>/gi, "\n");
  t = t.replace(/<[^>]+>/g, "");
  t = t
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"');
  t = t.replace(/\n{3,}/g, "\n\n").trim();
  return t;
}

export function extractBodyPlainFromMessage(message: gmail_v1.Schema$Message): string {
  const payload = message.payload;
  if (!payload) return "";

  const leaves: gmail_v1.Schema$MessagePart[] = [];
  collectLeafParts(payload, leaves);

  let plain = "";
  let html = "";
  for (const p of leaves) {
    const mime = (p.mimeType ?? "").toLowerCase();
    const data = p.body?.data;
    if (!data) continue;
    let text: string;
    try {
      text = decodeBase64Url(data);
    } catch {
      continue;
    }
    if (mime === "text/plain" && !plain) plain = text;
    if (mime === "text/html" && !html) html = text;
  }

  if (plain.trim()) return plain.trimEnd();
  if (html.trim()) return htmlToPlain(html);
  return "";
}

const ON_WROTE_RE = /^On .+ wrote:\s*$/gim;
const FROM_HEADER_BLOCK_RE = /^(From:|Sent:|To:|Subject:|Date:)\s+.*/gim;

export function buildBodyClean(bodyPlain: string): string {
  let t = bodyPlain.replace(/\r/g, "").trim();
  if (!t) return "";

  const onMatch = ON_WROTE_RE.exec(t);
  ON_WROTE_RE.lastIndex = 0;
  if (onMatch?.index != null && onMatch.index > 0) {
    t = t.slice(0, onMatch.index).trimEnd();
  }

  const lines = t.split("\n");
  const kept: string[] = [];
  let skippingQuotedHeaderRun = false;
  for (const line of lines) {
    const trimmed = line.trimEnd();
    if (/^>{1,}\s?/.test(trimmed)) continue;
    if (FROM_HEADER_BLOCK_RE.test(trimmed)) {
      skippingQuotedHeaderRun = true;
      FROM_HEADER_BLOCK_RE.lastIndex = 0;
      continue;
    }
    FROM_HEADER_BLOCK_RE.lastIndex = 0;
    if (skippingQuotedHeaderRun) {
      if (trimmed === "") skippingQuotedHeaderRun = false;
      continue;
    }
    kept.push(line);
  }
  t = kept.join("\n").trim();
  t = t.replace(/\n{3,}/g, "\n\n");
  return t;
}
