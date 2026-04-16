"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { hardDeleteProjectForeverAction } from "@/lib/crm/projectActions";

export function ProjectHardDeleteConfirmButton({
  projectId,
  projectName,
}: {
  projectId: string;
  projectName: string;
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [typed, setTyped] = useState("");

  const required = projectName.trim() || "DELETE";
  const ok = typed.trim() === required;

  return (
    <>
      <button
        type="button"
        className="cursor-pointer rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs font-medium text-red-800 hover:bg-red-100"
        onClick={() => {
          setError(null);
          setTyped("");
          dialogRef.current?.showModal();
        }}
      >
        Naikinti visam laikui
      </button>

      <dialog ref={dialogRef} className="fixed inset-0 m-auto w-[min(92vw,32rem)] rounded-xl p-0 backdrop:bg-black/30">
        <div className="rounded-xl border border-red-200 bg-white p-5 shadow-[0_12px_40px_-12px_rgba(15,23,42,0.35)]">
          <div className="text-base font-semibold text-zinc-900">Naikinti projektą visam laikui?</div>
          <p className="mt-1 text-sm text-zinc-600">
            Tai negrįžtamas veiksmas. Bus pašalintas projektas ir susiję įrašai (darbo eilutės, veiklos istorija, rankiniai kandidatai).
          </p>

          <div className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50/60 p-3 text-sm text-zinc-700">
            Įrašykite projekto pavadinimą, kad patvirtintumėte:{" "}
            <span className="font-semibold text-zinc-900">{required}</span>
            <input
              className="mt-2 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder="Įrašykite tiksliai…"
              disabled={pending}
            />
          </div>

          {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              type="button"
              disabled={pending}
              className="cursor-pointer rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
              onClick={() => dialogRef.current?.close()}
            >
              Atšaukti
            </button>
            <button
              type="button"
              disabled={pending || !ok}
              className="cursor-pointer rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
              onClick={() => {
                setError(null);
                startTransition(async () => {
                  const r = await hardDeleteProjectForeverAction(projectId);
                  if (!r.ok) {
                    setError(r.error);
                    return;
                  }
                  dialogRef.current?.close();
                  router.push("/projektai?status=deleted");
                  router.refresh();
                });
              }}
            >
              {pending ? "Naikinama…" : "Naikinti visam laikui"}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}

