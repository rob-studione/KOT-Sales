import "server-only";

import { cache } from "react";
import { createSupabaseSsrReadOnlyClient } from "@/lib/supabase/ssr";

const loadWorkCounts = cache(async (projectId: string): Promise<{ open: number; completed: number }> => {
  const supabase = await createSupabaseSsrReadOnlyClient();
  const { data, error } = await supabase.rpc("project_work_item_counts", { p_project_id: projectId });
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : null;
  const open = Number((row as any)?.open_count ?? 0);
  const completed = Number((row as any)?.completed_count ?? 0);
  return {
    open: Number.isFinite(open) ? Math.max(0, Math.floor(open)) : 0,
    completed: Number.isFinite(completed) ? Math.max(0, Math.floor(completed)) : 0,
  };
});

export async function ProjectWorkOpenTabCount({ projectId }: { projectId: string }) {
  const { open } = await loadWorkCounts(projectId);
  return <span className="ml-1 tabular-nums text-gray-400">({open})</span>;
}

export async function ProjectWorkCompletedTabCount({ projectId }: { projectId: string }) {
  const { completed } = await loadWorkCounts(projectId);
  return <span className="ml-1 tabular-nums text-gray-400">({completed})</span>;
}

