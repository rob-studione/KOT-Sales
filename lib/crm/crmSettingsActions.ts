"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/crm/currentUser";
import { createSupabaseSsrClient } from "@/lib/supabase/ssr";

function safeInt(raw: unknown, fallback: number): number {
  const n = typeof raw === "number" ? raw : Number(String(raw ?? "").trim());
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.floor(n));
}

function safeText(raw: unknown): string {
  return String(raw ?? "").trim();
}

function safeLanguage(raw: unknown): "lt" | "en" | "__invalid__" {
  const v = String(raw ?? "").trim().toLowerCase();
  if (v === "lt" || v === "en") return v;
  return "__invalid__";
}

const ALLOWED_TIMEZONES = [
  "Europe/Vilnius",
  "Europe/London",
  "Europe/Warsaw",
  "Europe/Berlin",
  "Europe/Paris",
  "Europe/Riga",
  "Europe/Tallinn",
  "UTC",
] as const;

function safeTimezone(raw: unknown): string | "__invalid__" {
  const v = String(raw ?? "").trim();
  if ((ALLOWED_TIMEZONES as readonly string[]).includes(v)) return v;
  return "__invalid__";
}

export async function updateGlobalSettingsAction(
  formData: FormData
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await requireAdmin({ mode: "throw" });
  } catch {
    return { ok: false, error: "Neturite teisių." };
  }

  const dailyCall = safeInt(formData.get("daily_call_target"), 30);
  const dailyAnswered = safeInt(formData.get("daily_answered_target"), 10);
  const salesDirect = safeText(formData.get("sales_direct_rule"));
  const salesInfluenced = safeText(formData.get("sales_influenced_rule"));
  const tz = safeTimezone(formData.get("timezone"));
  const lang = safeLanguage(formData.get("language"));

  if (tz === "__invalid__") return { ok: false, error: "Neleistina laiko juosta." };
  if (lang === "__invalid__") return { ok: false, error: "Neleistina kalba." };

  const supabase = await createSupabaseSsrClient();
  const { error } = await supabase
    .from("crm_global_settings")
    .update({
      daily_call_target: dailyCall,
      daily_answered_target: dailyAnswered,
      sales_direct_rule: salesDirect || undefined,
      sales_influenced_rule: salesInfluenced || undefined,
      timezone: tz,
      language: lang,
    })
    .eq("id", 1);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/nustatymai/crm");
  revalidatePath("/analitika");
  revalidatePath("/analitika/vadybininku-kpi");
  return { ok: true };
}

export async function updateUserPreferencesAction(
  formData: FormData
): Promise<{ ok: true } | { ok: false; error: string }> {
  const tz = safeTimezone(formData.get("timezone"));
  const lang = safeLanguage(formData.get("language"));
  if (tz === "__invalid__") return { ok: false, error: "Neleistina laiko juosta." };
  if (lang === "__invalid__") return { ok: false, error: "Neleistina kalba." };

  const supabase = await createSupabaseSsrClient();
  const { data } = await supabase.auth.getUser();
  const uid = data.user?.id;
  if (!uid) return { ok: false, error: "Neprisijungta." };

  const { error } = await supabase.from("crm_users").update({ timezone: tz, language: lang }).eq("id", uid);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/nustatymai/crm");
  revalidatePath("/analitika");
  return { ok: true };
}

export type StatusRowInput = {
  key: string;
  sort_order: number;
  is_answered: boolean;
  is_not_answered: boolean;
  is_success: boolean;
  is_failure: boolean;
  is_active: boolean;
};

function safeBool(v: unknown): boolean {
  return v === "1" || v === "true" || v === true || v === "on";
}

export async function upsertStatusAction(
  formData: FormData
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await requireAdmin({ mode: "throw" });
  } catch {
    return { ok: false, error: "Neturite teisių." };
  }

  const key = safeText(formData.get("key"));
  if (!key) return { ok: false, error: "Įveskite statuso pavadinimą." };

  const sort_order = safeInt(formData.get("sort_order"), 0);
  const row: StatusRowInput = {
    key,
    sort_order,
    is_answered: safeBool(formData.get("is_answered")),
    is_not_answered: safeBool(formData.get("is_not_answered")),
    is_success: safeBool(formData.get("is_success")),
    is_failure: safeBool(formData.get("is_failure")),
    is_active: safeBool(formData.get("is_active")),
  };

  const supabase = await createSupabaseSsrClient();
  const { error } = await supabase.from("crm_statuses").upsert(row, { onConflict: "key" });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/nustatymai/crm");
  revalidatePath("/analitika");
  revalidatePath("/analitika/vadybininku-kpi");
  return { ok: true };
}

