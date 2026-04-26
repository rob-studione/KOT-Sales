#!/usr/bin/env node
/**
 * Patikrina, kad `normalizeIsoDate` stiliaus YYYY-MM-DD regex atitinka lūkesčius
 * (naudokite tą patį kūną kaip `app/(crm)/analitika/lost-qa/page.tsx`: /^\d{4}-\d{2}-\d{2}$/).
 */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const ok = ISO_DATE.test("2026-04-15");
const bad = !ISO_DATE.test("not-a-date");
const bad2 = !ISO_DATE.test("2026-4-15");
if (!ok || !bad || !bad2) {
  console.error("verify-lost-qa-date-regex: FAILED", { ok, bad, bad2 });
  process.exit(1);
}
console.log("verify-lost-qa-date-regex: ok");
