"use client";

import { useEffect, useMemo, useState, useTransition } from "react";

import { updateLostQaControlSettingsAction } from "@/lib/crm/lostQaSettingsActions";
import type { LostQaAnalyzeMode, LostQaControlSettings } from "@/lib/crm/lostQa/lostQaControlSettings";
import type { LostQaAiUsageStats } from "@/lib/crm/lostQa/aiUsageStats";

function eur(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("lt-LT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function parseCostLimitDraft(s: string): number | null | "__invalid__" {
  const t = s.trim();
  if (t === "") return null;
  const n = Number(t.replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return "__invalid__";
  return n;
}

function costLimitToDraft(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "";
  return String(v);
}

export function LostQaSettingsPanel(props: { initial: LostQaControlSettings; stats: LostQaAiUsageStats }) {
  const [settings, setSettings] = useState<LostQaControlSettings>(props.initial);
  const [costDraft, setCostDraft] = useState(() => costLimitToDraft(props.initial.cost_limit_eur));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCostDraft(costLimitToDraft(settings.cost_limit_eur));
  }, [settings.cost_limit_eur]);

  const disabledHint = useMemo(() => {
    if (settings.enabled) return null;
    return "LOST analizė išjungta: niekas nebepaleis analizės, kol vėl įjungsi.";
  }, [settings.enabled]);

  const hasValidLimit = useMemo(() => {
    const lim = settings.cost_limit_eur;
    return lim != null && Number.isFinite(lim) && lim >= 0;
  }, [settings.cost_limit_eur]);

  const limitReachedBanner = useMemo(() => {
    const lim = settings.cost_limit_eur;
    if (!settings.stop_on_limit || lim == null || !Number.isFinite(lim)) return false;
    return props.stats.month_cost_eur >= lim;
  }, [settings.cost_limit_eur, settings.stop_on_limit, props.stats.month_cost_eur]);

  async function persist(next: LostQaControlSettings) {
    const lim = parseCostLimitDraft(costDraft);
    if (lim === "__invalid__") {
      setError("Netinkamas mėnesio limito formatas.");
      return;
    }
    const merged: LostQaControlSettings = { ...next, cost_limit_eur: lim };
    if (merged.cost_limit_eur == null || !Number.isFinite(merged.cost_limit_eur)) {
      merged.stop_on_limit = false;
    }

    setError(null);
    const prev = settings;
    setSettings(merged);
    const fd = new FormData();
    fd.set("enabled", merged.enabled ? "true" : "false");
    fd.set("mode", merged.mode);
    fd.set("reanalyze_on_update", merged.reanalyze_on_update ? "true" : "false");
    fd.set("cost_limit_eur", merged.cost_limit_eur == null || !Number.isFinite(merged.cost_limit_eur) ? "" : String(merged.cost_limit_eur));
    fd.set("stop_on_limit", merged.stop_on_limit ? "true" : "false");

    startTransition(async () => {
      const r = await updateLostQaControlSettingsAction(fd);
      if (!r.ok) {
        setSettings(prev);
        setError(r.error);
      }
    });
  }

  return (
    <div className="space-y-8">
      {limitReachedBanner && settings.stop_on_limit ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          Pasiektas mėnesio AI limitas – automatinė analizė sustabdyta.
        </div>
      ) : null}

      {!settings.enabled ? (
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-800">
          LOST analizė išjungta.
        </div>
      ) : null}

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          Nepavyko išsaugoti nustatymų: {error}
        </div>
      ) : null}

      <section className="rounded-xl border border-zinc-200/80 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900">LOST QA analizė</h2>
            <p className="mt-1 text-xs text-zinc-500">
              Čia valdai, ar sistema išvis gali leisti AI analizę ir ar ji gali vykti automatiškai po įkėlimo.
            </p>
          </div>
          {isPending ? <div className="text-xs text-zinc-500">Saugoma…</div> : null}
        </div>

        {disabledHint ? <p className="mt-4 text-sm text-zinc-700">{disabledHint}</p> : null}

        <div className="mt-5 space-y-5">
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4"
              checked={settings.enabled}
              disabled={isPending}
              onChange={(e) => void persist({ ...settings, enabled: e.target.checked })}
            />
            <span>
              <div className="text-sm font-medium text-zinc-900">Įjungti LOST analizę</div>
              <div className="mt-1 text-xs text-zinc-600">
                Kai išjungta, analizė nevykdoma nei automatiškai, nei rankiniu būdu.
              </div>
            </span>
          </label>

          <div className={!settings.enabled ? "opacity-50" : ""}>
            <div className="text-sm font-medium text-zinc-900">Analizės režimas</div>
            <div className="mt-3 space-y-2">
              <label className="flex items-start gap-3">
                <input
                  type="radio"
                  name="lost_qa_mode"
                  className="mt-1 h-4 w-4"
                  checked={settings.mode === "auto"}
                  disabled={isPending || !settings.enabled}
                  onChange={() => void persist({ ...settings, mode: "auto" })}
                />
                <span>
                  <div className="text-sm text-zinc-900">Automatinė analizė (rekomenduojama)</div>
                  <div className="mt-1 text-xs text-zinc-600">Po įkėlimo sistema pati paleis analizę, jei ji įjungta.</div>
                </span>
              </label>

              <label className="flex items-start gap-3">
                <input
                  type="radio"
                  name="lost_qa_mode"
                  className="mt-1 h-4 w-4"
                  checked={settings.mode === "manual"}
                  disabled={isPending || !settings.enabled}
                  onChange={() => void persist({ ...settings, mode: "manual" as LostQaAnalyzeMode })}
                />
                <span>
                  <div className="text-sm text-zinc-900">Tik rankinė analizė</div>
                  <div className="mt-1 text-xs text-zinc-600">
                    Analizė nebus vykdoma automatiškai. Ją bus galima paleisti rankiniu būdu.
                  </div>
                </span>
              </label>
            </div>
          </div>

          <label className={`flex items-start gap-3 ${!settings.enabled ? "opacity-50" : ""}`}>
            <input
              type="checkbox"
              className="mt-1 h-4 w-4"
              checked={settings.reanalyze_on_update}
              disabled={isPending || !settings.enabled}
              onChange={(e) => void persist({ ...settings, reanalyze_on_update: e.target.checked })}
            />
            <span>
              <div className="text-sm font-medium text-zinc-900">Peranalizuoti atnaujintus case</div>
              <div className="mt-1 text-xs text-zinc-600">
                Kai išjungta, jei analizė jau yra, ji nebus automatiškai atnaujinama net jei pasikeistų paruoštas įrašas.
              </div>
            </span>
          </label>
        </div>
      </section>

      <section className="rounded-xl border border-zinc-200/80 bg-white p-5 shadow-sm">
        <div>
          <h2 className="text-sm font-semibold text-zinc-900">AI naudojimas</h2>
          <p className="mt-1 text-xs text-zinc-500">Apytikslė AI analizės kaina pagal sunaudotus resursus.</p>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-zinc-200 bg-zinc-50/40 p-4">
            <div className="text-xs text-zinc-600">Šiandien</div>
            <div className="mt-2 text-lg font-semibold text-zinc-900">{eur(props.stats.today_cost_eur)}</div>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-zinc-50/40 p-4">
            <div className="text-xs text-zinc-600">Šį mėnesį</div>
            <div className="mt-2 text-lg font-semibold text-zinc-900">{eur(props.stats.month_cost_eur)}</div>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-zinc-50/40 p-4">
            <div className="text-xs text-zinc-600">Vidutinė kaina per case</div>
            <div className="mt-2 text-lg font-semibold text-zinc-900">{eur(props.stats.avg_cost_per_case_eur)}</div>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-zinc-50/40 p-4">
            <div className="text-xs text-zinc-600">Išanalizuota atvejų (šį mėn.)</div>
            <div className="mt-2 text-lg font-semibold text-zinc-900">{String(props.stats.analyzed_cases_month)}</div>
          </div>
        </div>

        <div className="mt-8 border-t border-zinc-200 pt-6">
          <h3 className="text-sm font-semibold text-zinc-900">AI kaštų limitas</h3>
          <div className="mt-4 space-y-4">
            <div>
              <label htmlFor="lost_qa_cost_limit_eur" className="text-sm font-medium text-zinc-900">
                Mėnesio AI biudžeto limitas (€)
              </label>
              <input
                id="lost_qa_cost_limit_eur"
                type="number"
                min={0}
                step="any"
                className="mt-1.5 block w-full max-w-xs rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 disabled:opacity-50"
                placeholder="Pvz. 50"
                value={costDraft}
                disabled={isPending}
                onChange={(e) => setCostDraft(e.target.value)}
                onBlur={() => {
                  const lim = parseCostLimitDraft(costDraft);
                  if (lim === "__invalid__") {
                    setError("Netinkamas mėnesio limito formatas.");
                    setCostDraft(costLimitToDraft(settings.cost_limit_eur));
                    return;
                  }
                  setError(null);
                  const cur = settings.cost_limit_eur;
                  const same =
                    (lim == null && (cur == null || !Number.isFinite(cur))) ||
                    (lim != null && cur != null && Number.isFinite(cur) && lim === cur);
                  if (same) return;
                  void persist({ ...settings, cost_limit_eur: lim });
                }}
              />
              <p className="mt-1 text-xs text-zinc-600">Palik tuščią, jei limito nenaudosi.</p>
            </div>

            <label className={`flex items-start gap-3 ${!hasValidLimit ? "opacity-50" : ""}`}>
              <input
                type="checkbox"
                className="mt-1 h-4 w-4"
                checked={settings.stop_on_limit}
                disabled={isPending || !hasValidLimit}
                onChange={(e) => void persist({ ...settings, stop_on_limit: e.target.checked })}
              />
              <span>
                <div className="text-sm font-medium text-zinc-900">Sustabdyti analizę pasiekus limitą</div>
                <div className="mt-1 text-xs text-zinc-600">
                  Pasiekus nustatytą mėnesio limitą, naujų atvejų analizė bus automatiškai sustabdyta.
                </div>
              </span>
            </label>
          </div>
        </div>
      </section>
    </div>
  );
}
