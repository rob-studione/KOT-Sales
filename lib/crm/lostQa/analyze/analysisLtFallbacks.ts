import "server-only";

import { lostPrimaryReasonLabelLtOrDefault } from "@/lib/crm/lostQa/reasonLabelLt";
import type { LostQaStructuredAnalysis } from "@/lib/crm/lostQa/analyze/lostQaAnalysisSchema";

/**
 * Prieš įrašant į DB — užpildo LT laukus, jei (retai) praeitų validaciją
 * su tarpais ar dėl senų/legacy režimų. Normaliam OpenAI srautui dažniausiai no-op.
 */
export function ensureNonEmptyAnalysisLtFields(parsed: LostQaStructuredAnalysis): LostQaStructuredAnalysis {
  const primary_reason_lt = (() => {
    const t = (parsed.primary_reason_lt ?? "").trim();
    return t || lostPrimaryReasonLabelLtOrDefault(String(parsed.primary_reason));
  })();

  const summary_lt = (parsed.summary_lt ?? []).map((s) => String(s).trim()).filter(Boolean);
  // Validacija jau reikalauja ne tuščio masyvo; apsauga nuo baltos vietos tik
  const safeSummary =
    summary_lt.length > 0
      ? summary_lt
      : [`${primary_reason_lt} — peržiūrėkite atvejo kontekstą (santrauka nebuvo sugeneruota).`];

  const block = safeSummary.join("\n");
  const why_lost_lt = (() => {
    const t = (parsed.why_lost_lt ?? "").trim();
    if (t) return t;
    if (block) {
      return block.length > 2000 ? `${block.slice(0, 2000)}…` : block;
    }
    return "Išsamesnis praradimo aprašymas nebuvo gautas — žr. analizės kategorijas ir el. laišką.";
  })();

  return { ...parsed, primary_reason_lt, why_lost_lt, summary_lt: safeSummary };
}
