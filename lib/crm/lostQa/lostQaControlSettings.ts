import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export const LOST_QA_SETTINGS_KEYS = {
  enabled: "lost_qa.enabled",
  mode: "lost_qa.mode",
  reanalyze_on_update: "lost_qa.reanalyze_on_update",
  cost_limit_eur: "lost_qa.cost_limit_eur",
  stop_on_limit: "lost_qa.stop_on_limit",
} as const;

export type LostQaAnalyzeMode = "auto" | "manual";

export type LostQaControlSettings = {
  enabled: boolean;
  mode: LostQaAnalyzeMode;
  reanalyze_on_update: boolean;
  /** `null` — limitas nenaudojamas */
  cost_limit_eur: number | null;
  stop_on_limit: boolean;
};

const DEFAULTS: LostQaControlSettings = {
  enabled: true,
  mode: "auto",
  reanalyze_on_update: true,
  cost_limit_eur: null,
  stop_on_limit: false,
};

function supabaseErrMessage(error: unknown): string {
  const raw =
    error && typeof error === "object" && "message" in error && typeof (error as { message: unknown }).message === "string"
      ? String((error as { message: string }).message)
      : typeof error === "string"
        ? error
        : JSON.stringify(error);
  const msg = raw || "Nežinoma duomenų bazės klaida.";
  if (/does not exist/i.test(msg) && /crm_settings/i.test(msg)) {
    return `${msg} Pritaikyk migraciją supabase/migrations/0066_crm_settings.sql.`;
  }
  return msg;
}

function asBool(v: unknown, fallback: boolean): boolean {
  if (typeof v === "boolean") return v;
  if (v === "true" || v === "1") return true;
  if (v === "false" || v === "0") return false;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (s === "true") return true;
    if (s === "false") return false;
  }
  return fallback;
}

function asMode(v: unknown, fallback: LostQaAnalyzeMode): LostQaAnalyzeMode {
  const s = String(v ?? "").trim().replaceAll('"', "");
  if (s === "manual") return "manual";
  if (s === "auto") return "auto";
  return fallback;
}

function asCostLimitEur(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") {
    if (!Number.isFinite(v) || v < 0) return null;
    return v;
  }
  if (typeof v === "string") {
    const n = Number(String(v).replace(",", ".").trim());
    if (!Number.isFinite(n) || n < 0) return null;
    return n;
  }
  return null;
}

export function parseLostQaControlSettings(rows: Array<{ key: string; value: unknown }>): LostQaControlSettings {
  const map = new Map<string, unknown>();
  for (const r of rows) map.set(r.key, r.value);

  return {
    enabled: asBool(map.get(LOST_QA_SETTINGS_KEYS.enabled), DEFAULTS.enabled),
    mode: asMode(map.get(LOST_QA_SETTINGS_KEYS.mode), DEFAULTS.mode),
    reanalyze_on_update: asBool(map.get(LOST_QA_SETTINGS_KEYS.reanalyze_on_update), DEFAULTS.reanalyze_on_update),
    cost_limit_eur: asCostLimitEur(map.get(LOST_QA_SETTINGS_KEYS.cost_limit_eur)) ?? DEFAULTS.cost_limit_eur,
    stop_on_limit: asBool(map.get(LOST_QA_SETTINGS_KEYS.stop_on_limit), DEFAULTS.stop_on_limit),
  };
}

export async function fetchLostQaControlSettings(client: SupabaseClient): Promise<LostQaControlSettings> {
  const keys = [
    LOST_QA_SETTINGS_KEYS.enabled,
    LOST_QA_SETTINGS_KEYS.mode,
    LOST_QA_SETTINGS_KEYS.reanalyze_on_update,
    LOST_QA_SETTINGS_KEYS.cost_limit_eur,
    LOST_QA_SETTINGS_KEYS.stop_on_limit,
  ];
  const { data, error } = await client.from("crm_settings").select("key,value").in("key", keys);
  if (error) throw new Error(supabaseErrMessage(error));
  return parseLostQaControlSettings((data as any[]) ?? []);
}

/** Alias: pilnas Lost QA valdymo nustatymų rinkinys (įskaitant AI limitą). */
export async function getLostQaSettings(client: SupabaseClient): Promise<LostQaControlSettings> {
  return fetchLostQaControlSettings(client);
}

export async function upsertLostQaControlSettings(
  client: SupabaseClient,
  patch: Partial<LostQaControlSettings>
): Promise<void> {
  const rows: Array<{ key: string; value: unknown }> = [];
  if ("enabled" in patch) rows.push({ key: LOST_QA_SETTINGS_KEYS.enabled, value: Boolean(patch.enabled) });
  if ("mode" in patch) rows.push({ key: LOST_QA_SETTINGS_KEYS.mode, value: patch.mode });
  if ("reanalyze_on_update" in patch) rows.push({ key: LOST_QA_SETTINGS_KEYS.reanalyze_on_update, value: Boolean(patch.reanalyze_on_update) });
  if ("cost_limit_eur" in patch) {
    const v = patch.cost_limit_eur;
    rows.push({
      key: LOST_QA_SETTINGS_KEYS.cost_limit_eur,
      value: v == null || !Number.isFinite(v) ? null : v,
    });
  }
  if ("stop_on_limit" in patch) rows.push({ key: LOST_QA_SETTINGS_KEYS.stop_on_limit, value: Boolean(patch.stop_on_limit) });
  if (!rows.length) return;

  const { error } = await client.from("crm_settings").upsert(rows, { onConflict: "key" });
  if (error) throw new Error(supabaseErrMessage(error));
}
