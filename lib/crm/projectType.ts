/**
 * `project_type` aiškinimas visoje CRM.
 *
 * Legacy: iki `project_type` stulpelio visi projektai buvo automatiniai (RPC kandidatai).
 * NULL / tuščia / nežinoma reikšmė → elgiamės kaip su **automatic**, kad neprarastų „Priskirti sau“.
 */

/** Skaito tipą iš Supabase / PostgREST eilutės (`project_type` arba retas `projectType`). */
export function projectTypeFromDbRow(row: unknown): string | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  const v = r["project_type"] ?? r["projectType"];
  if (v == null) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
}

export type CrmProjectType = "automatic" | "manual" | "procurement";

export function isManualProjectType(projectType: string | null | undefined): boolean {
  return String(projectType ?? "").trim().toLowerCase() === "manual";
}

export function isProcurementProjectType(projectType: string | null | undefined): boolean {
  return String(projectType ?? "").trim().toLowerCase() === "procurement";
}

export function effectiveProjectType(projectType: string | null | undefined): CrmProjectType {
  if (isManualProjectType(projectType)) return "manual";
  if (isProcurementProjectType(projectType)) return "procurement";
  return "automatic";
}

export function projectTypeLabelLt(projectType: string | null | undefined): string {
  const eff = effectiveProjectType(projectType);
  if (eff === "manual") return "Rankinis";
  if (eff === "procurement") return "Viešieji pirkimai";
  return "Automatinis";
}
