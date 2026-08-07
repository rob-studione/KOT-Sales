import { cache } from "react";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { SupabaseClient, User } from "@supabase/supabase-js";

function env(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Missing env var ${name}`);
  return v;
}

/**
 * @supabase/ssr uses skipAutoInitialize: the JWT is not attached until
 * getUser()/getSession()/getClaims() runs on that client instance.
 * Without this, PostgREST calls use the anon key as the role.
 *
 * Cached per RSC request so layout + page + Suspense children share one Auth round-trip.
 */
export const getSsrAuth = cache(async (): Promise<{
  client: SupabaseClient;
  user: User | null;
}> => {
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
  const { data } = await client.auth.getUser();
  return { client, user: data.user ?? null };
});

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
  await client.auth.getUser();
  return client;
}

/**
 * Read-only cookie-based Supabase client for Server Components.
 * It can read the session cookies but will never attempt to write/refresh cookies
 * (which would crash in a Server Component render).
 */
export async function createSupabaseSsrReadOnlyClient() {
  const { client } = await getSsrAuth();
  return client;
}
