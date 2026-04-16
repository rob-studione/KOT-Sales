import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { displayInvoiceNumberFromRow } from "@/lib/crm/invoiceDisplayNumber";
import { formatMoney } from "@/lib/crm/format";
import { parseManualLeadIdFromClientKey } from "@/lib/crm/manualLeadClientKey";
import type { CandidateExpandDetails, CandidateExpandInvoice } from "@/lib/crm/candidateExpandTypes";

export type { CandidateExpandDetails, CandidateExpandInvoice } from "@/lib/crm/candidateExpandTypes";

export async function fetchCandidateExpandDetails(
  supabase: SupabaseClient,
  clientKey: string
): Promise<CandidateExpandDetails> {
  const empty: CandidateExpandDetails = { email: null, phone: null, address: null, invoices: [] };
  if (!clientKey) return empty;

  const manualLeadId = parseManualLeadIdFromClientKey(clientKey);
  if (manualLeadId) {
    const { data: lead } = await supabase
      .from("project_manual_leads")
      .select("email,phone,notes")
      .eq("id", manualLeadId)
      .maybeSingle();
    if (lead) {
      return {
        email: lead.email != null && String(lead.email).trim() !== "" ? String(lead.email).trim() : null,
        phone: lead.phone != null && String(lead.phone).trim() !== "" ? String(lead.phone).trim() : null,
        address: null,
        invoices: [],
      };
    }
    return empty;
  }

  const { data: summary } = await supabase
    .from("v_client_list_from_invoices")
    .select("company_code,client_id,email,phone,address")
    .eq("client_key", clientKey)
    .maybeSingle();

  if (!summary) return empty;

  const company_code = summary.company_code as string | null | undefined;
  const client_id = summary.client_id as string | null | undefined;

  let q = supabase
    .from("invoices")
    .select("invoice_id,invoice_number,series_title,series_number,invoice_date,amount")
    .order("invoice_date", { ascending: false })
    .order("invoice_id", { ascending: false })
    .limit(5);

  if (company_code != null && String(company_code).trim() !== "") {
    q = q.eq("company_code", String(company_code).trim());
  } else if (client_id != null && String(client_id).trim() !== "") {
    q = q.eq("client_id", String(client_id).trim()).is("company_code", null);
  } else {
    q = q.is("company_code", null).is("client_id", null);
  }

  const { data: inv } = await q;

  const invoices: CandidateExpandInvoice[] = (inv ?? []).map((row) => ({
    invoice_id: String(row.invoice_id),
    label: displayInvoiceNumberFromRow({
      invoice_id: String(row.invoice_id),
      invoice_number: row.invoice_number as string | null,
      series_title: row.series_title as string | null,
      series_number: row.series_number as number | null,
    }),
    invoice_date:
      typeof row.invoice_date === "string"
        ? row.invoice_date.slice(0, 10)
        : String(row.invoice_date ?? "").slice(0, 10),
    amount: formatMoney(row.amount),
  }));

  return {
    email: (summary.email as string | null)?.trim() || null,
    phone: (summary.phone as string | null)?.trim() || null,
    address: (summary.address as string | null)?.trim() || null,
    invoices,
  };
}
