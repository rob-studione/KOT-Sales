import "server-only";

const ENTITY_MAP: Record<string, string> = {
  nbsp: " ",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

/** Decode minimal numeric and named HTML entities (conservative). */
function decodeHtmlEntities(input: string): string {
  let t = input.replace(/&#(\d+);/g, (_, n) => {
    const code = Number(n);
    if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return "";
    try {
      return String.fromCodePoint(code);
    } catch {
      return "";
    }
  });
  t = t.replace(/&#x([0-9a-f]+);/gi, (_, h) => {
    const code = parseInt(h, 16);
    if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return "";
    try {
      return String.fromCodePoint(code);
    } catch {
      return "";
    }
  });
  t = t.replace(/&([a-z]+);/gi, (m, name) => {
    const key = String(name).toLowerCase();
    return ENTITY_MAP[key] ?? m;
  });
  return t;
}

function stripZeroWidth(input: string): string {
  return input.replace(/[\u200B-\u200D\uFEFF]/g, "");
}

/** Collapse 3+ newlines to exactly 2 (single blank line between blocks). */
function collapseBlankLines(input: string): string {
  return input.replace(/\n{3,}/g, "\n\n");
}

const ON_WROTE_LINE_RE = /^On .+ wrote:$/i;
const HEADER_LINE_RE = /^(From|Sent|To|Cc|Subject|Date|Iš|Kam|Tema):\s+/i;
const FORWARD_RE = /^[-_]{2,}\s*Forwarded message\s*[-_]{2,}\s*$/i;
const LT_FORWARD_RE = /^[-_]{2,}\s*Persiųsta žinutė\s*[-_]{2,}\s*$/i;

function trimQuotedHistoryConservative(text: string): { trimmed: string; applied: boolean } {
  const t = text;
  const lines = t.split("\n");
  let cut = lines.length;
  let i = 0;
  for (; i < lines.length; i++) {
    const line = lines[i].trimEnd();
    if (ON_WROTE_LINE_RE.test(line)) {
      const head = lines.slice(0, i).join("\n").trimEnd();
      if (head.replace(/\s/g, "").length >= 20) {
        return { trimmed: head, applied: true };
      }
    }
    if (FORWARD_RE.test(line) || LT_FORWARD_RE.test(line)) {
      cut = i;
      break;
    }
    if (HEADER_LINE_RE.test(line)) {
      let j = i;
      let headerRun = 0;
      while (j < lines.length && (lines[j].trim() === "" || HEADER_LINE_RE.test(lines[j].trimEnd()))) {
        if (HEADER_LINE_RE.test(lines[j].trimEnd())) headerRun++;
        j++;
      }
      if (headerRun >= 2 && j < lines.length) {
        const head = lines.slice(0, i).join("\n").trimEnd();
        if (head.replace(/\s/g, "").length >= 20) {
          return { trimmed: head, applied: true };
        }
      }
    }
  }
  if (cut < lines.length) {
    const head = lines.slice(0, cut).join("\n").trimEnd();
    if (head.replace(/\s/g, "").length >= 20) {
      return { trimmed: head, applied: true };
    }
  }
  return { trimmed: t, applied: false };
}

const SIG_MARKERS = [
  /\n(?:Kind regards|Best regards|Warm regards|With regards|Regards)\s*,?\s*$/i,
  /\n(?:Thanks|Thank you|Many thanks)\s*,?\s*$/i,
  /\n(?:Sincerely|Yours sincerely)\s*,?\s*$/i,
  /\n(?:Pagarbiai|Su pagarbiais|Ačiū|Dėkoju)\s*,?\s*$/i,
];

const FOOTER_PATTERNS = [
  /confidentiality notice/i,
  /this e-?mail (?:is )?confidential/i,
  /saugokite konfidencialumą/i,
  /išsisaugokite informaciją/i,
  /unsubscribe/i,
  /atsisakyti prenumeratos/i,
  /tracking pixel/i,
  /automatically generated/i,
];

function trimSignatureConservative(text: string): { trimmed: string; applied: boolean } {
  const lowerThirdStart = Math.floor(text.length * 0.55);

  for (const re of SIG_MARKERS) {
    re.lastIndex = 0;
    const m = re.exec(text);
    if (!m || m.index < lowerThirdStart) continue;
    const head = text.slice(0, m.index).trimEnd();
    const tail = text.slice(m.index).trim();
    const tailLooksFooter =
      tail.length < 800 && (tail.split("\n").length <= 12 || FOOTER_PATTERNS.some((p) => p.test(tail)));
    if (head.replace(/\s/g, "").length >= 20 && tailLooksFooter) {
      return { trimmed: head, applied: true };
    }
  }

  for (const p of FOOTER_PATTERNS) {
    const idx = text.search(p);
    if (idx >= lowerThirdStart && idx > 0) {
      const head = text.slice(0, idx).trimEnd();
      if (head.replace(/\s/g, "").length >= 20) {
        return { trimmed: head, applied: true };
      }
    }
  }

  return { trimmed: text, applied: false };
}

function substantiveCharCount(s: string): number {
  return s.replace(/\s/g, "").length;
}

/**
 * Deterministic cleaning: normalize, decode entities, trim noise conservatively.
 * Does not summarize, translate, or rewrite language.
 */
export function cleanMessageTextForPreparation(bodyPlain: string | null, bodyClean: string | null): string {
  const raw = (bodyClean?.trim() ? bodyClean : bodyPlain ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (!raw.trim()) return "";

  let t = stripZeroWidth(raw);
  t = decodeHtmlEntities(t);
  t = t.replace(/<[^>]+>/g, "");
  t = t.trim();
  t = collapseBlankLines(t);

  const afterQuoted = trimQuotedHistoryConservative(t);
  let candidate = afterQuoted.trimmed;
  if (!afterQuoted.applied) {
    candidate = t;
  }

  const sig = trimSignatureConservative(candidate);
  let finalText = sig.trimmed;
  if (!sig.applied) {
    finalText = candidate;
  }

  const baseSub = substantiveCharCount(t);
  const finalSub = substantiveCharCount(finalText);
  if (baseSub >= 40 && finalSub < Math.min(20, Math.floor(baseSub * 0.35))) {
    finalText = afterQuoted.applied ? afterQuoted.trimmed : t;
    finalText = finalText.trim();
  }

  finalText = collapseBlankLines(finalText).trim();
  return finalText;
}
