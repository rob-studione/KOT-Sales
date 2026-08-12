import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { TranslatorCandidateReviewStatus } from "@/lib/translatorSearch/types";
import { isUuid } from "@/lib/translatorSearch/urlSafety";

export type ReviewCandidateInput = {
  candidateId: string;
  reviewStatus: Exclude<TranslatorCandidateReviewStatus, "pending">;
  reviewNote?: string | null;
  reviewedBy: string;
};

export type ReviewCandidateResult =
  | { ok: true; candidateId: string; reviewStatus: "approved" | "rejected"; noop?: boolean }
  | { ok: false; error: string; code: string };

export async function reviewTranslatorCandidate(
  admin: SupabaseClient,
  input: ReviewCandidateInput
): Promise<ReviewCandidateResult> {
  const id = String(input.candidateId ?? "").trim();
  if (!id || !isUuid(id)) {
    return { ok: false, code: "validation_id", error: "Neteisingas kandidato ID." };
  }
  if (input.reviewStatus !== "approved" && input.reviewStatus !== "rejected") {
    return { ok: false, code: "validation_status", error: "Leidžiama tik approved arba rejected." };
  }

  const { data: existing, error: readErr } = await admin
    .from("translator_candidates")
    .select("id,review_status,reviewed_by,reviewed_at,review_note")
    .eq("id", id)
    .maybeSingle();

  if (readErr) return { ok: false, code: "db_read", error: "Nepavyko nuskaityti duomenų." };
  if (!existing) return { ok: false, code: "not_found", error: "Kandidatas nerastas." };

  const note = input.reviewNote == null ? null : String(input.reviewNote).trim().slice(0, 1000) || null;

  if (
    existing.review_status === input.reviewStatus &&
    existing.reviewed_by === input.reviewedBy &&
    (existing.review_note ?? null) === note
  ) {
    return { ok: true, candidateId: id, reviewStatus: input.reviewStatus, noop: true };
  }

  const { data: updated, error: updErr } = await admin
    .from("translator_candidates")
    .update({
      review_status: input.reviewStatus,
      reviewed_by: input.reviewedBy,
      reviewed_at: new Date().toISOString(),
      review_note: note,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("id");

  if (updErr || !updated?.length) {
    return { ok: false, code: "db_update", error: "Nepavyko išsaugoti pakeitimo." };
  }
  return { ok: true, candidateId: id, reviewStatus: input.reviewStatus };
}
