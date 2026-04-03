/** Internal API keys from POST /api/sync-saskaita123 → human-readable Lithuanian. */
export function stoppedReasonLt(key: string): string {
  const k = (key || "").trim();
  const map: Record<string, string> = {
    unknown: "Baigta (priežastis nenurodyta).",
    max_pages_cap:
      "Pasiekta sinchronizacijos puslapių riba. Jei trūksta senų sąskaitų, pakartok sinchronizaciją arba padidink SYNC_MAX_PAGES_FULL.",
    no_next_page_url: "Paskutinis puslapis — daugiau sąskaitų API neberodo.",
    page_all_older_than_latestKnownInvoiceDate:
      "Šiame puslapyje visos sąskaitos senesnės už jau įrašytą naujausią datą (inkrementinė sinchronizacija sustojo).",
    error: "Klaida sinchronizuojant (žr. serverio žurnalą arba klaidos tekstą).",
  };
  return map[k] ?? k;
}
