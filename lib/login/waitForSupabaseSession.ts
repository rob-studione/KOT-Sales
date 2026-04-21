import type { SupabaseClient } from "@supabase/supabase-js";

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

export async function waitForSupabaseSessionAfterAuth(
  supabase: SupabaseClient,
  label: string,
  log?: (msg: string, data?: Record<string, unknown>) => void,
): Promise<{ session: NonNullable<Awaited<ReturnType<typeof supabase.auth.getSession>>["data"]["session"]>; userId: string; email: string }> {
  const maxAttempts = 8;
  const delayMs = 100;
  let lastErr: string | null = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const { data, error } = await supabase.auth.getSession();
    log?.("getSession", {
      label,
      attempt,
      hasSession: !!data.session?.user?.id,
      error: error?.message ?? null,
    });
    if (error) lastErr = error.message;
    const uid = data.session?.user?.id ? String(data.session.user.id) : "";
    if (uid) {
      const email = String(data.session?.user?.email ?? "").trim().toLowerCase();
      log?.("getSession_ok", { label, attempt, userIdPrefix: uid.slice(0, 8) });
      return { session: data.session!, userId: uid, email };
    }
    if (attempt < maxAttempts) {
      try {
        await supabase.auth.refreshSession();
      } catch {
        // ignore
      }
      await sleep(delayMs);
    }
  }
  log?.("getSession_exhausted", { label, lastError: lastErr });
  throw new Error("Nepavyko nustatyti sesijos pagal nuorodą.");
}
