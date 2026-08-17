import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ACTIVITY_SETTINGS_KEYS,
  DEFAULT_ACTIVITY_SCHEDULE,
  SIGNIFICANT_ACTIVITY_TYPES,
  buildActivityPeriod,
  emptyActivityPeriod,
  isSignificantActivityType,
  scheduleFromSettings,
  type ActivityEvent,
  type ActivityPeriodModel,
  type ActivitySchedule,
} from "@/lib/crm/managerActivity";
import { isoDateInVilnius, vilniusEndUtc, vilniusMinutesFromMidnight, vilniusStartUtc, vilniusTodayDateString } from "@/lib/crm/vilniusTime";
import { listWorkingDaysLtIso } from "@/lib/crm/workingDaysLt";
import type { ManagerKpiDateRange } from "@/lib/crm/managerKpiPeriods";

const ACTIVITY_PAGE = 5000;
const MAX_ACTIVITY_ROWS = 80_000;

async function loadActivitySchedule(supabase: SupabaseClient): Promise<ActivitySchedule> {
  const keys = Object.values(ACTIVITY_SETTINGS_KEYS);
  const { data, error } = await supabase.from("crm_settings").select("key,value").in("key", keys);
  if (error) return DEFAULT_ACTIVITY_SCHEDULE;
  return scheduleFromSettings(data as Array<{ key?: string; value?: string | null }>);
}

export async function loadManagerActivityForRange(
  supabase: SupabaseClient,
  userIds: string[],
  range: ManagerKpiDateRange
): Promise<{ byUser: Map<string, ActivityPeriodModel>; truncated: boolean }> {
  const byUser = new Map<string, ActivityPeriodModel>();
  const ids = [...new Set(userIds)].filter(Boolean);
  const today = vilniusTodayDateString();
  const liveNowMin = vilniusMinutesFromMidnight(new Date().toISOString());
  const schedule = await loadActivitySchedule(supabase);
  const empty = () => emptyActivityPeriod(schedule);
  const toYmd = range.to > today ? today : range.to;
  const workingDays = range.from > toYmd ? [] : listWorkingDaysLtIso(range.from, toYmd);
  const isSingleCalendarDay = range.from === range.to;

  if (ids.length === 0) return { byUser, truncated: false };

  const eventsByUserDay = new Map<string, Map<string, ActivityEvent[]>>();
  for (const id of ids) eventsByUserDay.set(id, new Map());

  let truncated = false;
  if (range.from <= toYmd) {
    const startIso = vilniusStartUtc(range.from);
    const endIso = vilniusEndUtc(toYmd);
    let from = 0;
    for (;;) {
      const { data, error } = await supabase
        .from("project_work_item_activities")
        .select("performed_by,occurred_at,action_type")
        .gte("occurred_at", startIso)
        .lte("occurred_at", endIso)
        .in("action_type", [...SIGNIFICANT_ACTIVITY_TYPES])
        .in("performed_by", ids)
        .order("occurred_at", { ascending: true })
        .range(from, from + ACTIVITY_PAGE - 1);
      if (error) {
        console.error("[managerActivity] range fetch", error);
        for (const id of ids) byUser.set(id, empty());
        return { byUser, truncated };
      }
      const chunk = data ?? [];
      if (chunk.length === 0) break;
      for (const row of chunk) {
        const uid = String((row as { performed_by?: string | null }).performed_by ?? "").trim();
        if (!uid || !eventsByUserDay.has(uid)) continue;
        const at = String((row as { occurred_at?: string }).occurred_at ?? "");
        if (!at) continue;
        const day = isoDateInVilnius(at);
        if (day < range.from || day > toYmd) continue;
        const actionType = String((row as { action_type?: string }).action_type ?? "").toLowerCase();
        if (!isSignificantActivityType(actionType)) continue;
        const byDay = eventsByUserDay.get(uid)!;
        if (!byDay.has(day)) byDay.set(day, []);
        byDay.get(day)!.push({
          occurredMin: vilniusMinutesFromMidnight(at),
          actionType,
        });
      }
      if (chunk.length < ACTIVITY_PAGE) break;
      from += ACTIVITY_PAGE;
      if (from >= MAX_ACTIVITY_ROWS) {
        truncated = true;
        break;
      }
    }
  }

  for (const id of ids) {
    byUser.set(
      id,
      buildActivityPeriod({
        isSingleCalendarDay,
        singleDate: range.from,
        workingDays,
        eventsByDay: eventsByUserDay.get(id) ?? new Map(),
        todayYmd: today,
        liveNowMin,
        schedule,
      })
    );
  }
  return { byUser, truncated };
}
