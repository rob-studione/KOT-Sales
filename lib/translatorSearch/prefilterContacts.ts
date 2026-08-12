export type ContactPrefilter = {
  emails: string[];
  phones: string[];
  hasProfessionKeyword: boolean;
  hasLanguageKeyword: boolean;
  worthSendingToModel: boolean;
  reasonIfSkip: string | null;
};

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const PHONE_RE = /(?:\+|00)?\d[\d\s().-]{7,}\d/g;

const PROFESSION_RE =
  /\b(translator|interprete?r|verėja|vert[eė]jas|sworn|certified|be[eë]digd|assorni|traduct(?:eur|rice|or)|dolmetscher)\b/i;

const LANGUAGE_RE =
  /\b(english|dutch|french|german|spanish|italian|lithuanian|nederlands|français|deutsch|anglais|flamand|belgian|belgium|nl|en|fr|de)\b/i;

export function prefilterContacts(text: string): ContactPrefilter {
  const raw = String(text ?? "").trim();
  if (raw.length < 40) {
    return {
      emails: [],
      phones: [],
      hasProfessionKeyword: false,
      hasLanguageKeyword: false,
      worthSendingToModel: false,
      reasonIfSkip: "text_too_short",
    };
  }

  const emails = [...new Set((raw.match(EMAIL_RE) ?? []).map((e) => e.toLowerCase()))].slice(0, 20);
  const phones = [...new Set((raw.match(PHONE_RE) ?? []).map((p) => p.replace(/\s+/g, " ").trim()))].slice(0, 20);
  const hasProfessionKeyword = PROFESSION_RE.test(raw);
  const hasLanguageKeyword = LANGUAGE_RE.test(raw);

  const worth =
    emails.length > 0 || phones.length > 0 || (hasProfessionKeyword && hasLanguageKeyword) || hasProfessionKeyword;

  return {
    emails,
    phones,
    hasProfessionKeyword,
    hasLanguageKeyword,
    worthSendingToModel: worth,
    reasonIfSkip: worth ? null : "no_contact_or_profession_signal",
  };
}
