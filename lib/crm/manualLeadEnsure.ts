import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeExpressCompanyCode } from "@/lib/crm/expressProcurementRecipient";

/** Tie patys laukai kaip `createManualProjectLeadAction` insert. */
export function manualLeadInsertPayload(input: {
  projectId: string;
  companyName: string;
  companyCode?: string | null;
  email?: string | null;
  phone?: string | null;
  contactName?: string | null;
  notes?: string | null;
}) {
  const companyCode = normalizeExpressCompanyCode(input.companyCode);
  return {
    project_id: input.projectId,
    company_name: input.companyName.trim(),
    company_code: companyCode || null,
    email: input.email?.trim() ? input.email.trim() : null,
    phone: input.phone?.trim() ? input.phone.trim() : null,
    contact_name: input.contactName?.trim() ? input.contactName.trim() : null,
    notes: input.notes?.trim() ? input.notes.trim() : null,
    crm_status: "new_lead" as const,
    last_order_at: null,
  };
}

function isUniqueViolation(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  if (error.code === "23505") return true;
  return /duplicate key|unique constraint/i.test(error.message ?? "");
}

/**
 * Tikslus lead pagal `(project_id, normalizuotas company_code)`.
 * Pavadinimu ir kituose projektuose neieško — unique indeksas yra per projektą.
 */
export async function findManualLeadIdByCompanyCode(
  supabase: SupabaseClient,
  input: { projectId: string; companyCode: string }
): Promise<string | null> {
  const companyCode = normalizeExpressCompanyCode(input.companyCode);
  const projectId = String(input.projectId ?? "").trim();
  if (!projectId || !companyCode) return null;

  const { data, error } = await supabase
    .from("project_manual_leads")
    .select("id")
    .eq("project_id", projectId)
    .eq("company_code", companyCode)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.id ? String(data.id) : null;
}

/**
 * Idempotentinis lead kūrimas pagal `(project_id, company_code)`.
 * Lygiagretūs insertai krenta į unique indeksą ir grąžina esamą eilutę.
 */
export async function ensureManualLeadByCompanyCode(
  supabase: SupabaseClient,
  input: {
    projectId: string;
    companyName: string;
    companyCode: string;
    email?: string | null;
    phone?: string | null;
    contactName?: string | null;
    notes?: string | null;
  }
): Promise<{ id: string; created: boolean }> {
  const projectId = String(input.projectId ?? "").trim();
  const companyName = input.companyName.trim();
  const companyCode = normalizeExpressCompanyCode(input.companyCode);
  if (!projectId) throw new Error("Neteisingas projektas.");
  if (!companyName) throw new Error("Įveskite įmonės pavadinimą.");
  if (!companyCode) throw new Error("Trūksta įmonės kodo.");

  const existing = await findManualLeadIdByCompanyCode(supabase, { projectId, companyCode });
  if (existing) return { id: existing, created: false };

  const { data, error } = await supabase
    .from("project_manual_leads")
    .insert(manualLeadInsertPayload({ ...input, projectId, companyName, companyCode }))
    .select("id")
    .single();

  if (error && isUniqueViolation(error)) {
    const raced = await findManualLeadIdByCompanyCode(supabase, { projectId, companyCode });
    if (raced) return { id: raced, created: false };
    throw new Error(error.message);
  }
  if (error || !data) throw new Error(error?.message ?? "Nepavyko išsaugoti kandidato.");
  return { id: String(data.id), created: true };
}
