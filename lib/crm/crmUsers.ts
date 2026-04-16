import type { SupabaseClient } from "@supabase/supabase-js";

export type CrmUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  avatar_url: string | null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidUuid(value: string): boolean {
  return UUID_RE.test(value.trim());
}

/** Inicialai rodomam vardui (2 simboliai). */
export function initialsFromDisplayName(name: string): string {
  const t = name.trim();
  if (!t) return "?";
  const parts = t.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const a = parts[0]!.charAt(0);
    const b = parts[1]!.charAt(0);
    return (a + b).toUpperCase();
  }
  return t.slice(0, 2).toUpperCase();
}

export async function fetchCrmUsers(supabase: SupabaseClient): Promise<CrmUser[]> {
  const { data, error } = await supabase
    .from("crm_users")
    .select("id, name, email, role, avatar_url")
    .order("name", { ascending: true });
  if (error) {
    if (error.code !== "PGRST205") {
      console.error("[crmUsers] fetchCrmUsers failed", error);
    }
    return [];
  }
  return (data ?? []) as CrmUser[];
}

/** Rezultatas egzistencijos patikrai — klaidos (pvz. RLS) nėra „naudotojas neegzistuoja“. */
export type CrmUserExistsResult =
  | { ok: true; exists: boolean }
  | { ok: false; code?: string; message: string; permissionDenied: boolean };

function isPermissionDeniedError(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  const code = String(error.code ?? "");
  const msg = String(error.message ?? "").toLowerCase();
  return code === "42501" || msg.includes("permission denied") || msg.includes("42501");
}

/**
 * Patikrina, ar `crm_users` eilutė su `id` egzistuoja.
 * Jei užklausa nepavyksta (pvz. RLS / teisės), grąžinama `ok: false` — negalima traktuoti kaip „nėra eilutės“.
 */
export async function crmUserExists(supabase: SupabaseClient, id: string): Promise<CrmUserExistsResult> {
  const trimmed = id.trim();
  if (!isValidUuid(trimmed)) {
    return { ok: true, exists: false };
  }

  const { data, error } = await supabase.from("crm_users").select("id").eq("id", trimmed).maybeSingle();

  if (error) {
    if (error.code !== "PGRST205") {
      console.error("[crmUsers] crmUserExists failed", error);
    }
    const message = error.message ?? "crm_users užklausa nepavyko";
    return {
      ok: false,
      code: error.code,
      message,
      permissionDenied: isPermissionDeniedError(error),
    };
  }

  return { ok: true, exists: data != null };
}

/** Vartotojui rodomas tekstas, kai egzistencijos patikra nepavyko (ne „neegzistuoja“). */
export function messageForCrmUserExistsFailure(r: Extract<CrmUserExistsResult, { ok: false }>): string {
  if (r.permissionDenied) {
    return "Nepavyko patikrinti pasirinkto naudotojo. Patikrinkite crm_users prieigas.";
  }
  return `Nepavyko patikrinti naudotojo: ${r.message}`;
}
