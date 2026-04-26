import { parseDateInputToIso } from "@/lib/crm/format";
import { normalizeKanbanCallStatus } from "@/lib/crm/projectBoardConstants";
import { nextWorkingDayAfterTodayVilnius } from "@/lib/crm/workingDaysLt";
import { vilniusTodayDateString } from "@/lib/crm/vilniusTime";

/** Numatytoji planuojamo veiksmo data pagal Kanban stulpelį (YYYY-MM-DD, Vilnius). */
export function defaultNextActionDateYmdForKanbanColumn(columnRaw: string): string | null {
  const s = normalizeKanbanCallStatus(columnRaw);
  const today = vilniusTodayDateString();
  switch (s) {
    case "Skambinti":
    case "Užbaigta":
      return null;
    case "Perskambinti":
    case "Laukti":
      return nextWorkingDayAfterTodayVilnius(today);
    case "Siųsti laišką":
    case "Siųsti komercinį":
    case "Skubus veiksmas":
      return today;
    default:
      return null;
  }
}

/** Stulpeliai, kuriuose Kanban kortelėje rodoma follow-up data. */
export const KANBAN_COLUMNS_SHOW_FOLLOW_UP_DATE = [
  "Perskambinti",
  "Laukti",
  "Skubus veiksmas",
  "Siųsti laišką",
  "Siųsti komercinį",
] as const;

export function kanbanColumnShowsFollowUpOnCard(columnRaw: string): boolean {
  const s = normalizeKanbanCallStatus(columnRaw);
  return (KANBAN_COLUMNS_SHOW_FOLLOW_UP_DATE as readonly string[]).includes(s);
}

/** Modale: matomas, redaguojamas data laukas (privaloma, ne hidden). */
export function kanbanColumnShowsDateFieldInModal(columnRaw: string): boolean {
  const s = normalizeKanbanCallStatus(columnRaw);
  return (
    s === "Perskambinti" ||
    s === "Laukti" ||
    s === "Skubus veiksmas" ||
    s === "Siųsti laišką" ||
    s === "Siųsti komercinį"
  );
}

export function kanbanColumnHidesDateFieldInModal(columnRaw: string): boolean {
  const s = normalizeKanbanCallStatus(columnRaw);
  return s === "Skambinti" || s === "Užbaigta";
}

/**
 * Efektyvi `next_action_date` reikšmė DB (Kanban patvirtinimas / touchpointas).
 * `rawTrimmed` — jau išvalytas formos laukas.
 */
export function resolveNextActionDateForKanbanStatus(opts: {
  callStatus: string;
  rawTrimmed: string;
}): { iso: string | null; error: string | null } {
  const col = normalizeKanbanCallStatus(opts.callStatus);
  const raw = opts.rawTrimmed;
  const parsed = raw ? parseDateInputToIso(raw) : null;
  if (raw && !parsed) {
    return { iso: null, error: "Neteisinga data. Naudokite formatą YYYY-MM-DD (pvz. 2026-04-15)." };
  }

  if (col === "Užbaigta" || col === "Skambinti") {
    return { iso: null, error: null };
  }

  if (col === "Laukti" || col === "Perskambinti") {
    if (!parsed) {
      return {
        iso: null,
        error: `Stulpeliui „${col}“ nurodykite planuojamos veiksmo datą (YYYY-MM-DD).`,
      };
    }
    return { iso: parsed, error: null };
  }

  if (col === "Skubus veiksmas" || col === "Siųsti laišką" || col === "Siųsti komercinį") {
    if (!parsed) {
      return {
        iso: null,
        error: `Stulpeliui „${col}“ nurodykite planuojamos veiksmo datą (YYYY-MM-DD).`,
      };
    }
    return { iso: parsed, error: null };
  }

  return { iso: null, error: null };
}

/** Palyginti follow-up datą su šiandiena (Vilnius). */
export function followUpDateVsTodayVilnius(nextActionDate: string | null | undefined): "none" | "past" | "today" | "future" {
  const d = typeof nextActionDate === "string" ? nextActionDate.trim().slice(0, 10) : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return "none";
  const today = vilniusTodayDateString();
  if (d < today) return "past";
  if (d === today) return "today";
  return "future";
}
