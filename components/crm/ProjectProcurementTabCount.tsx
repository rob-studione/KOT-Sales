import "server-only";

import { cache } from "react";
import { createSupabaseSsrReadOnlyClient } from "@/lib/supabase/ssr";
import { fetchProcurementContractsCount } from "@/lib/crm/procurementContracts";

const loadProcurementContractsCount = cache(async (projectId: string): Promise<number> => {
  const supabase = await createSupabaseSsrReadOnlyClient();
  const r = await fetchProcurementContractsCount(supabase, projectId);
  if (!r.ok) throw new Error(r.error);
  return r.count;
});

export async function ProjectProcurementContractsTabCount({ projectId }: { projectId: string }) {
  const n = await loadProcurementContractsCount(projectId);
  return <span className="ml-1 tabular-nums text-gray-400">({n})</span>;
}

