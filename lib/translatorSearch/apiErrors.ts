/** Stable safe API / UI errors — never leak internal exception text. */

export type SafeApiError = {
  code: string;
  error: string;
  status: number;
};

const SAFE_BY_CODE: Record<string, { error: string; status: number }> = {
  model_not_configured: {
    error: "Serverio konfigūracija nebaigta (modelis).",
    status: 500,
  },
  pricing_not_configured: {
    error: "Serverio konfigūracija nebaigta (kainodara).",
    status: 500,
  },
  openai_disabled: {
    error: "OpenAI kvietimai laikinai išjungti.",
    status: 503,
  },
  validation_id: { error: "Neteisingas kandidato ID.", status: 400 },
  validation_status: { error: "Leidžiama tik approved arba rejected.", status: 400 },
  not_found: { error: "Kandidatas nerastas.", status: 404 },
  db_read: { error: "Nepavyko nuskaityti duomenų.", status: 500 },
  db_update: { error: "Nepavyko išsaugoti pakeitimo.", status: 500 },
  db_update_running: { error: "Nepavyko pradėti paieškos.", status: 500 },
  db_update_terminal: { error: "Nepavyko užbaigti paieškos būsenos.", status: 500 },
  job_insert_failed: { error: "Nepavyko sukurti paieškos įrašo.", status: 500 },
  job_exception: { error: "Paieška nepavyko dėl vidinės klaidos.", status: 500 },
  unauthorized: { error: "Neprisijungę.", status: 401 },
  forbidden: { error: "Reikia administratoriaus teisių.", status: 403 },
};

export function toSafeApiError(
  code: string,
  fallbackMessage = "Įvyko klaida. Bandykite dar kartą."
): SafeApiError {
  const known = SAFE_BY_CODE[code];
  if (known) return { code, error: known.error, status: known.status };
  return { code: code || "internal_error", error: fallbackMessage, status: 500 };
}

export function logInternalError(scope: string, err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`[${scope}]`, msg);
}
