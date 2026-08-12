/**
 * Job / kandidatų DB operacijos (be server-only) — naudoja runJob ir verify.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  decideCandidateMerge,
  type ExistingCandidateForDedupe,
} from "@/lib/translatorSearch/dedupe";
import { DbUpdateError, isUniqueViolation } from "@/lib/translatorSearch/dbUpdates";
import { assertJobTransition, buildTerminalJobPatch } from "@/lib/translatorSearch/jobStatus";

export type TranslatorAdminClient = Pick<SupabaseClient, "from">;

export async function updateJobOrThrow(
  admin: TranslatorAdminClient,
  jobId: string,
  patch: Record<string, unknown>,
  code: string
): Promise<void> {
  const { data, error } = await admin
    .from("translator_search_jobs")
    .update(patch)
    .eq("id", jobId)
    .select("id");
  if (error || !data?.length) {
    throw new DbUpdateError(code, code);
  }
}

export async function failJobOrThrow(
  admin: TranslatorAdminClient,
  jobId: string,
  code: string,
  counters?: Partial<{
    search_calls: number;
    fetch_url_count: number;
    pdf_count: number;
    openai_calls: number;
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
    cost_eur_estimated: number;
    warning: string | null;
  }>
): Promise<void> {
  assertJobTransition("running", "failed");
  await updateJobOrThrow(
    admin,
    jobId,
    {
      ...buildTerminalJobPatch("failed", {
        error_code: code,
        error_message: null,
        warning: counters?.warning ?? null,
      }),
      error_code: code,
      error_message: null,
      ...buildTranslatorSearchJobMetricFields(counters),
    },
    "db_update_terminal"
  );
}

/** Shared metric fields for completed / failed terminal job updates. */
export function buildTranslatorSearchJobMetricFields(
  counters?: Partial<{
    search_calls: number;
    fetch_url_count: number;
    pdf_count: number;
    openai_calls: number;
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
    cost_eur_estimated: number;
  }>
): {
  search_calls: number;
  fetch_url_count: number;
  pdf_count: number;
  openai_calls: number;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  cost_eur_estimated: number;
} {
  return {
    search_calls: counters?.search_calls ?? 0,
    fetch_url_count: counters?.fetch_url_count ?? 0,
    pdf_count: counters?.pdf_count ?? 0,
    openai_calls: counters?.openai_calls ?? 0,
    input_tokens: counters?.input_tokens ?? 0,
    output_tokens: counters?.output_tokens ?? 0,
    total_tokens: counters?.total_tokens ?? 0,
    cost_eur_estimated: counters?.cost_eur_estimated ?? 0,
  };
}

export async function loadCandidateByDedupe(
  admin: TranslatorAdminClient,
  dedupeKey: string
): Promise<ExistingCandidateForDedupe | null> {
  const { data, error } = await admin
    .from("translator_candidates")
    .select(
      "id,dedupe_key,review_status,display_name,entity_type,email,phone,country,city,language_pairs,specializations,sworn_status,website_url,match_summary"
    )
    .eq("dedupe_key", dedupeKey)
    .maybeSingle();
  if (error) {
    throw new DbUpdateError("db_read", "db_read");
  }
  return (data as ExistingCandidateForDedupe | null) ?? null;
}

export type CandidateInsertPayload = {
  display_name: string;
  entity_type: string;
  email: string | null;
  phone: string | null;
  country: string | null;
  city: string | null;
  language_pairs: unknown;
  specializations: unknown;
  sworn_status: string;
  website_url: string | null;
  match_summary: string | null;
  dedupe_key: string;
};

export type InsertOrReuseCandidateResult = {
  candidateId: string;
  created: boolean;
  reused: boolean;
  existing: ExistingCandidateForDedupe | null;
  merge: ReturnType<typeof decideCandidateMerge>;
};

/**
 * Insert candidate; on dedupe_key unique conflict (23505) reload existing and reuse its id.
 */
export async function insertOrReuseCandidateByDedupe(
  admin: TranslatorAdminClient,
  dedupeKey: string,
  payload: CandidateInsertPayload
): Promise<InsertOrReuseCandidateResult> {
  let existing = await loadCandidateByDedupe(admin, dedupeKey);
  let merge = decideCandidateMerge(dedupeKey, existing);

  if (merge.action === "reuse" && merge.candidateId) {
    return {
      candidateId: merge.candidateId,
      created: false,
      reused: true,
      existing,
      merge,
    };
  }

  const { data: created, error: cErr } = await admin
    .from("translator_candidates")
    .insert({
      ...payload,
      review_status: "pending",
    })
    .select("id")
    .single();

  if (!cErr && created?.id) {
    const candidateId = String(created.id);
    merge = decideCandidateMerge(dedupeKey, null);
    return {
      candidateId,
      created: true,
      reused: false,
      existing: null,
      merge: { ...merge, action: "insert", candidateId },
    };
  }

  if (isUniqueViolation(cErr)) {
    existing = await loadCandidateByDedupe(admin, dedupeKey);
    merge = decideCandidateMerge(dedupeKey, existing);
    if (!merge.candidateId) {
      throw new DbUpdateError("db_read", "db_read");
    }
    return {
      candidateId: merge.candidateId,
      created: false,
      reused: true,
      existing,
      merge,
    };
  }

  throw new DbUpdateError("db_update", "db_update");
}

export async function listActiveJobsForActor(
  admin: TranslatorAdminClient,
  actorId: string,
  windowIso: string
): Promise<Array<{ id: string; status: string; request_params?: unknown; created_at?: string }>> {
  const { data, error } = await admin
    .from("translator_search_jobs")
    .select("id,status,request_params,created_at")
    .eq("requested_by", actorId)
    .in("status", ["pending", "running"])
    .gte("created_at", windowIso)
    .order("created_at", { ascending: false })
    .limit(10);
  if (error) {
    throw new DbUpdateError("db_read", "db_read");
  }
  return (data ?? []) as Array<{
    id: string;
    status: string;
    request_params?: unknown;
    created_at?: string;
  }>;
}
