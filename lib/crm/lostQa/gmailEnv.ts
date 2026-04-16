import "server-only";

export type GmailServiceAccountCredentials = {
  client_email: string;
  private_key: string;
};

export function requireGmailServiceAccountJson(): GmailServiceAccountCredentials {
  const raw = process.env.GMAIL_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) {
    throw new Error("Missing env var GMAIL_SERVICE_ACCOUNT_JSON (service account JSON for domain-wide delegation).");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new Error("GMAIL_SERVICE_ACCOUNT_JSON must be valid JSON.");
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error("GMAIL_SERVICE_ACCOUNT_JSON must be a JSON object.");
  }
  const o = parsed as Record<string, unknown>;
  const client_email = o.client_email;
  const private_key = o.private_key;
  if (typeof client_email !== "string" || !client_email.trim()) {
    throw new Error("GMAIL_SERVICE_ACCOUNT_JSON.client_email is required.");
  }
  if (typeof private_key !== "string" || !private_key.includes("BEGIN")) {
    throw new Error("GMAIL_SERVICE_ACCOUNT_JSON.private_key is required.");
  }
  return { client_email: client_email.trim(), private_key };
}

/**
 * Comma-separated list of company domains (no @), lowercase recommended.
 * Used to classify agent vs internal senders. Example: `acme.com,acme.lt`
 */
export function lostQaCompanyEmailDomains(): string[] {
  const raw = process.env.LOST_QA_COMPANY_EMAIL_DOMAINS?.trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/** Audience URL for Pub/Sub push OIDC (usually the full push endpoint URL). */
export function gmailPubSubOidcAudience(): string | null {
  const v = process.env.GMAIL_PUBSUB_AUDIENCE?.trim();
  return v || null;
}
