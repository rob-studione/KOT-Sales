/**
 * Viešųjų pirkimų sutarties „Tipas“ (CSV / DB reikšmė) → pilnas pavadinimas UI.
 * Raktai normalizuojami: trim, tarpų sutraukimas, mažosios raidės.
 */

const TYPE_KEY_TO_FULL_LABEL: Record<string, string> = {
  "ilgalaikė mvpž": "Ilgalaikė mažos vertės pirkimo sutartis",
  mvp: "Mažos vertės pirkimas",
  mvpž: "Mažos vertės pirkimo sutartis",
  pps: "Paprastojo pirkimo sutartis",
  sp: "Supaprastintas pirkimas",
  tsp: "Tarptautinis supaprastintas pirkimas",
};

function normalizeProcurementTypeKey(raw: string): string {
  return String(raw ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

/** Pilnas žmogui suprantamas pavadinimas; neatpažinus — originali reikšmė (trim). */
export function procurementContractTypeFullLabel(raw: string | null | undefined): string {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return "—";
  const key = normalizeProcurementTypeKey(trimmed);
  return TYPE_KEY_TO_FULL_LABEL[key] ?? trimmed;
}

/**
 * Lentelės celė: rodoma sutrumpinta (originali iš DB), title — pilnas pavadinimas, jei yra mappingas.
 * Neatpažinta — celė ir title sutampa (originalas).
 */
export function procurementContractTypeTableParts(raw: string | null | undefined): {
  cellText: string;
  title: string;
} {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return { cellText: "—", title: "" };
  const key = normalizeProcurementTypeKey(trimmed);
  const full = TYPE_KEY_TO_FULL_LABEL[key];
  if (full) return { cellText: trimmed, title: full };
  return { cellText: trimmed, title: trimmed };
}
