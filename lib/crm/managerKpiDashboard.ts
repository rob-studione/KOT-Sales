import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { isCallAnsweredByStatus, isCallNotAnsweredByStatus } from "@/lib/crm/projectBoardConstants";
import {
  type ManagerKpiDateRange,
  type ManagerKpiPreset,
  calendarDaysInRange,
  comparisonRangeForPreset,
  resolveManagerKpiRange,
} from "@/lib/crm/managerKpiPeriods";
import { initialsFromDisplayName } from "@/lib/crm/crmUsers";
import { countWorkingDaysLtIso } from "@/lib/crm/workingDaysLt";
import { eachDayInclusive, isoDateInVilnius, vilniusEndUtc, vilniusStartUtc } from "@/lib/crm/vilniusTime";

const ACTIVITY_PAGE = 5000;
const MAX_ACTIVITY_ROWS = 80_000;

export const MANAGER_KPI_DEFAULTS = {
  daily_call_target: 30,
  daily_answered_target: 10,
  daily_commercial_target: 5,
} as const;

type ActivityRow = {
  work_item_id: string;
  occurred_at: string;
  action_type: string;
  call_status: string;
  /** Kai null — fallback į darbo eilutės `assigned_to` (įskaitant senus įrašus). */
  performed_by: string | null;
};

type UserAgg = {
  calls: number;
  answered: number;
  notAnswered: number;
  commercial: number;
};

type DayAgg = { calls: number; answered: number; commercial: number };

function emptyAgg(): UserAgg {
  return { calls: 0, answered: 0, notAnswered: 0, commercial: 0 };
}

async function fetchActivitiesWindow(
  supabase: SupabaseClient,
  range: ManagerKpiDateRange
): Promise<{ rows: ActivityRow[]; truncated: boolean }> {
  const startIso = vilniusStartUtc(range.from);
  const endIso = vilniusEndUtc(range.to);
  const out: ActivityRow[] = [];
  let from = 0;
  let truncated = false;
  for (;;) {
    const { data, error } = await supabase
      .from("project_work_item_activities")
      .select("work_item_id,occurred_at,action_type,call_status,performed_by")
      .gte("occurred_at", startIso)
      .lte("occurred_at", endIso)
      .order("occurred_at", { ascending: true })
      .range(from, from + ACTIVITY_PAGE - 1);
    if (error) {
      console.error("[managerKpiDashboard] activities", error);
      return { rows: out, truncated };
    }
    const chunk = data ?? [];
    if (chunk.length === 0) break;
    for (const r of chunk) {
      const pb = (r as { performed_by?: string | null }).performed_by;
      out.push({
        work_item_id: String((r as { work_item_id?: string }).work_item_id ?? ""),
        occurred_at: String((r as { occurred_at?: string }).occurred_at ?? ""),
        action_type: String((r as { action_type?: string }).action_type ?? "").toLowerCase(),
        call_status: String((r as { call_status?: string }).call_status ?? ""),
        performed_by: pb == null || pb === "" ? null : String(pb),
      });
    }
    if (chunk.length < ACTIVITY_PAGE) break;
    from += ACTIVITY_PAGE;
    if (from >= MAX_ACTIVITY_ROWS) {
      truncated = true;
      break;
    }
  }
  return { rows: out, truncated };
}

async function loadAssignedToMap(supabase: SupabaseClient, workItemIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const ids = [...new Set(workItemIds)].filter(Boolean);
  const batch = 120;
  for (let i = 0; i < ids.length; i += batch) {
    const slice = ids.slice(i, i + batch);
    const { data, error } = await supabase.from("project_work_items").select("id,assigned_to").in("id", slice);
    if (error) {
      console.error("[managerKpiDashboard] work_items", error);
      continue;
    }
    for (const r of data ?? []) {
      const id = String((r as { id?: string }).id ?? "");
      const a = (r as { assigned_to?: string | null }).assigned_to;
      if (id && a) map.set(id, String(a));
    }
  }
  return map;
}

function aggregateAssigned(
  activities: ActivityRow[],
  assignedTo: Map<string, string>,
  kpiTrackedUserIds: Set<string>
): { byUser: Map<string, UserAgg>; byDay: Map<string, DayAgg>; warnings: string[] } {
  const byUser = new Map<string, UserAgg>();
  const byDay = new Map<string, DayAgg>();
  const warnings: string[] = [];

  function bumpUser(uid: string, fn: (a: UserAgg) => void) {
    if (!byUser.has(uid)) byUser.set(uid, emptyAgg());
    fn(byUser.get(uid)!);
  }

  function bumpDay(day: string, fn: (d: DayAgg) => void) {
    if (!byDay.has(day)) byDay.set(day, { calls: 0, answered: 0, commercial: 0 });
    fn(byDay.get(day)!);
  }

  for (const a of activities) {
    const fromActivity = (a.performed_by ?? "").trim();
    const fromWorkItem = (assignedTo.get(a.work_item_id) ?? "").trim();
    const day = isoDateInVilnius(a.occurred_at);

    if (a.action_type === "commercial") {
      const uid = fromActivity || fromWorkItem;
      if (!uid || !kpiTrackedUserIds.has(uid)) continue;
      bumpUser(uid, (x) => {
        x.commercial += 1;
      });
      bumpDay(day, (d) => {
        d.commercial += 1;
      });
      continue;
    }

    if (a.action_type !== "call") continue;
    if (!fromActivity || !kpiTrackedUserIds.has(fromActivity)) continue;

    bumpUser(fromActivity, (x) => {
      x.calls += 1;
      if (isCallAnsweredByStatus(a.call_status)) x.answered += 1;
      else if (isCallNotAnsweredByStatus(a.call_status)) x.notAnswered += 1;
    });
    bumpDay(day, (d) => {
      d.calls += 1;
      if (isCallAnsweredByStatus(a.call_status)) d.answered += 1;
    });
  }

  return { byUser, byDay, warnings };
}

export type ManagerKpiUserTargets = {
  user_id: string;
  daily_call_target: number;
  daily_answered_target: number;
  daily_commercial_target: number;
};

export type ManagerKpiTableRow = {
  userId: string;
  name: string;
  initials: string;
  calls: number;
  answered: number;
  notAnswered: number;
  answerRatePct: number | null;
  commercial: number;
  callsTarget: number;
  answeredTarget: number;
  commercialTarget: number;
  callsPct: number | null;
  answeredPct: number | null;
  status: "ok" | "warn" | "bad";
  trendCallsActual: number | null;
  trendAnsweredActual: number | null;
};

export type ManagerKpiTeamSummary = {
  calls: number;
  answered: number;
  notAnswered: number;
  answerRatePct: number | null;
  commercial: number;
  callsTarget: number;
  answeredTarget: number;
  callsKpiPct: number | null;
  answeredKpiPct: number | null;
  trendCallsActual: number | null;
  trendAnsweredActual: number | null;
  trendAnswerRatePP: number | null;
};

export type ManagerKpiChartPoint = { date: string; calls: number; answered: number; commercial: number };

export type ManagerKpiViewModel = {
  preset: ManagerKpiPreset;
  range: ManagerKpiDateRange;
  compareRange: ManagerKpiDateRange | null;
  compareEnabled: boolean;
  /** Kalendorinės dienos intervale (grafikas ir antraštė). */
  dayCount: number;
  /** Darbo dienos Lietuvoje (šventės + savaitgaliai išimti) — KPI target daugiklis. */
  workingDayCount: number;
  truncated: boolean;
  team: ManagerKpiTeamSummary;
  rows: ManagerKpiTableRow[];
  chart: ManagerKpiChartPoint[];
  targets: ManagerKpiUserTargets[];
  warnings: string[];
};

function pct(actual: number, target: number): number | null {
  if (target <= 0) return null;
  return Math.round((actual / target) * 1000) / 10;
}

function rowStatus(callsPct: number | null, answeredPct: number | null): "ok" | "warn" | "bad" {
  const scores: number[] = [];
  if (callsPct != null) scores.push(callsPct);
  if (answeredPct != null) scores.push(answeredPct);
  if (scores.length === 0) return "warn";
  const m = Math.min(...scores);
  if (m >= 100) return "ok";
  if (m >= 80) return "warn";
  return "bad";
}

function trendActual(cur: number, prev: number): number | null {
  if (prev <= 0) return cur > 0 ? 100 : cur < 0 ? -100 : null;
  return Math.round(((cur - prev) / prev) * 1000) / 10;
}

export async function buildManagerKpiViewModel(
  supabase: SupabaseClient,
  opts: {
    preset: ManagerKpiPreset;
    customFrom?: string | null;
    customTo?: string | null;
    compare: boolean;
  }
): Promise<ManagerKpiViewModel> {
  const range = resolveManagerKpiRange(opts.preset, opts.customFrom, opts.customTo);
  const dayCount = calendarDaysInRange(range);
  const workingDayCount = Math.max(0, countWorkingDaysLtIso(range.from, range.to));
  const compareRange = opts.compare ? comparisonRangeForPreset(opts.preset, range, opts.customFrom, opts.customTo) : null;

  const warnings: string[] = [];

  const [{ rows: curActs, truncated }, prevActsPack, usersRes, targetsRes] = await Promise.all([
    fetchActivitiesWindow(supabase, range),
    compareRange ? fetchActivitiesWindow(supabase, compareRange) : Promise.resolve({ rows: [] as ActivityRow[], truncated: false }),
    supabase
      .from("crm_users")
      .select("id,name,email,role,status,is_kpi_tracked")
      .eq("status", "active")
      .eq("is_kpi_tracked", true)
      .order("name", { ascending: true }),
    supabase.from("crm_user_kpi_targets").select("user_id,daily_call_target,daily_answered_target,daily_commercial_target"),
  ]);

  if (truncated) {
    warnings.push(
      `Veiklos įrašai apkirpti po ${MAX_ACTIVITY_ROWS.toLocaleString("lt-LT")} eilučių. Skaičiai gali būti ne pilni.`
    );
  }

  if (targetsRes.error) {
    const msg = targetsRes.error.message ?? "Nepavyko nuskaityti KPI tikslų (crm_user_kpi_targets).";
    if (msg.includes("Could not find the table") || msg.includes("crm_user_kpi_targets")) {
      warnings.push("Nerasta lentelė `crm_user_kpi_targets` (migracija nepritaikyta). KPI tikslai imami pagal numatytuosius (default).");
    } else {
      warnings.push(`Nepavyko nuskaityti KPI tikslų: ${msg}`);
    }
  }

  const users = (usersRes.data ?? []) as Array<{ id: string; name: string | null; email: string | null; role: string }>;
  const targetByUser = new Map<string, ManagerKpiUserTargets>();
  for (const r of targetsRes.data ?? []) {
    const uid = String((r as { user_id?: string }).user_id ?? "");
    if (!uid) continue;
    targetByUser.set(uid, {
      user_id: uid,
      daily_call_target: Number((r as { daily_call_target?: number }).daily_call_target ?? MANAGER_KPI_DEFAULTS.daily_call_target),
      daily_answered_target: Number(
        (r as { daily_answered_target?: number }).daily_answered_target ?? MANAGER_KPI_DEFAULTS.daily_answered_target
      ),
      daily_commercial_target: Number(
        (r as { daily_commercial_target?: number }).daily_commercial_target ?? MANAGER_KPI_DEFAULTS.daily_commercial_target
      ),
    });
  }

  const workIds = curActs.map((a) => a.work_item_id);
  const prevIds = compareRange ? prevActsPack.rows.map((a) => a.work_item_id) : [];
  const assignedTo = await loadAssignedToMap(supabase, [...workIds, ...prevIds]);

  const kpiTrackedUserIds = new Set(users.map((u) => u.id));
  const curAgg = aggregateAssigned(curActs, assignedTo, kpiTrackedUserIds);
  const prevAgg = compareRange ? aggregateAssigned(prevActsPack.rows, assignedTo, kpiTrackedUserIds) : null;
  warnings.push(...curAgg.warnings);

  const prevByUser = prevAgg?.byUser ?? new Map<string, UserAgg>();

  /** Komandos suvestinė: skambučiai tik `action_type=call` su ne null `performed_by`; komerciniai – coalesce(performed_by, assigned_to). */
  const teamAgg = emptyAgg();
  for (const a of curAgg.byUser.values()) {
    teamAgg.calls += a.calls;
    teamAgg.answered += a.answered;
    teamAgg.notAnswered += a.notAnswered;
    teamAgg.commercial += a.commercial;
  }
  const teamAnswerRate = teamAgg.calls > 0 ? Math.round((teamAgg.answered / teamAgg.calls) * 1000) / 10 : null;

  let teamCallsTarget = 0;
  let teamAnsweredTarget = 0;
  for (const u of users) {
    const t = targetByUser.get(u.id) ?? {
      user_id: u.id,
      daily_call_target: MANAGER_KPI_DEFAULTS.daily_call_target,
      daily_answered_target: MANAGER_KPI_DEFAULTS.daily_answered_target,
      daily_commercial_target: MANAGER_KPI_DEFAULTS.daily_commercial_target,
    };
    teamCallsTarget += t.daily_call_target * workingDayCount;
    teamAnsweredTarget += t.daily_answered_target * workingDayCount;
  }

  const teamPrev = emptyAgg();
  if (prevAgg) {
    for (const a of prevByUser.values()) {
      teamPrev.calls += a.calls;
      teamPrev.answered += a.answered;
      teamPrev.notAnswered += a.notAnswered;
      teamPrev.commercial += a.commercial;
    }
  }
  const prevTeamAnswerRate = teamPrev.calls > 0 ? teamPrev.answered / teamPrev.calls : null;
  const curTeamAnswerRate = teamAgg.calls > 0 ? teamAgg.answered / teamAgg.calls : null;
  const trendAnswerRatePP =
    compareRange && prevTeamAnswerRate != null && curTeamAnswerRate != null
      ? Math.round((curTeamAnswerRate - prevTeamAnswerRate) * 1000) / 10
      : null;

  const team: ManagerKpiTeamSummary = {
    calls: teamAgg.calls,
    answered: teamAgg.answered,
    notAnswered: teamAgg.notAnswered,
    answerRatePct: teamAnswerRate,
    commercial: teamAgg.commercial,
    callsTarget: teamCallsTarget,
    answeredTarget: teamAnsweredTarget,
    callsKpiPct: pct(teamAgg.calls, teamCallsTarget),
    answeredKpiPct: pct(teamAgg.answered, teamAnsweredTarget),
    trendCallsActual: compareRange ? trendActual(teamAgg.calls, teamPrev.calls) : null,
    trendAnsweredActual: compareRange ? trendActual(teamAgg.answered, teamPrev.answered) : null,
    trendAnswerRatePP,
  };

  const rows: ManagerKpiTableRow[] = users.map((u) => {
    const a = curAgg.byUser.get(u.id) ?? emptyAgg();
    const p = prevByUser.get(u.id) ?? emptyAgg();
    const t = targetByUser.get(u.id) ?? {
      user_id: u.id,
      daily_call_target: MANAGER_KPI_DEFAULTS.daily_call_target,
      daily_answered_target: MANAGER_KPI_DEFAULTS.daily_answered_target,
      daily_commercial_target: MANAGER_KPI_DEFAULTS.daily_commercial_target,
    };
    const callsTarget = t.daily_call_target * workingDayCount;
    const answeredTarget = t.daily_answered_target * workingDayCount;
    const commercialTarget = t.daily_commercial_target * workingDayCount;
    const answerRate = a.calls > 0 ? Math.round((a.answered / a.calls) * 1000) / 10 : null;
    const cPct = pct(a.calls, callsTarget);
    const aPct = pct(a.answered, answeredTarget);
    const displayName = String(u.name ?? "").trim() || String(u.email ?? "").trim() || u.id;
    return {
      userId: u.id,
      name: displayName,
      initials: initialsFromDisplayName(displayName),
      calls: a.calls,
      answered: a.answered,
      notAnswered: a.notAnswered,
      answerRatePct: answerRate,
      commercial: a.commercial,
      callsTarget,
      answeredTarget,
      commercialTarget,
      callsPct: cPct,
      answeredPct: aPct,
      status: rowStatus(cPct, aPct),
      trendCallsActual: compareRange ? trendActual(a.calls, p.calls) : null,
      trendAnsweredActual: compareRange ? trendActual(a.answered, p.answered) : null,
    };
  });

  const days = eachDayInclusive(range.from, range.to);
  const chart: ManagerKpiChartPoint[] = days.map((d) => {
    const x = curAgg.byDay.get(d) ?? { calls: 0, answered: 0, commercial: 0 };
    return { date: d, calls: x.calls, answered: x.answered, commercial: x.commercial };
  });

  const targetsList: ManagerKpiUserTargets[] = users.map((u) => {
    return (
      targetByUser.get(u.id) ?? {
        user_id: u.id,
        daily_call_target: MANAGER_KPI_DEFAULTS.daily_call_target,
        daily_answered_target: MANAGER_KPI_DEFAULTS.daily_answered_target,
        daily_commercial_target: MANAGER_KPI_DEFAULTS.daily_commercial_target,
      }
    );
  });

  return {
    preset: opts.preset,
    range,
    compareRange,
    compareEnabled: opts.compare,
    dayCount,
    workingDayCount,
    truncated,
    team,
    rows,
    chart,
    targets: targetsList,
    warnings,
  };
}
