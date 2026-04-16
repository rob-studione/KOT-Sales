import "server-only";

import { loadEnvConfig } from "@next/env";
import { NextResponse } from "next/server";

let devLostCronEnvReloaded = false;

/**
 * Same pattern as procurement cron routes: `Authorization: Bearer $CRON_SECRET` or `x-cron-secret`.
 * Internal Gmail maintenance endpoints reuse this guard.
 */
export function assertCronOrInternalSecret(request: Request): NextResponse | null {
  if (
    process.env.NODE_ENV === "development" &&
    !process.env.CRON_SECRET?.trim() &&
    !devLostCronEnvReloaded
  ) {
    devLostCronEnvReloaded = true;
    // Next 16+ can serve this handler with a process.env snapshot that omitted .env.local; force a reload once.
    loadEnvConfig(process.cwd(), true, console, true);
  }
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json(
      { error: "Server misconfigured: CRON_SECRET is not set." },
      { status: 500 }
    );
  }
  const auth = request.headers.get("authorization");
  const bearer = auth?.startsWith("Bearer ") ? auth.slice(7).trim() : null;
  const headerSecret = request.headers.get("x-cron-secret")?.trim();
  const token = bearer ?? headerSecret;
  if (token !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

/** Optional: allow same secret as Bearer for Pub/Sub manual replay when OIDC is not used. */
export function bearerMatchesCronSecret(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const auth = request.headers.get("authorization");
  const bearer = auth?.startsWith("Bearer ") ? auth.slice(7).trim() : null;
  return bearer === secret;
}
