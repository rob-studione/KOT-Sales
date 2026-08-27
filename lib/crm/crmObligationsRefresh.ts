/** Klientiniai komponentai kviečia po Kanban / touchpoint sėkmės. */
export const CRM_OBLIGATIONS_REFRESH_EVENT = "crm-obligations-refresh";

export function notifyCrmObligationsRefresh(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(CRM_OBLIGATIONS_REFRESH_EVENT));
}
