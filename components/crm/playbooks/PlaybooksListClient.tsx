"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";

import type { PlaybookStatus } from "@/lib/crm/playbooks/playbookStatus";
import { normalizePlaybookStatus } from "@/lib/crm/playbooks/playbookStatus";

import type { PlaybookListRow } from "./playbookListTypes";

export type { PlaybookListRow };

function PlaybookCardLoading() {
  return (
    <div className="rounded-xl border border-zinc-200/90 bg-white p-5 shadow-[0_1px_3px_rgba(15,23,42,0.05),0_2px_12px_-4px_rgba(15,23,42,0.08)]">
      <div className="h-5 w-2/3 rounded bg-zinc-100" />
      <div className="mt-3 h-4 w-full rounded bg-zinc-100" />
      <div className="mt-2 h-4 w-5/6 rounded bg-zinc-100" />
      <div className="mt-6 flex justify-end gap-2">
        <div className="h-10 w-24 rounded bg-zinc-100" />
        <div className="h-10 w-28 rounded bg-zinc-100" />
        <div className="h-10 w-24 rounded bg-zinc-100" />
      </div>
    </div>
  );
}

const PlaybookCard = dynamic(() => import("./PlaybookCard"), {
  ssr: false,
  loading: PlaybookCardLoading,
});

const FILTER_OPTIONS: Array<{ id: PlaybookStatus; label: string }> = [
  { id: "active", label: "Active" },
  { id: "draft", label: "Draft" },
  { id: "archived", label: "Archived" },
];

export function PlaybooksListClient({ initialRows }: { initialRows: PlaybookListRow[] }) {
  const router = useRouter();
  const [rows, setRows] = useState<PlaybookListRow[]>(initialRows);
  const [statusFilter, setStatusFilter] = useState<PlaybookStatus>("active");
  const [selected, setSelected] = useState<PlaybookListRow | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dupPendingId, setDupPendingId] = useState<string | null>(null);
  const [dupError, setDupError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  function openConfirm(row: PlaybookListRow) {
    setSelected(row);
    setError(null);
    setPending(false);
    dialogRef.current?.showModal();
  }

  function closeConfirm() {
    dialogRef.current?.close();
    setSelected(null);
    setError(null);
    setPending(false);
  }

  async function onDuplicate(row: PlaybookListRow) {
    if (dupPendingId) return;
    setDupError(null);
    setDupPendingId(row.id);
    try {
      const res = await fetch(`/api/crm/playbooks/${row.id}/duplicate`, { method: "POST" });
      const json = (await res.json()) as { ok?: boolean; id?: string; error?: string };
      if (!res.ok || !json.ok || !json.id) {
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }
      router.push(`/scenarijai/${json.id}/edit`);
      router.refresh();
    } catch (e) {
      setDupError(e instanceof Error ? e.message : "Klaida");
      setDupPendingId(null);
    }
  }

  const filteredRows = useMemo(
    () => rows.filter((r) => normalizePlaybookStatus(r.status) === statusFilter),
    [rows, statusFilter],
  );

  async function onConfirmDelete() {
    if (!selected) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/crm/playbooks/${selected.id}`, { method: "DELETE" });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }
      const deletedId = selected.id;
      setRows((prev) => prev.filter((r) => r.id !== deletedId));
      closeConfirm();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Klaida");
      setPending(false);
    }
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-200/90 bg-white px-6 py-12 text-center text-sm text-zinc-500">
        Kol kas nėra scenarijų.
        <div className="mt-2 text-xs text-zinc-400">Kai jų atsiras daugiau, čia galėsi greitai pasirinkti ir paleisti.</div>
      </div>
    );
  }

  return (
    <>
      {dupError ? (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          Nepavyko dubliuoti scenarijaus: {dupError}
        </div>
      ) : null}

      <div className="mb-4 flex flex-wrap gap-2">
        {FILTER_OPTIONS.map((opt) => {
          const active = statusFilter === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => setStatusFilter(opt.id)}
              className={[
                "rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition-colors",
                active
                  ? "border-[#7C4A57] bg-[#7C4A57] text-white"
                  : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50",
              ].join(" ")}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      {filteredRows.length === 0 ? (
        <div className="rounded-xl border border-zinc-200/90 bg-white px-6 py-12 text-center text-sm text-zinc-500">
          Pagal pasirinktą filtrą scenarijų nėra.
          <div className="mt-2 text-xs text-zinc-400">Pakeisk filtrą arba sukurk naują scenarijų.</div>
        </div>
      ) : (
        <div className="grid gap-4">
          {filteredRows.map((r) => (
            <PlaybookCard
              key={r.id}
              row={r}
              onDeleteClick={openConfirm}
              onDuplicateClick={onDuplicate}
              duplicatePending={dupPendingId === r.id}
            />
          ))}
        </div>
      )}

      <dialog ref={dialogRef} className="fixed inset-0 m-auto w-[min(92vw,32rem)] rounded-xl p-0 backdrop:bg-black/30">
        <div className="rounded-xl border border-red-200 bg-white p-5 shadow-[0_12px_40px_-12px_rgba(15,23,42,0.35)]">
          <div className="text-base font-semibold text-zinc-900">Ar tikrai norite ištrinti šį scenarijų?</div>
          <p className="mt-1 text-sm text-zinc-600">Šis veiksmas negrįžtamas.</p>

          {selected ? (
            <div className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50/60 p-3 text-sm text-zinc-700">
              Bus ištrintas: <span className="font-semibold text-zinc-900">{selected.name}</span>
            </div>
          ) : null}

          {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              type="button"
              disabled={pending}
              className="cursor-pointer rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
              onClick={closeConfirm}
            >
              Atšaukti
            </button>
            <button
              type="button"
              disabled={pending || !selected}
              className="cursor-pointer rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
              onClick={onConfirmDelete}
            >
              {pending ? "Trinama…" : "Ištrinti"}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}

