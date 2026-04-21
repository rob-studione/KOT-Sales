import { createBrowserClient } from "@supabase/ssr";
import { createStorageFromOptions } from "@supabase/ssr/dist/module/cookies";
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

const sharedCookieOptions = {
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};

let cached: SupabaseClient | null = null;
let authConfirmCached: SupabaseClient | null = null;
let authRecoveryCached: SupabaseClient | null = null;

export function resetSupabaseBrowserClient(): void {
  cached = null;
}

/** Clears the dedicated `/auth/confirm` client (implicit flow; see createSupabaseAuthConfirmBrowserClient). */
export function resetSupabaseAuthConfirmBrowserClient(): void {
  authConfirmCached = null;
}

/** Clears the dedicated `/auth/recovery` PKCE client (see createSupabaseAuthRecoveryBrowserClient). */
export function resetSupabaseAuthRecoveryBrowserClient(): void {
  authRecoveryCached = null;
}

export function createSupabaseBrowserClient(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url) throw new Error("Missing env var NEXT_PUBLIC_SUPABASE_URL");
  if (!anonKey) throw new Error("Missing env var NEXT_PUBLIC_SUPABASE_ANON_KEY");

  // Important: use cookie-based auth so middleware/server can see the session.
  // In development on http://localhost, `secure` cookies won't be sent.
  cached = createBrowserClient(url, anonKey, {
    cookieOptions: sharedCookieOptions,
  });

  return cached;
}

/**
 * Browser client for `/auth/confirm` (invite / implicit tokens) only.
 * PKCE password recovery with `?code=` uses {@link createSupabaseBrowserClient} on `/auth/recovery`.
 *
 * `@supabase/ssr` `createBrowserClient` hardcodes `flowType: "pkce"`, which rejects
 * implicit-grant redirects from `GET /auth/v1/verify` (`#access_token=…&refresh_token=…`).
 * Password recovery emails use that redirect, so this client uses `flowType: "implicit"`
 * and disables auto URL handling; the page parses the URL and calls `setSession` / `verifyOtp` explicitly.
 */
export function createSupabaseAuthConfirmBrowserClient(): SupabaseClient {
  if (authConfirmCached) return authConfirmCached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url) throw new Error("Missing env var NEXT_PUBLIC_SUPABASE_URL");
  if (!anonKey) throw new Error("Missing env var NEXT_PUBLIC_SUPABASE_ANON_KEY");

  const { storage } = createStorageFromOptions(
    {
      cookieEncoding: "base64url",
      cookieOptions: sharedCookieOptions,
    },
    false,
  );

  authConfirmCached = createClient(url, anonKey, {
    auth: {
      flowType: "implicit",
      detectSessionInUrl: false,
      persistSession: true,
      autoRefreshToken: typeof window !== "undefined",
      storage,
    },
  });

  return authConfirmCached;
}

/**
 * PKCE browser client for `/auth/recovery` only (`?code=` from password reset email).
 *
 * `@supabase/ssr` `createBrowserClient` sets `detectSessionInUrl: true`, so GoTrue runs
 * `_initialize` → `_getSessionFromURL` and may call `exchangeCodeForSession` before our
 * explicit call — that consumes `code-verifier` from cookies and breaks the second exchange.
 * This client uses the same cookie storage as the main app but disables session-in-URL
 * detection so only `exchangeCodeForSession(code)` runs once.
 */
export function createSupabaseAuthRecoveryBrowserClient(): SupabaseClient {
  if (authRecoveryCached) return authRecoveryCached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url) throw new Error("Missing env var NEXT_PUBLIC_SUPABASE_URL");
  if (!anonKey) throw new Error("Missing env var NEXT_PUBLIC_SUPABASE_ANON_KEY");

  const { storage } = createStorageFromOptions(
    {
      cookieEncoding: "base64url",
      cookieOptions: sharedCookieOptions,
    },
    false,
  );

  authRecoveryCached = createClient(url, anonKey, {
    auth: {
      flowType: "pkce",
      detectSessionInUrl: false,
      persistSession: true,
      autoRefreshToken: typeof window !== "undefined",
      storage,
    },
  });

  return authRecoveryCached;
}

