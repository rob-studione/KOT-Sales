import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { logSupabaseError } from "@/lib/supabase/supabaseErrorLog";

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function normalizeCompanyCode(raw: unknown): string {
  return String(raw ?? "")
    .trim()
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, "");
}

/**
 * Cold leads: išima rankinius kandidatus, kurių įm. kodas turi bent vieną sąskaitą.
 * Kviečiama po invoice sync su ką tik paliestais kodais (pigus diff).
 */
export async function pruneManualColdLeadsByCompanyCodes(
  supabase: SupabaseClient,
  companyCodes: string[]
): Promise<{ deleted: number }> {
  const codes = [...new Set(companyCodes.map(normalizeCompanyCode).filter(Boolean))];
  if (codes.length === 0) return { deleted: 0 };

  let deleted = 0;
  for (const part of chunk(codes, 200)) {
    const { data, error } = await supabase
      .from("project_manual_leads")
      .delete()
      .in("company_code", part)
      .select("id");
    if (error) {
      logSupabaseError("manualColdLeads.pruneByCompanyCodes", error);
      continue;
    }
    deleted += data?.length ?? 0;
  }
  return { deleted };
}

/** Ar įmonės kodas jau turi sąskaitų CRM (tada ne cold lead). */
export async function companyCodeHasInvoices(
  supabase: SupabaseClient,
  companyCode: string
): Promise<boolean> {
  const code = normalizeCompanyCode(companyCode);
  if (!code) return false;
  const { data, error } = await supabase
    .from("invoices")
    .select("invoice_id")
    .eq("company_code", code)
    .limit(1)
    .maybeSingle();
  if (error) {
    logSupabaseError("manualColdLeads.companyCodeHasInvoices", error);
    return false;
  }
  return data != null;
}
