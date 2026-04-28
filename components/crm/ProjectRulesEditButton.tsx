"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { projectSortLabel, type ProjectSortOption } from "@/lib/crm/projectSnapshot";
import { updateAutomaticProjectRulesAction } from "@/lib/crm/projectActions";

export function ProjectRulesEditButton({
  projectId,
  initial,
  children,
  triggerClassName,
  triggerAriaLabel,
}: {
  projectId: string;
  initial: {
    dateFrom: string;
    dateTo: string;
    minOrderCount: number;
    inactivityDays: number;
    sortOption: ProjectSortOption;
  };
  children?: React.ReactNode;
  triggerClassName?: string;
  triggerAriaLabel?: string;
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <button
        type="button"
        aria-label={triggerAriaLabel ?? "Redaguoti taisykles"}
        className={
          triggerClassName ??
          "cursor-pointer rounded-md px-2 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-50 hover:text-zinc-800"
        }
        onClick={() => {
          setError(null);
          dialogRef.current?.showModal();
        }}
      >
        {children ?? "Redaguoti taisykles"}
      </button>

      <dialog ref={dialogRef} className="w-full max-w-xl rounded-xl p-0 backdrop:bg-black/30">
        <div className="rounded-xl border border-zinc-200 bg-white p-5">
          <div className="text-base font-semibold text-zinc-900">Taisyklių redagavimas</div>
          <p className="mt-1 text-sm text-zinc-600">
            Pakeitimai perskaičiuos „Kandidatai“ sąrašą. Esamos „Darbas“ eilutės neliečiamos.
          </p>

          <form
            className="mt-4 grid gap-3 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              setError(null);
              startTransition(async () => {
                const r = await updateAutomaticProjectRulesAction(projectId, fd);
                if (!r.ok) {
                  setError(r.error);
                  return;
                }
                dialogRef.current?.close();
                router.refresh();
              });
            }}
          >
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-zinc-700">Data nuo</span>
              <input
                name="date_from"
                type="date"
                required
                defaultValue={initial.dateFrom}
                className="rounded-md border border-zinc-200 px-3 py-2"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-zinc-700">Data iki</span>
              <input
                name="date_to"
                type="date"
                required
                defaultValue={initial.dateTo}
                className="rounded-md border border-zinc-200 px-3 py-2"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-zinc-700">Min. sąskaitų skaičius intervale</span>
              <input
                name="min_order_count"
                type="number"
                min={1}
                defaultValue={initial.minOrderCount}
                className="rounded-md border border-zinc-200 px-3 py-2"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-zinc-700">Neaktyvumo slenkstis (dienos)</span>
              <input
                name="inactivity_days"
                type="number"
                min={1}
                max={3650}
                defaultValue={initial.inactivityDays}
                className="rounded-md border border-zinc-200 px-3 py-2"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm sm:col-span-2">
              <span className="font-medium text-zinc-700">Kandidatų rikiavimas</span>
              <select
                name="sort_option"
                defaultValue={initial.sortOption}
                className="rounded-md border border-zinc-200 bg-white px-3 py-2"
              >
                <option value="revenue_desc">{projectSortLabel("revenue_desc")}</option>
                <option value="last_invoice_desc">{projectSortLabel("last_invoice_desc")}</option>
                <option value="order_count_desc">{projectSortLabel("order_count_desc")}</option>
              </select>
            </label>

            {error ? <p className="text-sm text-red-600 sm:col-span-2">{error}</p> : null}

            <div className="mt-2 flex items-center justify-end gap-2 sm:col-span-2">
              <button
                type="button"
                className="cursor-pointer rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                onClick={() => dialogRef.current?.close()}
              >
                Atšaukti
              </button>
              <button
                type="submit"
                disabled={pending}
                className="cursor-pointer rounded-md bg-zinc-900 px-3 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-60"
              >
                {pending ? "Saugoma…" : "Išsaugoti"}
              </button>
            </div>
          </form>
        </div>
      </dialog>
    </>
  );
}

