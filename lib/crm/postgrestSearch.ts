/**
 * PostgREST `or=(clause1,clause2)` uses commas as delimiters. User search text that
 * contains `,`, `(`, or `)` can produce a malformed filter and a 400 from the API.
 */
export function sanitizeForPostgrestOrClause(s: string): string {
  return s.replace(/[,()]/g, " ").replace(/\s+/g, " ").trim();
}

function escapeIlikeTerm(s: string): string {
  // PostgREST uses `%` for wildcards; escape `%` and `_` in user input.
  // (Backslash escaping is supported by Postgres ILIKE.)
  return s.replace(/[%_\\]/g, (m) => `\\${m}`);
}

/**
 * Build a safe PostgREST `or=(...)` clause for client list search.
 * Example output: `company_name.ilike.%foo%,company_code.ilike.%foo%`
 */
export function buildClientListSearchOrClause(raw: string): string | null {
  const sanitized = sanitizeForPostgrestOrClause(raw);
  if (!sanitized) return null;
  const term = escapeIlikeTerm(sanitized);
  const like = `%${term}%`;
  return [
    `company_name.ilike.${like}`,
    `company_code.ilike.${like}`,
    `client_id.ilike.${like}`,
    `vat_code.ilike.${like}`,
    `email.ilike.${like}`,
    `phone.ilike.${like}`,
    `address.ilike.${like}`,
  ].join(",");
}
