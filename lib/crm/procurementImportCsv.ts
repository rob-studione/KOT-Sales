import type { ParseResult } from "papaparse";
import { parseManualImportCsvForImport, resolveManualImportDelimiter } from "@/lib/crm/manualImportCsv";
import Papa from "papaparse";

/** Oficialūs antraštės pavadinimai (Google Sheets / LT). */
export const PROCUREMENT_CSV_CANONICAL_HEADERS = {
  contractUid: "Sutarties unikalus ID",
  contractNumber: "Sutarties numeris",
  contractObject: "Sutarties objektas",
  organizationName: "Perkančioji organizacija",
  organizationCode: "Perkančiosios organizacijos kodas",
  supplier: "Tiekėjas (-ai)",
  value: "Vertė",
  validUntil: "Galiojimo data",
  type: "Tipas",
} as const;

function normHeader(s: string): string {
  return s.replace(/^\ufeff/, "").trim().toLowerCase().replace(/\s+/g, " ");
}

/** Langelis iš Sheets (įskaitant neįtraukiamus tarpus). */
export function cleanCsvCell(raw: unknown): string {
  return String(raw ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Randa stulpelį pagal kelis galimus pavadinimus (normalizuota). */
function pickColumn(row: Record<string, unknown>, candidates: string[]): string {
  const keys = Object.keys(row);
  const map = new Map<string, string>();
  for (const k of keys) {
    map.set(normHeader(k), k);
  }
  for (const c of candidates) {
    const hit = map.get(normHeader(c));
    if (hit) return hit;
  }
  return "";
}

export type ProcurementCsvMappedRow = {
  import_dedupe_key: string;
  contract_uid: string;
  contract_number: string;
  contract_object: string;
  organization_name: string;
  organization_code: string;
  supplier: string;
  value: number | null;
  valid_until: string;
  type: string;
};

export type ProcurementCsvParseIssue = { line: number; message: string };

/**
 * Unikalumas projekte:
 * - jei yra `contract_uid` → naudoti tik jį
 * - jei nėra `contract_uid` → organization_code + contract_number
 *
 * Sąmoningai nėra fallback pagal objektą / datą, kad skirtingos sutartys nebūtų sujungiamos.
 */
export function computeProcurementImportDedupeKey(input: {
  contract_uid: string;
  organization_code: string;
  contract_number: string;
}): string | null {
  const uid = input.contract_uid.trim();
  if (uid) return uid;

  const code = input.organization_code.trim();
  if (!code) return null;
  const num = input.contract_number.trim();
  if (!num) return null;
  return `${code}|${num}`;
}

/** LT skaičiai: tuščia → null; kablelis (217,95) → numeric. */
export function parseProcurementNumeric(raw: string): number | null {
  const s = raw.replace(/\s/g, "").replace(/\u00a0/g, "").trim();
  if (!s) return null;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  let normalized = s;
  if (lastComma > lastDot) {
    normalized = s.replace(/\./g, "").replace(",", ".");
  } else if (lastDot > lastComma) {
    normalized = s.replace(/,/g, "");
  } else if (lastComma >= 0) {
    normalized = s.replace(",", ".");
  }
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

/** Grąžina YYYY-MM-DD arba tuščią. */
export function parseProcurementDate(raw: string): string {
  const s = cleanCsvCell(raw);
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(s);
  if (m) {
    const d = m[1]!.padStart(2, "0");
    const mo = m[2]!.padStart(2, "0");
    const y = m[3]!;
    return `${y}-${mo}-${d}`;
  }
  const t = Date.parse(s);
  if (!Number.isNaN(t)) {
    const d = new Date(t);
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, "0");
    const da = String(d.getDate()).padStart(2, "0");
    return `${y}-${mo}-${da}`;
  }
  return "";
}

export function resolveProcurementCsvColumnKeys(
  sampleRow: Record<string, unknown>
): Record<keyof typeof PROCUREMENT_CSV_CANONICAL_HEADERS, string> {
  return {
    contractUid: pickColumn(sampleRow, [
      PROCUREMENT_CSV_CANONICAL_HEADERS.contractUid,
      "Sutarties unikalus id",
    ]),
    contractNumber: pickColumn(sampleRow, [PROCUREMENT_CSV_CANONICAL_HEADERS.contractNumber]),
    contractObject: pickColumn(sampleRow, [PROCUREMENT_CSV_CANONICAL_HEADERS.contractObject]),
    organizationName: pickColumn(sampleRow, [PROCUREMENT_CSV_CANONICAL_HEADERS.organizationName]),
    organizationCode: pickColumn(sampleRow, [PROCUREMENT_CSV_CANONICAL_HEADERS.organizationCode]),
    supplier: pickColumn(sampleRow, [
      PROCUREMENT_CSV_CANONICAL_HEADERS.supplier,
      "Tiekėjas",
      "Tiekėjai",
    ]),
    value: pickColumn(sampleRow, [PROCUREMENT_CSV_CANONICAL_HEADERS.value]),
    validUntil: pickColumn(sampleRow, [PROCUREMENT_CSV_CANONICAL_HEADERS.validUntil]),
    type: pickColumn(sampleRow, [PROCUREMENT_CSV_CANONICAL_HEADERS.type]),
  };
}

export function parseProcurementImportCsv(text: string): ParseResult<Record<string, unknown>> {
  return parseManualImportCsvForImport(text);
}

/** Antraštės eilutė be pilno parse (UI). */
export function getProcurementImportCsvFields(text: string): { delimiter: string; fields: string[] } {
  const delimiter = resolveManualImportDelimiter(text);
  const head = text.length > 65536 ? text.slice(0, 65536) : text;
  const preview = Papa.parse<Record<string, unknown>>(head, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
    delimiter,
  });
  const raw = preview.meta?.fields ?? [];
  const fields = raw
    .filter((f): f is string => typeof f === "string")
    .map((f) => f.replace(/^\ufeff/, "").trim())
    .filter((f) => f.length > 0);
  return { delimiter, fields };
}

function isEffectivelyEmptyRow(parts: {
  organization_code: string;
  contract_number: string;
  contract_object: string;
  organization_name: string;
  supplier: string;
  valueRaw: string;
  validUntilRaw: string;
  type: string;
  contract_uid: string;
}): boolean {
  return (
    !parts.organization_code &&
    !parts.contract_number &&
    !parts.contract_object &&
    !parts.organization_name &&
    !parts.supplier &&
    !parts.valueRaw &&
    !parts.validUntilRaw &&
    !parts.type &&
    !parts.contract_uid
  );
}

export function mapProcurementCsvRows(
  parsed: ParseResult<Record<string, unknown>>,
  keys: ReturnType<typeof resolveProcurementCsvColumnKeys>
): { rows: ProcurementCsvMappedRow[]; issues: ProcurementCsvParseIssue[] } {
  const rows: ProcurementCsvMappedRow[] = [];
  const issues: ProcurementCsvParseIssue[] = [];

  if (!keys.organizationCode) {
    issues.push({
      line: 0,
      message: `Nerastas stulpelis „${PROCUREMENT_CSV_CANONICAL_HEADERS.organizationCode}“.`,
    });
    return { rows, issues };
  }
  if (!keys.validUntil) {
    issues.push({
      line: 0,
      message: `Nerastas stulpelis „${PROCUREMENT_CSV_CANONICAL_HEADERS.validUntil}“.`,
    });
    return { rows, issues };
  }

  const data = parsed.data ?? [];
  for (let i = 0; i < data.length; i++) {
    const r = data[i] ?? {};
    const line = i + 2;

    const organization_code = keys.organizationCode ? cleanCsvCell(r[keys.organizationCode]) : "";
    const contract_number = keys.contractNumber ? cleanCsvCell(r[keys.contractNumber]) : "";
    const contract_object = keys.contractObject ? cleanCsvCell(r[keys.contractObject]) : "";
    const organization_name = keys.organizationName ? cleanCsvCell(r[keys.organizationName]) : "";
    const supplier = keys.supplier ? cleanCsvCell(r[keys.supplier]) : "";
    const valRaw = keys.value ? cleanCsvCell(r[keys.value]) : "";
    const validUntilRaw = keys.validUntil ? cleanCsvCell(r[keys.validUntil]) : "";
    const type = keys.type ? cleanCsvCell(r[keys.type]) : "";
    const contract_uid = keys.contractUid ? cleanCsvCell(r[keys.contractUid]) : "";

    if (
      isEffectivelyEmptyRow({
        organization_code,
        contract_number,
        contract_object,
        organization_name,
        supplier,
        valueRaw: valRaw,
        validUntilRaw,
        type,
        contract_uid,
      })
    ) {
      continue;
    }

    const valid_until = parseProcurementDate(validUntilRaw);
    if (!valid_until) {
      issues.push({ line, message: `Neteisinga galiojimo data: „${validUntilRaw || "—"}“.` });
      continue;
    }

    if (!organization_code) {
      issues.push({ line, message: "Trūksta perkančiosios organizacijos kodo." });
      continue;
    }

    const value = valRaw ? parseProcurementNumeric(valRaw) : null;

    const dedupe = computeProcurementImportDedupeKey({
      contract_uid,
      organization_code,
      contract_number,
    });
    if (!dedupe) {
      issues.push({
        line,
        message:
          "Nepavyko sudaryti deduplikacijos rakto: reikia „Sutarties unikalus ID“ arba („Perkančiosios organizacijos kodas“ + „Sutarties numeris“).",
      });
      continue;
    }

    rows.push({
      import_dedupe_key: dedupe,
      contract_uid,
      contract_number,
      contract_object,
      organization_name,
      organization_code,
      supplier,
      value,
      valid_until,
      type,
    });
  }
  return { rows, issues };
}
