import type { SupabaseClient } from "@supabase/supabase-js";
import { calendarDateInTimeZone, procurementCalendarDaysLeft, VILNIUS_TZ } from "@/lib/crm/procurementDates";
import { NOTIFICATION_TYPE_PROCUREMENT_DEADLINE } from "@/lib/crm/notificationConstants";
import { isProcurementProjectType, projectTypeFromDbRow } from "@/lib/crm/projectType";

/**
 * Kasdienis priminimas: jei liko ≤ notify_days_before dienų ir dar nepranešta — įrašo pranešimą ir notified_at.
 */
export async function runProcurementDeadlineNotifications(
  admin: SupabaseClient,
  now: Date = new Date()
): Promise<{ checked: number; notified: number; errors: string[] }> {
  const today = calendarDateInTimeZone(now, VILNIUS_TZ);
  if (!today) return { checked: 0, notified: 0, errors: ["Nepavyko nustatyti datos (Europe/Vilnius)."] };

  const errors: string[] = [];
  let notified = 0;

  const { data: contracts, error: cErr } = await admin
    .from("project_procurement_contracts")
    .select("id, project_id, organization_name, valid_until, notify_days_before, assigned_to, notified_at")
    .is("notified_at", null)
    .not("assigned_to", "is", null);

  if (cErr || !contracts) {
    return { checked: 0, notified: 0, errors: [cErr?.message ?? "Nepavyko nuskaityti sutarčių."] };
  }

  const projectIds = [...new Set(contracts.map((c) => String((c as { project_id: string }).project_id)))];
  const { data: projects, error: pErr } = await admin.from("projects").select("id, project_type, status").in("id", projectIds);

  if (pErr || !projects) {
    return { checked: 0, notified: 0, errors: [pErr?.message ?? "Nepavyko nuskaityti projektų."] };
  }

  const projectOk = new Set<string>();
  for (const p of projects) {
    const row = p as { id: string; project_type?: string | null; status?: string | null };
    const st = String(row.status ?? "");
    if (st !== "active") continue;
    if (!isProcurementProjectType(projectTypeFromDbRow(row) ?? row.project_type)) continue;
    projectOk.add(String(row.id));
  }

  type ContractNeedle = {
    id: string;
    project_id: string;
    organization_name?: string | null;
    valid_until: string;
    notify_days_before: number;
    assigned_to: string | null;
  };

  const candidates = (contracts as ContractNeedle[]).filter((c) => projectOk.has(String(c.project_id)));

  for (const c of candidates) {
    const validUntil = String(c.valid_until).slice(0, 10);
    const threshold = Number(c.notify_days_before ?? 0);
    if (!Number.isFinite(threshold)) continue;
    const daysLeft = procurementCalendarDaysLeft(validUntil, now);
    if (daysLeft === null || daysLeft < 0 || daysLeft > threshold) continue;

    const assignee = c.assigned_to;
    if (!assignee) continue;

    const leftLabel = String(daysLeft);
    const org = String(c.organization_name ?? "").trim() || "—";
    const message = `Sutarties galiojimas baigiasi (${org}). Likę dienų: ${leftLabel}.`;

    const { error: nErr } = await admin.from("notifications").insert({
      user_id: assignee,
      project_id: c.project_id,
      contract_id: c.id,
      type: NOTIFICATION_TYPE_PROCUREMENT_DEADLINE,
      message,
      is_read: false,
    });
    if (nErr) {
      errors.push(`${c.id}: ${nErr.message}`);
      continue;
    }

    const { error: uErr } = await admin
      .from("project_procurement_contracts")
      .update({ notified_at: new Date().toISOString() })
      .eq("id", c.id)
      .is("notified_at", null);

    if (uErr) {
      errors.push(`notified_at ${c.id}: ${uErr.message}`);
      continue;
    }
    notified += 1;
  }

  return { checked: candidates.length, notified, errors };
}
