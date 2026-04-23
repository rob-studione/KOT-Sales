import "server-only";

import { cache } from "react";
import { createSupabaseSsrReadOnlyClient } from "@/lib/supabase/ssr";
import { fetchManualProjectCandidatesTotalCount } from "@/lib/crm/projectManualLeads";

const loadAutoCount = cache(
  async (opts: {
    projectId: string;
    dateFrom: string;
    dateTo: string;
    minOrders: number;
    inactivityDays: number;
  }): Promise<number> => {
    const supabase = await createSupabaseSsrReadOnlyClient();
    const { data, error } = await supabase.rpc("match_project_candidates_count", {
      p_date_from: opts.dateFrom,
      p_date_to: opts.dateTo,
      p_min_orders: opts.minOrders,
      p_inactivity_days: opts.inactivityDays,
      p_project_id: opts.projectId,
    });
    if (error) throw new Error(error.message);
    const n = typeof data === "number" ? data : Number(data ?? 0);
    return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
  },
);

const loadManualCount = cache(async (projectId: string): Promise<number> => {
  const supabase = await createSupabaseSsrReadOnlyClient();
  return await fetchManualProjectCandidatesTotalCount(supabase, projectId);
});

export async function ProjectAutoCandidatesTabCount({
  projectId,
  dateFrom,
  dateTo,
  minOrders,
  inactivityDays,
}: {
  projectId: string;
  dateFrom: string;
  dateTo: string;
  minOrders: number;
  inactivityDays: number;
}) {
  const n = await loadAutoCount({ projectId, dateFrom, dateTo, minOrders, inactivityDays });
  return <span className="ml-1 tabular-nums text-gray-400">({n})</span>;
}

export async function ProjectManualCandidatesTabCount({ projectId }: { projectId: string }) {
  const n = await loadManualCount(projectId);
  return <span className="ml-1 tabular-nums text-gray-400">({n})</span>;
}

