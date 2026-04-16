import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

export function createSupabaseBrowserClient(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url) throw new Error("Missing env var NEXT_PUBLIC_SUPABASE_URL");
  if (!anonKey) throw new Error("Missing env var NEXT_PUBLIC_SUPABASE_ANON_KEY");

  // Important: use cookie-based auth so middleware/server can see the session.
  // In development on http://localhost, `secure` cookies won't be sent.
  cached = createBrowserClient(url, anonKey, {
    cookieOptions: {
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    },
  });

  return cached;
}

