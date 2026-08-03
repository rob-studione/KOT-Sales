import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";

function env(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Missing env var ${name}`);
  return v;
}

/**
 * @supabase/ssr uses skipAutoInitialize: the JWT is not attached until
 * getUser()/getSession()/getClaims() runs on that client instance.
 * Without this, PostgREST calls use the anon key as the role.
 */
async function attachSession(client: SupabaseClient): Promise<SupabaseClient> {
  await client.auth.getUser();
  return client;
}

/** Cookie-based Supabase client for Server Components / Server Actions. */
export async function createSupabaseSsrClient() {
  const cookieStore = await cookies();
  const client = createServerClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("NEXT_PUBLIC_SUPABASE_ANON_KEY"), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          cookieStore.set(name, value, options);
        }
      },
    },
  });
  return attachSession(client);
}

/**
 * Read-only cookie-based Supabase client for Server Components.
 * It can read the session cookies but will never attempt to write/refresh cookies
 * (which would crash in a Server Component render).
 */
export async function createSupabaseSsrReadOnlyClient() {
  const cookieStore = await cookies();
  const client = createServerClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("NEXT_PUBLIC_SUPABASE_ANON_KEY"), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll() {
        // no-op: Server Components cannot mutate cookies during render
      },
    },
  });
  return attachSession(client);
}

