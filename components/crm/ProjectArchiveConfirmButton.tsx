"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { archiveProjectFormAction } from "@/lib/crm/projectActions";

export function ProjectArchiveConfirmButton({ projectId }: { projectId: string }) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  return (
    <>
      <button
        type="button"
        className="cursor-pointer rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
        onClick={() => {
          setError(null);
          setConfirmed(false);
          dialogRef.current?.showModal();
        }}
      >
        Archyvuoti
      </button>

      <dialog
        ref={dialogRef}
        className="fixed inset-0 m-auto w-[min(92vw,28rem)] rounded-xl p-0 backdrop:bg-black/30"
      >
        <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-[0_12px_40px_-12px_rgba(15,23,42,0.35)]">
          <div className="text-base font-semibold text-zinc-900">Archyvuoti projektą?</div>
          <p className="mt-1 text-sm text-zinc-600">Archyvuotas projektas bus paslėptas iš aktyvių projektų sąrašo.</p>

          <label className="mt-4 flex cursor-pointer items-start gap-2 rounded-lg border border-zinc-200 bg-zinc-50/50 p-3 text-sm text-zinc-700">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-400"
              checked={confirmed}
              disabled={pending}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            <span>
              Patvirtinu, kad noriu archyvuoti šį projektą
            </span>
          </label>

          {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              type="button"
              disabled={pending}
              className="cursor-pointer rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
              onClick={() => {
                dialogRef.current?.close();
                setConfirmed(false);
              }}
            >
              Atšaukti
            </button>
            <button
              type="button"
              disabled={pending || !confirmed}
              className="cursor-pointer rounded-md bg-[#7C4A57] px-3 py-2 text-sm font-semibold text-white hover:bg-[#693948] disabled:opacity-60"
              onClick={() => {
                setError(null);
                startTransition(async () => {
                  try {
                    await archiveProjectFormAction(projectId);
                    dialogRef.current?.close();
                    setConfirmed(false);
                    router.refresh();
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "Nepavyko archyvuoti projekto.");
                  }
                });
              }}
            >
              {pending ? "Archyvuojama…" : "Archyvuoti projektą"}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}

