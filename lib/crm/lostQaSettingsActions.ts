"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/crm/currentUser";
import { upsertLostQaControlSettings, type LostQaAnalyzeMode } from "@/lib/crm/lostQa/lostQaControlSettings";
import { createSupabaseSsrClient } from "@/lib/supabase/ssr";

function safeBool(v: unknown): boolean {
  return v === true || v === "true" || v === "1" || v === "on";
}

function safeMode(v: unknown): LostQaAnalyzeMode | "__invalid__" {
  const s = String(v ?? "").trim();
  if (s === "auto" || s === "manual") return s;
  return "__invalid__";
}

function parseCostLimitEurFromForm(v: unknown): number | null | "__invalid__" {
  if (v == null) return null;
  const s = String(v).trim();
  if (s === "") return null;
  const n = Number(s.replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return "__invalid__";
  return n;
}

export async function updateLostQaControlSettingsAction(
  formData: FormData
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await requireAdmin({ mode: "throw" });
  } catch {
    return { ok: false, error: "Neturite teisių." };
  }

  const enabled = safeBool(formData.get("enabled"));
  const mode = safeMode(formData.get("mode"));
  const reanalyze_on_update = safeBool(formData.get("reanalyze_on_update"));
  const cost_limit_eur = parseCostLimitEurFromForm(formData.get("cost_limit_eur"));
  const stop_on_limit = safeBool(formData.get("stop_on_limit"));

  if (mode === "__invalid__") return { ok: false, error: "Neleistinas analizės režimas." };
  if (cost_limit_eur === "__invalid__") return { ok: false, error: "Netinkamas mėnesio limito formatas." };

  const supabase = await createSupabaseSsrClient();
  try {
    await upsertLostQaControlSettings(supabase, {
      enabled,
      mode,
      reanalyze_on_update,
      cost_limit_eur,
      stop_on_limit,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }

  revalidatePath("/nustatymai/lost-qa");
  return { ok: true };
}
