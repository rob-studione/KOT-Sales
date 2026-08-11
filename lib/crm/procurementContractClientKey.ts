/** Stabilus `client_key` viešųjų pirkimų darbo eilutei. */

const CONTRACT_PREFIX = "pc:";
const ORG_PREFIX = "po:";
const ORG_NAME_PREFIX = "po:name:";

/** Senas per-sutarties raktas (legacy open work items). */
export function procurementContractClientKey(contractId: string): string {
  return `${CONTRACT_PREFIX}${String(contractId).trim()}`;
}

export function parseProcurementContractIdFromClientKey(clientKey: string | null | undefined): string | null {
  const s = String(clientKey ?? "").trim();
  if (!s.startsWith(CONTRACT_PREFIX) || s.startsWith(ORG_PREFIX)) return null;
  const id = s.slice(CONTRACT_PREFIX.length).trim();
  return /^[0-9a-f-]{36}$/i.test(id) ? id : null;
}

/** Normalizuotas pavadinimas fallback raktui (be įmonės kodo). */
export function normalizeProcurementOrgNameForKey(name: string | null | undefined): string {
  return String(name ?? "")
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/**
 * Įstaigos raktas: `po:{organization_code}` arba `po:name:{normalizedName}`.
 * Nauji pick'ai naudoja šį raktą (ne `pc:`).
 */
export function procurementOrgClientKey(opts: {
  organizationCode?: string | null;
  organizationName?: string | null;
}): string | null {
  const code = String(opts.organizationCode ?? "").trim();
  if (code && !code.toUpperCase().startsWith("PERSON_")) {
    return `${ORG_PREFIX}${code}`;
  }
  const name = normalizeProcurementOrgNameForKey(opts.organizationName);
  if (!name) return null;
  return `${ORG_NAME_PREFIX}${name}`;
}

export function isProcurementOrgClientKey(clientKey: string | null | undefined): boolean {
  const s = String(clientKey ?? "").trim();
  return s.startsWith(ORG_PREFIX);
}

export function isProcurementContractClientKey(clientKey: string | null | undefined): boolean {
  const s = String(clientKey ?? "").trim();
  return s.startsWith(CONTRACT_PREFIX) && !s.startsWith(ORG_PREFIX);
}

/** Sutarties eilutės įstaigos raktas. */
export function procurementOrgClientKeyFromContract(row: {
  organization_code?: string | null;
  organization_name?: string | null;
}): string | null {
  return procurementOrgClientKey({
    organizationCode: row.organization_code,
    organizationName: row.organization_name,
  });
}
