import { NextResponse } from "next/server";

import { assertCronVercelOrInternalSecret } from "@/lib/crm/lostQa/gmailInternalAuth";
import { runLostQaPipelineTick } from "@/lib/crm/lostQa/cron/runLostQaPipelineTick";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 300;

function safeStringifyUnknown(value: unknown): string {
  try {
    return JSON.stringify(
      value,
      (_key, v) => {
        if (v instanceof Error) {
          return { name: v.name, message: v.message, stack: v.stack };
        }
        return v;
      },
      2
    );
  } catch {
    try {
      return String(value);
    } catch {
      return "[unserializable error]";
    }
  }
}

function formatErrorForResponse(e: unknown): { error: string; meta?: Record<string, unknown> } {
  if (e instanceof Error) {
    return { error: e.message || e.name || "Unknown error", meta: { name: e.name } };
  }
  if (e && typeof e === "object") {
    return { error: safeStringifyUnknown(e) };
  }
  return { error: String(e ?? "Unknown error") };
}

/**
 * Vercel Cron (GET) arba rankinis kvietimas su `Authorization: Bearer $CRON_SECRET`.
 * Jei Gmail API ar history sinchronas neturi veikti (pvz. testuojant), naudokite `?skipGmail=1`.
 */
export async function GET(request: Request) {
  const unauthorized = assertCronVercelOrInternalSecret(request);
  if (unauthorized) return unauthorized;

  const { searchParams } = new URL(request.url);
  const skipGmail = searchParams.get("skipGmail") === "1" || searchParams.get("skipGmail") === "true";

  try {
    const admin = createSupabaseAdminClient();
    const r = await runLostQaPipelineTick(admin, { skipGmail });
    console.log("[lost-qa] cron tick", { ok: true, status: 200, skipGmail });
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    const formatted = formatErrorForResponse(e);
    if (e instanceof Error) {
      console.error("[lost-qa] cron tick failed:", e.message, { stack: e.stack });
    } else {
      console.error("[lost-qa] cron tick failed (non-Error):", safeStringifyUnknown(e));
    }
    return NextResponse.json({ ok: false, ...formatted }, { status: 500 });
  }
}
