"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { AccountsCardList, type AccountListRow } from "@/components/crm/accounts/AccountsCardList";
import { AccountEditDrawer } from "@/components/crm/accounts/AccountEditDrawer";
import { useRouter } from "next/navigation";
import { deleteCrmUserAccountAction } from "@/lib/crm/accountActions";

export function AccountsPageClient({ rows, currentUserId }: { rows: AccountListRow[]; currentUserId: string }) {
  const router = useRouter();
  const [localRows, setLocalRows] = useState<AccountListRow[]>(rows);
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AccountListRow | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [pendingDelete, startDelete] = useTransition();

  useEffect(() => {
    setLocalRows(rows);
  }, [rows]);

  const selected = useMemo(() => localRows.find((r) => r.id === selectedId) ?? null, [localRows, selectedId]);

  const deletePhrase = "IŠTRINTI PASKYRĄ";
  const canConfirmDelete = deleteConfirm.trim() === deletePhrase;

  return (
    <>
      {banner ? (
        <div
          className={[
            "mb-4 rounded-xl border px-4 py-3 text-sm",
            banner.kind === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-red-200 bg-red-50 text-red-900",
          ].join(" ")}
        >
          {banner.text}
        </div>
      ) : null}

      <AccountsCardList
        rows={localRows}
        currentUserId={currentUserId}
        onOpen={(row) => {
          setSelectedId(row.id);
          setOpen(true);
        }}
        onRequestDelete={(row) => {
          setDeleteTarget(row);
          setDeleteConfirm("");
          setDeleteOpen(true);
        }}
      />
      <AccountEditDrawer
        open={open}
        user={selected}
        onClose={() => {
          setOpen(false);
        }}
        onSaved={(updated) => {
          setLocalRows((prev) =>
            prev.map((r) => {
              if (r.id !== updated.id) return r;
              const full = [updated.first_name, updated.last_name].filter(Boolean).join(" ").trim();
              const nextName = full || r.legacy_name || r.name;
              return {
                ...r,
                name: nextName,
                first_name: updated.first_name,
                last_name: updated.last_name,
                phone: updated.phone,
                role: updated.role,
                status_raw: updated.status,
                status: updated.status === "inactive" ? "Neaktyvi" : "Aktyvi",
                avatar_url: updated.avatar_url ?? r.avatar_url ?? null,
              };
            })
          );
          router.refresh();
        }}
      />

      {deleteOpen && deleteTarget ? (
        <div className="fixed inset-0 z-[60]">
          <div
            className="absolute inset-0 bg-black/20"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget && !pendingDelete) {
                setDeleteOpen(false);
                setDeleteTarget(null);
                setDeleteConfirm("");
              }
            }}
            aria-hidden
          />
          <div className="absolute left-1/2 top-1/2 w-[min(520px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-zinc-200 bg-white p-6 shadow-[0_20px_60px_-30px_rgba(0,0,0,0.45)]">
            <div className="text-lg font-semibold tracking-tight text-zinc-900">Ištrinti paskyrą?</div>
            <p className="mt-2 text-sm leading-relaxed text-zinc-600">
              Tai <span className="font-semibold text-zinc-900">negrįžtamas</span> veiksmas: bus pašalintas Auth naudotojas ir CRM profilis (
              <span className="font-mono text-xs text-zinc-800">{deleteTarget.email}</span>
              ).
            </p>
            <p className="mt-3 text-sm text-zinc-600">
              Patvirtinimui įveskite: <span className="font-semibold text-zinc-900">{deletePhrase}</span>
            </p>
            <input
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              className="mt-2 w-full rounded-xl border border-zinc-200 bg-zinc-50/40 px-4 py-3 text-sm text-zinc-900 outline-none ring-0 placeholder:text-zinc-400 focus:border-zinc-300 focus:bg-white focus:ring-2 focus:ring-zinc-900/5"
              placeholder={deletePhrase}
              autoComplete="off"
              disabled={pendingDelete}
            />

            <div className="mt-6 flex items-center justify-end gap-2">
              <button
                type="button"
                className="rounded-xl px-4 py-2.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
                disabled={pendingDelete}
                onClick={() => {
                  if (pendingDelete) return;
                  setDeleteOpen(false);
                  setDeleteTarget(null);
                  setDeleteConfirm("");
                }}
              >
                Atšaukti
              </button>
              <button
                type="button"
                className={[
                  "rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-sm",
                  canConfirmDelete && !pendingDelete
                    ? "bg-red-600 hover:bg-red-700"
                    : "cursor-not-allowed bg-red-300",
                ].join(" ")}
                disabled={!canConfirmDelete || pendingDelete}
                onClick={() => {
                  if (!deleteTarget?.id) return;
                  startDelete(async () => {
                    const res = await deleteCrmUserAccountAction(deleteTarget.id);
                    if (!res.ok) {
                      setBanner({ kind: "error", text: res.error });
                      return;
                    }
                    setBanner({ kind: "success", text: "Paskyra ištrinta." });
                    setLocalRows((prev) => prev.filter((r) => r.id !== deleteTarget.id));
                    if (selectedId === deleteTarget.id) {
                      setOpen(false);
                      setSelectedId(null);
                    }
                    setDeleteOpen(false);
                    setDeleteTarget(null);
                    setDeleteConfirm("");
                    router.refresh();
                  });
                }}
              >
                {pendingDelete ? "Trinama…" : "Ištrinti visam laikui"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

