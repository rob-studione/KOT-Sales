#!/usr/bin/env node
/**
 * Manager day-activity: 09:00–18:00, lunch excluded from gaps and coverage.
 *   node --import ./scripts/register-ts-path.mjs --experimental-strip-types scripts/verify-manager-activity.mts
 */

import {
  actionBreakdownTooltip,
  DEFAULT_ACTIVITY_SCHEDULE,
  buildActivityDay,
  buildActivityPeriod,
  formatDurationMin,
  freezeNowForGaps,
  maxGapTooltip,
  nowMinForActivityDay,
  periodMaxGapTooltip,
  slotHoverTitle,
  slotTone,
  workElapsedMinutes,
} from "@/lib/crm/managerActivity";

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error("verify-manager-activity: FAILED", msg);
    process.exit(1);
  }
}

const s = DEFAULT_ACTIVITY_SCHEDULE;
assert(s.workStartMin === 9 * 60 && s.workEndMin === 18 * 60, "default window 09:00–18:00");
assert(s.slotMinutes === 15, "timeline slots are 15 min");

assert(workElapsedMinutes(12 * 60 + 40, 14 * 60 + 20, s) === 40, "12:40→14:20 gap is 40 min");
assert(freezeNowForGaps(13 * 60 + 30, s) === 13 * 60, "lunch freezes now at 13:00");
assert(workElapsedMinutes(12 * 60 + 40, freezeNowForGaps(13 * 60 + 30, s), s) === 20, "gap at 13:30 from 12:40 is 20");

const last1210 = 12 * 60 + 10;
assert(workElapsedMinutes(last1210, 14 * 60 + 10, s) === 60, "12:10→14:10 is 60 min (lunch ignored)");
assert(workElapsedMinutes(last1210, 15 * 60 + 10, s) === 120, "Tyla at 15:10 after 12:10");

const quietAt1510 = buildActivityDay({
  events: [{ occurredMin: last1210, actionType: "call" }],
  nowMin: 15 * 60 + 10,
  isWorkingDay: true,
});
assert(quietAt1510.status === "quiet", "Tyla from 15:10, not 14:10");

const stillActive1410 = buildActivityDay({
  events: [{ occurredMin: last1210, actionType: "call" }],
  nowMin: 14 * 60 + 10,
  isWorkingDay: true,
});
assert(stillActive1410.status === "active", "14:10 still Aktyvus after 12:10");

const duringLunch = buildActivityDay({
  events: [{ occurredMin: 12 * 60 + 40, actionType: "call" }],
  nowMin: 13 * 60 + 20,
  isWorkingDay: true,
});
assert(duringLunch.status === "active", "lunch must not create Tyla");

const earlyOnly = buildActivityDay({
  events: [{ occurredMin: 8 * 60 + 50, actionType: "call" }],
  nowMin: 10 * 60,
  isWorkingDay: true,
});
assert(earlyOnly.firstMin == null, "pre-09:00 action is not Pirmas");
assert(earlyOnly.coveragePct === 0, "pre-09:00 action does not raise coverage");
assert(earlyOnly.status === "not_started", "only pre-09:00 action is still Nepradėjo");
assert(
  earlyOnly.slots.every((x) => x.startMin >= 9 * 60 && x.endMin <= 18 * 60),
  "timeline stays inside 09:00–18:00"
);

const coverageMorning = buildActivityDay({
  events: [
    { occurredMin: 9 * 60 + 5, actionType: "call" },
    { occurredMin: 9 * 60 + 40, actionType: "email" },
  ],
  nowMin: 11 * 60,
  isWorkingDay: true,
});
assert(coverageMorning.coveragePct === 25, "2 of 8 elapsed 15-min slots → 25%");
assert(coverageMorning.slots.filter((x) => x.kind === "lunch").length === 1, "13:00–14:00 is one lunch block");
assert(
  coverageMorning.slots.some((x) => x.startMin === 9 * 60 && x.endMin === 9 * 60 + 15),
  "first work slot is 09:00–09:15"
);

const futureSlot = coverageMorning.slots.find((x) => x.startMin === 16 * 60);
assert(futureSlot != null && slotTone(futureSlot, 11 * 60) === "future", "later slot is future, not idle");
assert(slotHoverTitle(futureSlot!, 11 * 60, s).includes("Dar neatėjo"), "future tooltip");
const idleSlot = coverageMorning.slots.find((x) => x.startMin === 10 * 60);
assert(idleSlot != null && slotTone(idleSlot, 11 * 60) === "idle", "elapsed empty slot is idle");
assert(slotHoverTitle(idleSlot!, 11 * 60, s) === "10:00–10:15\nNeaktyvu", "idle tooltip");
const lunchSlot = coverageMorning.slots.find((x) => x.kind === "lunch");
assert(lunchSlot != null && lunchSlot.endMin - lunchSlot.startMin === 60, "lunch is one hour");
assert(lunchSlot != null && slotHoverTitle(lunchSlot, 11 * 60, s) === "13:00–14:00\nPietūs · neįskaičiuojama", "lunch tooltip");

const afterHours = buildActivityDay({
  events: [
    { occurredMin: 12 * 60 + 10, actionType: "call" },
    { occurredMin: 18 * 60 + 30, actionType: "email" },
  ],
  nowMin: 18 * 60 + 45,
  isWorkingDay: true,
});
assert(afterHours.lastMin === 12 * 60 + 10, "post-18:00 last time is not Paskutinis");
assert(afterHours.status === "quiet", "post-18:00 action does not reset Tyla");
assert(afterHours.coveragePct != null && afterHours.slots.every((x) => x.endMin <= 18 * 60), "no slot after 18:00");

const lunchGap = buildActivityDay({
  events: [
    ...Array.from({ length: 12 }, (_, i) => ({
      occurredMin: 9 * 60 + i * 20,
      actionType: "call" as const,
    })),
    { occurredMin: 12 * 60 + 40, actionType: "call" as const },
    { occurredMin: 14 * 60 + 20, actionType: "email" as const },
  ],
  nowMin: 14 * 60 + 20,
  isWorkingDay: true,
});
assert(lunchGap.maxGapMin === 40, "12:40→14:20 max gap is 40 min");
assert(lunchGap.maxGapFromMin === 12 * 60 + 40 && lunchGap.maxGapToMin === 14 * 60 + 20, "max gap endpoints are exact events");
assert(
  maxGapTooltip(lunchGap) ===
    "12:40–14:20\nNeaktyvumo trukmė: 40 min.\nPietūs 13:00–14:00 neįskaičiuoti",
  "lunch-crossing tooltip"
);

const acrossLunch = buildActivityDay({
  events: [
    ...Array.from({ length: 10 }, (_, i) => ({
      occurredMin: 9 * 60 + i * 20,
      actionType: "call" as const,
    })),
    { occurredMin: 12 * 60 + 10, actionType: "call" as const },
    { occurredMin: 14 * 60 + 17, actionType: "call" as const },
  ],
  nowMin: 14 * 60 + 19,
  isWorkingDay: true,
});
assert(acrossLunch.firstMin === 9 * 60, "in-window first ignores nothing here");
assert(acrossLunch.lastMin === 14 * 60 + 17, "in-window last");
assert(acrossLunch.maxGapMin === 67, "12:10→14:17 is 1 val. 07 min after lunch");
assert(acrossLunch.maxGapFromMin === 12 * 60 + 10 && acrossLunch.maxGapToMin === 14 * 60 + 17, "1h07m endpoints");
assert(formatDurationMin(67) === "1 val. 07 min", "duration format");
assert(
  maxGapTooltip(acrossLunch) ===
    "12:10–14:17\nNeaktyvumo trukmė: 1 val. 07 min.\nPietūs 13:00–14:00 neįskaičiuoti",
  "1h07m tooltip"
);

const coverage75 = buildActivityDay({
  events: Array.from({ length: 12 }, (_, i) => ({
    occurredMin: 9 * 60 + i * 15,
    actionType: "call" as const,
  })),
  nowMin: 13 * 60,
  isWorkingDay: true,
});
assert(coverage75.coveragePct === 75, "12 of 16 elapsed work slots → 75%");
assert(coverage75.slots.filter((x) => x.kind === "work").length === 32, "full day has 32 work slots");

const none = buildActivityDay({ events: [], nowMin: 10 * 60, isWorkingDay: true });
assert(none.status === "not_started", "no actions after 09:00 → Nepradėjo");

const early = buildActivityDay({ events: [], nowMin: 8 * 60, isWorkingDay: true });
assert(early.status === "before_start", "before 09:00 not Nepradėjo");

const weekend = buildActivityDay({ events: [], nowMin: 10 * 60, isWorkingDay: false });
assert(weekend.status === "off_day", "weekend off");

assert(nowMinForActivityDay("2026-08-10", "2026-08-17", 14 * 60, s) === 18 * 60, "past day clock is 18:00");
assert(nowMinForActivityDay("2026-08-17", "2026-08-17", 14 * 60, s) === 14 * 60, "today uses live now");
assert(nowMinForActivityDay("2026-08-18", "2026-08-17", 14 * 60, s) == null, "future day skipped");

const pastDay = buildActivityPeriod({
  isSingleCalendarDay: true,
  singleDate: "2026-08-10",
  workingDays: ["2026-08-10"],
  eventsByDay: new Map([
    [
      "2026-08-10",
      [
        { occurredMin: 9 * 60 + 3, actionType: "call" },
        { occurredMin: 17 * 60 + 42, actionType: "call" },
      ],
    ],
  ]),
  todayYmd: "2026-08-17",
  liveNowMin: 14 * 60,
});
assert(pastDay.kind === "day" && pastDay.dayIsLive === false, "past single day is not live");
assert(pastDay.day != null && pastDay.day.firstMin === 9 * 60 + 3, "past day first is in-window");
assert(pastDay.day != null && pastDay.day.nowMin === 18 * 60, "past day coverage uses end of work");

const range = buildActivityPeriod({
  isSingleCalendarDay: false,
  singleDate: "2026-08-10",
  workingDays: ["2026-08-10", "2026-08-11", "2026-08-12"],
  eventsByDay: new Map([
    [
      "2026-08-10",
      [
        { occurredMin: 9 * 60 + 3, actionType: "call" },
        { occurredMin: 17 * 60 + 42, actionType: "call" },
      ],
    ],
    [
      "2026-08-11",
      [
        { occurredMin: 9 * 60 + 1, actionType: "call" },
        { occurredMin: 17 * 60 + 55, actionType: "email" },
      ],
    ],
  ]),
  todayYmd: "2026-08-17",
  liveNowMin: 14 * 60,
});
assert(range.kind === "range" && range.days.length === 3, "empty working day stays in the range");
assert(range.days[2]!.hasWorkActivity === false, "08-12 has no activity");
assert(range.days[2]!.firstMin == null && range.days[2]!.lastMin == null, "empty day first/last are dash");
assert(range.summary != null && range.summary.workingDayCount === 3, "empty day counts in averages");
assert(range.summary != null && range.summary.avgFirstMin === 9 * 60 + 2, "avg first ignores empty days");
assert(range.summary != null && range.summary.maxGapDate === "2026-08-12", "longest inactivity is the empty day");
assert(range.summary != null && range.summary.maxGapMin === 8 * 60, "empty day gap is 8 work hours");
assert(periodMaxGapTooltip(range.summary!, s).startsWith("08-12"), "period tooltip names the day");
assert(range.days[0]!.actionCount === 2, "action count is in-window significant events");
assert(range.days[2]!.actionCount === 0, "empty day has 0 actions");
assert(range.summary != null && range.summary.idleDayCount === 1, "one day without activity");
assert(range.summary != null && range.summary.lowActivityDayCount === 3, "yellow/red days include empty and sparse days");

const earlyExcluded = buildActivityPeriod({
  isSingleCalendarDay: true,
  singleDate: "2026-08-10",
  workingDays: ["2026-08-10"],
  eventsByDay: new Map([
    [
      "2026-08-10",
      [
        { occurredMin: 8 * 60 + 9, actionType: "status_change" },
        { occurredMin: 9 * 60 + 12, actionType: "call" },
      ],
    ],
  ]),
  todayYmd: "2026-08-17",
  liveNowMin: 14 * 60,
});
assert(earlyExcluded.days[0]!.actionCount === 1, "pre-09:00 action is not a counted Veiksmai");
assert(
  actionBreakdownTooltip(
    [
      { occurredMin: 8 * 60 + 9, actionType: "status_change" },
      { occurredMin: 9 * 60 + 12, actionType: "call" },
      { occurredMin: 10 * 60, actionType: "email" },
      { occurredMin: 11 * 60, actionType: "commercial" },
      { occurredMin: 12 * 60, actionType: "status_change" },
    ],
    s
  ) === "1 skambutis\n1 laiškas\n1 komercinis\n1 statuso pakeitimas",
  "Veiksmai tooltip splits by type and ignores pre-09:00"
);

const sat = buildActivityPeriod({
  isSingleCalendarDay: true,
  singleDate: "2026-08-15",
  workingDays: [],
  eventsByDay: new Map(),
  todayYmd: "2026-08-17",
  liveNowMin: 14 * 60,
});
assert(sat.kind === "day" && sat.day != null && sat.day.status === "off_day", "weekend single day is off");

console.log("verify-manager-activity: ok");
