import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { LostCaseRow } from "@/lib/crm/lostQaDb";
import { buildPreparedPayload, buildPreparedText, hashPreparedInput } from "@/lib/crm/lostQa/prepare/payloadBuild";
import {
  deactivateCurrentPreparedInputs,
  getCurrentPreparedInput,
  getMaxPreparationVersion,
  insertPreparedInput,
  listMessagesForCase,
} from "@/lib/crm/lostQa/prepare/preparedInputRepository";
import { enrichSourceMessages, selectMessagesForPreparation } from "@/lib/crm/lostQa/prepare/messageSelect";

export type PrepareLostCaseResult =
  | { ok: true; skipped: true; reason: "same_hash" }
  | {
      ok: true;
      skipped: false;
      preparation_version: number;
      prepared_hash: string;
      prepared_input_id: string;
      source_message_count: number;
      selected_message_count: number;
    }
  | { ok: false; error: string };

const PREPARE_STATUSES = new Set<string>([
  "pending_analysis",
  "analyzed",
  "reviewed",
  "feedback_sent",
  "closed",
]);

export async function prepareLostCaseFromDb(admin: SupabaseClient, lostCase: LostCaseRow): Promise<PrepareLostCaseResult> {
  if (!PREPARE_STATUSES.has(lostCase.status)) {
    return { ok: false, error: `Status not eligible for preparation: ${lostCase.status}` };
  }

  const rows = await listMessagesForCase(admin, lostCase.id);
  console.log("[lost-qa prepare-case] 6 after loading lost_case_messages", {
    lost_case_id: lostCase.id,
    count: rows.length,
  });
  if (!rows.length) {
    return { ok: false, error: "No lost_case_messages for this case." };
  }

  const allEnriched = enrichSourceMessages(rows);
  const selected = selectMessagesForPreparation(rows);

  console.log("[lost-qa prepare-case] 7 before buildPreparedPayload", {
    lost_case_id: lostCase.id,
    enriched: allEnriched.length,
    selected: selected.length,
  });
  const payload = buildPreparedPayload(lostCase, allEnriched, selected);
  console.log("[lost-qa prepare-case] 8 after buildPreparedPayload", {
    lost_case_id: lostCase.id,
    selected_message_count: payload.thread_statistics.selected_message_count,
  });
  const prepared_text = buildPreparedText(payload);
  const prepared_hash = hashPreparedInput(prepared_text);

  const current = await getCurrentPreparedInput(admin, lostCase.id);
  if (current && current.prepared_hash === prepared_hash) {
    console.log("[lost-qa prepare-case] 9-10 skip insert/update (same_hash)");
    return { ok: true, skipped: true, reason: "same_hash" };
  }

  const prevMax = await getMaxPreparationVersion(admin, lostCase.id);
  const preparation_version = prevMax + 1;

  console.log("[lost-qa prepare-case] 9 before insert/update prepared_lost_case_inputs", {
    lost_case_id: lostCase.id,
    preparation_version,
  });
  await deactivateCurrentPreparedInputs(admin, lostCase.id);

  const id = await insertPreparedInput(admin, {
    lost_case_id: lostCase.id,
    preparation_version,
    source_message_count: payload.thread_statistics.source_message_count,
    selected_message_count: payload.thread_statistics.selected_message_count,
    prepared_payload: payload as object,
    prepared_text,
    prepared_hash,
    is_current: true,
  });
  console.log("[lost-qa prepare-case] 10 after insert/update", {
    lost_case_id: lostCase.id,
    prepared_input_id: id,
  });

  return {
    ok: true,
    skipped: false,
    preparation_version,
    prepared_hash,
    prepared_input_id: id,
    source_message_count: payload.thread_statistics.source_message_count,
    selected_message_count: payload.thread_statistics.selected_message_count,
  };
}
