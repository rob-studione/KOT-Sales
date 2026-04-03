/**
 * PostgREST `or=(clause1,clause2)` uses commas as delimiters. User search text that
 * contains `,`, `(`, or `)` can produce a malformed filter and a 400 from the API.
 */
export function sanitizeForPostgrestOrClause(s: string): string {
  return s.replace(/[,()]/g, " ").replace(/\s+/g, " ").trim();
}
