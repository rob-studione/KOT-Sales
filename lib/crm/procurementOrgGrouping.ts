import type { SupabaseClient } from "@supabase/supabase-js";
import { isReturnedToCandidates } from "@/lib/crm/projectBoardConstants";
import {
  isProcurementOrgClientKey,
  parseProcurementContractIdFromClientKey,
  procurementOrgClientKeyFromContract,
} from "@/lib/crm/procurementContractClientKey";
import type { ProcurementContractRow, ProcurementContractsSortBy, ProcurementContractsSortDir } from "@/lib/crm/procurementContracts";

export type ProcurementOrgGroup = {
  orgKey: string;
  organization_code: string;
  organization_name: string;
  contracts: ProcurementContractRow[];
  contractCount: number;
  totalValueEur: number;
  nearestValidUntil: string | null;
};

async function loadProjectContractOrgIndex(
  supabase: SupabaseClient,
  projectId: string
): Promise<
  | {
      ok: true;
      rows: Array<{ id: string; organization_code: string | null; organization_name: string | null }>;
      idToOrgKey: Map<string, string>;
    }
  | { ok: false; error: string }
> {
  const { data: allContracts, error: cErr } = await supabase
    .from("project_procurement_contracts")
    .select("id,organization_code,organization_name")
    .eq("project_id", projectId)
    .limit(12000);

  if (cErr) return { ok: false, error: cErr.message };

  const rows = (allContracts ?? []) as Array<{
    id: string;
    organization_code: string | null;
    organization_name: string | null;
  }>;

  const idToOrgKey = new Map<string, string>();
  for (const c of rows) {
    const ok = procurementOrgClientKeyFromContract(c);
    if (ok) idToOrgKey.set(String(c.id), ok);
  }
  return { ok: true, rows, idToOrgKey };
}

/** Netinkamos įstaigos (`project_candidate_exclusions.client_key = po:…`). */
export async function fetchProcurementInvalidOrgKeys(
  supabase: SupabaseClient,
  projectId: string
): Promise<{ ok: true; orgKeys: string[] } | { ok: false; error: string }> {
  const { data, error } = await supabase
    .from("project_candidate_exclusions")
    .select("client_key")
    .eq("project_id", projectId)
    .like("client_key", "po:%");

  if (error) return { ok: false, error: error.message };
  const orgKeys = [
    ...new Set(
      (data ?? [])
        .map((r) => String((r as { client_key?: unknown }).client_key ?? "").trim())
        .filter((k) => isProcurementOrgClientKey(k))
    ),
  ];
  return { ok: true, orgKeys };
}

/**
 * Įstaigos, kurių neturi matytis aktyviame Sutartys sąraše:
 * - darbo eilutė (atvira ar užbaigta, negrąžinta)
 * - netinkamos (`project_candidate_exclusions`) kai includeInvalidExclusions
 */
export async function fetchBlockedProcurementContractIds(
  supabase: SupabaseClient,
  projectId: string,
  opts?: { includeInvalidExclusions?: boolean }
): Promise<{ ok: true; contractIds: string[]; blockedOrgKeys: string[] } | { ok: false; error: string }> {
  const includeInvalid = opts?.includeInvalidExclusions !== false;

  const { data: workRows, error: wErr } = await supabase
    .from("project_work_items")
    .select("client_key,source_id,result_status,source_type")
    .eq("project_id", projectId)
    .eq("source_type", "procurement_contract");

  if (wErr) return { ok: false, error: wErr.message };

  const activeWork = (workRows ?? []).filter(
    (r) => !isReturnedToCandidates(String((r as { result_status?: unknown }).result_status ?? ""))
  );

  const blockedOrgKeys = new Set<string>();
  const legacyContractIds = new Set<string>();

  for (const r of activeWork) {
    const ck = String((r as { client_key?: unknown }).client_key ?? "").trim();
    const sourceId = String((r as { source_id?: unknown }).source_id ?? "").trim();
    if (isProcurementOrgClientKey(ck)) {
      blockedOrgKeys.add(ck);
      continue;
    }
    const fromKey = parseProcurementContractIdFromClientKey(ck);
    if (fromKey) legacyContractIds.add(fromKey);
    else if (sourceId && /^[0-9a-f-]{36}$/i.test(sourceId)) legacyContractIds.add(sourceId);
  }

  if (includeInvalid) {
    const inv = await fetchProcurementInvalidOrgKeys(supabase, projectId);
    if (!inv.ok) return inv;
    for (const k of inv.orgKeys) blockedOrgKeys.add(k);
  }

  if (blockedOrgKeys.size === 0 && legacyContractIds.size === 0) {
    return { ok: true, contractIds: [], blockedOrgKeys: [] };
  }

  const idx = await loadProjectContractOrgIndex(supabase, projectId);
  if (!idx.ok) return idx;

  for (const id of legacyContractIds) {
    const ok = idx.idToOrgKey.get(id);
    if (ok) blockedOrgKeys.add(ok);
  }

  const excludeIds: string[] = [];
  for (const c of idx.rows) {
    const ok = idx.idToOrgKey.get(String(c.id));
    if (ok && blockedOrgKeys.has(ok)) excludeIds.push(String(c.id));
  }

  return { ok: true, contractIds: excludeIds, blockedOrgKeys: [...blockedOrgKeys] };
}

export function groupProcurementContractsByOrg(
  contracts: ProcurementContractRow[],
  opts?: { sortBy?: ProcurementContractsSortBy; sortDir?: ProcurementContractsSortDir }
): ProcurementOrgGroup[] {
  const sortBy = opts?.sortBy ?? "valid_until";
  const sortDir = opts?.sortDir ?? "asc";
  const dir = sortDir === "desc" ? -1 : 1;

  const map = new Map<string, ProcurementContractRow[]>();
  for (const c of contracts) {
    const key =
      procurementOrgClientKeyFromContract(c) ??
      `po:id:${String(c.id)}`;
    const list = map.get(key);
    if (list) list.push(c);
    else map.set(key, [c]);
  }

  const groups: ProcurementOrgGroup[] = [];
  for (const [orgKey, list] of map) {
    list.sort((a, b) => String(a.valid_until).localeCompare(String(b.valid_until)));
    let total = 0;
    for (const c of list) {
      if (c.value != null && Number.isFinite(Number(c.value))) total += Number(c.value);
    }
    const first = list[0]!;
    groups.push({
      orgKey,
      organization_code: String(first.organization_code ?? "").trim(),
      organization_name: String(first.organization_name ?? "").trim() || "—",
      contracts: list,
      contractCount: list.length,
      totalValueEur: total,
      nearestValidUntil: list[0]?.valid_until ? String(list[0].valid_until).slice(0, 10) : null,
    });
  }

  groups.sort((a, b) => {
    if (sortBy === "value") {
      const av = a.totalValueEur;
      const bv = b.totalValueEur;
      if (av !== bv) return (av < bv ? -1 : 1) * dir;
    } else {
      const ad = a.nearestValidUntil ?? "9999-99-99";
      const bd = b.nearestValidUntil ?? "9999-99-99";
      if (ad !== bd) return ad.localeCompare(bd) * dir;
    }
    return a.organization_name.localeCompare(b.organization_name, "lt");
  });

  return groups;
}
