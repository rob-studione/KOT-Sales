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
): Promise<void> {
  try {
    await requireAdmin({ mode: "throw" });
  } catch {
    return;
  }

  const supabase = await createSupabaseSsrClient();
  const { data: cur, error: readErr } = await supabase.from("crm_global_settings").select("*").eq("id", 1).maybeSingle();
  if (readErr) return;

  const dailyCall = formData.has("daily_call_target")
    ? safeInt(formData.get("daily_call_target"), 30)
    : safeInt(cur?.daily_call_target ?? 30, 30);
  const dailyAnswered = formData.has("daily_answered_target")
    ? safeInt(formData.get("daily_answered_target"), 10)
    : safeInt(cur?.daily_answered_target ?? 10, 10);
  const salesDirect = formData.has("sales_direct_rule")
    ? safeText(formData.get("sales_direct_rule"))
    : safeText(cur?.sales_direct_rule ?? "");
  const salesInfluenced = formData.has("sales_influenced_rule")
    ? safeText(formData.get("sales_influenced_rule"))
    : safeText(cur?.sales_influenced_rule ?? "");
  const tz = formData.has("timezone") ? safeTimezone(formData.get("timezone")) : safeTimezone(cur?.timezone ?? "Europe/Vilnius");
  const lang = formData.has("language") ? safeLanguage(formData.get("language")) : safeLanguage(cur?.language ?? "lt");

  if (tz === "__invalid__") return;
  if (lang === "__invalid__") return;

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

  if (error) return;
  revalidatePath("/nustatymai/bendri");
  revalidatePath("/nustatymai/kpi");
  revalidatePath("/dashboard");
  revalidatePath("/analitika/kpi");
  return;
}

export async function updateUserPreferencesAction(
  formData: FormData
): Promise<void> {
  const tz = safeTimezone(formData.get("timezone"));
  const lang = safeLanguage(formData.get("language"));
  if (tz === "__invalid__") return;
  if (lang === "__invalid__") return;

  const supabase = await createSupabaseSsrClient();
  const { data } = await supabase.auth.getUser();
  const uid = data.user?.id;
  if (!uid) return;

  const { error } = await supabase.from("crm_users").update({ timezone: tz, language: lang }).eq("id", uid);
  if (error) return;
  revalidatePath("/nustatymai/bendri");
  revalidatePath("/nustatymai/kpi");
  revalidatePath("/dashboard");
  return;
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
): Promise<void> {
  try {
    await requireAdmin({ mode: "throw" });
  } catch {
    return;
  }

  const key = safeText(formData.get("key"));
  if (!key) return;

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
  if (error) return;
  revalidatePath("/nustatymai/bendri");
  revalidatePath("/nustatymai/kpi");
  revalidatePath("/dashboard");
  revalidatePath("/analitika/kpi");
  return;
}

