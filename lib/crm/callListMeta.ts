export function formatInactivityPhrase(lastInvoiceAnywhereIso: string): string {
  const d = lastInvoiceAnywhereIso?.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return "—";
  const last = new Date(`${d}T12:00:00`);
  const now = new Date();
  const ms = now.getTime() - last.getTime();
  const days = Math.floor(ms / 86400000);
  if (days < 0) return "Nauja sąskaita";
  if (days === 0) return "Paskutinė — šiandien";
  if (days === 1) return "1 d. nuo paskutinės sąskaitos";
  return `${days} d. nuo paskutinės sąskaitos`;
}
