import { isSyntheticCompanyCode } from "@/lib/crm/company-code";

export function toNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function formatMoney(value: unknown): string {
  const n = toNumber(value);
  if (n === null) return "—";
  return new Intl.NumberFormat("lt-LT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(n);
}

export function formatDate(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value !== "string") return "—";
  if (!value) return "—";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("lt-LT");
}

/** Display name from latest invoice client snapshot; company_name stays visible when code is missing. */
export function displayClientName(
  company_name: string | null | undefined,
  company_code: string | null | undefined
): string {
  const name = (company_name ?? "").trim();
  const cc = (company_code ?? "").trim();
  if (name && name.toUpperCase() !== "UNKNOWN") return name;
  if (isSyntheticCompanyCode(cc)) return "—";
  const numericOnly = /^\d+$/.test(cc);
  if (!numericOnly && cc && cc.toUpperCase() !== "UNKNOWN") return cc;
  return "—";
}

/** Clients / invoices lists — missing code. */
export function formatCompanyCodeList(company_code: string | null | undefined): string {
  const c = (company_code ?? "").trim();
  if (!c || c.toUpperCase() === "UNKNOWN" || isSyntheticCompanyCode(c)) return "—";
  return c;
}

/** Detail view — missing code. */
export function formatCompanyCodeDetail(company_code: string | null | undefined): string {
  const c = (company_code ?? "").trim();
  if (!c || c.toUpperCase() === "UNKNOWN" || isSyntheticCompanyCode(c)) return "—";
  return c;
}
