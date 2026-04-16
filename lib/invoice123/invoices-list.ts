/** Shared helpers for Invoice123 GET /api/v1.0/invoices list responses. */

import { resolveInvoiceNumber } from "@/lib/crm/invoiceDisplayNumber";
import { SYNTHETIC_COMPANY_CODE_PREFIX } from "@/lib/crm/company-code";

export type AnyRecord = Record<string, unknown>;

export function isRecord(v: unknown): v is AnyRecord {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

export function asString(v: unknown): string | null {
  if (typeof v === "string") return v;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}

export function asNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function looksLikeNumericCompanyCode(s: string): boolean {
  return /^\d+$/.test(s.trim());
}

export function toISODate(value: unknown): string | null {
  const s = asString(value);
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

export const INVOICES_LIST_BASE = "https://app.invoice123.com/api/v1.0/invoices";

function issuerFingerprint(normalizedIssuedTo: string): string {
  let h = 5381;
  for (let i = 0; i < normalizedIssuedTo.length; i++) {
    h = Math.imul(h, 33) ^ normalizedIssuedTo.charCodeAt(i);
  }
  let h2 = 52711;
  for (let i = 0; i < normalizedIssuedTo.length; i++) {
    h2 = Math.imul(h2, 31) ^ normalizedIssuedTo.charCodeAt(i);
  }
  return (
    (h >>> 0).toString(16).padStart(8, "0") + (h2 >>> 0).toString(16).padStart(8, "0")
  ).slice(0, 16);
}

/**
 * Non-null company identifier for DB aggregation (invoices.company_code / companies.company_code).
 * Prefers real `client.code`, else PERSON_<client.id>, else PERSON_TXT_<hash(issued_to)>, else PERSON_INV_<invoice_id>.
 */
export function resolveEffectiveCompanyCode(opts: {
  rawClientCode: string | null;
  clientId: string | null;
  issuedToNormalized: string | null;
  invoiceId: string;
}): string {
  const rc = (opts.rawClientCode ?? "").trim();
  if (rc.length > 0 && rc.toUpperCase() !== "UNKNOWN") {
    return rc;
  }
  const cid = (opts.clientId ?? "").trim();
  if (cid.length > 0) {
    return `${SYNTHETIC_COMPANY_CODE_PREFIX}${cid}`;
  }
  const iss = opts.issuedToNormalized;
  if (iss && iss.length > 0) {
    return `${SYNTHETIC_COMPANY_CODE_PREFIX}TXT_${issuerFingerprint(iss)}`;
  }
  return `${SYNTHETIC_COMPANY_CODE_PREFIX}INV_${opts.invoiceId}`;
}

export type MappedListInvoiceRow = {
  invoice_id: string;
  /** Human-facing number: series_title + series_number, or invoice_id when series missing. */
  invoice_number: string;
  client_id: string | null;
  company_name: string;
  company_code: string;
  vat_code: string | null;
  address: string | null;
  email: string | null;
  phone: string | null;
  invoice_date: string;
  amount: number;
  series_title: string | null;
  series_number: number | null;
  updated_at: string;
};

export function parseInvoicesListJson(json: unknown): {
  invoices: AnyRecord[];
  pagination: AnyRecord | null;
} {
  const root = isRecord(json) ? json : null;
  const dataObj = root && isRecord(root.data) ? (root.data as AnyRecord) : null;
  /** Invoice123 may return one element per invoice, or one per line item (same invoice repeated with different line `id`). */
  const resultArr = dataObj && Array.isArray(dataObj.result) ? (dataObj.result as unknown[]) : [];
  const invoices = resultArr.filter((x) => isRecord(x)) as AnyRecord[];
  const pagination =
    dataObj && isRecord((dataObj as AnyRecord).pagination)
      ? ((dataObj as AnyRecord).pagination as AnyRecord)
      : null;
  return { invoices, pagination };
}

/**
 * Flatten list rows to a single invoice-shaped object for mapping.
 * - Nested `invoice` document (line row): merge so `id` / `total` / `date` come from the invoice.
 * - Flat line row: `invoice_id` / `invoiceId` may reference the invoice while `id` is a line id — coerce `id` to that invoice id.
 */
export function normalizeInvoice123ListRow(inv: AnyRecord): AnyRecord {
  const nested = isRecord(inv.invoice) ? (inv.invoice as AnyRecord) : null;
  if (nested) {
    return {
      ...inv,
      ...nested,
      client: nested.client ?? inv.client,
      issued_to: nested.issued_to ?? inv.issued_to,
      issuedTo: nested.issuedTo ?? inv.issuedTo,
    };
  }
  const invId = asString(inv.invoice_id)?.trim() ?? asString(inv.invoiceId)?.trim() ?? null;
  if (invId) {
    return { ...inv, id: invId };
  }
  return inv;
}

/**
 * Combine multiple mapped rows that share the same `invoice_id` (duplicate headers or line items).
 * If every `amount` matches, keep one copy; otherwise sum (line-level totals).
 */
export function mergeInvoiceRowGroup(group: MappedListInvoiceRow[]): MappedListInvoiceRow {
  if (group.length === 1) return group[0];
  const amounts = group.map((g) => g.amount);
  const allSame = amounts.every((a) => a === amounts[0]);
  const amount = allSame ? amounts[0] : amounts.reduce((s, a) => s + a, 0);
  return { ...group[0], amount };
}

export function mergeMappedRowsByInvoiceId(rows: MappedListInvoiceRow[]): MappedListInvoiceRow[] {
  const groups = new Map<string, MappedListInvoiceRow[]>();
  for (const r of rows) {
    const arr = groups.get(r.invoice_id) ?? [];
    arr.push(r);
    groups.set(r.invoice_id, arr);
  }
  return Array.from(groups.values()).map((g) => mergeInvoiceRowGroup(g));
}

export function resolveInvoicesListNextUrl(nextFromApi: string): string {
  const u = nextFromApi;
  if (/^https?:\/\//i.test(u)) return u;
  if (u.startsWith("/?")) return `${INVOICES_LIST_BASE}${u.slice(1)}`;
  if (u.startsWith("?")) return `${INVOICES_LIST_BASE}${u}`;
  if (u.startsWith("/")) return new URL(u, INVOICES_LIST_BASE).toString();
  return new URL(u, INVOICES_LIST_BASE).toString();
}

export function mapInvoiceListItems(invoices: AnyRecord[]): {
  rows: MappedListInvoiceRow[];
  pageErrors: string[];
  /** Raw `data.result` length before per-invoice merge (API may return line-level rows). */
  inputRowCount: number;
} {
  const pageErrors: string[] = [];
  const inputRowCount = invoices.length;
  const rows = invoices
    .map((raw) => {
      const inv = normalizeInvoice123ListRow(raw);
      const invoiceId = asString(inv.id)?.trim() ?? null;
      const invoiceDate = toISODate(inv.date) ?? null;
      const amount = asNumber(inv.total) ?? null;

      if (!invoiceId) {
        pageErrors.push("Missing invoice id");
        return null;
      }
      if (!invoiceDate) {
        pageErrors.push(`Missing/invalid date for invoice ${invoiceId}`);
        return null;
      }
      if (amount === null || !Number.isFinite(amount)) {
        pageErrors.push(`Missing/invalid total for invoice ${invoiceId}`);
        return null;
      }

      const issuedTo =
        asString(inv.issued_to)?.trim() ??
        asString((inv as AnyRecord).issuedTo)?.trim() ??
        null;

      let clientObj = isRecord(inv.client) ? (inv.client as AnyRecord) : null;
      if (!clientObj) {
        if (!issuedTo) {
          pageErrors.push(`Missing client and issued_to for invoice ${invoiceId}`);
          return null;
        }
        clientObj = { name: issuedTo.replace(/\s+/g, " ").trim().slice(0, 200) };
      }

      const rawCompanyCode = asString(clientObj.code)?.trim() ?? null;
      let companyName: string | null =
        asString(clientObj.name)?.trim() ?? issuedTo ?? null;
      if (!companyName && rawCompanyCode && !looksLikeNumericCompanyCode(rawCompanyCode)) {
        companyName = rawCompanyCode;
      }
      const company_name = (() => {
        const n = companyName?.trim();
        if (!n || n.toUpperCase() === "UNKNOWN") return "";
        return n;
      })();

      const vat_code =
        asString(clientObj.vat_code)?.trim() ?? asString((clientObj as AnyRecord).vatCode)?.trim() ?? null;
      const address = asString(clientObj.address)?.trim() ?? null;
      const email = asString(clientObj.email)?.trim() ?? null;
      const phone = asString(clientObj.phone)?.trim() ?? null;
      const client_id =
        asString(clientObj.id)?.trim() ??
        asString(clientObj.client_id)?.trim() ??
        asString((clientObj as AnyRecord).clientId)?.trim() ??
        asString(inv.client_id)?.trim() ??
        asString((inv as AnyRecord).clientId)?.trim() ??
        null;

      const issuedToNormalized = issuedTo
        ? issuedTo
            .replace(/\s+/g, " ")
            .trim()
            .toLowerCase()
        : null;

      const company_code = resolveEffectiveCompanyCode({
        rawClientCode: rawCompanyCode,
        clientId: client_id,
        issuedToNormalized,
        invoiceId,
      });

      const series_title =
        asString(inv.series_title)?.trim() ??
        asString((inv as AnyRecord).seriesTitle)?.trim() ??
        asString(inv.series)?.trim() ??
        asString((inv as AnyRecord).series)?.trim() ??
        null;
      const seriesNumRaw = asNumber(inv.series_number) ?? asNumber((inv as AnyRecord).seriesNumber);
      const series_number =
        seriesNumRaw != null && Number.isFinite(seriesNumRaw) ? Math.trunc(seriesNumRaw) : null;

      const invoice_number = resolveInvoiceNumber(series_title, series_number, invoiceId);

      return {
        invoice_id: invoiceId,
        invoice_number,
        client_id,
        company_name,
        company_code,
        vat_code,
        address,
        email,
        phone,
        invoice_date: invoiceDate,
        amount,
        series_title,
        series_number,
        updated_at: new Date().toISOString(),
      };
    })
    .filter((x): x is MappedListInvoiceRow => Boolean(x));

  const merged = mergeMappedRowsByInvoiceId(rows);
  return { rows: merged, pageErrors, inputRowCount };
}

export function buildInvoicesListUrl(opts: {
  page: number;
  limit?: number;
  rangeStart?: string;
  rangeEnd?: string;
}): string {
  const u = new URL(INVOICES_LIST_BASE);
  u.searchParams.set("page", String(Math.max(1, opts.page)));
  u.searchParams.set("limit", String(opts.limit ?? 50));
  if (opts.rangeStart && opts.rangeEnd) {
    u.searchParams.set("range", `${opts.rangeStart},${opts.rangeEnd}`);
  }
  return u.toString();
}
