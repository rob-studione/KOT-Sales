import "server-only";

import type { LostCaseMessageRow } from "@/lib/crm/lostQaDb";
import { cleanMessageTextForPreparation } from "@/lib/crm/lostQa/prepare/textClean";
import { detectSignals } from "@/lib/crm/lostQa/prepare/signalDetect";
import type { EnrichedLostMessage } from "@/lib/crm/lostQa/prepare/messageScore";
import { mustKeepForCap, scoreForSelection } from "@/lib/crm/lostQa/prepare/messageScore";

const MAX_SELECTED = 12;

function isMeaningful(m: EnrichedLostMessage): boolean {
  const sub = m.clean_text.replace(/\s/g, "").length;
  if (m.signals.low_value && sub < 20) return false;
  const sig =
    m.signals.pricing ||
    m.signals.timeline ||
    m.signals.competitor ||
    m.signals.objection ||
    m.signals.decision ||
    m.signals.scope ||
    m.signals.ghosting;
  if (sig) return true;
  return sub >= 25;
}

export function enrichSourceMessages(rows: LostCaseMessageRow[]): EnrichedLostMessage[] {
  const sorted = [...rows].sort((a, b) => a.message_index - b.message_index);
  let firstClientIdx = -1;
  let firstBizIdx = -1;
  for (let i = 0; i < sorted.length; i++) {
    const r = sorted[i];
    if (firstClientIdx < 0 && r.is_inbound && r.sender_role === "client") firstClientIdx = i;
    if (firstBizIdx < 0 && !r.is_inbound && (r.sender_role === "agent" || r.sender_role === "internal")) {
      firstBizIdx = i;
    }
  }

  const withClean = sorted.map((r) => {
    const clean_text = cleanMessageTextForPreparation(r.body_plain, r.body_clean);
    const signals = detectSignals(clean_text, r.snippet);
    return { ...r, clean_text, signals };
  });

  // Ghosting: last message is from agent/internal and no client reply follows.
  const last = withClean[withClean.length - 1];
  const ghosting =
    Boolean(last) && !last.is_inbound && (last.sender_role === "agent" || last.sender_role === "internal");

  const meaningfulIdx = new Set<number>();
  withClean.forEach((m, i) => {
    const e: EnrichedLostMessage = {
      ...m,
      isFirstInboundClient: false,
      isFirstOutboundBiz: false,
      isFinalMeaningful: false,
    };
    if (isMeaningful(e)) meaningfulIdx.add(i);
  });

  let finalMeaningfulIdx = -1;
  for (let i = withClean.length - 1; i >= 0; i--) {
    if (meaningfulIdx.has(i)) {
      finalMeaningfulIdx = i;
      break;
    }
  }
  if (finalMeaningfulIdx < 0 && withClean.length > 0) {
    finalMeaningfulIdx = withClean.length - 1;
  }

  return withClean.map((m, i) => ({
    ...m,
    signals: { ...m.signals, ghosting: ghosting && i === withClean.length - 1 },
    isFirstInboundClient: i === firstClientIdx && firstClientIdx >= 0,
    isFirstOutboundBiz: i === firstBizIdx && firstBizIdx >= 0,
    isFinalMeaningful: i === finalMeaningfulIdx && finalMeaningfulIdx >= 0,
  }));
}

export function selectMessagesForPreparation(rows: LostCaseMessageRow[]): EnrichedLostMessage[] {
  if (!rows.length) return [];
  const enriched = enrichSourceMessages(rows);
  const byIdx = new Map(enriched.map((m) => [m.message_index, m]));
  const meaningful = enriched.filter(isMeaningful).sort((a, b) => a.message_index - b.message_index);

  if (meaningful.length === 0) {
    const last = enriched[enriched.length - 1];
    return last ? [last] : [];
  }

  if (meaningful.length <= MAX_SELECTED) {
    return meaningful;
  }

  const pick = new Set<number>();

  for (const m of enriched) {
    if (m.isFirstInboundClient) pick.add(m.message_index);
    if (m.isFirstOutboundBiz) pick.add(m.message_index);
  }

  for (const m of enriched) {
    if (m.signals.objection || m.signals.decision) pick.add(m.message_index);
    if (m.signals.pricing || m.signals.timeline || m.signals.competitor || m.signals.scope) {
      pick.add(m.message_index);
    }
  }

  const lastM = meaningful[meaningful.length - 1];
  if (lastM) {
    pick.add(lastM.message_index);
    const ord = [...enriched].map((m) => m.message_index).sort((a, b) => a - b);
    const pos = ord.indexOf(lastM.message_index);
    if (pos > 0) pick.add(ord[pos - 1]);
  }

  let selected = [...pick]
    .sort((a, b) => a - b)
    .map((i) => byIdx.get(i))
    .filter((m): m is EnrichedLostMessage => Boolean(m));

  if (selected.length > MAX_SELECTED) {
    const isSignal = (m: EnrichedLostMessage) =>
      m.signals.pricing ||
      m.signals.timeline ||
      m.signals.competitor ||
      m.signals.objection ||
      m.signals.decision ||
      m.signals.scope ||
      m.signals.ghosting;

    const scored = selected.map((m) => ({
      m,
      score: scoreForSelection(m),
      must: mustKeepForCap(m),
      signal: isSignal(m),
    }));

    const sortByPriority = (a: (typeof scored)[number], b: (typeof scored)[number]) => {
      if (a.must !== b.must) return a.must ? -1 : 1;
      if (b.score !== a.score) return b.score - a.score;
      return a.m.message_index - b.m.message_index;
    };

    // Keep all signal messages if possible (drop non-signal first).
    const signalOnes = scored.filter((x) => x.signal).sort(sortByPriority);
    const nonSignal = scored.filter((x) => !x.signal).sort(sortByPriority);

    const chosen: EnrichedLostMessage[] = [];
    for (const x of signalOnes) {
      if (chosen.length >= MAX_SELECTED) break;
      chosen.push(x.m);
    }
    for (const x of nonSignal) {
      if (chosen.length >= MAX_SELECTED) break;
      chosen.push(x.m);
    }

    const keep = new Set(chosen.map((m) => m.message_index));
    selected = selected.filter((m) => keep.has(m.message_index)).sort((a, b) => a.message_index - b.message_index);
  }

  const seen = new Set<number>();
  return selected.filter((m) => {
    if (seen.has(m.message_index)) return false;
    seen.add(m.message_index);
    return true;
  });
}
