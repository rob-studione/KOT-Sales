"use client";

import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  actionBreakdownTooltip,
  activityDayHealth,
  activityStatusLabel,
  formatClockMin,
  formatDurationMin,
  maxGapTooltip,
  periodMaxGapTooltip,
  rebuildActivityDayFromRangeDay,
  slotBarClass,
  slotHoverTitle,
  slotTone,
  type ActivityDayModel,
  type ActivityPeriodModel,
  type ActivityRangeDay,
  type ActivityStatus,
} from "@/lib/crm/managerActivity";

function statusDotClass(status: ActivityStatus | "done" | "empty"): string {
  switch (status) {
    case "active":
    case "done":
      return "bg-emerald-500";
    case "quiet":
      return "bg-amber-400";
    case "not_started":
    case "empty":
      return "bg-zinc-400";
    default:
      return "bg-zinc-300";
  }
}

function coverageLabel(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${n.toLocaleString("lt-LT", { maximumFractionDigits: 1 })} %`;
}

function clockOrDash(min: number | null): string {
  return min == null ? "—" : formatClockMin(min);
}

function compactDate(ymd: string): string {
  return ymd.slice(5);
}

function dayHealthDotClass(d: ActivityRangeDay): string {
  switch (activityDayHealth(d)) {
    case "ok":
      return "bg-emerald-500";
    case "reduced":
      return "bg-amber-400";
    default:
      return "bg-rose-400";
  }
}

function actionCountLabel(n: number): string {
  return n === 1 ? "1 veiksmas" : `${n} veiksmai`;
}

function dayStatusLine(activity: ActivityDayModel, isLive: boolean): string {
  if (activity.status === "off_day") return activityStatusLabel("off_day");
  if (!isLive) {
    if (activity.firstMin == null) return "Nėra aktyvumo";
    return "Diena baigta";
  }
  const label = activityStatusLabel(activity.status);
  if (activity.status === "active" || activity.status === "quiet") {
    if (activity.lastAgoWorkMin == null) return label;
    return `${label} · prieš ${formatDurationMin(activity.lastAgoWorkMin)}.`;
  }
  return label;
}

function dayDotStatus(activity: ActivityDayModel, isLive: boolean): ActivityStatus | "done" | "empty" {
  if (isLive) return activity.status;
  if (activity.status === "off_day") return "off_day";
  return activity.firstMin == null ? "empty" : "done";
}

function HoverTip({
  text,
  className,
  style,
  children,
  as: Tag = "div",
}: {
  text: string;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
  as?: "div" | "span";
}) {
  const [pos, setPos] = useState<{ left: number; top: number; placeAbove: boolean } | null>(null);

  function show(el: HTMLElement) {
    const r = el.getBoundingClientRect();
    setPos({
      left: r.left + r.width / 2,
      top: r.top,
      placeAbove: r.top > 96,
    });
  }

  return (
    <>
      <Tag
        className={className}
        style={style}
        onMouseEnter={(e) => show(e.currentTarget)}
        onMouseLeave={() => setPos(null)}
      >
        {children}
      </Tag>
      {pos && typeof document !== "undefined"
        ? createPortal(
            <div
              role="tooltip"
              className="pointer-events-none fixed z-[80] w-max max-w-[260px] -translate-x-1/2 rounded-md bg-zinc-900 px-2.5 py-1.5 text-left text-xs leading-snug text-white shadow-lg"
              style={{
                left: pos.left,
                top: pos.placeAbove ? pos.top - 8 : pos.top + 42,
                transform: pos.placeAbove ? "translate(-50%, -100%)" : "translate(-50%, 0)",
              }}
            >
              {text.split("\n").map((line, i) => (
                <div key={i}>{line}</div>
              ))}
            </div>,
            document.body
          )
        : null}
    </>
  );
}

function ActivityDayView({ activity, isLive }: { activity: ActivityDayModel; isLive: boolean }) {
  const gapTitle = maxGapTooltip(activity);
  return (
    <div className="min-w-0 cursor-default py-0.5">
      <div className="flex cursor-default items-center gap-1.5">
        <span className={`h-2 w-2 shrink-0 rounded-full ${statusDotClass(dayDotStatus(activity, isLive))}`} />
        <span className="text-xs font-medium leading-snug text-zinc-800">{dayStatusLine(activity, isLive)}</span>
      </div>
      <div className="mt-1.5 cursor-default whitespace-nowrap text-xs leading-snug tabular-nums tracking-wide text-zinc-500">
        <span>Pirmas: {clockOrDash(activity.firstMin)}</span>
        <span className="mx-3.5">Paskutinis: {clockOrDash(activity.lastMin)}</span>
        <span>Padengimas: {coverageLabel(activity.coveragePct)}</span>
        {gapTitle ? (
          <HoverTip text={gapTitle} className="ml-3.5 inline-block cursor-help">
            Ilgiausias neaktyvumas: {formatDurationMin(activity.maxGapMin)}
          </HoverTip>
        ) : (
          <span className="ml-3.5">Ilgiausias neaktyvumas: {formatDurationMin(activity.maxGapMin)}</span>
        )}
      </div>
      <div className="mt-2 cursor-default">
        <div className="flex h-10 overflow-hidden rounded-sm border border-zinc-200">
          {activity.slots.map((slot) => {
            const tone = slotTone(slot, activity.nowMin);
            const duration = Math.max(1, slot.endMin - slot.startMin);
            return (
              <HoverTip
                key={`${slot.startMin}-${slot.endMin}`}
                text={slotHoverTitle(slot, activity.nowMin, activity.schedule)}
                style={{ flexGrow: duration, flexShrink: 0, flexBasis: 0 }}
                className={`min-w-0 cursor-help border-r border-white last:border-r-0 ${slotBarClass(tone)}`}
              />
            );
          })}
        </div>
        <div className="mt-0.5 flex justify-between text-[10px] leading-none text-zinc-400">
          <span>{formatClockMin(activity.schedule.workStartMin)}</span>
          <span>Pietūs</span>
          <span>{formatClockMin(activity.schedule.workEndMin)}</span>
        </div>
      </div>
    </div>
  );
}

function RangeDayDetail({ row, schedule }: { row: ActivityRangeDay; schedule: ActivityPeriodModel["schedule"] }) {
  const activity = useMemo(() => rebuildActivityDayFromRangeDay(row, schedule), [row, schedule]);
  return <ActivityDayView activity={activity} isLive={row.isLive} />;
}

function ActivityRangeView({ period }: { period: ActivityPeriodModel }) {
  const [openDate, setOpenDate] = useState<string | null>(null);
  const summary = period.summary;
  if (!summary) return null;
  const gapTitle = periodMaxGapTooltip(summary, period.schedule);

  return (
    <div className="min-w-0 cursor-default py-0.5">
      <div className="text-xs leading-snug text-zinc-600">
        <span className="tabular-nums">Vid. padengimas: {coverageLabel(summary.avgCoveragePct)}</span>
        <span className="tabular-nums"> · Vid. pirmas: {clockOrDash(summary.avgFirstMin)}</span>
        <span className="tabular-nums"> · Vid. paskutinis: {clockOrDash(summary.avgLastMin)}</span>
        {gapTitle ? (
          <HoverTip text={gapTitle} className="inline-block cursor-help tabular-nums">
            {" · Ilgiausias neaktyvumas: "}
            {formatDurationMin(summary.maxGapMin)}
          </HoverTip>
        ) : (
          <span className="tabular-nums"> · Ilgiausias neaktyvumas: {formatDurationMin(summary.maxGapMin)}</span>
        )}
        <span className="text-zinc-400"> · Įvertinta d. d.: {summary.workingDayCount}</span>
        <span className="text-zinc-400">
          {" "}
          · Dienos be aktyvumo: {summary.idleDayCount} · Žemo aktyvumo dienos: {summary.lowActivityDayCount}
        </span>
      </div>
      {period.days.length === 0 ? (
        <p className="mt-2 text-xs text-zinc-400">Šiame intervale nėra darbo dienų.</p>
      ) : (
        <div className="mt-2 rounded-md border border-zinc-100">
          <div className="grid grid-cols-[0.9rem_4.5rem_minmax(3.2rem,0.85fr)_4.6rem_3.1rem_3.4rem_minmax(5.2rem,1.1fr)] gap-x-2 border-b border-zinc-100 bg-zinc-50 px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-zinc-400">
            <span />
            <span>Data</span>
            <span className="text-right">Padengimas</span>
            <span className="text-right">Veiksmai</span>
            <span className="text-right">Pirmas</span>
            <span className="text-right">Paskutinis</span>
            <span className="text-right">Neaktyvumas</span>
          </div>
          {period.days.map((d) => {
            const open = openDate === d.date;
            return (
              <div key={d.date} className={`border-b border-zinc-100 last:border-b-0 ${open ? "bg-zinc-50/80" : ""}`}>
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => setOpenDate(open ? null : d.date)}
                  className="grid w-full cursor-pointer grid-cols-[0.9rem_4.5rem_minmax(3.2rem,0.85fr)_4.6rem_3.1rem_3.4rem_minmax(5.2rem,1.1fr)] gap-x-2 px-2 py-1.5 text-left text-[11px] tabular-nums text-zinc-700 hover:bg-zinc-100"
                >
                  <span className="text-zinc-400" aria-hidden>
                    {open ? "⌄" : "›"}
                  </span>
                  <span className="flex min-w-0 items-center gap-1.5 font-medium text-zinc-800">
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dayHealthDotClass(d)}`} />
                    <span>{compactDate(d.date)}</span>
                  </span>
                  <span className="text-right">{coverageLabel(d.coveragePct)}</span>
                  <HoverTip
                    as="span"
                    text={actionBreakdownTooltip(d.events, period.schedule)}
                    className="block cursor-help text-right"
                  >
                    {actionCountLabel(d.actionCount)}
                  </HoverTip>
                  <span className="text-right">{clockOrDash(d.firstMin)}</span>
                  <span className="text-right">{clockOrDash(d.lastMin)}</span>
                  <span className="text-right">{formatDurationMin(d.maxGapMin)}</span>
                </button>
                {open ? (
                  <div className="mx-2 mb-2 ml-5 rounded-md border border-zinc-200/80 border-l-[3px] border-l-zinc-300 bg-white px-3 py-2">
                    <RangeDayDetail row={d} schedule={period.schedule} />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function ManagerActivityCell({ activity }: { activity: ActivityPeriodModel }) {
  if (activity.kind === "range") return <ActivityRangeView period={activity} />;
  if (!activity.day) return <span className="text-xs text-zinc-400">—</span>;
  return <ActivityDayView activity={activity.day} isLive={activity.dayIsLive} />;
}
