import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseSsrReadOnlyClient } from "@/lib/supabase/ssr";

export async function ProjectRevenueTabCount({
  projectId,
  from,
  to,
}: {
  projectId: string;
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD
}) {
  let supabase: SupabaseClient;
  try {
    supabase = await createSupabaseSsrReadOnlyClient();
  } catch {
    return <span className="ml-1 tabular-nums text-gray-400">(…)</span>;
  }

  const { data, error } = await supabase.rpc("project_revenue_summary", {
    p_project_id: projectId,
    p_from: from,
    p_to: to,
  });

  if (error) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[projektai/[id]] project_revenue_summary failed:", error);
    }
    return <span className="ml-1 tabular-nums text-gray-400">(…)</span>;
  }

  const row = Array.isArray(data) ? data[0] : null;
  const count = Number((row as any)?.revenue_count ?? 0);
  return <span className="ml-1 tabular-nums text-gray-400">({Number.isFinite(count) ? count : 0})</span>;
}

