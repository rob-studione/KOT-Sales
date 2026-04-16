"use client";

import { useMemo } from "react";
import type { BestCallTimesData, BestCallTimeCell } from "@/lib/crm/salesAnalyticsDashboard";

function pct(n: number, d: number): string {
  if (!Number.isFinite(n) || !Number.isFinite(d) || d <= 0) return "—";
  return `${Math.round((n / d) * 100)}%`;
}

function ltWeekdayLabel(idxMon0: number): string {
  return ["Pirmadienis", "Antradienis", "Trečiadienis", "Ketvirtadienis", "Penktadienis", "Šeštadienis", "Sekmadienis"][idxMon0] ?? "—";
}

function successesForMetric(cell: BestCallTimeCell): number {
  return cell.answered;
}

function weightedScore(successes: number, calls: number): number {
  if (!Number.isFinite(successes) || !Number.isFinite(calls) || calls <= 0) return 0;
  const rate = successes / calls;
  return rate * Math.log(calls + 1);
}

export function BestCallTimeSection({ data }: { data: BestCallTimesData }) {
  const ranked = useMemo(() => {
    const out: Array<{
      weekdayIdx: number;
      slotIdx: number;
      calls: number;
      successes: number;
      rate: number;
      score: number;
    }> = [];

    for (let w = 0; w < data.matrix.length; w++) {
      for (let s = 0; s < data.matrix[w].length; s++) {
        const cell = data.matrix[w][s];
        if (cell.calls <= 0) continue;
        const successes = successesForMetric(cell);
        const rate = successes / cell.calls;
        const score = weightedScore(successes, cell.calls);
        out.push({ weekdayIdx: w, slotIdx: s, calls: cell.calls, successes, rate, score });
      }
    }

    out.sort((a, b) => {
      // Primary: weighted score (success_rate * ln(call_count + 1))
      if (a.score !== b.score) return b.score - a.score;
      // Secondary: raw rate
      if (a.rate !== b.rate) return b.rate - a.rate;
      // Tertiary: more calls wins
      if (a.calls !== b.calls) return b.calls - a.calls;
      return a.weekdayIdx - b.weekdayIdx || a.slotIdx - b.slotIdx;
    });

    return out;
  }, [data.matrix]);

  const best = ranked[0] ?? null;
  const top3 = ranked.slice(0, 3);
  const alt2 = top3.length >= 2 ? top3[1] : null;
  const alt3 = top3.length >= 3 ? top3[2] : null;

  if (!best) return null;

  const bestText = `${ltWeekdayLabel(best.weekdayIdx)} ${data.slotKeys[best.slotIdx] ?? "—"} — ${pct(best.successes, best.calls)} (${best.calls.toLocaleString("lt-LT")})`;
  const altParts: string[] = [];
  if (alt2) {
    altParts.push(
      `${ltWeekdayLabel(alt2.weekdayIdx)} ${data.slotKeys[alt2.slotIdx] ?? "—"} — ${pct(alt2.successes, alt2.calls)} (${alt2.calls.toLocaleString("lt-LT")})`
    );
  }
  if (alt3) {
    altParts.push(
      `${ltWeekdayLabel(alt3.weekdayIdx)} ${data.slotKeys[alt3.slotIdx] ?? "—"} — ${pct(alt3.successes, alt3.calls)} (${alt3.calls.toLocaleString("lt-LT")})`
    );
  }

  return (
    <div className="text-xs text-zinc-500">
      <div className="leading-snug">
        <span className="font-medium text-zinc-700">Geriausias laikas skambinti:</span> {bestText}
        {best.calls < 5 ? <span className="text-zinc-400"> • maža imtis</span> : null}
      </div>
      <div className="mt-1 leading-snug">
        <span className="font-medium text-zinc-700">Alternatyvos:</span> {altParts.length ? altParts.join(", ") : "—"}
      </div>
    </div>
  );
}

