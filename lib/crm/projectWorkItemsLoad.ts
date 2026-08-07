import {
  isProjectWorkItemClosed,
  isReturnedToCandidates,
} from "@/lib/crm/projectBoardConstants";
import {
  WORK_ITEM_COMPLETION_RESULT_VALUES,
  PROCUREMENT_WORK_ITEM_COMPLETION_RESULT_VALUES,
} from "@/lib/crm/projectCompletion";

/** Uždarytos eilutės (įskaitant grąžintas) — nebe „atviros“ Darbas lentoje. */
export const PROJECT_WORK_ITEM_CLOSED_STATUSES: readonly string[] = [
  "completed",
  "closed",
  "cancelled",
  "lost",
  "neaktualus",
  "uždaryta",
  "returned_to_candidates",
  ...WORK_ITEM_COMPLETION_RESULT_VALUES,
  ...PROCUREMENT_WORK_ITEM_COMPLETION_RESULT_VALUES,
];

/** Užbaigta skirtukas — be grąžintų į kandidatus. */
export const PROJECT_WORK_ITEM_COMPLETED_TAB_STATUSES: readonly string[] =
  PROJECT_WORK_ITEM_CLOSED_STATUSES.filter((s) => s !== "returned_to_candidates");

/** Veiklos stulpeliai (ne `*`) — timeline / same-day logikai. */
export const PROJECT_WORK_ITEM_ACTIVITY_SELECT =
  "id,work_item_id,occurred_at,action_type,call_status,next_action,next_action_date,comment,performed_by";

export function isCompletedWorkItemRow(resultStatus: string | null | undefined): boolean {
  return isProjectWorkItemClosed(resultStatus) && !isReturnedToCandidates(resultStatus);
}

/** ISO riba „galimai šiandien uždaryta“ (buffer dėl TZ). */
export function recentWorkUpdatedSinceIso(hoursBack = 36): string {
  return new Date(Date.now() - hoursBack * 3600 * 1000).toISOString();
}
