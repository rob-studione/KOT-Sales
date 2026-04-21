/** Shared URL parsing for /auth/confirm and /auth/recovery (GoTrue-compatible). */

export type AuthFlowType = "invite" | "recovery" | "signup" | "email_change" | "magiclink" | "unknown";

export function parseHashParams(hash: string): Record<string, string> {
  const raw = String(hash ?? "").trim();
  if (!raw) return {};
  const h = raw.startsWith("#") ? raw.slice(1) : raw;
  const qs = new URLSearchParams(h);
  const out: Record<string, string> = {};
  for (const [k, v] of qs.entries()) out[k] = v;
  return out;
}

/** Hash first, then query overrides (matches GoTrue `parseParametersFromURL`). */
export function parseAuthParamsFromWindow(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const hashParams = parseHashParams(window.location.hash);
  const out: Record<string, string> = { ...hashParams };
  const search = new URLSearchParams(window.location.search);
  for (const [k, v] of search.entries()) {
    out[k] = v;
  }
  return out;
}

export function normalizeAuthType(raw: string | null | undefined): AuthFlowType {
  const t = String(raw ?? "").trim().toLowerCase();
  if (t === "invite" || t === "recovery" || t === "signup" || t === "email_change" || t === "magiclink") return t;
  if (t === "email") return "signup";
  return "unknown";
}

export function isPasswordSetupFlow(t: AuthFlowType): boolean {
  return t === "invite" || t === "recovery" || t === "signup";
}

export function looksLikeOpaqueOtpToken(token: string): boolean {
  const t = String(token ?? "").trim();
  return t.length >= 20 && !t.includes("@");
}

/**
 * PKCE recovery from email ends up as `/...?code=...` without `type=recovery`.
 * Invite/signup PKCE may use `type=invite` / `type=signup` — keep those on /auth/confirm.
 */
export function isRecoveryPkceCodeOnlyRedirect(params: Record<string, string>): boolean {
  const code = String(params.code ?? "").trim();
  const tokenHash = String(params.token_hash ?? "").trim();
  if (!code || tokenHash) return false;
  const type = normalizeAuthType(params.type);
  if (type === "invite" || type === "signup" || type === "email_change" || type === "magiclink") return false;
  return true;
}
