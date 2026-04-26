"use client";

import { useState, useTransition } from "react";
import { saveManagerKpiTargetsAction } from "@/lib/crm/managerKpiActions";
import type { ManagerKpiTableRow } from "@/lib/crm/managerKpiDashboard";

type DraftRow = {
  userId: string;
  name: string;
  daily_call_target: number;
  daily_answered_target: number;
  daily_commercial_target: number;
};

function buildDraft(rows: ManagerKpiTableRow[], workingDayCount: number): DraftRow[] {
  const d = Math.max(1, workingDayCount);
  return rows.map((r) => ({
    userId: r.userId,
    name: r.name,
    daily_call_target: Math.max(0, Math.round(r.callsTarget / d)),
    daily_answered_target: Math.max(0, Math.round(r.answeredTarget / d)),
    daily_commercial_target: Math.max(0, Math.round(r.commercialTarget / d)),
  }));
}

export function ManagerKpiSettingsDrawer({
  onClose,
  rows,
  workingDayCount,
}: {
  onClose: () => void;
  rows: ManagerKpiTableRow[];
  workingDayCount: number;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftRow[]>(() => buildDraft(rows, workingDayCount));

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button type="button" className="absolute inset-0 bg-black/30" aria-label="Uždaryti" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-lg flex-col border-l border-zinc-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-zinc-900">KPI nustatymai</h2>
          <button type="button" className="rounded-md p-1 text-zinc-500 hover:bg-zinc-100" onClick={onClose} aria-label="Uždaryti">
            ✕
          </button>
        </div>
        <p className="px-4 py-2 text-xs text-zinc-500">
          Dienos tikslai aktyviems vartotojams. Periodo tikslas = dienos tikslas × darbo dienų skaičius (LT, be savaitgalių ir švenčių) pasirinktame intervale.
        </p>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
          <div className="space-y-4">
            {draft.map((row, idx) => (
              <div key={row.userId} className="rounded-lg border border-zinc-200 p-3">
                <div className="text-sm font-medium text-zinc-900">{row.name}</div>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  <label className="text-xs text-zinc-500">
                    Skamb./d.
                    <input
                      type="number"
                      min={0}
                      className="mt-0.5 w-full rounded-md border border-zinc-200 px-2 py-1 text-sm"
                      value={row.daily_call_target}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        setDraft((prev) => {
                          const n = [...prev];
                          n[idx] = { ...n[idx]!, daily_call_target: Number.isFinite(v) ? Math.max(0, v) : 0 };
                          return n;
                        });
                      }}
                    />
                  </label>
                  <label className="text-xs text-zinc-500">
                    Atsil./d.
                    <input
                      type="number"
                      min={0}
                      className="mt-0.5 w-full rounded-md border border-zinc-200 px-2 py-1 text-sm"
                      value={row.daily_answered_target}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        setDraft((prev) => {
                          const n = [...prev];
                          n[idx] = { ...n[idx]!, daily_answered_target: Number.isFinite(v) ? Math.max(0, v) : 0 };
                          return n;
                        });
                      }}
                    />
                  </label>
                  <label className="text-xs text-zinc-500">
                    Kom./d.
                    <input
                      type="number"
                      min={0}
                      className="mt-0.5 w-full rounded-md border border-zinc-200 px-2 py-1 text-sm"
                      value={row.daily_commercial_target}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        setDraft((prev) => {
                          const n = [...prev];
                          n[idx] = { ...n[idx]!, daily_commercial_target: Number.isFinite(v) ? Math.max(0, v) : 0 };
                          return n;
                        });
                      }}
                    />
                  </label>
                </div>
              </div>
            ))}
          </div>
        </div>
        {error ? <p className="px-4 text-sm text-red-600">{error}</p> : null}
        <div className="border-t border-zinc-100 px-4 py-3">
          <button
            type="button"
            disabled={pending}
            className="w-full rounded-lg bg-zinc-900 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
            onClick={() => {
              setError(null);
              startTransition(async () => {
                const r = await saveManagerKpiTargetsAction(
                  draft.map((x) => ({
                    user_id: x.userId,
                    daily_call_target: x.daily_call_target,
                    daily_answered_target: x.daily_answered_target,
                    daily_commercial_target: x.daily_commercial_target,
                  }))
                );
                if (!r.ok) {
                  setError(r.error);
                  return;
                }
                onClose();
              });
            }}
          >
            {pending ? "Saugoma…" : "Išsaugoti"}
          </button>
        </div>
      </div>
    </div>
  );
}
