/** KPI: vienas skambutis vadybininkui + kortelei + Vilniaus dienai. Atsiliepė laimi, jei tą dieną buvo bent vienas. */

export type UniqueCallDayAcc = {
  userId: string;
  day: string;
  answered: boolean;
  notAnswered: boolean;
};

export function uniqueCallDayKey(userId: string, workItemId: string, day: string): string {
  return `${userId}\t${workItemId}\t${day}`;
}

export function recordUniqueCallDay(
  acc: Map<string, UniqueCallDayAcc>,
  userId: string,
  workItemId: string,
  day: string,
  answered: boolean,
  notAnswered: boolean
): void {
  const key = uniqueCallDayKey(userId, workItemId, day);
  const prev = acc.get(key);
  if (!prev) {
    acc.set(key, { userId, day, answered, notAnswered });
    return;
  }
  if (answered) prev.answered = true;
  if (notAnswered) prev.notAnswered = true;
}
