/**
 * Supabase / PostgREST klaidos objektas dažnai neturi enumeruojamų laukų,
 * todėl `console.error("…", err)` naršyklėje rodo `{}`.
 */
export function supabaseErrorForLog(err: unknown): Record<string, unknown> {
  if (err == null) return { error: null };
  if (typeof err !== "object") return { value: err };
  const e = err as Record<string, unknown>;
  const pick = ["message", "details", "hint", "code", "statusCode", "status"] as const;
  const out: Record<string, unknown> = {};
  for (const k of pick) {
    if (k in e) out[k] = e[k];
  }
  try {
    const names = Object.getOwnPropertyNames(err);
    const plain: Record<string, unknown> = {};
    for (const n of names) {
      try {
        plain[n] = (err as Record<string, unknown>)[n];
      } catch {
        plain[n] = "[unreadable]";
      }
    }
    out.ownProperties = plain;
  } catch {
    out.stringFallback = String(err);
  }
  return out;
}

export function logSupabaseError(scope: string, err: unknown, extra?: Record<string, unknown>): void {
  const payload = supabaseErrorForLog(err);
  const merged = extra && Object.keys(extra).length > 0 ? { ...payload, context: extra } : payload;
  console.error(`[${scope}]`, merged);
  try {
    console.error(`[${scope}] json=${JSON.stringify(merged)}`);
  } catch {
    console.error(`[${scope}] json stringify failed`);
  }
}
