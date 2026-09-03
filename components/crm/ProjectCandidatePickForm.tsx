"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ClientProjectHistoryList } from "@/components/crm/ClientProjectHistoryList";
import type { ClientProjectHistoryEntry } from "@/lib/crm/findMatchingExistingClient";
import {
  pickClientFromProject,
  previewPickClientPriorHistoryAction,
  type PickClientFromProjectResult,
} from "@/lib/crm/projectActions";

export type ProjectCandidatePickTarget =
  | { kind: "auto"; clientKey: string }
  | { kind: "manual_lead"; leadId: string }
  | { kind: "linked_client"; linkId: string }
  | { kind: "procurement_contract"; contractId: string };

export type ProjectCandidatePickFormProps =
  | {
      projectId: string;
      defaultAssignee: string;
      candidateType: "auto";
      clientKey: string;
      /** 1-based pozicija sąraše (prioritetui); serveris naudoja vietoje pilno findIndex. */
      snapshotPriority?: number;
      onOptimisticPick?: (target: ProjectCandidatePickTarget) => void;
      onOptimisticRevert?: (target: ProjectCandidatePickTarget) => void;
    }
  | {
      projectId: string;
      defaultAssignee: string;
      candidateType: "manual_lead" | "linked_client" | "procurement_contract";
      candidateId: string;
      onOptimisticPick?: (target: ProjectCandidatePickTarget) => void;
      onOptimisticRevert?: (target: ProjectCandidatePickTarget) => void;
    };

function pickTarget(props: ProjectCandidatePickFormProps): ProjectCandidatePickTarget {
  if (props.candidateType === "auto") {
    return { kind: "auto", clientKey: props.clientKey };
  }
  if (props.candidateType === "manual_lead") {
    return { kind: "manual_lead", leadId: props.candidateId };
  }
  if (props.candidateType === "linked_client") {
    return { kind: "linked_client", linkId: props.candidateId };
  }
  return { kind: "procurement_contract", contractId: props.candidateId };
}

export function ProjectCandidatePickForm(props: ProjectCandidatePickFormProps) {
  const { projectId, defaultAssignee } = props;
  const target = pickTarget(props);
  const router = useRouter();
  const formRef = useRef<HTMLFormElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [priorHistory, setPriorHistory] = useState<ClientProjectHistoryEntry[] | null>(null);

  function runPick(fd: FormData) {
    const tClick = typeof performance !== "undefined" ? performance.now() : Date.now();
    props.onOptimisticPick?.(target);
    const tAfterOptimistic = typeof performance !== "undefined" ? performance.now() : Date.now();
    if (process.env.NEXT_PUBLIC_CRM_PERF_LOG === "1" && typeof performance !== "undefined") {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          console.info("[CRM perf] pickClient UI", {
            clickToOptimisticSyncMs: Math.round(tAfterOptimistic - tClick),
            clickToSecondRafMs: Math.round(performance.now() - tClick),
          });
        });
      });
    }
    startTransition(async () => {
      setError(null);
      const tAction = typeof performance !== "undefined" ? performance.now() : Date.now();
      const r: PickClientFromProjectResult = await pickClientFromProject(fd);
      if (process.env.NODE_ENV === "development" || process.env.NEXT_PUBLIC_CRM_PERF_LOG === "1") {
        console.info("[CRM perf] pickClientFromProject", {
          clickToActionStartMs: Math.round(tAction - tClick),
          serverTotalMs: r.timings.totalServerMs,
          server: r.timings,
          ok: r.ok,
        });
      }
      if (r.ok) {
        setPriorHistory(null);
        router.refresh();
        if (typeof performance !== "undefined") {
          requestAnimationFrame(() => {
            console.info("[CRM perf] pick first frame after success", {
              clickToFirstRafMs: Math.round(performance.now() - tClick),
            });
          });
        }
      } else {
        props.onOptimisticRevert?.(target);
        setError(r.error);
      }
    });
  }

  return (
    <>
      <form
        ref={formRef}
        className="flex flex-col items-end gap-1"
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          const fd = new FormData(e.currentTarget);
          startTransition(async () => {
            setError(null);
            const preview = await previewPickClientPriorHistoryAction(fd);
            if (!preview.ok) {
              setError(preview.error);
              return;
            }
            if (preview.history.length > 0) {
              setPriorHistory(preview.history);
              return;
            }
            runPick(fd);
          });
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <input type="hidden" name="project_id" value={projectId} />
        <input type="hidden" name="candidate_type" value={props.candidateType} />
        {props.candidateType === "auto" ? (
          <>
            <input type="hidden" name="client_key" value={props.clientKey} />
            {props.snapshotPriority != null && props.snapshotPriority > 0 ? (
              <input type="hidden" name="snapshot_priority" value={String(props.snapshotPriority)} />
            ) : null}
          </>
        ) : (
          <input type="hidden" name="candidate_id" value={props.candidateId} />
        )}
        <input type="hidden" name="assigned_to" value={defaultAssignee} />
        <button
          type="submit"
          disabled={pending}
          className="cursor-pointer rounded-lg bg-[#7C4A57] px-3 py-1.5 text-xs font-medium text-white shadow-sm transition-colors hover:bg-[#693948] disabled:opacity-50"
        >
          {pending ? "…" : "Priskirti sau"}
        </button>
        {error ? <span className="max-w-[12rem] text-right text-xs text-red-600">{error}</span> : null}
      </form>

      {priorHistory && priorHistory.length > 0 ? (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget && !pending) setPriorHistory(null);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="pick-prior-title"
            className="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border border-zinc-200 bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="pick-prior-title" className="text-base font-semibold text-zinc-900">
              Su šia įmone jau dirbta kitame projekte
            </h3>
            <p className="mt-2 text-sm text-zinc-600">
              Kitoje lentoje jau buvo skambutis, laiškas arba kitas Kanban veiksmas. Galite atšaukti arba vis tiek
              priskirti sau šiame projekte.
            </p>
            <ClientProjectHistoryList history={priorHistory} />
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                disabled={pending}
                onClick={() => setPriorHistory(null)}
                className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
              >
                Atšaukti
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  const form = formRef.current;
                  if (!form) return;
                  const fd = new FormData(form);
                  runPick(fd);
                }}
                className="rounded-lg bg-[#7C4A57] px-4 py-2 text-sm font-medium text-white hover:bg-[#693948] disabled:opacity-50"
              >
                {pending ? "Priskiriama…" : "Vis tiek priskirti"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
