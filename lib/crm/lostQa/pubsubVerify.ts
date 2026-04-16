import "server-only";

import { OAuth2Client } from "google-auth-library";

import { gmailPubSubOidcAudience } from "@/lib/crm/lostQa/gmailEnv";

/**
 * Verifies Google Pub/Sub push OIDC (`Authorization: Bearer <jwt>`) when `GMAIL_PUBSUB_AUDIENCE` is set.
 * Returns false if audience is not configured or token is invalid.
 */
export async function verifyPubSubOidcBearer(authHeader: string | null): Promise<boolean> {
  const audience = gmailPubSubOidcAudience();
  if (!audience) return false;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  if (!token) return false;
  try {
    const client = new OAuth2Client();
    await client.verifyIdToken({ idToken: token, audience });
    return true;
  } catch {
    return false;
  }
}
