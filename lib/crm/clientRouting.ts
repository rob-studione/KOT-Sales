import { parseManualLeadIdFromClientKey } from "@/lib/crm/manualLeadClientKey";
import { parseProcurementContractIdFromClientKey } from "@/lib/crm/procurementContractClientKey";

/** URL segment for clients grouped without company_code and without client_id (single bucket). */
export const ORPHAN_CLIENT_PATH_SEGMENT = "orphan";

export function clientDetailPath(clientKey: string | null | undefined): string {
  if (clientKey == null || clientKey === "") {
    return `/clients/${ORPHAN_CLIENT_PATH_SEGMENT}`;
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
