"use client";

import { forwardRef, useImperativeHandle, useRef, useState, useTransition } from "react";
import { deleteCommercialProposalAction } from "@/lib/crm/commercialProposalActions";
import type { CommercialProposalStatus } from "@/lib/commercialProposal/types";

function deleteCopy(status: string, proposalNumber: string | null): { title: string; body: string; needsExplicit: boolean } {
  if (status === "draft") {
    return {
      title: "Ištrinti šį pasiūlymą?",
      body: "Veiksmo atšaukti negalėsite.",
      needsExplicit: false,
    };
  }
  const number = proposalNumber?.trim() || "šį pasiūlymą";
  return {
    title: `Ištrinti sugeneruotą pasiūlymą ${number} ir jo PDF?`,
    body: "Veiksmo atšaukti negalėsite.",
    needsExplicit: true,
  };
}

export type ProposalDeleteControlHandle = {
  open: () => void;
};

export const ProposalDeleteControl = forwardRef<
  ProposalDeleteControlHandle,
  {
    proposalId: string;
    proposalNumber: string | null;
    status: CommercialProposalStatus | string;
    variant: "link" | "button";
    hideTrigger?: boolean;
    onDeleted: () => void;
    onDeleteError?: (message: string) => void;
  }
>(function ProposalDeleteControl(
  { proposalId, proposalNumber, status, variant, hideTrigger = false, onDeleted, onDeleteError },
  ref
) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const copy = deleteCopy(status, proposalNumber);

  function open() {
    setError(null);
    setConfirmed(false);
    dialogRef.current?.showModal();
  }

  function close() {
    if (pending) return;
    dialogRef.current?.close();
  }

  useImperativeHandle(ref, () => ({ open }));

  return (
    <>
      {!hideTrigger && variant === "link" ? (
        <button
          type="button"
          className="text-red-700 hover:underline disabled:opacity-50"
          disabled={pending}
          onClick={open}
        >
          Ištrinti
        </button>
      ) : null}
      {!hideTrigger && variant === "button" ? (
        <button
          type="button"
          className="rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
          disabled={pending}
          onClick={open}
        >
          Ištrinti
        </button>
      ) : null}

      <dialog ref={dialogRef} className="fixed inset-0 m-auto w-[min(92vw,32rem)] rounded-xl p-0 backdrop:bg-black/30">
        <div className="rounded-xl border border-red-200 bg-white p-5 shadow-[0_12px_40px_-12px_rgba(15,23,42,0.35)]">
          <div className="text-base font-semibold text-zinc-900">{copy.title}</div>
          <p className="mt-1 text-sm text-zinc-600">{copy.body}</p>

          {copy.needsExplicit ? (
            <label className="mt-4 flex cursor-pointer items-start gap-2 rounded-lg border border-zinc-200 bg-zinc-50/50 p-3 text-sm text-zinc-700">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-400"
                checked={confirmed}
                disabled={pending}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              <span>Patvirtinu, kad noriu ištrinti šį pasiūlymą ir jo PDF</span>
            </label>
          ) : null}

          {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              type="button"
              disabled={pending}
              className="cursor-pointer rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
              onClick={close}
            >
              Atšaukti
            </button>
            <button
              type="button"
              disabled={pending || (copy.needsExplicit && !confirmed)}
              className="cursor-pointer rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
              onClick={() => {
                setError(null);
                start(async () => {
                  const res = await deleteCommercialProposalAction(proposalId);
                  if (!res.ok) {
                    if (onDeleteError) {
                      dialogRef.current?.close();
                      onDeleteError(res.error);
                    } else {
                      setError(res.error);
                    }
                    return;
                  }
                  dialogRef.current?.close();
                  onDeleted();
                });
              }}
            >
              {pending ? "Trinama…" : "Ištrinti"}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
});
