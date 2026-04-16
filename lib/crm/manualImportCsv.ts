import Papa, { type ParseResult } from "papaparse";

const PAPA_BASE = {
  header: true as const,
  skipEmptyLines: true as const,
  dynamicTyping: false as const,
};

function firstNonEmptyLine(text: string): string {
  return (text.split(/\r?\n/).find((l) => l.trim().length > 0) ?? "").trim();
}

/** Pakanka antraštės ir kelių eilučių delimiter’iui; išvengia kelių pilnų parse dideliems failams. */
function headSample(text: string, maxBytes = 64 * 1024): string {
  if (text.length <= maxBytes) return text;
  const slice = text.slice(0, maxBytes);
  const lastNl = Math.max(slice.lastIndexOf("\n"), slice.lastIndexOf("\r"));
  return lastNl > 0 ? slice.slice(0, lastNl) : slice;
}

/** Pirmos eilutės skirtukų skaičius — be kabučių; pakanka tipiniams antraštės CSV. */
function guessDelimiterFromFirstLine(line: string): string {
  if (!line) return ",";
  const commas = (line.match(/,/g) ?? []).length;
  const semicolons = (line.match(/;/g) ?? []).length;
  const tabs = (line.match(/\t/g) ?? []).length;
  if (tabs > semicolons && tabs > commas) return "\t";
  if (semicolons > commas) return ";";
  return ",";
}

function parseWithDelimiter(text: string, delimiter: string): ParseResult<Record<string, unknown>> {
  return Papa.parse<Record<string, unknown>>(text, {
    ...PAPA_BASE,
    delimiter,
  });
}

function fieldCount(meta: ParseResult<Record<string, unknown>>["meta"]): number {
  return meta?.fields?.filter((f) => typeof f === "string" && f.trim().length > 0).length ?? 0;
}

/**
 * Nustato skirtuką rankinio importo CSV (LT dažnai `;`, EN — `,`).
 * Renkamasi variantas, kuris antraštėje duoda daugiausia ne tuščių stulpelių.
 */
export function resolveManualImportDelimiter(text: string): string {
  const sample = headSample(text);
  const line = firstNonEmptyLine(sample);
  const candidates = [guessDelimiterFromFirstLine(line), ";", ",", "\t"];
  const seen = new Set<string>();
  let best = ",";
  let bestCount = 0;
  for (const d of candidates) {
    if (seen.has(d)) continue;
    seen.add(d);
    const c = fieldCount(parseWithDelimiter(sample, d).meta);
    if (c > bestCount) {
      bestCount = c;
      best = d;
    }
  }
  return best;
}

function normalizeFieldNames(fields: string[]): string[] {
  return fields
    .map((f) => f.replace(/^\ufeff/, "").trim())
    .filter((f) => f.length > 0);
}

/** Antraštės stulpeliai mapping UI (masyvas, ne vienas string). */
export function getManualImportCsvFields(text: string): { delimiter: string; fields: string[] } {
  const sample = headSample(text);
  const delimiter = resolveManualImportDelimiter(text);
  const preview = parseWithDelimiter(sample, delimiter);
  const raw = preview.meta?.fields ?? [];
  const asStrings = raw.filter((f): f is string => typeof f === "string");
  const fields = normalizeFieldNames(asStrings);
  return { delimiter, fields };
}

/** Pilnas parse serverio importui — tas pats delimiter kaip UI. */
export function parseManualImportCsvForImport(text: string): ParseResult<Record<string, unknown>> {
  const delimiter = resolveManualImportDelimiter(text);
  return parseWithDelimiter(text, delimiter);
}
