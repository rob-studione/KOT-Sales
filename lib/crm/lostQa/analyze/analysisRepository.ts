import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { LostCaseAnalysisInsert, LostCaseAnalysisRow } from "@/lib/crm/lostQaDb";

export async function fetchLostCaseAnalysisByCaseAndPrompt(
  admin: SupabaseClient,
  lostCaseId: string,
  promptVersion: number
): Promise<LostCaseAnalysisRow | null> {
  const { data, error } = await admin
    .from("lost_case_analysis")
    .select("*")
    .eq("lost_case_id", lostCaseId)
    .eq("prompt_version", promptVersion)
    .maybeSingle();
  if (error) throw error;
  return (data as LostCaseAnalysisRow | null) ?? null;
}

export async function upsertLostCaseAnalysis(
  admin: SupabaseClient,
  row: LostCaseAnalysisInsert
): Promise<string> {
  const { data, error } = await admin
    .from("lost_case_analysis")
    .upsert(row, { onConflict: "lost_case_id,prompt_version" })
    .select("id")
    .single();
  if (error) throw error;
  return (data as { id: string }).id;
}
