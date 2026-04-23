import type { SupabaseClient } from "@supabase/supabase-js";
import type { CrmUser } from "@/lib/crm/crmUsers";
import type { ProjectListRow } from "@/lib/crm/projectListHelpers";

type ProjektaiRpcPayload = {
  projects: unknown[];
  counts: Array<{ project_id: string; item_count: number | string }>;
  users: Array<{ id: string; name: string; avatar_url: string | null }>;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === "object" && !Array.isArray(v);
}

function parsePayload(data: unknown): {
  rows: ProjectListRow[];
  users: CrmUser[];
  userById: Map<string, CrmUser>;
} {
  if (!isRecord(data)) {
    throw new Error("Netikėtas projektai_list_payload atsakas.");
  }
  const raw = data as ProjektaiRpcPayload;
  const projects = Array.isArray(raw.projects) ? raw.projects : [];
  const counts = Array.isArray(raw.counts) ? raw.counts : [];
  const usersRaw = Array.isArray(raw.users) ? raw.users : [];

  const countByProject = new Map<string, number>();
  for (const c of counts) {
    if (!c?.project_id) continue;
    countByProject.set(String(c.project_id), Number(c.item_count ?? 0));
  }

  const rows: ProjectListRow[] = projects.map((p) => {
    const row = p as ProjectListRow;
    const id = String((row as { id?: unknown }).id ?? "");
    const n = countByProject.get(id) ?? 0;
    return {
      ...row,
      project_work_items: [{ count: Number.isFinite(n) ? n : 0 }],
    };
  });

  const users: CrmUser[] = usersRaw.map((u) => ({
    id: String(u.id ?? ""),
    name: String(u.name ?? ""),
    email: "",
    role: "",
    avatar_url: u.avatar_url ?? null,
  }));

  const userById = new Map(users.map((u) => [u.id, u]));
  return { rows, users, userById };
}

export type FetchProjektaiListPayloadResult =
  | {
      ok: true;
      rows: ProjectListRow[];
      users: CrmUser[];
      userById: Map<string, CrmUser>;
      ownerColumnAvailable: true;
      deletedAtAvailable: true;
      sortOrderAvailable: true;
      rpcProjektaiPayloadMs: number;
      parseMs: number;
    }
  | { ok: false; error: string; rpcProjektaiPayloadMs: number; parseMs?: number };

/**
 * Vienas RPC: projektai + work item count + tik savininkų naudotojai (id, name, avatar_url).
 */
export async function fetchProjektaiListPayload(
  supabase: SupabaseClient,
): Promise<FetchProjektaiListPayloadResult> {
  const tRpc0 = Date.now();
  const { data, error } = await supabase.rpc("projektai_list_payload");
  const rpcProjektaiPayloadMs = Date.now() - tRpc0;
  if (error) {
    return { ok: false, error: error.message, rpcProjektaiPayloadMs };
  }
  const tParse0 = Date.now();
  try {
    const parsed = parsePayload(data);
    const parseMs = Date.now() - tParse0;
    return {
      ok: true,
      rows: parsed.rows,
      users: parsed.users,
      userById: parsed.userById,
      ownerColumnAvailable: true,
      deletedAtAvailable: true,
      sortOrderAvailable: true,
      rpcProjektaiPayloadMs,
      parseMs,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Nepavyko apdoroti projektai_list_payload.",
      rpcProjektaiPayloadMs,
      parseMs: Date.now() - tParse0,
    };
  }
}
