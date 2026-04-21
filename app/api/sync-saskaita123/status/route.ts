import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  let supabase;
  try {
    supabase = createSupabaseServerClient();
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: `Supabase: ${message}` }, { status: 500 });
  }

  const { data, error } = await supabase
    .from("invoice_sync_state")
    .select("last_run_at,last_result,last_error,updated_at")
    .eq("id", "default")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 502 });
  }

  return NextResponse.json(
    {
      lastRunAt: data?.last_run_at ?? null,
      lastResult: data?.last_result ?? null,
      lastError: data?.last_error ?? null,
      updatedAt: data?.updated_at ?? null,
    },
    { status: 200 }
  );
}

