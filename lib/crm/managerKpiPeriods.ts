import {
  eachDayInclusive,
  subtractOneCivilDayVilnius,
  vilniusFirstDayOfMonthIso,
  vilniusMondayOfWeekIso,
  vilniusTodayDateString,
} from "@/lib/crm/vilniusTime";

export type ManagerKpiPreset = "today" | "week" | "month" | "custom";

export type ManagerKpiDateRange = { from: string; to: string };

/** Seni bookmark'ai / query: nukreipiame į artimiausią dabartinį presetą. */
export function parseManagerKpiPreset(raw: string | undefined | null): ManagerKpiPreset {
  if (raw === "today" || raw === "yesterday") return "today";
  if (raw === "week" || raw === "last_week") return "week";
  if (raw === "month" || raw === "last_month") return "month";
  if (raw === "custom") return "custom";
  return "today";
}

function lastMonthRange(todayIso: string): ManagerKpiDateRange {
  const firstThisMonth = vilniusFirstDayOfMonthIso(todayIso);
  const lastPrev = subtractOneCivilDayVilnius(firstThisMonth);
  const firstPrev = vilniusFirstDayOfMonthIso(lastPrev);
  return { from: firstPrev, to: lastPrev };
}

/** Pagrindinis laikotarpis pagal preset (Vilnius, YYYY-MM-DD įskaitant). */
export function resolveManagerKpiRange(
  preset: ManagerKpiPreset,
  customFrom?: string | null,
  customTo?: string | null
): ManagerKpiDateRange {
  const today = vilniusTodayDateString();

  if (preset === "custom" && customFrom && customTo && /^\d{4}-\d{2}-\d{2}$/.test(customFrom) && /^\d{4}-\d{2}-\d{2}$/.test(customTo)) {
    return customFrom <= customTo ? { from: customFrom, to: customTo } : { from: customTo, to: customFrom };
  }

  if (preset === "today") return { from: today, to: today };
  if (preset === "week") {
    const mon = vilniusMondayOfWeekIso(today);
    return { from: mon, to: today };
  }
  if (preset === "month") {
    const first = vilniusFirstDayOfMonthIso(today);
    return { from: first, to: today };
  }
  return { from: today, to: today };
}

/** Lyginimui: ankstesnis toks pat ilgis (dienų sk.), baigiantis diena prieš `from`. */
export function previousPeriodSameLength(range: ManagerKpiDateRange): ManagerKpiDateRange {
  const days = eachDayInclusive(range.from, range.to);
  const n = days.length;
  if (n < 1) return range;
  const prevTo = subtractOneCivilDayVilnius(range.from);
  let prevFrom = prevTo;
  for (let i = 1; i < n; i++) {
    prevFrom = subtractOneCivilDayVilnius(prevFrom);
  }
  return { from: prevFrom, to: prevTo };
}

/** Šiandien → vakar; ši savaitė → praeita savaitė (atitinkama trukmė); šis mėnuo → praeitas kalendorinis mėnuo; custom → ankst. toks pat ilgis. */
export function comparisonRangeForPreset(
  preset: ManagerKpiPreset,
  current: ManagerKpiDateRange,
  _customFrom?: string | null,
  _customTo?: string | null
): ManagerKpiDateRange {
  const today = vilniusTodayDateString();

  if (preset === "today") {
    const y = subtractOneCivilDayVilnius(today);
    return { from: y, to: y };
  }
  if (preset === "week") {
    const thisMon = vilniusMondayOfWeekIso(today);
    const lastSun = subtractOneCivilDayVilnius(thisMon);
    const lastMon = vilniusMondayOfWeekIso(lastSun);
    const span = eachDayInclusive(thisMon, today).length;
    const days = eachDayInclusive(lastMon, lastSun);
    const tail = days.slice(-span);
    if (tail.length === 0) return { from: lastMon, to: lastSun };
    return { from: tail[0]!, to: tail[tail.length - 1]! };
  }
  if (preset === "month") {
    return lastMonthRange(today);
  }
  if (preset === "custom") {
    return previousPeriodSameLength(current);
  }
  return previousPeriodSameLength(current);
}

/** Trumpas LT pavadinimas UI eilutei „Lyginama su: …“. */
export function managerKpiCompareShortLabel(preset: ManagerKpiPreset): string {
  switch (preset) {
    case "today":
      return "vakar";
    case "week":
      return "praeita savaitė";
    case "month":
      return "praeitas mėnuo";
    case "custom":
      return "ankstesnis laikotarpis";
  }
}

export function calendarDaysInRange(range: ManagerKpiDateRange): number {
  return eachDayInclusive(range.from, range.to).length;
}
