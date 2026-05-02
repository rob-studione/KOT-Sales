export type PlaybookStatus = "draft" | "active" | "archived";

export function normalizePlaybookStatus(raw: string | null | undefined): PlaybookStatus {
  if (raw === "active" || raw === "archived" || raw === "draft") return raw;
  return "draft";
}

export function playbookStatusLabel(status: PlaybookStatus): string {
  switch (status) {
    case "draft":
      return "Draft";
    case "active":
      return "Active";
    case "archived":
      return "Archived";
  }
}

export function playbookStatusBadgeClasses(status: PlaybookStatus): string {
  switch (status) {
    case "draft":
      return "border border-zinc-200 bg-zinc-100 text-zinc-700";
    case "active":
      return "border border-emerald-200 bg-emerald-50 text-emerald-800";
    case "archived":
      return "border border-zinc-200/80 bg-white text-zinc-500";
  }
}

/** Leidžiami perėjimai: draft→active, active→archived */
export function canAdvancePlaybookStatus(current: PlaybookStatus, next: PlaybookStatus): boolean {
  if (current === "draft" && next === "active") return true;
  if (current === "active" && next === "archived") return true;
  return false;
}
