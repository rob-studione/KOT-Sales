/** Diagnostinis dienos ritmas (ne KPI balas). Laikai — minutės nuo Vidurnakčio, Europe/Vilnius. */

export const SIGNIFICANT_ACTIVITY_TYPES = ["call", "email", "commercial", "status_change"] as const;
export type SignificantActivityType = (typeof SIGNIFICANT_ACTIVITY_TYPES)[number];

export type ActivitySchedule = {
  workStartMin: number;
  workEndMin: number;
  lunchStartMin: number;
  lunchEndMin: number;
  slotMinutes: number;
  silenceMinutes: number;
};

/** Numatytasis grafikas; keičiama per crm_settings, jei raktai yra. */
export const DEFAULT_ACTIVITY_SCHEDULE: ActivitySchedule = {
  workStartMin: 9 * 60,
  workEndMin: 18 * 60,
  lunchStartMin: 13 * 60,
  lunchEndMin: 14 * 60,
  slotMinutes: 15,
  silenceMinutes: 120,
};

export const ACTIVITY_SETTINGS_KEYS = {
  workStart: "activity.work_start",
  workEnd: "activity.work_end",
  lunchStart: "activity.lunch_start",
  lunchEnd: "activity.lunch_end",
  silenceMinutes: "activity.silence_minutes",
} as const;

export function isSignificantActivityType(raw: string): raw is SignificantActivityType {
  const v = raw.trim().toLowerCase();
  return (SIGNIFICANT_ACTIVITY_TYPES as readonly string[]).includes(v);
}

export function parseHmToMinutes(raw: string | null | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(raw ?? "").trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min) || h > 23 || min > 59) return null;
  return h * 60 + min;
}

export function scheduleFromSettings(
  rows: Array<{ key?: string; value?: string | null }> | null | undefined,
  base: ActivitySchedule = DEFAULT_ACTIVITY_SCHEDULE
): ActivitySchedule {
  const map = new Map<string, string>();
  for (const r of rows ?? []) {
    const k = String(r.key ?? "").trim();
    if (k) map.set(k, String(r.value ?? "").trim());
  }
  const workStart = parseHmToMinutes(map.get(ACTIVITY_SETTINGS_KEYS.workStart)) ?? base.workStartMin;
  const workEnd = parseHmToMinutes(map.get(ACTIVITY_SETTINGS_KEYS.workEnd)) ?? base.workEndMin;
  const lunchStart = parseHmToMinutes(map.get(ACTIVITY_SETTINGS_KEYS.lunchStart)) ?? base.lunchStartMin;
  const lunchEnd = parseHmToMinutes(map.get(ACTIVITY_SETTINGS_KEYS.lunchEnd)) ?? base.lunchEndMin;
  const silenceRaw = map.get(ACTIVITY_SETTINGS_KEYS.silenceMinutes);
  const silenceParsed = silenceRaw != null && silenceRaw !== "" ? Number(silenceRaw) : NaN;
  const silenceMinutes = Number.isFinite(silenceParsed) && silenceParsed > 0 ? Math.trunc(silenceParsed) : base.silenceMinutes;
  const out: ActivitySchedule = {
    ...base,
    workStartMin: workStart,
    workEndMin: workEnd,
    lunchStartMin: lunchStart,
    lunchEndMin: lunchEnd,
    silenceMinutes,
  };
  if (out.lunchEndMin <= out.lunchStartMin) {
    out.lunchStartMin = base.lunchStartMin;
    out.lunchEndMin = base.lunchEndMin;
  }
  if (out.workEndMin <= out.workStartMin) {
    out.workStartMin = base.workStartMin;
    out.workEndMin = base.workEndMin;
  }
  return out;
}

export type ActivityEvent = {
  occurredMin: number;
  actionType: SignificantActivityType;
};

export type ActivitySlotKind = "work" | "lunch";

export type ActivitySlot = {
  startMin: number;
  endMin: number;
  kind: ActivitySlotKind;
  active: boolean;
  counts: Record<SignificantActivityType, number>;
};

export type ActivityStatus = "active" | "quiet" | "not_started" | "before_start" | "off_day";

export type ActivityDayModel = {
  status: ActivityStatus;
  firstMin: number | null;
  lastMin: number | null;
  lastAgoWorkMin: number | null;
  coveragePct: number | null;
  maxGapMin: number;
  maxGapFromMin: number | null;
  maxGapToMin: number | null;
  currentGapMin: number;
  nowMin: number;
  slots: ActivitySlot[];
  schedule: ActivitySchedule;
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function formatClockMin(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.max(0, min % 60);
  return `${pad2(h)}:${pad2(m)}`;
}

export function formatDurationMin(min: number): string {
  const n = Math.max(0, Math.round(min));
  if (n < 60) return `${n} min`;
  const h = Math.floor(n / 60);
  const m = n % 60;
  if (m === 0) return `${h} val.`;
  return `${h} val. ${pad2(m)} min`;
}

function overlapMin(a1: number, a2: number, b1: number, b2: number): number {
  return Math.max(0, Math.min(a2, b2) - Math.max(a1, b1));
}

export function workElapsedMinutes(fromMin: number, toMin: number, schedule: ActivitySchedule): number {
  if (toMin <= fromMin) return 0;
  const a = Math.min(schedule.workEndMin, Math.max(schedule.workStartMin, fromMin));
  const b = Math.min(schedule.workEndMin, Math.max(schedule.workStartMin, toMin));
  if (b <= a) return 0;
  return Math.max(0, b - a - overlapMin(a, b, schedule.lunchStartMin, schedule.lunchEndMin));
}

/** Dabartinis laikas spragoms: pietų metu ir po darbo dienos pabaigos laikrodis nestumia tylos. */
export function freezeNowForGaps(nowMin: number, schedule: ActivitySchedule): number {
  if (nowMin < schedule.workStartMin) return schedule.workStartMin;
  if (nowMin >= schedule.lunchStartMin && nowMin < schedule.lunchEndMin) return schedule.lunchStartMin;
  if (nowMin > schedule.workEndMin) return schedule.workEndMin;
  return nowMin;
}

export function listDaySlots(schedule: ActivitySchedule): Array<{ startMin: number; endMin: number; kind: ActivitySlotKind }> {
  const out: Array<{ startMin: number; endMin: number; kind: ActivitySlotKind }> = [];
  const step = Math.max(1, schedule.slotMinutes);
  let t = schedule.workStartMin;
  while (t < schedule.workEndMin) {
    if (t >= schedule.lunchStartMin && t < schedule.lunchEndMin) {
      const lunchEnd = Math.min(schedule.lunchEndMin, schedule.workEndMin);
      out.push({ startMin: t, endMin: lunchEnd, kind: "lunch" });
      t = lunchEnd;
      continue;
    }
    let end = Math.min(schedule.workEndMin, t + step);
    if (t < schedule.lunchStartMin && end > schedule.lunchStartMin) {
      end = schedule.lunchStartMin;
    }
    const lunchCovered = overlapMin(t, end, schedule.lunchStartMin, schedule.lunchEndMin);
    const kind: ActivitySlotKind = lunchCovered >= end - t ? "lunch" : "work";
    out.push({ startMin: t, endMin: end, kind });
    t = end;
  }
  return out;
}

function inWorkHours(min: number, schedule: ActivitySchedule): boolean {
  if (min < schedule.workStartMin || min >= schedule.workEndMin) return false;
  if (min >= schedule.lunchStartMin && min < schedule.lunchEndMin) return false;
  return true;
}

function emptyCounts(): Record<SignificantActivityType, number> {
  return { call: 0, email: 0, commercial: 0, status_change: 0 };
}

export function countSignificantInWindow(
  events: ActivityEvent[],
  schedule: ActivitySchedule
): Record<SignificantActivityType, number> {
  const counts = emptyCounts();
  for (const e of events) {
    if (!inWorkHours(e.occurredMin, schedule)) continue;
    counts[e.actionType] += 1;
  }
  return counts;
}

function sumCounts(counts: Record<SignificantActivityType, number>): number {
  return counts.call + counts.email + counts.commercial + counts.status_change;
}

export function actionBreakdownTooltip(events: ActivityEvent[], schedule: ActivitySchedule): string {
  const counts = countSignificantInWindow(events, schedule);
  if (sumCounts(counts) === 0) return "Nėra reikšmingų CRM veiksmų";
  return [
    `${counts.call} ${counts.call === 1 ? "skambutis" : "skambučiai"}`,
    `${counts.email} ${counts.email === 1 ? "laiškas" : "laiškai"}`,
    `${counts.commercial} ${counts.commercial === 1 ? "komercinis" : "komerciniai"}`,
    `${counts.status_change} ${counts.status_change === 1 ? "statuso pakeitimas" : "statuso pakeitimai"}`,
  ].join("\n");
}

export function buildActivityDay(args: {
  events: ActivityEvent[];
  nowMin: number;
  isWorkingDay: boolean;
  schedule?: ActivitySchedule;
}): ActivityDayModel {
  const schedule = args.schedule ?? DEFAULT_ACTIVITY_SCHEDULE;
  const sorted = [...args.events].filter((e) => e.occurredMin >= 0 && e.occurredMin < 24 * 60).sort((a, b) => a.occurredMin - b.occurredMin);

  const template = listDaySlots(schedule);
  const slots: ActivitySlot[] = template.map((s) => ({
    ...s,
    active: false,
    counts: emptyCounts(),
  }));

  for (const e of sorted) {
    const slot = slots.find((s) => e.occurredMin >= s.startMin && e.occurredMin < s.endMin);
    if (!slot) continue;
    slot.counts[e.actionType] += 1;
    if (slot.kind === "work") slot.active = true;
  }

  const nowFrozen = freezeNowForGaps(args.nowMin, schedule);
  const inWindow = sorted.filter((e) => inWorkHours(e.occurredMin, schedule));
  const firstMin = inWindow.length > 0 ? inWindow[0]!.occurredMin : null;
  const lastMin = inWindow.length > 0 ? inWindow[inWindow.length - 1]!.occurredMin : null;

  let maxGapMin = 0;
  let maxGapFromMin: number | null = null;
  let maxGapToMin: number | null = null;
  const considerGap = (fromMin: number, toMin: number) => {
    const gap = workElapsedMinutes(fromMin, toMin, schedule);
    if (gap > maxGapMin) {
      maxGapMin = gap;
      maxGapFromMin = fromMin;
      maxGapToMin = toMin;
    }
  };
  if (inWindow.length === 0) {
    if (args.nowMin >= schedule.workStartMin) {
      considerGap(schedule.workStartMin, nowFrozen);
    }
  } else {
    considerGap(schedule.workStartMin, inWindow[0]!.occurredMin);
    for (let i = 1; i < inWindow.length; i++) {
      considerGap(inWindow[i - 1]!.occurredMin, inWindow[i]!.occurredMin);
    }
    considerGap(inWindow[inWindow.length - 1]!.occurredMin, nowFrozen);
  }

  const lastInWindow = inWindow.length > 0 ? inWindow[inWindow.length - 1]!.occurredMin : null;
  const currentGapMin =
    lastInWindow == null
      ? args.nowMin >= schedule.workStartMin
        ? workElapsedMinutes(schedule.workStartMin, nowFrozen, schedule)
        : 0
      : workElapsedMinutes(lastInWindow, nowFrozen, schedule);
  const lastAgoWorkMin = lastInWindow == null ? null : workElapsedMinutes(lastInWindow, nowFrozen, schedule);

  const coverageSlots = slots.filter((s) => s.kind === "work" && s.startMin < args.nowMin);
  const coveragePct =
    coverageSlots.length === 0
      ? null
      : Math.round((coverageSlots.filter((s) => s.active).length / coverageSlots.length) * 1000) / 10;

  let status: ActivityStatus;
  if (!args.isWorkingDay) {
    status = "off_day";
  } else if (inWindow.length === 0) {
    status = args.nowMin < schedule.workStartMin ? "before_start" : "not_started";
  } else if ((lastAgoWorkMin ?? 0) < schedule.silenceMinutes) {
    status = "active";
  } else {
    status = "quiet";
  }

  return {
    status,
    firstMin,
    lastMin,
    lastAgoWorkMin,
    coveragePct,
    maxGapMin,
    maxGapFromMin,
    maxGapToMin,
    currentGapMin,
    nowMin: args.nowMin,
    slots,
    schedule,
  };
}

export type SlotTone = "lunch" | "active" | "idle" | "future";

export function slotTone(slot: ActivitySlot, nowMin: number): SlotTone {
  if (slot.kind === "lunch") return "lunch";
  if (slot.active) return "active";
  if (slot.startMin >= nowMin) return "future";
  return "idle";
}

export function slotBarClass(tone: SlotTone): string {
  switch (tone) {
    case "active":
      return "bg-emerald-500";
    case "idle":
      return "bg-zinc-300";
    case "lunch":
      return "bg-amber-50 bg-[repeating-linear-gradient(135deg,transparent,transparent_3px,rgba(161,98,7,0.12)_3px,rgba(161,98,7,0.12)_6px)]";
    case "future":
      return "bg-zinc-50";
    default:
      return "bg-white";
  }
}

function fmtCoverage(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const rounded = Math.round(n * 10) / 10;
  return `${rounded.toLocaleString("lt-LT", { maximumFractionDigits: 1 })}%`;
}

export function activityRangeLabel(day: ActivityDayModel): string {
  if (day.firstMin == null || day.lastMin == null) return "—";
  return `${formatClockMin(day.firstMin)}–${formatClockMin(day.lastMin)}`;
}

export function activityCompactLines(day: ActivityDayModel): { line1: string; line2: string } {
  const label = activityStatusLabel(day.status);
  if (day.status === "off_day") return { line1: label, line2: "" };
  if (day.status === "before_start") return { line1: label, line2: "" };
  if (day.status === "not_started") return { line1: label, line2: "Nėra CRM veiksmų" };

  const ago = day.lastAgoWorkMin == null ? "" : `prieš ${formatDurationMin(day.lastAgoWorkMin)}.`;
  const line1 = ago ? `${label} · ${ago}` : label;
  const line2 = `${activityRangeLabel(day)} · padengimas ${fmtCoverage(day.coveragePct)}`;
  return { line1, line2 };
}

export function intervalCrossesLunch(fromMin: number, toMin: number, schedule: ActivitySchedule): boolean {
  return overlapMin(fromMin, toMin, schedule.lunchStartMin, schedule.lunchEndMin) > 0;
}

export function maxGapTooltip(day: ActivityDayModel): string {
  if (day.maxGapFromMin == null || day.maxGapToMin == null) return "";
  const lines = [
    `${formatClockMin(day.maxGapFromMin)}–${formatClockMin(day.maxGapToMin)}`,
    `Neaktyvumo trukmė: ${formatDurationMin(day.maxGapMin)}.`,
  ];
  if (intervalCrossesLunch(day.maxGapFromMin, day.maxGapToMin, day.schedule)) {
    lines.push(
      `Pietūs ${formatClockMin(day.schedule.lunchStartMin)}–${formatClockMin(day.schedule.lunchEndMin)} neįskaičiuoti`
    );
  }
  return lines.join("\n");
}

function activityCountLines(counts: Record<SignificantActivityType, number>): string[] {
  const lines: string[] = [];
  const push = (n: number, one: string, many: string) => {
    if (n <= 0) return;
    lines.push(`${n} ${n === 1 ? one : many}`);
  };
  push(counts.call, "skambutis", "skambučiai");
  push(counts.email, "laiškas", "laiškai");
  push(counts.commercial, "komercinis", "komerciniai");
  push(counts.status_change, "statuso pakeitimas", "statuso pakeitimai");
  return lines;
}

export function slotTooltip(slot: ActivitySlot): string {
  if (slot.kind === "lunch") return "Pietūs";
  const parts = activityCountLines(slot.counts);
  if (parts.length === 0) return "Neaktyvu";
  return parts.join(" · ");
}

export function slotHoverTitle(slot: ActivitySlot, nowMin: number, schedule: ActivitySchedule): string {
  const tone = slotTone(slot, nowMin);
  if (tone === "lunch") {
    return `${formatClockMin(schedule.lunchStartMin)}–${formatClockMin(schedule.lunchEndMin)}\nPietūs · neįskaičiuojama`;
  }
  const range = `${formatClockMin(slot.startMin)}–${formatClockMin(slot.endMin)}`;
  if (tone === "future") return `${range}\nDar neatėjo`;
  if (tone === "idle") return `${range}\nNeaktyvu`;
  const counts = activityCountLines(slot.counts);
  return [range, ...(counts.length > 0 ? counts : ["Neaktyvu"])].join("\n");
}

export function activityStatusLabel(status: ActivityStatus): string {
  switch (status) {
    case "active":
      return "Aktyvus";
    case "quiet":
      return "Tyla";
    case "not_started":
      return "Nepradėjo";
    case "before_start":
      return "Darbo laikas dar neprasidėjo";
    case "off_day":
      return "Nedarbo diena";
    default:
      return "—";
  }
}

/** Praėjusiai dienai laikrodis fiksuojamas darbo pabaigoje, kad padengimas ir spragos būtų visos dienos. */
export function nowMinForActivityDay(
  dayYmd: string,
  todayYmd: string,
  liveNowMin: number,
  schedule: ActivitySchedule
): number | null {
  if (dayYmd > todayYmd) return null;
  if (dayYmd === todayYmd) return liveNowMin;
  return schedule.workEndMin;
}

export type ActivityRangeDay = {
  date: string;
  isLive: boolean;
  hasWorkActivity: boolean;
  actionCount: number;
  firstMin: number | null;
  lastMin: number | null;
  coveragePct: number | null;
  maxGapMin: number;
  maxGapFromMin: number | null;
  maxGapToMin: number | null;
  nowMin: number;
  events: ActivityEvent[];
};

export type ActivityDayHealth = "ok" | "reduced" | "low";

/** Diagnostinė spalva pagal padengimą; ne KPI balas. */
export function activityDayHealth(d: { hasWorkActivity: boolean; coveragePct: number | null }): ActivityDayHealth {
  if (!d.hasWorkActivity) return "low";
  const c = d.coveragePct ?? 0;
  if (c < 35) return "low";
  if (c < 70) return "reduced";
  return "ok";
}

export type ActivityRangeSummary = {
  workingDayCount: number;
  avgCoveragePct: number | null;
  avgFirstMin: number | null;
  avgLastMin: number | null;
  maxGapMin: number;
  maxGapFromMin: number | null;
  maxGapToMin: number | null;
  maxGapDate: string | null;
  idleDayCount: number;
  lowActivityDayCount: number;
};

export type ActivityPeriodModel = {
  kind: "day" | "range";
  schedule: ActivitySchedule;
  day: ActivityDayModel | null;
  dayIsLive: boolean;
  summary: ActivityRangeSummary | null;
  days: ActivityRangeDay[];
};

function snapshotDay(
  date: string,
  activity: ActivityDayModel,
  events: ActivityEvent[],
  isLive: boolean
): ActivityRangeDay {
  return {
    date,
    isLive,
    hasWorkActivity: activity.firstMin != null,
    actionCount: sumCounts(countSignificantInWindow(events, activity.schedule)),
    firstMin: activity.firstMin,
    lastMin: activity.lastMin,
    coveragePct: activity.coveragePct,
    maxGapMin: activity.maxGapMin,
    maxGapFromMin: activity.maxGapFromMin,
    maxGapToMin: activity.maxGapToMin,
    nowMin: activity.nowMin,
    events,
  };
}

function avgRounded(values: number[], decimals: number): number | null {
  if (values.length === 0) return null;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const f = 10 ** decimals;
  return Math.round(mean * f) / f;
}

export function summarizeActivityRangeDays(days: ActivityRangeDay[]): ActivityRangeSummary {
  let maxGapMin = 0;
  let maxGapFromMin: number | null = null;
  let maxGapToMin: number | null = null;
  let maxGapDate: string | null = null;
  for (const d of days) {
    if (d.maxGapMin > maxGapMin) {
      maxGapMin = d.maxGapMin;
      maxGapFromMin = d.maxGapFromMin;
      maxGapToMin = d.maxGapToMin;
      maxGapDate = d.date;
    }
  }
  const firsts = days.map((d) => d.firstMin).filter((n): n is number => n != null);
  const lasts = days.map((d) => d.lastMin).filter((n): n is number => n != null);
  const coverages = days.map((d) => d.coveragePct).filter((n): n is number => n != null);
  return {
    workingDayCount: days.length,
    avgCoveragePct: avgRounded(coverages, 1),
    avgFirstMin: firsts.length ? Math.round(avgRounded(firsts, 0) ?? 0) : null,
    avgLastMin: lasts.length ? Math.round(avgRounded(lasts, 0) ?? 0) : null,
    maxGapMin,
    maxGapFromMin,
    maxGapToMin,
    maxGapDate,
    idleDayCount: days.filter((d) => !d.hasWorkActivity).length,
    lowActivityDayCount: days.filter((d) => activityDayHealth(d) !== "ok").length,
  };
}

export function buildActivityPeriod(args: {
  isSingleCalendarDay: boolean;
  singleDate: string;
  workingDays: string[];
  eventsByDay: Map<string, ActivityEvent[]>;
  todayYmd: string;
  liveNowMin: number;
  schedule?: ActivitySchedule;
}): ActivityPeriodModel {
  const schedule = args.schedule ?? DEFAULT_ACTIVITY_SCHEDULE;

  if (args.isSingleCalendarDay) {
    const ymd = args.singleDate;
    const isLive = ymd === args.todayYmd;
    const isWorking = args.workingDays.includes(ymd);
    const nowMin = nowMinForActivityDay(ymd, args.todayYmd, args.liveNowMin, schedule) ?? 0;
    const events = args.eventsByDay.get(ymd) ?? [];
    const day = buildActivityDay({ events, nowMin, isWorkingDay: isWorking, schedule });
    return {
      kind: "day",
      schedule,
      day,
      dayIsLive: isLive,
      summary: null,
      days: isWorking ? [snapshotDay(ymd, day, events, isLive)] : [],
    };
  }

  const days: ActivityRangeDay[] = [];
  for (const ymd of args.workingDays) {
    const nowMin = nowMinForActivityDay(ymd, args.todayYmd, args.liveNowMin, schedule);
    if (nowMin == null) continue;
    const events = args.eventsByDay.get(ymd) ?? [];
    const activity = buildActivityDay({ events, nowMin, isWorkingDay: true, schedule });
    days.push(snapshotDay(ymd, activity, events, ymd === args.todayYmd));
  }
  return {
    kind: "range",
    schedule,
    day: null,
    dayIsLive: false,
    summary: summarizeActivityRangeDays(days),
    days,
  };
}

export function emptyActivityPeriod(schedule: ActivitySchedule = DEFAULT_ACTIVITY_SCHEDULE): ActivityPeriodModel {
  return {
    kind: "day",
    schedule,
    day: buildActivityDay({ events: [], nowMin: 0, isWorkingDay: false, schedule }),
    dayIsLive: false,
    summary: null,
    days: [],
  };
}

export function periodMaxGapTooltip(summary: ActivityRangeSummary, schedule: ActivitySchedule): string {
  if (summary.maxGapDate == null) return "";
  const dateLabel = summary.maxGapDate.slice(5);
  const fake: ActivityDayModel = {
    status: "quiet",
    firstMin: null,
    lastMin: null,
    lastAgoWorkMin: null,
    coveragePct: null,
    maxGapMin: summary.maxGapMin,
    maxGapFromMin: summary.maxGapFromMin,
    maxGapToMin: summary.maxGapToMin,
    currentGapMin: summary.maxGapMin,
    nowMin: schedule.workEndMin,
    slots: [],
    schedule,
  };
  const body = maxGapTooltip(fake);
  return body ? `${dateLabel}\n${body}` : dateLabel;
}

export function rebuildActivityDayFromRangeDay(row: ActivityRangeDay, schedule: ActivitySchedule): ActivityDayModel {
  return buildActivityDay({
    events: row.events,
    nowMin: row.nowMin,
    isWorkingDay: true,
    schedule,
  });
}
