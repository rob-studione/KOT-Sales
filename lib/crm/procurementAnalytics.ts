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

async function rpcProcurementOverviewAnalytics(
  supabase: SupabaseClient,
  projectId: string,
  period: ProjectAnalyticsRange,
  totals: ProjectAnalyticsRange
): Promise<{ ok: true; data: Omit<ProcurementDashboardAnalyticsDto, "range"> } | { ok: false; error: string }> {
  const { data, error } = await supabase.rpc("project_procurement_overview_analytics", {
    p_project_id: projectId,
    p_period_from: period.from,
    p_period_to: period.to,
    p_totals_from: totals.from,
    p_totals_to: totals.to,
  });

  if (error) {
    return { ok: false, error: String(error.message ?? "") };
  }

  const payload = (data ?? {}) as {
    totals?: {
      contracts?: unknown;
      calls?: unknown;
      contacted?: unknown;
      calledWorkItems?: unknown;
      invitedOrIncluded?: unknown;
      totalValueEur?: unknown;
    };
    period?: {
      calls?: unknown;
      contacted?: unknown;
      contactedConversionPercent?: unknown;
      invitedOrIncluded?: unknown;
    };
  };

  const num = (v: unknown) => {
    const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
    return Number.isFinite(n) ? n : 0;
  };
  const int = (v: unknown) => Math.max(0, Math.trunc(num(v)));
  const pctRaw = payload.period?.contactedConversionPercent;
  const pctNum = typeof pctRaw === "number" ? pctRaw : typeof pctRaw === "string" ? Number(pctRaw) : NaN;

  return {
    ok: true,
    data: {
      totals: {
        contracts: int(payload.totals?.contracts),
        calls: int(payload.totals?.calls),
        contacted: int(payload.totals?.contacted),
        calledWorkItems: int(payload.totals?.calledWorkItems),
        invitedOrIncluded: int(payload.totals?.invitedOrIncluded),
        totalValueEur: num(payload.totals?.totalValueEur),
      },
      period: {
        calls: int(payload.period?.calls),
        contacted: int(payload.period?.contacted),
        contactedConversionPercent: Number.isFinite(pctNum) ? pctNum : null,
        invitedOrIncluded: int(payload.period?.invitedOrIncluded),
      },
    },
  };
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
    .select("work_item_id,occurred_at,action_type,call_status,project_work_items!inner(project_id,source_type,result_status)")
    .eq("project_work_items.project_id", projectId)
    .eq("project_work_items.source_type", "procurement_contract")
    .gte("occurred_at", startIso)
    .lte("occurred_at", endIso)
    .order("occurred_at", { ascending: true })
    .limit(20000);

  const activityByWork = new Map<string, Array<{ action_type: string; call_status: string }>>();
  const resultStatusByWorkId = new Map<string, string>();
  for (const r of (actRows ?? []) as Array<{
    work_item_id?: unknown;
    action_type?: unknown;
    call_status?: unknown;
    project_work_items?: { result_status?: unknown } | Array<{ result_status?: unknown }> | null;
  }>) {
    const wid = String(r.work_item_id ?? "");
    if (!wid) continue;
    const action = String(r.action_type ?? "").trim().toLowerCase();
    const callStatus = String(r.call_status ?? "");
    if (!activityByWork.has(wid)) activityByWork.set(wid, []);
    activityByWork.get(wid)!.push({ action_type: action, call_status: callStatus });
    const join = Array.isArray(r.project_work_items) ? r.project_work_items[0] : r.project_work_items;
    if (join && !resultStatusByWorkId.has(wid)) {
      resultStatusByWorkId.set(wid, String(join.result_status ?? ""));
    }
  }

  let calls = 0;
  const calledWorkIds = new Set<string>();
  const contactedWorkIds = new Set<string>();
  for (const [wid, list] of activityByWork.entries()) {
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
  for (const [wid, list] of activityByWork.entries()) {
    const rs = String(resultStatusByWorkId.get(wid) ?? "").trim().toLowerCase();
    if (!PROCUREMENT_INVITE_RESULTS.has(rs)) continue;
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
  for (const r of (contractRows ?? []) as Array<{ value?: unknown }>) {
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

  const rpc = await rpcProcurementOverviewAnalytics(supabase, projectId, range, totalsRange);
  if (rpc.ok) {
    return { range, ...rpc.data };
  }

  console.warn("[procurementAnalytics] overview RPC fallback:", rpc.error);
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
