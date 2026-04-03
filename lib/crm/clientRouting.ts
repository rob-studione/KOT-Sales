/** URL segment for clients grouped without company_code and without client_id (single bucket). */
export const ORPHAN_CLIENT_PATH_SEGMENT = "orphan";

export function clientDetailPath(clientKey: string | null | undefined): string {
  if (clientKey == null || clientKey === "") {
    return `/clients/${ORPHAN_CLIENT_PATH_SEGMENT}`;
  }
  return `/clients/${encodeURIComponent(clientKey)}`;
}
