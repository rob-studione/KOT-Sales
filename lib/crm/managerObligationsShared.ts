export type ManagerObligationKind = "urgent" | "callback" | "email" | "commercial";

export type ManagerObligationTone = "today" | "overdue";

export type ManagerObligationItem = {
  kind: ManagerObligationKind;
  tone: ManagerObligationTone;
  workItemId: string;
  projectId: string;
  projectName: string;
  clientName: string;
  dueDate: string;
  workingDaysOverdue: number;
  href: string;
};

export type ManagerObligationCounts = {
  urgent: number;
  callback: number;
  email: number;
  commercial: number;
  total: number;
};

export type ManagerObligationProjectSummary = {
  projectId: string;
  projectName: string;
  href: string;
  urgent: number;
  callback: number;
  email: number;
  commercial: number;
  total: number;
  hasOverdue: boolean;
};

export type ManagerObligationsPayload = {
  today: string;
  counts: ManagerObligationCounts;
  items: ManagerObligationItem[];
};

export function groupManagerObligationsByProject(items: ManagerObligationItem[]): ManagerObligationProjectSummary[] {
  const map = new Map<string, ManagerObligationProjectSummary>();
  for (const item of items) {
    let row = map.get(item.projectId);
    if (!row) {
      row = {
        projectId: item.projectId,
        projectName: item.projectName,
        href: `/projektai/${item.projectId}/darbas`,
        urgent: 0,
        callback: 0,
        email: 0,
        commercial: 0,
        total: 0,
        hasOverdue: false,
      };
      map.set(item.projectId, row);
    }
    row[item.kind] += 1;
    row.total += 1;
    if (item.tone === "overdue" || item.kind === "callback") row.hasOverdue = true;
  }
  return [...map.values()].sort((a, b) => {
    if (a.hasOverdue !== b.hasOverdue) return a.hasOverdue ? -1 : 1;
    if (b.total !== a.total) return b.total - a.total;
    return a.projectName.localeCompare(b.projectName, "lt");
  });
}

export function formatManagerObligationProjectSummary(row: ManagerObligationProjectSummary): string {
  const parts: string[] = [];
  if (row.callback > 0) parts.push(`${row.callback} neperskamb.`);
  if (row.urgent > 0) parts.push(`${row.urgent} skub${row.urgent === 1 ? "us" : "ūs"}`);
  if (row.email > 0) parts.push(`${row.email} laiškas`);
  if (row.commercial > 0) parts.push(`${row.commercial} komerc.`);
  return parts.join(" · ");
}
