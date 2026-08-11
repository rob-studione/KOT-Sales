import type { SupabaseClient } from "@supabase/supabase-js";
import { calendarDateInTimeZone, procurementCalendarDaysLeft, VILNIUS_TZ } from "@/lib/crm/procurementDates";
import { NOTIFICATION_TYPE_PROCUREMENT_DEADLINE } from "@/lib/crm/notificationConstants";
import { isProcurementProjectType, projectTypeFromDbRow } from "@/lib/crm/projectType";
import { procurementOrgClientKeyFromContract } from "@/lib/crm/procurementContractClientKey";

type ContractNeedle = {
  id: string;
  project_id: string;
  organization_name?: string | null;
  organization_code?: string | null;
  valid_until: string;
  notify_days_before: number;
  assigned_to: string | null;
  notified_at?: string | null;
};

/**
 * Kasdienis priminimas įstaigos lygiu:
 * jei artimiausia nepranešta sutartis turi ≤ notify_days_before dienų —
 * vienas pranešimas įstaigai, visoms jos „due“ sutartims pažymimas notified_at.
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
    .select("id, project_id, organization_name, organization_code, valid_until, notify_days_before, assigned_to, notified_at")
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

  const candidates = (contracts as ContractNeedle[]).filter((c) => projectOk.has(String(c.project_id)));

  type OrgBucket = {
    projectId: string;
    orgKey: string;
    orgName: string;
    assignee: string;
    threshold: number;
    nearestDaysLeft: number;
    nearestValidUntil: string;
    nearestContractId: string;
    contractIds: string[];
  };

  const buckets = new Map<string, OrgBucket>();

  for (const c of candidates) {
    const validUntil = String(c.valid_until).slice(0, 10);
    const threshold = Number(c.notify_days_before ?? 0);
    if (!Number.isFinite(threshold)) continue;
    const daysLeft = procurementCalendarDaysLeft(validUntil, now);
    if (daysLeft === null || daysLeft < 0 || daysLeft > threshold) continue;

    const assignee = String(c.assigned_to ?? "").trim();
    if (!assignee) continue;

    const orgKey =
      procurementOrgClientKeyFromContract({
        organization_code: c.organization_code,
        organization_name: c.organization_name,
      }) ?? `po:id:${c.id}`;
    const bucketKey = `${c.project_id}::${orgKey}::${assignee}`;
    const orgName = String(c.organization_name ?? "").trim() || "—";

    const existing = buckets.get(bucketKey);
    if (!existing) {
      buckets.set(bucketKey, {
        projectId: String(c.project_id),
        orgKey,
        orgName,
        assignee,
        threshold,
        nearestDaysLeft: daysLeft,
        nearestValidUntil: validUntil,
        nearestContractId: String(c.id),
        contractIds: [String(c.id)],
      });
      continue;
    }

    existing.contractIds.push(String(c.id));
    if (daysLeft < existing.nearestDaysLeft) {
      existing.nearestDaysLeft = daysLeft;
      existing.nearestValidUntil = validUntil;
      existing.nearestContractId = String(c.id);
      existing.threshold = threshold;
    }
  }

  for (const b of buckets.values()) {
    const n = b.contractIds.length;
    const message =
      n > 1
        ? `Įstaigos „${b.orgName}“ artėja ${n} sutarčių terminai. Artimiausia po ${b.nearestDaysLeft} d. (${b.nearestValidUntil}).`
        : `Sutarties galiojimas baigiasi (${b.orgName}). Likę dienų: ${b.nearestDaysLeft}.`;

    const { error: nErr } = await admin.from("notifications").insert({
      user_id: b.assignee,
      project_id: b.projectId,
      contract_id: b.nearestContractId,
      type: NOTIFICATION_TYPE_PROCUREMENT_DEADLINE,
      message,
      is_read: false,
    });
    if (nErr) {
      errors.push(`${b.orgKey}: ${nErr.message}`);
      continue;
    }

    const { error: uErr } = await admin
      .from("project_procurement_contracts")
      .update({ notified_at: new Date().toISOString() })
      .in("id", b.contractIds)
      .is("notified_at", null);

    if (uErr) {
      errors.push(`notified_at ${b.orgKey}: ${uErr.message}`);
      continue;
    }
    notified += 1;
  }

  return { checked: candidates.length, notified, errors };
}
