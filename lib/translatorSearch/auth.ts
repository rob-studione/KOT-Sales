import { hasPermission } from "@/lib/crm/permissions/check";

/** Minimal actor shape for translator-search auth (structurally compatible with CurrentCrmUser). */
export type TranslatorSearchActor = {
  id: string;
  email: string;
  role: string;
  role_is_system?: boolean;
  permissionKeys?: string[];
  first_name: string;
  last_name: string;
  phone: string | null;
  status: string;
  avatar_url: string | null;
};

export type ApiAuthFailure = { ok: false; status: 401 | 403; error: string };
export type ApiAuthSuccess = { ok: true; actor: TranslatorSearchActor };

/**
 * Pure auth decision for CRM translator-search write endpoints.
 * Testable without DB / OpenAI.
 */
export function authorizeTranslatorSearchAction(
  actor: TranslatorSearchActor | null,
  permission: "tools.translator_search.run" | "tools.translator_search.review"
): ApiAuthSuccess | ApiAuthFailure {
  if (!actor) {
    return { ok: false, status: 401, error: "Neprisijungę." };
  }
  if (!hasPermission(actor, permission)) {
    return { ok: false, status: 403, error: "Neturite teisių atlikti šį veiksmą." };
  }
  return { ok: true, actor };
}
