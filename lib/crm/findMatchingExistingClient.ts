import type { SupabaseClient } from "@supabase/supabase-js";

export type ExistingClientMatch = {
  client_key: string;
  company_name: string;
  company_code: string | null;
  client_id: string | null;
  email: string | null;
};

type ViewRow = {
  client_key: string;
  company_code: string | null;
  client_id: string | null;
  company_name: string | null;
  email: string | null;
};

function normalizeRow(r: ViewRow): ExistingClientMatch {
  return {
    client_key: String(r.client_key ?? ""),
    company_name: String(r.company_name ?? "").trim() || "—",
    company_code: r.company_code != null && String(r.company_code).trim() !== "" ? String(r.company_code).trim() : null,
    client_id: r.client_id != null && String(r.client_id).trim() !== "" ? String(r.client_id).trim() : null,
    email: r.email != null && String(r.email).trim() !== "" ? String(r.email).trim() : null,
  };
}

/**
 * Pirmas etapas: tikslus match pagal įmonės kodą (arba client_id, jei įvesta kaip identifikatorius),
 * tada pagal el. paštą (case-insensitive).
 */
export async function findMatchingExistingClient(
  supabase: SupabaseClient,
  input: { companyCode: string | null; email: string | null }
): Promise<ExistingClientMatch | null> {
  const codeRaw = input.companyCode?.trim() ?? "";
  const emailRaw = input.email?.trim() ?? "";

  if (codeRaw) {
    const { data: byCode, error: e1 } = await supabase
      .from("v_client_list_from_invoices")
      .select("client_key,company_code,client_id,company_name,email")
      .eq("company_code", codeRaw)
      .maybeSingle();

    if (!e1 && byCode) {
      return normalizeRow(byCode as ViewRow);
    }

    const { data: byClientId, error: e2 } = await supabase
      .from("v_client_list_from_invoices")
      .select("client_key,company_code,client_id,company_name,email")
      .eq("client_id", codeRaw)
      .maybeSingle();

    if (!e2 && byClientId) {
      return normalizeRow(byClientId as ViewRow);
    }
  }

  if (emailRaw) {
    const { data: rows, error: e3 } = await supabase
      .from("v_client_list_from_invoices")
      .select("client_key,company_code,client_id,company_name,email")
      .ilike("email", emailRaw)
      .limit(2);

    if (e3 || !rows?.length) return null;
    if (rows.length > 1) {
      const exact = rows.find((r) => String((r as ViewRow).email ?? "").trim().toLowerCase() === emailRaw.toLowerCase());
      return normalizeRow((exact ?? rows[0]) as ViewRow);
    }
    return normalizeRow(rows[0] as ViewRow);
  }

  return null;
}
