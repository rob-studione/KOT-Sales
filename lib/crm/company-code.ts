/** Matches sync fallback keys when Invoice123 has no `client.code` (see `resolveEffectiveCompanyCode`). */
export const SYNTHETIC_COMPANY_CODE_PREFIX = "PERSON_";

export function isSyntheticCompanyCode(company_code: string | null | undefined): boolean {
  return (company_code ?? "").trim().startsWith(SYNTHETIC_COMPANY_CODE_PREFIX);
}
