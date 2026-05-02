import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export const YT_PODCAST_SETTINGS_KEYS = {
  enabled: "yt_podcast.enabled",
  costLimitEur: "yt_podcast.cost_limit_eur",
  stopOnLimit: "yt_podcast.stop_on_limit",
  maxVideosPerRun: "yt_podcast.max_videos_per_run",
  maxTranscriptChars: "yt_podcast.max_transcript_chars",
  analysisPromptVersion: "yt_podcast.analysis_prompt_version",
} as const;

export type YtPodcastAiSettings = {
  enabled: boolean;
  costLimitEur: number;
  stopOnLimit: boolean;
  maxVideosPerRun: number;
  maxTranscriptChars: number;
  analysisPromptVersion: string;
};

const DEFAULTS: YtPodcastAiSettings = {
  enabled: false,
  costLimitEur: 30,
  stopOnLimit: true,
  maxVideosPerRun: 5,
  maxTranscriptChars: 120_000,
  analysisPromptVersion: "v3_high_signal",
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
  if (v === "true" || v === "1" || v === true) return true;
  if (v === "false" || v === "0" || v === false) return false;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (s === "true") return true;
    if (s === "false") return false;
  }
  return fallback;
}

function asNumber(v: unknown, fallback: number): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(String(v).replace(",", ".").trim());
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function asString(v: unknown, fallback: string): string {
  if (typeof v === "string") {
    const t = v.trim();
    return t || fallback;
  }
  if (v != null && typeof v !== "object") return String(v).trim() || fallback;
  return fallback;
}

function clampInt(n: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(n)) return fallback;
  const x = Math.floor(n);
  if (x < min) return min;
  if (x > max) return max;
  return x;
}

/** Normalizuoja reikšmes į saugą intervalą (po DB skaitymo ar formos). */
export function normalizeYtPodcastAiSettings(raw: Partial<YtPodcastAiSettings> | null | undefined): YtPodcastAiSettings {
  const base = { ...DEFAULTS, ...raw };
  return {
    enabled: typeof base.enabled === "boolean" ? base.enabled : DEFAULTS.enabled,
    costLimitEur: clampInt(base.costLimitEur, 1, 500, DEFAULTS.costLimitEur),
    stopOnLimit: typeof base.stopOnLimit === "boolean" ? base.stopOnLimit : DEFAULTS.stopOnLimit,
    maxVideosPerRun: clampInt(base.maxVideosPerRun, 1, 10, DEFAULTS.maxVideosPerRun),
    maxTranscriptChars: clampInt(base.maxTranscriptChars, 10_000, 250_000, DEFAULTS.maxTranscriptChars),
    analysisPromptVersion: (() => {
      const s = asString(base.analysisPromptVersion, DEFAULTS.analysisPromptVersion);
      return s.length > 64 ? s.slice(0, 64) : s;
    })(),
  };
}

export function parseYtPodcastAiSettingsFromRows(rows: Array<{ key: string; value: unknown }>): YtPodcastAiSettings {
  const map = new Map<string, unknown>();
  for (const r of rows) map.set(r.key, r.value);

  const raw: Partial<YtPodcastAiSettings> = {
    enabled: asBool(map.get(YT_PODCAST_SETTINGS_KEYS.enabled), DEFAULTS.enabled),
    costLimitEur: asNumber(map.get(YT_PODCAST_SETTINGS_KEYS.costLimitEur), DEFAULTS.costLimitEur),
    stopOnLimit: asBool(map.get(YT_PODCAST_SETTINGS_KEYS.stopOnLimit), DEFAULTS.stopOnLimit),
    maxVideosPerRun: asNumber(map.get(YT_PODCAST_SETTINGS_KEYS.maxVideosPerRun), DEFAULTS.maxVideosPerRun),
    maxTranscriptChars: asNumber(map.get(YT_PODCAST_SETTINGS_KEYS.maxTranscriptChars), DEFAULTS.maxTranscriptChars),
    analysisPromptVersion: asString(map.get(YT_PODCAST_SETTINGS_KEYS.analysisPromptVersion), DEFAULTS.analysisPromptVersion),
  };

  return normalizeYtPodcastAiSettings(raw);
}

export async function fetchYtPodcastAiSettings(client: SupabaseClient): Promise<YtPodcastAiSettings> {
  const keys = Object.values(YT_PODCAST_SETTINGS_KEYS);
  const { data, error } = await client.from("crm_settings").select("key,value").in("key", keys);
  if (error) throw new Error(supabaseErrMessage(error));
  return parseYtPodcastAiSettingsFromRows((data as Array<{ key: string; value: unknown }>) ?? []);
}

export async function upsertYtPodcastAiSettings(
  client: SupabaseClient,
  patch: Partial<YtPodcastAiSettings>
): Promise<void> {
  const normalized = normalizeYtPodcastAiSettings({ ...(await fetchYtPodcastAiSettings(client)), ...patch });
  const rows: Array<{ key: string; value: unknown }> = [];
  if ("enabled" in patch) rows.push({ key: YT_PODCAST_SETTINGS_KEYS.enabled, value: normalized.enabled });
  if ("costLimitEur" in patch) rows.push({ key: YT_PODCAST_SETTINGS_KEYS.costLimitEur, value: normalized.costLimitEur });
  if ("stopOnLimit" in patch) rows.push({ key: YT_PODCAST_SETTINGS_KEYS.stopOnLimit, value: normalized.stopOnLimit });
  if ("maxVideosPerRun" in patch) rows.push({ key: YT_PODCAST_SETTINGS_KEYS.maxVideosPerRun, value: normalized.maxVideosPerRun });
  if ("maxTranscriptChars" in patch)
    rows.push({ key: YT_PODCAST_SETTINGS_KEYS.maxTranscriptChars, value: normalized.maxTranscriptChars });
  if ("analysisPromptVersion" in patch)
    rows.push({ key: YT_PODCAST_SETTINGS_KEYS.analysisPromptVersion, value: normalized.analysisPromptVersion });
  if (!rows.length) return;

  const { error } = await client.from("crm_settings").upsert(rows, { onConflict: "key" });
  if (error) throw new Error(supabaseErrMessage(error));
}

/** Perrašo visus podcast AI raktus (pvz. formos submit). */
export async function replaceYtPodcastAiSettings(client: SupabaseClient, next: YtPodcastAiSettings): Promise<void> {
  const s = normalizeYtPodcastAiSettings(next);
  const rows: Array<{ key: string; value: unknown }> = [
    { key: YT_PODCAST_SETTINGS_KEYS.enabled, value: s.enabled },
    { key: YT_PODCAST_SETTINGS_KEYS.costLimitEur, value: s.costLimitEur },
    { key: YT_PODCAST_SETTINGS_KEYS.stopOnLimit, value: s.stopOnLimit },
    { key: YT_PODCAST_SETTINGS_KEYS.maxVideosPerRun, value: s.maxVideosPerRun },
    { key: YT_PODCAST_SETTINGS_KEYS.maxTranscriptChars, value: s.maxTranscriptChars },
    { key: YT_PODCAST_SETTINGS_KEYS.analysisPromptVersion, value: s.analysisPromptVersion },
  ];
  const { error } = await client.from("crm_settings").upsert(rows, { onConflict: "key" });
  if (error) throw new Error(supabaseErrMessage(error));
}
