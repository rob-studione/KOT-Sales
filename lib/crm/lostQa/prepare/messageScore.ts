import "server-only";

import type { LostCaseMessageRow } from "@/lib/crm/lostQaDb";
import type { PreparedMessageSignals } from "@/lib/crm/lostQa/prepare/preparedCasePayload";

export type EnrichedLostMessage = LostCaseMessageRow & {
  clean_text: string;
  signals: PreparedMessageSignals;
  isFirstInboundClient: boolean;
  isFirstOutboundBiz: boolean;
  isFinalMeaningful: boolean;
};

export function scoreForSelection(m: EnrichedLostMessage): number {
  let s = 0;
  const anyBizSignal =
    m.signals.pricing ||
    m.signals.timeline ||
    m.signals.competitor ||
    m.signals.objection ||
    m.signals.decision ||
    m.signals.scope ||
    m.signals.ghosting;

  if (m.isFirstInboundClient) s += 120;
  if (m.isFirstOutboundBiz) s += 120;
  if (m.isFinalMeaningful) s += 90;
  if (m.signals.decision) s += 70;
  if (m.signals.objection) s += 55;
  if (m.signals.pricing) s += 50;
  if (m.signals.competitor) s += 50;
  if (m.signals.scope) s += 45;
  if (m.signals.timeline) s += 40;

  const len = m.clean_text.replace(/\s/g, "").length;
  if (len > 240) s += 18;
  else if (len > 120) s += 10;
  else if (len > 40) s += 4;

  if (m.signals.low_value) s -= 95;
  if (m.sender_role === "system") s -= 40;

  if (!anyBizSignal && len < 25) s -= 25;
  return s;
}

export function mustKeepForCap(m: EnrichedLostMessage): boolean {
  const sig =
    m.signals.pricing ||
    m.signals.timeline ||
    m.signals.competitor ||
    m.signals.objection ||
    m.signals.decision ||
    m.signals.scope ||
    m.signals.ghosting;
  return m.isFirstInboundClient || m.isFirstOutboundBiz || m.isFinalMeaningful || sig;
}
