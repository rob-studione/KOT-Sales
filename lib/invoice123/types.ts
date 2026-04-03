/**
 * Saskaita123 / Invoice123 — nested `client` on invoice (OpenAPI `Invoices` → `client`).
 * DB stores the same semantics under `company_*` on `invoices` / `companies`.
 * @see https://app.invoice123.com/docs/definitions/openapi.1_0.json
 */
export type Invoice123Client = {
  id?: string | null;
  client_id?: string | null;
  name?: string | null;
  code?: string | null;
  vat_code?: string | null;
  address?: string | null;
  email?: string | null;
  phone?: string | null;
};
