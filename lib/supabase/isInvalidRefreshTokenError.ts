/** GoTrue / Supabase Auth when the stored refresh token is missing or revoked on the server. */
export function isInvalidRefreshTokenError(error: { message?: string; code?: string } | null | undefined): boolean {
  if (!error) return false;
  const code = String(error.code ?? "").toLowerCase();
  if (code === "refresh_token_not_found" || code === "invalid_refresh_token") return true;
  const msg = String(error.message ?? "").toLowerCase();
  return msg.includes("refresh token not found") || msg.includes("invalid refresh token");
}
