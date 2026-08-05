/**
 * Neksar TMS — Client Invoices External API (`GET /api/external/v1/client-invoices`).
 * Read-only shape we depend on. Full field list documented by Neksar; only the
 * fields KOT Sales actually maps are typed strictly here, the rest stay optional.
 * @see docs/KOT_CLOUD_INVOICE_SYNC_API_HANDOFF.md
 */

export type NeksarDocType = "STANDARD" | "CREDIT" | "PROFORMA";
export type NeksarStatus = "DRAFT" | "SENT" | "PAID" | "OVERDUE" | "CANCELLED";

export type NeksarClientInvoice = {
  id: string;
  number: string | null;
  status: NeksarStatus | string;
  docType: NeksarDocType | string;
  billingEntityId: string | null;

  /** Import provenance — migrated Saskaita123 rows have these populated. */
  sourceProvider: string | null;
  sourceInvoiceId: string | null;
  importedAt: string | null;

  issuedAt: string | null;
  updatedAt: string | null;

  currency: string | null;
  total: string | number | null;
  /** Net before VAT (preferred for CRM display). */
  subtotal?: string | number | null;
  taxAmount?: string | number | null;
  /** Percent, e.g. 21 or 0. */
  taxRate?: string | number | null;
  vatClassCode?: string | null;

  clientId: string | null;
  clientName: string | null;
  clientCompany: string | null;

  buyerRegistrationNo: string | null;
  buyerPersonalCode: string | null;
  buyerVatNo: string | null;
  buyerEmail: string | null;
  buyerPhone: string | null;
  buyerAddress: string | null;
  buyerCity: string | null;
  buyerPostalCode: string | null;
  buyerCountry: string | null;

  [key: string]: unknown;
};

export type NeksarListResponse = {
  data: NeksarClientInvoice[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};
