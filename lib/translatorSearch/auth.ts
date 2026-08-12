/** Minimal actor shape for translator-search auth (structurally compatible with CurrentCrmUser). */
export type TranslatorSearchActor = {
  id: string;
  email: string;
  role: string;
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
export function authorizeTranslatorSearchAdmin(
  actor: TranslatorSearchActor | null
): ApiAuthSuccess | ApiAuthFailure {
  if (!actor) {
    return { ok: false, status: 401, error: "Neprisijungę." };
  }
  if (actor.role !== "admin") {
    return { ok: false, status: 403, error: "Reikia administratoriaus teisių." };
  }
  return { ok: true, actor };
}
