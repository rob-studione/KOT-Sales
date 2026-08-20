"use client";

import { useState, useTransition } from "react";
import {
  deleteCompanyHistoryAction,
  reorderCompanyHistoryAction,
  setCompanyHistoryActiveAction,
  upsertCompanyHistoryAction,
} from "@/lib/crm/commercialProposalActions";
import type { CpCompanyHistoryEntry } from "@/lib/commercialProposal/types";

export function CompanyHistoryAdminClient({ initial }: { initial: CpCompanyHistoryEntry[] }) {
  const [rows, setRows] = useState(initial);
  const [year, setYear] = useState("");
  const [body, setBody] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <section className="mt-8 rounded-xl border border-zinc-200/80 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-zinc-900">Istorijos įrašai</h2>
      <p className="mt-1 text-xs text-zinc-500">
        Šie įrašai patenka į komercinio pasiūlymo skiltį „Mūsų istorija“. Nauji metai (2025, 2026, …) pridedami čia —
        PDF generatoriaus keisti nereikia.
      </p>

      <div className="mt-4 grid gap-3">
        <div className="grid gap-3 sm:grid-cols-[120px_1fr_auto]">
          <input
            value={year}
            onChange={(e) => setYear(e.target.value)}
            placeholder="Metai"
            className="h-9 rounded-lg border border-zinc-200 px-3 text-sm"
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Tekstas (be „YYYY metais“ prefikso)"
            className="min-h-9 rounded-lg border border-zinc-200 px-3 py-2 text-sm"
            rows={2}
          />
          <button
            type="button"
            disabled={pending}
            className="h-9 rounded-lg bg-[#7C4A57] px-4 text-sm font-medium text-white hover:bg-[#693948] disabled:opacity-50"
            onClick={() => {
              setMessage(null);
              start(async () => {
                const res = await upsertCompanyHistoryAction({
                  id: editingId ?? undefined,
                  year: Number(year),
                  body,
                  sort_order: editingId
                    ? rows.find((r) => r.id === editingId)?.sort_order ?? (rows.length + 1) * 10
                    : (rows.length + 1) * 10,
                  active: true,
                });
                if (!res.ok) {
                  setMessage(res.error);
                  return;
                }
                window.location.reload();
              });
            }}
          >
            {editingId ? "Išsaugoti" : "Add"}
          </button>
        </div>
        {editingId ? (
          <button
            type="button"
            className="text-left text-xs text-zinc-500 hover:underline"
            onClick={() => {
              setEditingId(null);
              setYear("");
              setBody("");
            }}
          >
            Atšaukti redagavimą
          </button>
        ) : null}
        {message ? <p className="text-sm text-red-600">{message}</p> : null}
      </div>

      <ul className="mt-5 divide-y divide-zinc-100">
        {rows.map((r, idx) => (
          <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-zinc-900">
                {r.year} metais {r.active ? "" : "(išjungta)"}
              </div>
              <p className="mt-1 text-sm text-zinc-700">{r.body}</p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <button
                type="button"
                className="rounded-md border border-zinc-200 px-2 py-1 hover:bg-zinc-50"
                disabled={pending || idx === 0}
                onClick={() => {
                  const next = [...rows];
                  const swap = next[idx - 1]!;
                  next[idx - 1] = r;
                  next[idx] = swap;
                  setRows(next);
                  start(async () => {
                    await reorderCompanyHistoryAction(next.map((x) => x.id));
                  });
                }}
              >
                ↑
              </button>
              <button
                type="button"
                className="rounded-md border border-zinc-200 px-2 py-1 hover:bg-zinc-50"
                disabled={pending || idx === rows.length - 1}
                onClick={() => {
                  const next = [...rows];
                  const swap = next[idx + 1]!;
                  next[idx + 1] = r;
                  next[idx] = swap;
                  setRows(next);
                  start(async () => {
                    await reorderCompanyHistoryAction(next.map((x) => x.id));
                  });
                }}
              >
                ↓
              </button>
              <button
                type="button"
                className="rounded-md border border-zinc-200 px-2 py-1 hover:bg-zinc-50"
                onClick={() => {
                  setEditingId(r.id);
                  setYear(String(r.year));
                  setBody(r.body);
                }}
              >
                Edit
              </button>
              <button
                type="button"
                className="rounded-md border border-zinc-200 px-2 py-1 hover:bg-zinc-50"
                onClick={() => {
                  start(async () => {
                    await setCompanyHistoryActiveAction(r.id, !r.active);
                    window.location.reload();
                  });
                }}
              >
                {r.active ? "Disable" : "Enable"}
              </button>
              <button
                type="button"
                className="rounded-md border border-red-200 px-2 py-1 text-red-700 hover:bg-red-50"
                onClick={() => {
                  if (!confirm("Ištrinti šį istorijos įrašą?")) return;
                  start(async () => {
                    await deleteCompanyHistoryAction(r.id);
                    window.location.reload();
                  });
                }}
              >
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
