const PREFIX = "pc:";

/** Stabilus `client_key` sutarčiai viešųjų pirkimų darbo eilutėje (unikalumas per projektą). */
export function procurementContractClientKey(contractId: string): string {
  return `${PREFIX}${String(contractId).trim()}`;
}

export function parseProcurementContractIdFromClientKey(clientKey: string | null | undefined): string | null {
  const s = String(clientKey ?? "").trim();
  if (!s.startsWith(PREFIX)) return null;
  const id = s.slice(PREFIX.length).trim();
  return /^[0-9a-f-]{36}$/i.test(id) ? id : null;
}
