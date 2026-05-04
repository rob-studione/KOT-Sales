"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";
import { returnWorkItemToCandidates } from "@/lib/crm/projectActions";
import { isTrivialReturnHistory } from "@/lib/crm/projectBoardConstants";
import type { ProjectWorkItemActivityDto } from "@/lib/crm/projectWorkItemActivityDto";

type ModalMode = "simple" | "danger" | null;

export function ReturnToCandidatesFlow({
  workItemId,
  clientLabel,
  activities,
  onAfterSuccess,
}: {
  workItemId: string;
  clientLabel: string;
  activities: ProjectWorkItemActivityDto[];
  onAfterSuccess?: () => void;
}) {
  const router = useRouter();
  const [modal, setModal] = useState<ModalMode>(null);
  const [dangerAck, setDangerAck] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const openModal = useCallback(() => {
    setError(null);
    setDangerAck(false);
    setModal(isTrivialReturnHistory(activities) ? "simple" : "danger");
  }, [activities]);

  useEffect(() => {
    if (!modal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setModal(null);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [modal]);

  const runReturn = useCallback(() => {
    setError(null);
    startTransition(async () => {
      const r = await returnWorkItemToCandidates(workItemId);
      if (r.error) {
        setError(r.error);
        return;
      }
      setModal(null);
      onAfterSuccess?.();
      router.refresh();
    });
  }, [workItemId, onAfterSuccess, router]);

  return (
    <div className="border-t border-zinc-100 pt-4">
      <h3 className="text-xs font-medium uppercase tracking-wide text-zinc-400">Kandidatai</h3>
      <p className="mt-1 text-xs text-zinc-500">
        Pašalinti iš „Darbas“ ir vėl leisti klientui atsirasti kandidatų sąraše (jei taisyklės tenkina). Veiklos istorija
        lieka.
      </p>
      <button
        type="button"
        onClick={openModal}
        disabled={isPending}
        className="mt-2 cursor-pointer rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
      >
        Grąžinti į kandidatus
      </button>

      {modal === "simple" ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-[#7C4A57]/40 backdrop-blur-[1px]"
            aria-label="Atšaukti"
            onClick={() => setModal(null)}
          />
          <div
            role="dialog"
            aria-modal="true"
            className="relative z-10 w-full max-w-md rounded-xl border border-zinc-200 bg-white p-4 shadow-xl"
          >
            <h2 className="text-base font-semibold text-zinc-900">Grąžinti į kandidatus?</h2>
            <p className="mt-2 text-sm text-zinc-600">
              Dar nėra įrašytų veiksmų (tik paėmimas į darbą).{" "}
              <span className="font-medium text-zinc-800">{clientLabel}</span> bus pašalintas iš Kanban. Kandidatų
              sąraše klientas vėl pasirodys, jei atitinka projekto taisykles.
            </p>
            {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setModal(null)}
                className="cursor-pointer rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
              >
                Atšaukti
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={runReturn}
                className="cursor-pointer rounded-lg bg-[#7C4A57] px-3 py-2 text-sm font-medium text-white hover:bg-[#693948] disabled:opacity-50"
              >
                {isPending ? "…" : "Patvirtinti"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {modal === "danger" ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-[#7C4A57]/50 backdrop-blur-[1px]"
            aria-label="Atšaukti"
            onClick={() => setModal(null)}
          />
          <div
            role="dialog"
            aria-modal="true"
            className="relative z-10 w-full max-w-lg rounded-xl border border-red-200 bg-white p-4 shadow-xl"
          >
            <h2 className="text-base font-semibold text-red-900">Patvirtinkite grąžinimą</h2>
            <p className="mt-2 text-sm text-zinc-700">
              <span className="font-medium text-zinc-900">{clientLabel}</span> jau turi veiklos istoriją (skambučiai,
              laiškai, pastabos ir kt.). Grąžinimas į kandidatus yra negrįžtamas sprendimas dėl lentos — įsitikinkite:
            </p>
            <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-zinc-700">
              <li>pašalins darbo kortelę iš „Darbas“ (Kanban / sąrašas);</li>
              <li>neištrins pastabų ir veiksmų — visa istorija lieka prie šio darbo įrašo;</li>
              <li>leis vėl matyti klientą kandidatų sąraše, jei jis atitinka taisykles;</li>
              <li>bus pridėtas aiškus įrašas į istoriją apie grąžinimą.</li>
            </ul>
            <label className="mt-4 flex cursor-pointer items-start gap-2 text-sm text-zinc-800">
              <input
                type="checkbox"
                checked={dangerAck}
                onChange={(e) => setDangerAck(e.target.checked)}
                className="mt-1 rounded border-zinc-300"
              />
              <span>Suprantu pasekmes ir noriu tęsti.</span>
            </label>
            {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setModal(null)}
                className="cursor-pointer rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
              >
                Atšaukti
              </button>
              <button
                type="button"
                disabled={isPending || !dangerAck}
                onClick={runReturn}
                className="cursor-pointer rounded-lg bg-red-700 px-3 py-2 text-sm font-medium text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isPending ? "…" : "Taip, grąžinti į kandidatus"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
