import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { isCallAnsweredByStatus } from "@/lib/crm/projectBoardConstants";
import type { ProjectAnalyticsRange } from "@/lib/crm/projectAnalytics";

export type ProcurementDashboardAnalyticsDto = {
  range: ProjectAnalyticsRange;
  totals: {
    contracts: number;
    calls: number;
    contacted: number;
    calledWorkItems: number;
    invitedOrIncluded: number;
    totalValueEur: number;
  };
  period: {
    calls: number;
    contacted: number;
    contactedConversionPercent: number | null;
    invitedOrIncluded: number;
  };
};

function rangeToUtcBounds(range: ProjectAnalyticsRange): { startIso: string; endIso: string } {
  return {
    startIso: `${range.from}T00:00:00.000Z`,
    endIso: `${range.to}T23:59:59.999Z`,
  };
}

const PROCUREMENT_INVITE_RESULTS = new Set<string>([
  "completion_procurement_invite_participate",
  "completion_procurement_include_purchase",
]);

function vilniusTodayYmd(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Vilnius",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const d = parts.find((p) => p.type === "day")?.value;
  if (!y || !m || !d) return now.toISOString().slice(0, 10);
  return `${y}-${m}-${d}`;
}

function ymdFromIso(iso: string): string {
  const s = String(iso ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : vilniusTodayYmd();
}

async function computeProcurementEffortAndInvites(
  supabase: SupabaseClient,
  projectId: string,
  range: ProjectAnalyticsRange
): Promise<{
  calls: number;
  contacted: number;
  contactedConversionPercent: number | null;
  invitedOrIncluded: number;
  calledWorkItems: number;
}> {
  const { startIso, endIso } = rangeToUtcBounds(range);

  const { data: actRows } = await supabase
    .from("project_work_item_activities")
    .select("work_item_id,occurred_at,action_type,call_status")
    .gte("occurred_at", startIso)
    .lte("occurred_at", endIso)
    .order("occurred_at", { ascending: true })
    .limit(20000);

  const activityByWork = new Map<string, Array<{ action_type: string; call_status: string }>>();
  for (const r of (actRows ?? []) as any[]) {
    const wid = String(r.work_item_id ?? "");
    if (!wid) continue;
    const action = String(r.action_type ?? "").trim().toLowerCase();
    const callStatus = String(r.call_status ?? "");
    if (!activityByWork.has(wid)) activityByWork.set(wid, []);
    activityByWork.get(wid)!.push({ action_type: action, call_status: callStatus });
  }

  const workIds = [...activityByWork.keys()];
  let workRows: Array<{ id: string; source_type: string | null; result_status: string | null }> = [];
  if (workIds.length > 0) {
    const { data: wRows } = await supabase
      .from("project_work_items")
      .select("id,source_type,result_status")
      .eq("project_id", projectId)
      .in("id", workIds);
    workRows = (wRows ?? []) as any[];
  }

  const procurementWorkIds = new Set(
    workRows.filter((w) => String(w.source_type ?? "") === "procurement_contract").map((w) => String(w.id))
  );
  const resultStatusByWorkId = new Map<string, string>();
  for (const w of workRows) resultStatusByWorkId.set(String(w.id), String((w as any).result_status ?? ""));

  let calls = 0;
  const calledWorkIds = new Set<string>();
  const contactedWorkIds = new Set<string>();
  for (const [wid, list] of activityByWork.entries()) {
    if (!procurementWorkIds.has(wid)) continue;
    let hadCall = false;
    let contacted = false;
    for (const a of list) {
      if (a.action_type === "call") {
        calls += 1;
        hadCall = true;
        if (isCallAnsweredByStatus(a.call_status)) contacted = true;
      }
    }
    if (hadCall) calledWorkIds.add(wid);
    if (hadCall && contacted) contactedWorkIds.add(wid);
  }

  const called = calledWorkIds.size;
  const contacted = contactedWorkIds.size;
  const contactedConversionPercent = called > 0 ? (contacted / called) * 100 : null;

  let invitedOrIncluded = 0;
  for (const wid of procurementWorkIds) {
    const rs = String(resultStatusByWorkId.get(wid) ?? "").trim().toLowerCase();
    if (!PROCUREMENT_INVITE_RESULTS.has(rs)) continue;
    const list = activityByWork.get(wid) ?? [];
    if (list.some((a) => String(a.call_status ?? "").trim() === "Užbaigta")) {
      invitedOrIncluded += 1;
    }
  }

  return { calls, contacted, contactedConversionPercent, invitedOrIncluded, calledWorkItems: called };
}

async function fetchProcurementContractsTotalValue(
  supabase: SupabaseClient,
  projectId: string
): Promise<number> {
  const { data: contractRows } = await supabase
    .from("project_procurement_contracts")
    .select("value")
    .eq("project_id", projectId)
    .limit(12000);
  let totalEur = 0;
  for (const r of (contractRows ?? []) as any[]) {
    const v = r.value == null ? null : Number(r.value);
    if (v != null && Number.isFinite(v)) totalEur += v;
  }
  return totalEur;
}

async function fetchProcurementContractsCountTotal(supabase: SupabaseClient, projectId: string): Promise<number> {
  const { count, error } = await supabase
    .from("project_procurement_contracts")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId);
  if (error) return 0;
  return count ?? 0;
}

export async function fetchProcurementDashboardAnalytics(
  supabase: SupabaseClient,
  projectId: string,
  projectCreatedAtIso: string,
  range: ProjectAnalyticsRange
): Promise<ProcurementDashboardAnalyticsDto> {
  const createdFrom = ymdFromIso(projectCreatedAtIso);
  const today = vilniusTodayYmd();
  const totalsRange: ProjectAnalyticsRange = { from: createdFrom, to: today };

  const [totalsEff, periodEff, totalValueEur, totalContracts] = await Promise.all([
    computeProcurementEffortAndInvites(supabase, projectId, totalsRange),
    computeProcurementEffortAndInvites(supabase, projectId, range),
    fetchProcurementContractsTotalValue(supabase, projectId),
    fetchProcurementContractsCountTotal(supabase, projectId),
  ]);

  return {
    range,
    totals: {
      contracts: totalContracts,
      calls: totalsEff.calls,
      contacted: totalsEff.contacted,
      calledWorkItems: totalsEff.calledWorkItems,
      invitedOrIncluded: totalsEff.invitedOrIncluded,
      totalValueEur,
    },
    period: {
      calls: periodEff.calls,
      contacted: periodEff.contacted,
      contactedConversionPercent: periodEff.contactedConversionPercent,
      invitedOrIncluded: periodEff.invitedOrIncluded,
    },
  };
}

