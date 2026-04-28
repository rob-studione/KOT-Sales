"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatDate, formatIsoMonthDay } from "@/lib/crm/format";

export type CallsTrendPoint = { date: string; calls: number };

function isWorkdayIso(isoYyyyMmDd: string): boolean {
  const [yS, mS, dS] = isoYyyyMmDd.split("-");
  const y = Number(yS);
  const m = Number(mS);
  const d = Number(dS);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return false;
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0..6 (Sun..Sat)
  return day >= 1 && day <= 5;
}

function dayOfMonth(isoYyyyMmDd: string): number {
  const d = Number(isoYyyyMmDd.split("-")[2]);
  return Number.isFinite(d) ? d : NaN;
}

function addCivilDaysIso(isoYyyyMmDd: string, deltaDays: number): string {
  const [yS, mS, dS] = isoYyyyMmDd.split("-");
  const y = Number(yS);
  const m = Number(mS);
  const d = Number(dS);
  const dt = new Date(Date.UTC(y, m - 1, d + deltaDays));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function eachDayIsoInclusive(from: string, to: string): string[] {
  if (!from || !to) return [];
  const a = from.slice(0, 10);
  const b = to.slice(0, 10);
  const start = a <= b ? a : b;
  const end = a <= b ? b : a;
  const out: string[] = [];
  let cur = start;
  // Hard cap for safety; normal ranges are small.
  for (let guard = 0; guard < 400; guard += 1) {
    out.push(cur);
    if (cur === end) break;
    cur = addCivilDaysIso(cur, 1);
  }
  return out;
}

export function CallsByDayBarChart({
  trend,
  range,
  showAverage = true,
}: {
  trend: CallsTrendPoint[];
  range: { from: string; to: string };
  showAverage?: boolean;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);
  const [containerW, setContainerW] = useState<number>(0);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setContainerW(el.clientWidth);
    });
    ro.observe(el);
    setContainerW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const workdays = useMemo(() => {
    const callsByDate = new Map<string, number>();
    for (const d of trend) callsByDate.set(d.date, d.calls);

    const days = eachDayIsoInclusive(range.from, range.to);
    const work = days.filter(isWorkdayIso).map((date) => ({ date, calls: callsByDate.get(date) ?? 0 }));
    return work;
  }, [trend, range.from, range.to]);

  if (workdays.length === 0) {
    return <p className="px-1 py-2 text-sm text-zinc-500">Nėra duomenų pasirinktam laikotarpiui.</p>;
  }

  const n = workdays.length;
  const maxY = Math.max(1, ...workdays.map((d) => d.calls));
  const avg = workdays.reduce((acc, d) => acc + d.calls, 0) / Math.max(1, n);

  const h = 228;
  // Tight but safe: room for Y-axis numbers + first/last X tick (rotated day labels).
  const padL = 36;
  const padR = 28;
  const padT = 12;
  const padB = 36;
  const innerH = h - padT - padB;

  const MAX_BAR_W = 40;
  const MIN_BAR_W = 6;
  const TARGET_BAR_W = 32;
  const TARGET_GAP = 12;
  const MIN_GAP = 4;
  /** When extra horizontal space exists, spread bars by widening gap up to this before growing bar width. */
  const MAX_GAP_SPREAD = 56;

  // No content-width expansion. Always fit within available width (no horizontal scroll).
  const w = Math.max(1, containerW || 760);
  const innerW = Math.max(1, w - padL - padR);

  let gap = TARGET_GAP;
  let barW = TARGET_BAR_W;

  // --- Fit when too tight (shrink gap, then bar width) ---
  let barsTotalW = n * barW + Math.max(0, n - 1) * gap;
  if (barsTotalW > innerW && n > 1) {
    gap = Math.max(MIN_GAP, (innerW - n * barW) / Math.max(1, n - 1));
    barsTotalW = n * barW + Math.max(0, n - 1) * gap;
  }
  if (barsTotalW > innerW) {
    barW = Math.max(MIN_BAR_W, (innerW - Math.max(0, n - 1) * gap) / n);
    barW = Math.min(MAX_BAR_W, barW);
    barsTotalW = n * barW + Math.max(0, n - 1) * gap;
  } else {
    barW = Math.min(MAX_BAR_W, barW);
    barsTotalW = n * barW + Math.max(0, n - 1) * gap;
  }

  // --- Spread: use full inner width (start at padL, widen gap then bar width) ---
  if (n > 1 && barsTotalW < innerW - 0.5) {
    let g = (innerW - n * barW) / (n - 1);
    if (g < MIN_GAP) {
      barW = (innerW - (n - 1) * MIN_GAP) / n;
      barW = Math.max(MIN_BAR_W, Math.min(MAX_BAR_W, barW));
      g = (innerW - n * barW) / (n - 1);
      gap = Math.max(MIN_GAP, g);
    } else if (g > MAX_GAP_SPREAD) {
      barW = (innerW - (n - 1) * MAX_GAP_SPREAD) / n;
      barW = Math.max(MIN_BAR_W, Math.min(MAX_BAR_W, barW));
      gap = MAX_GAP_SPREAD;
      const slack = innerW - (n * barW + (n - 1) * gap);
      if (slack > 0.5) {
        barW = Math.min(MAX_BAR_W, barW + slack / n);
      }
    } else {
      gap = g;
    }
  } else if (n === 1) {
    barW = Math.min(MAX_BAR_W, Math.max(MIN_BAR_W, innerW));
  }

  barsTotalW = n * barW + Math.max(0, n - 1) * gap;
  const startX = padL;

  const gridTicks = 4;

  const xCenters = useMemo(() => {
    const list: number[] = [];
    for (let i = 0; i < n; i += 1) {
      const xLeft = startX + i * (barW + gap);
      list.push(xLeft + barW / 2);
    }
    return list;
  }, [n, startX, barW, gap]);

  function xAt(i: number): number {
    return xCenters[i] ?? startX + barW / 2;
  }

  function yAt(v: number): number {
    return padT + innerH - (v / maxY) * innerH;
  }

  const avgY = yAt(avg);
  const ZERO_BAR_H = 4;

  return (
    <div
      ref={wrapRef}
      className="relative h-[236px] w-full overflow-x-hidden overflow-y-visible rounded-lg bg-zinc-50/60 px-2 py-2"
      onMouseLeave={() => setHover(null)}
    >
      {hover ? (
        <div
          className="pointer-events-none absolute z-10 w-[11rem] -translate-x-1/2 rounded-md bg-white px-3 py-2 text-xs text-zinc-900 shadow-lg ring-1 ring-black/5"
          style={{
            left: hover.x,
            top: Math.max(8, hover.y - 46),
          }}
        >
          <div className="text-sm font-medium text-zinc-900">{formatDate(workdays[hover.i]!.date)}</div>
          <div className="mt-1.5 flex items-baseline gap-1.5">
            <span className="text-xs text-zinc-500">Skambučiai:</span>
            <span className="text-base font-bold tabular-nums leading-none text-zinc-900">{workdays[hover.i]!.calls}</span>
          </div>
        </div>
      ) : null}

      <svg
        ref={svgRef}
        viewBox={`0 0 ${w} ${h}`}
        className="block h-full w-full select-none"
        role="img"
        aria-label="Skambučiai pagal dieną"
        onMouseMove={(e) => {
          const svgEl = svgRef.current;
          if (!svgEl) return;
          const rect = svgEl.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const y = e.clientY - rect.top;

          // Map client X to svg X with viewBox scaling.
          const svgX = (x / Math.max(1, rect.width)) * w;
          let bestI = 0;
          let bestDist = Infinity;
          for (let i = 0; i < n; i += 1) {
            const dist = Math.abs(svgX - xAt(i));
            if (dist < bestDist) {
              bestDist = dist;
              bestI = i;
            }
          }
          setHover({
            i: bestI,
            x: x + 0,
            y,
          });
        }}
      >
        <rect x={0} y={0} width={w} height={h} fill="transparent" />

        {/* Grid */}
        {Array.from({ length: gridTicks + 1 }).map((_, idx) => {
          const t = idx / gridTicks;
          const y = padT + innerH * (1 - t);
          const val = Math.round(maxY * t);
          return (
            <g key={idx}>
              <line x1={padL} y1={y} x2={w - padR} y2={y} stroke="#e4e4e7" strokeWidth={1} />
              <text x={4} y={y + 4} fontSize={13} fill="#71717a">
                {val}
              </text>
            </g>
          );
        })}

        {/* Average line */}
        {showAverage ? (
          <line
            x1={padL}
            y1={avgY}
            x2={w - padR}
            y2={avgY}
            stroke="#94a3b8"
            strokeWidth={1}
            strokeDasharray="4 4"
          />
        ) : null}

        {/* Bars */}
        {workdays.map((d, i) => {
          const x = xAt(i) - barW / 2;
          const isZero = d.calls === 0;
          const yTop = isZero ? padT + innerH - ZERO_BAR_H : yAt(d.calls);
          const bh = isZero ? ZERO_BAR_H : padT + innerH - yTop;
          const height = Math.max(2, bh);
          const rx = Math.max(1, Math.min(6, barW / 2, height / 2));
          const fill = hover?.i === i ? "#6B3F4B" : "#7C4A57";
          return (
            <rect
              key={`${d.date}-${i}`}
              x={x}
              y={yTop}
              width={barW}
              height={height}
              rx={rx}
              fill={fill}
            />
          );
        })}

        {/* X labels */}
        {workdays.map((d, i) => {
          const dom = dayOfMonth(d.date);
          const x = xAt(i);
          const y = h - 8;
          return (
            <text
              key={`x-${d.date}-${i}`}
              x={x}
              y={y}
              fontSize={11}
              fill="#a1a1aa"
              textAnchor="middle"
              transform={`rotate(-45 ${x} ${y})`}
            >
              {Number.isFinite(dom) ? String(dom).padStart(2, "0") : formatIsoMonthDay(d.date)}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

