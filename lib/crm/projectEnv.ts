/** „Sukūrė“ etiketė be prisijungimo — galima perrašyti per CRM_DEFAULT_ACTOR. */
export function defaultProjectActor(): string {
  const v = process.env.CRM_DEFAULT_ACTOR?.trim();
  return v && v.length > 0 ? v : "CRM";
}
