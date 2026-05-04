"use client";

import { useRef, useState, useTransition } from "react";
import { createAccountAction } from "@/lib/crm/accountActions";

export function CreateAccountButton() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  return (
    <>
      <button
        type="button"
        className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-[#7C4A57] px-3 py-2 text-sm font-semibold text-white hover:bg-[#693948]"
        onClick={() => {
          setError(null);
          setSuccess(null);
          dialogRef.current?.showModal();
        }}
      >
        Sukurti paskyrą
      </button>

      <dialog ref={dialogRef} className="w-full max-w-lg rounded-xl p-0 backdrop:bg-black/30">
        <div className="rounded-xl border border-zinc-200 bg-white p-5">
          <div className="text-base font-semibold text-zinc-900">Nauja paskyra</div>
          <p className="mt-1 text-sm text-zinc-600">Vartotojas gaus kvietimą el. paštu ir susikurs slaptažodį.</p>

          <form
            ref={formRef}
            className="mt-4 flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              setError(null);
              setSuccess(null);
              startTransition(async () => {
                const r = await createAccountAction(fd);
                if (!r.ok) {
                  setError(r.error);
                  return;
                }
                setSuccess(`Kvietimas išsiųstas: ${r.invitedEmail}`);
                formRef.current?.reset();
              });
            }}
          >
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-zinc-700">Vardas</span>
              <input name="name" required className="rounded-md border border-zinc-200 px-3 py-2" placeholder="Vardas Pavardė" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-zinc-700">El. paštas</span>
              <input name="email" type="email" required className="rounded-md border border-zinc-200 px-3 py-2" placeholder="vardas@imone.lt" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-zinc-700">Rolė</span>
              <select name="role" defaultValue="sales" className="rounded-md border border-zinc-200 px-3 py-2">
                <option value="sales">Pardavimų vadybininkas</option>
                <option value="admin">Admin</option>
              </select>
            </label>

            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            {success ? <p className="text-sm text-emerald-700">{success}</p> : null}

            <div className="mt-1 flex items-center justify-end gap-2">
              <button
                type="button"
                className="cursor-pointer rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                onClick={() => dialogRef.current?.close()}
              >
                Uždaryti
              </button>
              <button
                type="submit"
                disabled={pending}
                className="cursor-pointer rounded-md bg-[#7C4A57] px-3 py-2 text-sm font-semibold text-white hover:bg-[#693948] disabled:opacity-60"
              >
                {pending ? "Kuriama…" : "Sukurti"}
              </button>
            </div>
          </form>
        </div>
      </dialog>
    </>
  );
}

