/**
 * Shared helpers for Neksar TMS `GET /api/external/v1/client-invoices`.
 * Maps Neksar client invoices onto the existing `public.invoices` columns so the
 * new source reuses the same table, UI and KPIs as the legacy Invoice123 sync.
 *
 * Dedup during cutover is by invoice NUMBER (not id), because the same invoice
 * has a different id in Invoice123 vs Neksar. See number key helpers below.
 * @see docs/KOT_CLOUD_INVOICE_SYNC_API_HANDOFF.md
 */

import { SYNTHETIC_COMPANY_CODE_PREFIX } from "@/lib/crm/company-code";
import type { NeksarClientInvoice, NeksarListResponse } from "@/lib/neksar/types";

export const NEKSAR_API_BASE_URL_DEFAULT = "https://clouds.kingsoftranslation.com";
export const NEKSAR_CLIENT_INVOICES_PATH = "/api/external/v1/client-invoices";

/** LT billing entity (Vertimų karaliai, UAB — EUR). Confirmed live 2026-07-27. */
export const NEKSAR_LT_BILLING_ENTITY_ID = "cmokpmdqi0001bmzhcpctahsq";

export const NEKSAR_DEFAULT_STATUSES = "SENT,PAID,OVERDUE";
export const NEKSAR_PAGE_LIMIT_MAX = 100;

type AnyRecord = Record<string, unknown>;

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

/** UTC calendar date (YYYY-MM-DD) from an ISO datetime; stable across systems. */
export function toISODate(value: unknown): string | null {
  const s = asString(value);
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function issuerFingerprint(normalized: string): string {
  let h = 5381;
  for (let i = 0; i < normalized.length; i++) h = Math.imul(h, 33) ^ normalized.charCodeAt(i);
  let h2 = 52711;
  for (let i = 0; i < normalized.length; i++) h2 = Math.imul(h2, 31) ^ normalized.charCodeAt(i);
  return (
    (h >>> 0).toString(16).padStart(8, "0") + (h2 >>> 0).toString(16).padStart(8, "0")
  ).slice(0, 16);
}

/** Non-null company code for aggregation; mirrors Invoice123 `resolveEffectiveCompanyCode`. */
export function resolveNeksarCompanyCode(opts: {
  rawCode: string | null;
  clientId: string | null;
  nameNormalized: string | null;
  invoiceId: string;
}): string {
  const rc = (opts.rawCode ?? "").trim();
  if (rc.length > 0 && rc.toUpperCase() !== "UNKNOWN") return rc;
  const cid = (opts.clientId ?? "").trim();
  if (cid.length > 0) return `${SYNTHETIC_COMPANY_CODE_PREFIX}${cid}`;
  const nm = opts.nameNormalized;
  if (nm && nm.length > 0) return `${SYNTHETIC_COMPANY_CODE_PREFIX}TXT_${issuerFingerprint(nm)}`;
  return `${SYNTHETIC_COMPANY_CODE_PREFIX}INV_${opts.invoiceId}`;
}

/**
 * Parse Neksar `number` (single string, e.g. `VK-00029674`, `INV-9001`, `KR-9001`).
 * - `series_title`: non-digit prefix (e.g. `VK-`).
 * - `series_number`: trailing integer (leading zeros dropped: `00029674` -> 29674).
 */
export function parseNeksarNumber(raw: string | null | undefined): {
  series_title: string | null;
  series_number: number | null;
} {
  const s = (raw ?? "").trim();
  if (!s) return { series_title: null, series_number: null };
  const m = s.match(/^(.*?)(\d+)\s*$/);
  if (!m) return { series_title: s, series_number: null };
  const title = m[1].trim();
  const n = parseInt(m[2], 10);
  return {
    series_title: title.length > 0 ? title : null,
    series_number: Number.isFinite(n) ? n : null,
  };
}

/** Uppercase letters of a series title (`VK-000` -> `VK`, `INV-` -> `INV`). */
export function seriesLetters(seriesTitle: string | null | undefined): string {
  const m = (seriesTitle ?? "").match(/[A-Za-z]+/);
  return m ? m[0].toUpperCase() : "";
}

/**
 * Cross-source dedup key: `<SERIES_LETTERS>:<number>`. The same invoice keeps this
 * key whether it came from Invoice123 (`VK-000` + 29674) or Neksar (`VK-00029674`).
 */
export function invoiceNumberKey(seriesTitle: string | null | undefined, seriesNumber: number | null): string | null {
  if (seriesNumber == null) return null;
  return `${seriesLetters(seriesTitle)}:${seriesNumber}`;
}

/** Canonical CRM row — matches `public.invoices` columns. */
export type MappedNeksarRow = {
  invoice_id: string;
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
  /** Be PVM (Neksar `subtotal`). */
  amount_net: number | null;
  tax_amount: number | null;
  tax_rate: number | null;
  series_title: string | null;
  series_number: number | null;
  updated_at: string;
};

export function parseNeksarListJson(json: unknown): {
  invoices: NeksarClientInvoice[];
  pagination: NeksarListResponse["pagination"] | null;
} {
  const root = isRecord(json) ? json : null;
  const arr = root && Array.isArray(root.data) ? (root.data as unknown[]) : [];
  const invoices = arr.filter((x) => isRecord(x)) as NeksarClientInvoice[];
  const pag = root && isRecord(root.pagination) ? (root.pagination as AnyRecord) : null;
  const pagination = pag
    ? {
        page: asNumber(pag.page) ?? 1,
        limit: asNumber(pag.limit) ?? 0,
        total: asNumber(pag.total) ?? 0,
        totalPages: asNumber(pag.totalPages) ?? 0,
      }
    : null;
  return { invoices, pagination };
}

export type NeksarMapSkipReason =
  | "not_standard"
  | "imported"
  | "non_eur"
  | "missing_id"
  | "missing_date"
  | "missing_total";

export type NeksarMapResult =
  | { ok: true; row: MappedNeksarRow }
  | { ok: false; reason: NeksarMapSkipReason; invoiceId: string | null; number: string | null };

function roundMoney2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Suma be PVM iš Neksar laukų.
 * Prioritetas: `subtotal` → `total − taxAmount` → jei `taxRate === 0` — `total`
 * → jei žinomas tarifas — `total / (1 + rate/100)` → kitaip null (UI/KPI fallback /1.21).
 */
export function resolveNeksarAmountNet(opts: {
  total: number;
  subtotal: number | null;
  taxAmount: number | null;
  taxRate: number | null;
}): number | null {
  if (opts.subtotal != null) return roundMoney2(opts.subtotal);
  if (opts.taxAmount != null) return roundMoney2(opts.total - opts.taxAmount);
  if (opts.taxRate === 0) return roundMoney2(opts.total);
  if (opts.taxRate != null && opts.taxRate > 0) {
    return roundMoney2(opts.total / (1 + opts.taxRate / 100));
  }
  return null;
}

/**
 * Map one Neksar invoice to a `public.invoices` row, applying KOT Sales scope rules:
 * only issued STANDARD invoices, native (not migrated) and EUR.
 */
export function mapNeksarInvoice(inv: NeksarClientInvoice): NeksarMapResult {
  const invoiceId = asString(inv.id)?.trim() ?? null;
  const number = asString(inv.number)?.trim() ?? null;

  if ((asString(inv.docType) ?? "").toUpperCase() !== "STANDARD") {
    return { ok: false, reason: "not_standard", invoiceId, number };
  }
  if (inv.importedAt != null) {
    return { ok: false, reason: "imported", invoiceId, number };
  }
  const currency = (asString(inv.currency) ?? "EUR").toUpperCase();
  if (currency !== "EUR") {
    return { ok: false, reason: "non_eur", invoiceId, number };
  }
  if (!invoiceId) {
    return { ok: false, reason: "missing_id", invoiceId, number };
  }
  const invoiceDate = toISODate(inv.issuedAt);
  if (!invoiceDate) {
    return { ok: false, reason: "missing_date", invoiceId, number };
  }
  const amount = asNumber(inv.total);
  if (amount == null || !Number.isFinite(amount)) {
    return { ok: false, reason: "missing_total", invoiceId, number };
  }

  const tax_amount = asNumber(inv.taxAmount);
  const tax_rate = asNumber(inv.taxRate);
  const amount_net = resolveNeksarAmountNet({
    total: amount,
    subtotal: asNumber(inv.subtotal),
    taxAmount: tax_amount,
    taxRate: tax_rate,
  });

  const { series_title, series_number } = parseNeksarNumber(number);

  const clientCompany = asString(inv.clientCompany)?.trim() ?? null;
  const clientName = asString(inv.clientName)?.trim() ?? null;
  const rawName = clientCompany && clientCompany.length > 0 ? clientCompany : clientName;
  const company_name = (() => {
    const n = rawName?.trim();
    if (!n || n.toUpperCase() === "UNKNOWN") return "";
    return n;
  })();

  const rawCode =
    asString(inv.buyerRegistrationNo)?.trim() ?? asString(inv.buyerPersonalCode)?.trim() ?? null;
  const client_id = asString(inv.clientId)?.trim() ?? null;
  const nameNormalized = rawName ? rawName.replace(/\s+/g, " ").trim().toLowerCase() : null;
  const company_code = resolveNeksarCompanyCode({
    rawCode,
    clientId: client_id,
    nameNormalized,
    invoiceId,
  });

  const address = (() => {
    const parts = [
      asString(inv.buyerAddress)?.trim(),
      asString(inv.buyerCity)?.trim(),
      asString(inv.buyerPostalCode)?.trim(),
      asString(inv.buyerCountry)?.trim(),
    ].filter((p): p is string => Boolean(p && p.length > 0));
    return parts.length > 0 ? parts.join(", ") : null;
  })();

  return {
    ok: true,
    row: {
      invoice_id: invoiceId,
      invoice_number: number ?? invoiceId,
      client_id,
      company_name,
      company_code,
      vat_code: asString(inv.buyerVatNo)?.trim() ?? null,
      address,
      email: asString(inv.buyerEmail)?.trim() ?? null,
      phone: asString(inv.buyerPhone)?.trim() ?? null,
      invoice_date: invoiceDate,
      amount,
      amount_net,
      tax_amount,
      tax_rate,
      series_title,
      series_number,
      updated_at: new Date().toISOString(),
    },
  };
}

export function buildNeksarListUrl(opts: {
  baseUrl: string;
  page: number;
  limit?: number;
  statuses?: string;
  billingEntityId?: string | null;
  updatedSince?: string | null;
  issuedFrom?: string | null;
}): string {
  const base = opts.baseUrl.replace(/\/$/, "");
  const u = new URL(`${base}${NEKSAR_CLIENT_INVOICES_PATH}`);
  u.searchParams.set("page", String(Math.max(1, opts.page)));
  u.searchParams.set("limit", String(Math.min(NEKSAR_PAGE_LIMIT_MAX, Math.max(1, opts.limit ?? NEKSAR_PAGE_LIMIT_MAX))));
  if (opts.statuses) u.searchParams.set("status", opts.statuses);
  if (opts.billingEntityId) u.searchParams.set("billingEntityId", opts.billingEntityId);
  if (opts.updatedSince) u.searchParams.set("updatedSince", opts.updatedSince);
  if (opts.issuedFrom) u.searchParams.set("issuedFrom", opts.issuedFrom);
  return u.toString();
}
