import { normalizeKanbanCallStatus, isProjectWorkItemClosed } from "@/lib/crm/projectBoardConstants";
import type { ProjectWorkItemActivityDto } from "@/lib/crm/projectWorkItemActivityDto";
import { isoDateInVilnius, vilniusTodayDateString } from "@/lib/crm/vilniusTime";

/**
 * Pirmoji diena (Vilnius), kada kortelė pateko į Užbaigta stulpelį su dabartine call_status.
 * - Jei paskutinėse veiklose yra `call_status` → Užbaigta, naudojame tą įrašą.
 * * Jei ne (pvz. `call` + `answered` po confirmKanbanMove) — paskutinės veiklos `occurred_at`
 *   laikomas to paties perkėlimo momentu.
 */
export function vilniusDateWhenEnteredUžbaigtaColumn(
  workItem: { call_status: string },
  activities: ProjectWorkItemActivityDto[] | undefined
): string | null {
  if (normalizeKanbanCallStatus(workItem.call_status) !== "Užbaigta") return null;
  const acts = activities ?? [];
  if (acts.length === 0) return null;
  for (let i = acts.length - 1; i >= 0; i--) {
    const a = acts[i]!;
    if (normalizeKanbanCallStatus(a.call_status) === "Užbaigta") {
      return isoDateInVilnius(a.occurred_at);
    }
  }
  return isoDateInVilnius(acts[acts.length - 1]!.occurred_at);
}

/** Uždaryta Užbaigta kortelė, kurią „Darbas“ turi rodyti tik tą dieną, kai įvyko užbaigimas (Vilnius). */
export function isUžbaigtaSameDayCompletionOnDarbas(
  workItem: { call_status: string; result_status: string },
  activities: ProjectWorkItemActivityDto[] | undefined,
  todayVilnius: string
): boolean {
  if (normalizeKanbanCallStatus(workItem.call_status) !== "Užbaigta") return false;
  if (!isProjectWorkItemClosed(workItem.result_status)) return false;
  const d = vilniusDateWhenEnteredUžbaigtaColumn(workItem, activities);
  return d === todayVilnius;
}

export { vilniusTodayDateString };
