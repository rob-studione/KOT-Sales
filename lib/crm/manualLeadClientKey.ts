/** Unikalus `project_work_items.client_key` rankiniam leadui (nėra CRM `client_key`). */
const PREFIX = "ml:";

export function manualLeadClientKey(leadId: string): string {
  return `${PREFIX}${String(leadId).trim()}`;
}

export function parseManualLeadIdFromClientKey(clientKey: string | null | undefined): string | null {
  const s = String(clientKey ?? "").trim();
  if (!s.startsWith(PREFIX)) return null;
  const id = s.slice(PREFIX.length).trim();
  return /^[0-9a-f-]{36}$/i.test(id) ? id : null;
}
