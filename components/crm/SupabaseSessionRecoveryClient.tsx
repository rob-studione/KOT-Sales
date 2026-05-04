"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { isInvalidRefreshTokenError } from "@/lib/supabase/isInvalidRefreshTokenError";

/**
 * Clears broken cookie sessions (e.g. revoked refresh token) so GoTrue stops throwing
 * "Invalid Refresh Token: Refresh Token Not Found" on auto-refresh.
 */
export function SupabaseSessionRecoveryClient() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    let cancelled = false;

    async function recoverFromBadRefresh() {
      const { error } = await supabase.auth.getSession();
      if (cancelled || !error || !isInvalidRefreshTokenError(error)) return;
      await supabase.auth.signOut();
      router.replace("/login");
      router.refresh();
    }

    void recoverFromBadRefresh();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "INITIAL_SESSION") void recoverFromBadRefresh();
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [router]);

  return null;
}
