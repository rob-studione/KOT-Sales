import type { SupabaseClient } from "@supabase/supabase-js";
import { VAT_INVOICE_SERIES_TITLE_ILIKE } from "@/lib/crm/vatInvoiceListFilter";

const BATCH = 1000;

/**
 * Bendra PVM sąskaitų (VK-%) suma, kai RPC `vat_invoices_kpis` neprieinamas.
 * Naudoja tik `select("amount")` be agregatų — suderinama su PostgREST be `amount.sum()`.
 */
export async function sumVatInvoiceAmounts(supabase: SupabaseClient): Promise<number | null> {
  let from = 0;
  let total = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("invoices")
      .select("amount")
      .ilike("series_title", VAT_INVOICE_SERIES_TITLE_ILIKE)
      .not("invoice_number", "ilike", "VK-000IS%")
      .not("invoice_number", "ilike", "VK-000KR%")
      .range(from, from + BATCH - 1);

    if (error) {
      console.error("[vatInvoiceKpis] sumVatInvoiceAmounts", {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      });
      return null;
    }

    const rows = data ?? [];
    for (const r of rows) {
      const raw = r.amount;
      const n = typeof raw === "number" ? raw : Number(raw);
      if (Number.isFinite(n)) total += n;
    }
    if (rows.length < BATCH) break;
    from += BATCH;
  }
  return total;
}
