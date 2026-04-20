import { parseManualLeadIdFromClientKey } from "@/lib/crm/manualLeadClientKey";
import { parseProcurementContractIdFromClientKey } from "@/lib/crm/procurementContractClientKey";

/** URL segment for clients grouped without company_code and without client_id (single bucket). */
export const ORPHAN_CLIENT_PATH_SEGMENT = "orphan";

/**
 * Canonical client detail path is `/klientai/[clientId]`.
 *
 * - Prefer `clientId` (internal id) when available.
 * - Fallback to legacy `/clients/[client_key]` when only `clientKey` is known; it will redirect server-side.
 */
export function clientDetailPath(clientKey: string | null | undefined, clientId?: string | null | undefined): string {
  const id = String(clientId ?? "").trim();
  if (id) return `/klientai/${encodeURIComponent(id)}`;
  if (clientKey == null || clientKey === "") {
    return `/klientai/${ORPHAN_CLIENT_PATH_SEGMENT}`;
  }
  return `/clients/${encodeURIComponent(clientKey)}`;
}

/** Darbo eilutė: CRM nuoroda tik jei `client_key` tikras; rankiniams leadams (`ml:…`) — null. */
export function workItemClientDetailHref(clientKey: string | null | undefined): string | null {
  if (clientKey == null || String(clientKey).trim() === "") return null;
  if (parseManualLeadIdFromClientKey(clientKey)) return null;
  if (parseProcurementContractIdFromClientKey(clientKey)) return null;
  return clientDetailPath(clientKey);
}
