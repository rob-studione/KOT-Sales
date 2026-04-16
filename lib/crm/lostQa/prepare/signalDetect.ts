import "server-only";

import type { PreparedMessageSignals } from "@/lib/crm/lostQa/prepare/preparedCasePayload";

function hasAny(hay: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => {
    p.lastIndex = 0;
    return p.test(hay);
  });
}

/** Deterministic EN/LT cue heuristics (keyword / phrase). */
export function detectSignals(text: string, snippet: string | null): PreparedMessageSignals {
  const combined = `${text}\n${snippet ?? ""}`.toLowerCase();

  const pricing = hasAny(combined, [
    /\bprice\b/,
    /\bpricing\b/,
    /\bquote\b/,
    /\bquotation\b/,
    /\bcost\b/,
    /\brate\b/,
    /\btoo expensive\b/,
    /\bcheaper\b/,
    /\blower (?:the )?quote\b/,
    /\beur\b|\beuro\b|\b€/,
    /\bkaina\b/,
    /\bkainos\b/,
    /\bsiūloma kaina\b/,
    /\bpasiūlymas\b/,
    /\bskaičiuok\b/,
    /\bbrangu\b/,
    /\bper brang\w*\b/,
    /\bnuolaida\b/,
  ]);

  const timeline = hasAny(combined, [
    /\burgent\b/,
    /\burgen\w*\b/,
    /\bdeadline\b/,
    /\bby (?:monday|tuesday|wednesday|thursday|friday|today|tomorrow)\b/,
    /\bturnaround\b/,
    /\beta\b/,
    /\basap\b/,
    /\bthis week\b/,
    /\bskubu\b/,
    /\bskubiai\b/,
    /\bterminas\b/,
    /\biš šiandien\b/,
    /\biki \d{1,2}\/\d{1,2}\b/,
    /\bpristatymo terminas\b/,
  ]);

  const competitor = hasAny(combined, [
    /\bcompetitor\b/,
    /\banother provider\b/,
    /\bwent with\b/,
    /\bchose (?:someone|another)\b/,
    /\bselected (?:a )?different\b/,
    /\bkonkurent\w*\b/,
    /\bkitas tiekėj\w*\b/,
    /\bpasirinkom kit\w*\b/,
    /\bpasirinkome kit\w*\b/,
    /\bpasirinko kit\w*\b/,
  ]);

  const objection = hasAny(combined, [
    /\bconcern\b/,
    /\bhesitant\b/,
    /\bnot sure\b/,
    /\bworried\b/,
    /\bdoes not meet\b/,
    /\bdoesn't meet\b/,
    /\bnot what we need\b/,
    /\bnebūtinai\b/,
    /\bdvejoj\w*\b/,
    /\brūpest\w*\b/,
    /\bnetinka\b/,
    /\bneatitinka\b/,
  ]);

  const decision = hasAny(combined, [
    /\bwill not (?:move forward|proceed)\b/,
    /\bcannot proceed\b/,
    /\bcan't proceed\b/,
    /\bnot interested\b/,
    /\bcancelling\b/,
    /\bcanceling\b/,
    /\bdecided to\b/,
    /\bwe (?:have )?decided\b/,
    /\bgoing with\b/,
    /\btoo late\b/,
    /\bnot accepted\b/,
    /\bnegalime tęst\w*\b/,
    /\bnedomina\b/,
    /\bnutraukiame\b/,
    /\batsisak\w*\b/,
    /\bspręsti\b.*\bnebegal\w*\b/,
    /\bper vėlu\b/,
    /\bnepriim\w*\b/,
    /\bwe (?:will )?go with another provider\b/,
    /\bwe went with another provider\b/,
    /\bwe chose another provider\b/,
    /\bwe chose a different provider\b/,
    /\bwe received a lower quote elsewhere\b/,
    /\bpasirinkome kitą tiekėją\b/,
    /\bpasirinkome kitą paslaugų teikėją\b/,
    /\bradome kitą variantą ir rinksime jį\b/,
    /\bnusprendėme nesitęsti\b/,
    /\bnusprendėme netęsti\b/,
  ]);

  const scope = hasAny(combined, [
    /\bcertified\b/,
    /\bnotarized\b/,
    /\bnotarised\b/,
    /\bapostille\b/,
    /\bformat mismatch\b/,
    /\blanguage pair\b/,
    /\bscope\b.*\bmismatch\b/,
    /\bpatvirtint\w* dokument\w*\b/,
    /\bnotarin\w*\b/,
    /\bapostil\w*\b/,
    /\bformatas\b.*\bnetinka\b/,
    /\bkalb\w* por\w*\b/,
  ]);

  const trimmed = text.trim();
  const shortAck =
    trimmed.length < 80 &&
    /^(?:thanks|thank you|ty|thx|ok\.?|okay|noted|received|got it|understood|ačiū|gerai|supratau|gavau|užfiksuota)\s*[.!?]?$/i.test(
      trimmed.replace(/\s+/g, " ")
    );

  const low_value =
    shortAck ||
    hasAny(combined, [
      /\bout of office\b/,
      /\bautomatic reply\b/,
      /\bauto-?reply\b/,
      /\bne prie kompiuterio\b/,
      /\bišvykęs\b/,
      /\batsakysiu vėliau\b/,
      /\bundeliverable\b/,
      /\bdelivery status notification\b/,
      /\bmail delivery failed\b/,
      /\bgrąžinta laiško\b/,
    ]);

  return {
    pricing,
    timeline,
    competitor,
    objection,
    decision,
    scope,
    ghosting: false,
    low_value,
  };
}
