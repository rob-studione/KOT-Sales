/** Lower numeric rank (e.g. list index or snapshot_priority) = higher sales priority. */
export type CallListPriority = "high" | "medium" | "low";

export function priorityFromRankInList(rank0: number, total: number): CallListPriority {
  if (total <= 0) return "medium";
  const t = Math.max(1, total);
  const p = rank0 / t;
  if (p < 1 / 3) return "high";
  if (p < 2 / 3) return "medium";
  return "low";
}

/** For work items: smaller snapshot_priority means picked earlier (stronger). */
export function priorityFromSnapshotScore(
  snapshotPriority: number,
  allPriorities: number[]
): CallListPriority {
  const vals = [...allPriorities].filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (vals.length === 0) return "medium";
  const p33 = vals[Math.floor((vals.length - 1) * 0.33)]!;
  const p66 = vals[Math.floor((vals.length - 1) * 0.66)]!;
  if (snapshotPriority <= p33) return "high";
  if (snapshotPriority <= p66) return "medium";
  return "low";
}

export function callListPriorityLabel(p: CallListPriority): string {
  switch (p) {
    case "high":
      return "Aukštas";
    case "low":
      return "Žemas";
    default:
      return "Vidutinis";
  }
}
