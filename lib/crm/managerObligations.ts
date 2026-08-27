import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_ACTIVITY_SCHEDULE } from "@/lib/crm/managerActivity";
import type {
  ManagerObligationCounts,
  ManagerObligationItem,
  ManagerObligationKind,
  ManagerObligationsPayload,
  ManagerObligationTone,
} from "@/lib/crm/managerObligationsShared";
import {
  isProjectWorkItemClosed,
  isReturnedToCandidates,
  normalizeKanbanCallStatus,
  type KanbanNextActionColumn,
} from "@/lib/crm/projectBoardConstants";
import { countWorkingDaysLtIso, nextWorkingDayLtYmdAfter } from "@/lib/crm/workingDaysLt";
import { isoDateInVilnius, vilniusMinutesFromMidnight, vilniusTodayDateString } from "@/lib/crm/vilniusTime";

export type {
  ManagerObligationCounts,
  ManagerObligationItem,
  ManagerObligationKind,
  ManagerObligationProjectSummary,
  ManagerObligationsPayload,
  ManagerObligationTone,
} from "@/lib/crm/managerObligationsShared";
export {
  formatManagerObligationProjectSummary,
  groupManagerObligationsByProject,
} from "@/lib/crm/managerObligationsShared";

const OBLIGATION_COLUMNS = new Set<KanbanNextActionColumn>([
  "Skubus veiksmas",
  "Perskambinti",
  "Siųsti laišką",
  "Siųsti komercinį",
]);

const KIND_ORDER: Record<ManagerObligationKind, number> = {
  urgent: 0,
  callback: 1,
  email: 2,
  commercial: 3,
};

type WorkItemRow = {
  id: string;
  project_id: string;
  client_name_snapshot: string;
  call_status: string;
  next_action_date: string | null;
  result_status: string;
  projects: { id: string; name: string; status: string } | null;
};

function isIsoDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function obligationTone(dueDate: string, today: string, afterWorkHours: boolean): ManagerObligationTone {
  if (dueDate < today) return "overdue";
  if (dueDate === today && afterWorkHours) return "overdue";
  return "today";
}

function activityDatesByWorkItem(
  rows: Array<{ work_item_id: string; action_type: string; occurred_at: string }>
): Map<string, { email: string[]; commercial: string[] }> {
  const map = new Map<string, { email: string[]; commercial: string[] }>();
  for (const r of rows) {
    const id = String(r.work_item_id ?? "");
    if (!id) continue;
    const at = String(r.occurred_at ?? "");
    if (!at) continue;
    const day = isoDateInVilnius(at);
    const action = String(r.action_type ?? "").toLowerCase();
    if (!map.has(id)) map.set(id, { email: [], commercial: [] });
    const bucket = map.get(id)!;
    if (action === "email") bucket.email.push(day);
    if (action === "commercial") bucket.commercial.push(day);
  }
  return map;
}

function hasActivityOnOrAfterDue(
  bucket: { email: string[]; commercial: string[] } | undefined,
  kind: "email" | "commercial",
  dueDate: string
): boolean {
  const days = kind === "email" ? bucket?.email ?? [] : bucket?.commercial ?? [];
  return days.some((d) => d >= dueDate);
}

function sortItems(items: ManagerObligationItem[]): ManagerObligationItem[] {
  return [...items].sort((a, b) => {
    const ko = KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
    if (ko !== 0) return ko;
    if (b.workingDaysOverdue !== a.workingDaysOverdue) return b.workingDaysOverdue - a.workingDaysOverdue;
    if (a.dueDate !== b.dueDate) return a.dueDate.localeCompare(b.dueDate);
    return a.projectName.localeCompare(b.projectName, "lt");
  });
}

export async function loadManagerObligations(
  supabase: SupabaseClient,
  userId: string
): Promise<ManagerObligationsPayload> {
  const empty: ManagerObligationsPayload = {
    today: vilniusTodayDateString(),
    counts: { urgent: 0, callback: 0, email: 0, commercial: 0, total: 0 },
    items: [],
  };

  const uid = userId.trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uid)) {
    return empty;
  }

  const today = empty.today;
  const afterWorkHours = vilniusMinutesFromMidnight(new Date().toISOString()) >= DEFAULT_ACTIVITY_SCHEDULE.workEndMin;

  const { data: rawRows, error } = await supabase
    .from("project_work_items")
    .select(
      "id,project_id,client_name_snapshot,call_status,next_action_date,result_status,projects!inner(id,name,status)"
    )
    .eq("assigned_to", uid)
    .eq("projects.status", "active")
    .not("next_action_date", "is", null);

  if (error) {
    console.error("[managerObligations] work_items", error);
    return empty;
  }

  const candidates: WorkItemRow[] = [];
  for (const row of rawRows ?? []) {
    const r = row as Record<string, unknown>;
    const projectsRaw = r.projects;
    const project = Array.isArray(projectsRaw) ? projectsRaw[0] : projectsRaw;
    if (!project || typeof project !== "object") continue;
    const p = project as { id?: string; name?: string; status?: string };
    if (String(p.status ?? "") !== "active") continue;

    const resultStatus = String(r.result_status ?? "");
    if (isReturnedToCandidates(resultStatus) || isProjectWorkItemClosed(resultStatus)) continue;

    const col = normalizeKanbanCallStatus(String(r.call_status ?? ""));
    if (!OBLIGATION_COLUMNS.has(col)) continue;

    const due = String(r.next_action_date ?? "").slice(0, 10);
    if (!isIsoDate(due)) continue;

    candidates.push({
      id: String(r.id ?? ""),
      project_id: String(r.project_id ?? ""),
      client_name_snapshot: String(r.client_name_snapshot ?? "").trim() || "—",
      call_status: String(r.call_status ?? ""),
      next_action_date: due,
      result_status: resultStatus,
      projects: { id: String(p.id ?? ""), name: String(p.name ?? "").trim() || "Projektas", status: "active" },
    });
  }

  if (candidates.length === 0) return empty;

  const ids = candidates.map((c) => c.id).filter(Boolean);
  const { data: actRows, error: actErr } = await supabase
    .from("project_work_item_activities")
    .select("work_item_id,action_type,occurred_at")
    .in("work_item_id", ids)
    .in("action_type", ["email", "commercial"]);

  if (actErr) {
    console.error("[managerObligations] activities", actErr);
  }

  const actsByItem = activityDatesByWorkItem(
    (actRows ?? []) as Array<{ work_item_id: string; action_type: string; occurred_at: string }>
  );

  const items: ManagerObligationItem[] = [];

  for (const row of candidates) {
    const col = normalizeKanbanCallStatus(row.call_status);
    const due = row.next_action_date!;
    const projectId = row.project_id;
    const projectName = row.projects?.name ?? "Projektas";
    const href = `/projektai/${projectId}/darbas`;
    const actBucket = actsByItem.get(row.id);

    if (col === "Skubus veiksmas" && due <= today) {
      items.push({
        kind: "urgent",
        tone: obligationTone(due, today, afterWorkHours),
        workItemId: row.id,
        projectId,
        projectName,
        clientName: row.client_name_snapshot,
        dueDate: due,
        workingDaysOverdue: due < today ? countWorkingDaysLtIso(nextWorkingDayLtYmdAfter(due), today) : 0,
        href,
      });
      continue;
    }

    if (col === "Perskambinti" && due < today) {
      const overdueStart = nextWorkingDayLtYmdAfter(due);
      const workingDaysOverdue = countWorkingDaysLtIso(overdueStart, today);
      if (workingDaysOverdue <= 0) continue;
      items.push({
        kind: "callback",
        tone: "overdue",
        workItemId: row.id,
        projectId,
        projectName,
        clientName: row.client_name_snapshot,
        dueDate: due,
        workingDaysOverdue,
        href,
      });
      continue;
    }

    if (col === "Siųsti laišką" && due <= today && !hasActivityOnOrAfterDue(actBucket, "email", due)) {
      items.push({
        kind: "email",
        tone: obligationTone(due, today, afterWorkHours),
        workItemId: row.id,
        projectId,
        projectName,
        clientName: row.client_name_snapshot,
        dueDate: due,
        workingDaysOverdue: due < today ? countWorkingDaysLtIso(nextWorkingDayLtYmdAfter(due), today) : 0,
        href,
      });
      continue;
    }

    if (col === "Siųsti komercinį" && due <= today && !hasActivityOnOrAfterDue(actBucket, "commercial", due)) {
      items.push({
        kind: "commercial",
        tone: obligationTone(due, today, afterWorkHours),
        workItemId: row.id,
        projectId,
        projectName,
        clientName: row.client_name_snapshot,
        dueDate: due,
        workingDaysOverdue: due < today ? countWorkingDaysLtIso(nextWorkingDayLtYmdAfter(due), today) : 0,
        href,
      });
    }
  }

  const sorted = sortItems(items);
  const counts: ManagerObligationCounts = {
    urgent: sorted.filter((i) => i.kind === "urgent").length,
    callback: sorted.filter((i) => i.kind === "callback").length,
    email: sorted.filter((i) => i.kind === "email").length,
    commercial: sorted.filter((i) => i.kind === "commercial").length,
    total: sorted.length,
  };

  return { today, counts, items: sorted };
}
