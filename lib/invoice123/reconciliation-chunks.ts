/** Calendar helpers for reconciliation job chunking (UTC YYYY-MM-DD, same as incremental sync). */

export function addDaysUtc(isoDate: string, deltaDays: number): string {
  const [y, m, d] = isoDate.split("-").map((x) => parseInt(x, 10));
  const t = Date.UTC(y, m - 1, d) + deltaDays * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

export function todayUtcIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Inclusive [start, end] for lookback N days ending today (matches sync-saskaita123 incremental). */
export function inclusiveOverallRange(lookbackDays: number): { start: string; end: string } {
  const end = todayUtcIso();
  const start = addDaysUtc(end, -(lookbackDays - 1));
  return { start, end };
}

/** Non-overlapping forward chunks of `chunkDays` inclusive days until overall end. */
export function buildDayChunks(
  overallStart: string,
  overallEnd: string,
  chunkDays: number
): Array<{ start: string; end: string }> {
  const chunks: Array<{ start: string; end: string }> = [];
  let curStart = overallStart;
  while (curStart <= overallEnd) {
    let curEnd = addDaysUtc(curStart, chunkDays - 1);
    if (curEnd > overallEnd) curEnd = overallEnd;
    chunks.push({ start: curStart, end: curEnd });
    curStart = addDaysUtc(curEnd, 1);
  }
  return chunks;
}
