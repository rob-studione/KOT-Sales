"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { ProposalListActions } from "@/components/crm/commercial-proposal/ProposalListActions";
import { formatCategoryDiscountsLabel, templateVersionLabel } from "@/lib/commercialProposal/uiLabels";
import { formatDate } from "@/lib/crm/format";
import type { ProposalListRow } from "@/lib/crm/commercialProposalActions";
import { CP_TOOL_PATH } from "@/lib/crm/commercialProposalPaths";

const SUCCESS_TOAST_MS = 3000;
const ERROR_TOAST_MS = 5000;

type ListToast = { kind: "ok" | "error"; text: string };

function statusLabel(status: string): string {
  if (status === "draft") return "Juodraštis";
  if (status === "generated") return "Sugeneruotas";
  if (status === "sent") return "Išsiųstas";
  return status;
}

function statusChipClass(status: string): string {
  if (status === "draft") return "border-zinc-300 bg-zinc-50 text-zinc-700";
  if (status === "generated") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "sent") return "border-[#7C4A57]/40 bg-[#F7EEF0] text-[#7C4A57]";
  return "border-zinc-300 bg-zinc-50 text-zinc-700";
}

export function CommercialProposalList({
  rows,
  canAdmin,
  showDeletedToast = false,
}: {
  rows: ProposalListRow[];
  canAdmin: boolean;
  showDeletedToast?: boolean;
}) {
  const router = useRouter();
  const [hiddenIds, setHiddenIds] = useState<string[]>([]);
  const [toast, setToast] = useState<ListToast | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const visible = useMemo(() => rows.filter((r) => !hiddenIds.includes(r.id)), [rows, hiddenIds]);
  const showTemplate = useMemo(() => {
    const versions = new Set(visible.map((r) => r.template_version || "LT_COMMERCIAL_V2"));
    return versions.size > 1;
  }, [visible]);

  useEffect(() => {
    if (!showDeletedToast) return;
    setToast({ kind: "ok", text: "✓ Pasiūlymas ištrintas." });
    const params = new URLSearchParams(window.location.search);
    params.delete("deleted");
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `${CP_TOOL_PATH}?${qs}` : CP_TOOL_PATH);
  }, [showDeletedToast]);

  useEffect(() => {
    if (!toast) return;
    const ms = toast.kind === "error" ? ERROR_TOAST_MS : SUCCESS_TOAST_MS;
    const t = window.setTimeout(() => setToast(null), ms);
    return () => window.clearTimeout(t);
  }, [toast]);

  return (
    <>
      {toast && typeof document !== "undefined"
        ? createPortal(
            <div
              role="status"
              className={[
                "fixed right-4 top-4 z-50 flex max-w-sm items-start gap-2 rounded-lg border px-3 py-2 text-sm shadow-sm",
                toast.kind === "error"
                  ? "border-red-200 bg-red-50 text-red-800"
                  : "border-emerald-200 bg-emerald-50 text-emerald-900",
              ].join(" ")}
            >
              <span>{toast.text}</span>
              <button
                type="button"
                className="shrink-0 rounded p-0.5 text-current opacity-60 hover:opacity-100"
                aria-label="Uždaryti"
                onClick={() => setToast(null)}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>,
            document.body
          )
        : null}
      <div className="mt-4 overflow-visible rounded-[14px] border border-[#E8E8EB] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="border-b border-[#EEEEF0] bg-[#F7F7F8] text-left text-xs font-medium uppercase tracking-wide text-[#6F7077]">
            <tr>
              <th className="px-4 py-3 font-medium text-[#6F7077]">Numeris</th>
              <th className="px-4 py-3 font-medium text-[#6F7077]">Gavėjas</th>
              <th className="px-4 py-3 font-medium text-[#6F7077]">Tipas</th>
              <th className="px-4 py-3 font-medium text-[#6F7077]">Vadybininkas</th>
              <th className="px-4 py-3 font-medium text-[#6F7077]">Sukurta</th>
              <th className="px-4 py-3 font-medium text-[#6F7077]">Nuolaida</th>
              <th className="px-4 py-3 font-medium text-[#6F7077]">Būsena</th>
              {showTemplate ? <th className="px-4 py-3 font-medium text-[#6F7077]">Šablonas</th> : null}
              <th className="px-4 py-3 font-medium text-[#6F7077]">Veiksmai</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {visible.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-3 font-medium text-zinc-900">{r.proposal_number ?? "Juodraštis"}</td>
                <td className="px-4 py-3 text-zinc-800">{r.recipient_name || r.client_name || "—"}</td>
                <td className="px-4 py-3 text-zinc-700">{r.recipient_type === "lead" ? "Lead" : "Klientas"}</td>
                <td className="px-4 py-3 text-zinc-700">{r.manager_name ?? "—"}</td>
                <td className="px-4 py-3 text-zinc-700">{formatDate(r.created_at)}</td>
                <td className="px-4 py-3 text-zinc-700">{formatCategoryDiscountsLabel(r.discounts)}</td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${statusChipClass(r.status)}`}
                  >
                    {statusLabel(r.status)}
                  </span>
                </td>
                {showTemplate ? (
                  <td className="px-4 py-3 text-zinc-700">{templateVersionLabel(r.template_version)}</td>
                ) : null}
                <td className="px-4 py-3">
                  <ProposalListActions
                    proposalId={r.id}
                    proposalNumber={r.proposal_number}
                    status={r.status}
                    hasPdf={Boolean(r.pdf_storage_path)}
                    canDelete={r.status === "draft" || canAdmin}
                    menuOpen={openMenuId === r.id}
                    onMenuOpenChange={(open) => setOpenMenuId(open ? r.id : null)}
                    onDeleted={() => {
                      setOpenMenuId(null);
                      setHiddenIds((prev) => (prev.includes(r.id) ? prev : [...prev, r.id]));
                      setToast({ kind: "ok", text: "✓ Pasiūlymas ištrintas." });
                      router.refresh();
                    }}
                    onDeleteError={() => {
                      setToast({ kind: "error", text: "Nepavyko ištrinti pasiūlymo." });
                    }}
                  />
                </td>
              </tr>
            ))}
            {visible.length === 0 ? (
              <tr>
                <td colSpan={showTemplate ? 9 : 8} className="px-4 py-8 text-center text-sm text-zinc-500">
                  Komercinių pasiūlymų dar nėra.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </>
  );
}
