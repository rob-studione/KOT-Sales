"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { ProposalListActions } from "@/components/crm/commercial-proposal/ProposalListActions";
import { RecipientTypeBadge } from "@/components/crm/commercial-proposal/RecipientSelector";
import { recipientInitials, statusChipClass, statusLabel } from "@/components/crm/commercial-proposal/studio/shared";
import { formatCategoryDiscountsLabel } from "@/lib/commercialProposal/uiLabels";
import { formatDate } from "@/lib/crm/format";
import type { ProposalListRow } from "@/lib/crm/commercialProposalActions";
import { CP_TOOL_PATH } from "@/lib/crm/commercialProposalPaths";

const SUCCESS_TOAST_MS = 3000;
const ERROR_TOAST_MS = 5000;

type ListToast = { kind: "ok" | "error"; text: string };

function recipientDisplay(row: ProposalListRow): { name: string; company: string | null } {
  const companyName = (row.recipient_name || row.client_name || "").trim();
  const contact = (row.contact_name || "").trim();
  if (contact && contact !== companyName) {
    return { name: contact, company: companyName || null };
  }
  return { name: companyName || "—", company: null };
}

function RecipientCell({ row }: { row: ProposalListRow }) {
  const { name, company } = recipientDisplay(row);
  return (
    <div data-recipient-cell="cell">
      <span
        aria-hidden
        data-recipient-avatar="avatar"
        className="rounded-full bg-[#F7EEF0] text-[11px] font-semibold text-[#7C4A57]"
      >
        {recipientInitials(name)}
      </span>
      <div data-recipient-identity="identity">
        <div data-recipient-line="line">
          <span data-recipient-name="name" className="text-[13px] font-semibold text-[#17171B]" title={name}>
            {name}
          </span>
          <span data-recipient-badge="badge">
            <RecipientTypeBadge type={row.recipient_type === "lead" ? "lead" : "client"} />
          </span>
        </div>
        {company ? (
          <span className="mt-0.5 block truncate text-[12px] text-[#6F7077]" title={company}>
            {company}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export function CommercialProposalList({
  rows,
  canAdmin,
  showDeletedToast = false,
  searchQuery = "",
}: {
  rows: ProposalListRow[];
  canAdmin: boolean;
  showDeletedToast?: boolean;
  searchQuery?: string;
}) {
  const router = useRouter();
  const [hiddenIds, setHiddenIds] = useState<string[]>([]);
  const [toast, setToast] = useState<ListToast | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const visible = useMemo(() => rows.filter((r) => !hiddenIds.includes(r.id)), [rows, hiddenIds]);

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

  const emptyMessage = searchQuery.trim()
    ? "Pagal paiešką pasiūlymų nerasta."
    : "Komercinių pasiūlymų dar nėra.";

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
      <div className="overflow-x-auto">
        <table data-proposal-table="table" className="w-full text-sm">
          <colgroup>
            <col data-col="proposal" />
            <col data-col="recipient" />
            <col data-col="manager" />
            <col data-col="created" />
            <col data-col="discounts" />
            <col data-col="spacer" />
            <col data-col="status" />
            <col data-col="actions" />
          </colgroup>
          <thead className="border-b border-[#E8E8EB] bg-[#FBFBFB] text-left text-[11px] font-medium uppercase tracking-wide text-[#6F7077]">
            <tr>
              <th className="px-4 py-2.5 font-medium">Pasiūlymas</th>
              <th className="px-4 py-2.5 font-medium">Gavėjas</th>
              <th className="hidden px-4 py-2.5 font-medium xl:table-cell">Rengėjas</th>
              <th className="hidden px-4 py-2.5 font-medium min-[1600px]:table-cell">Sukurta</th>
              <th className="hidden px-4 py-2.5 font-medium min-[1600px]:table-cell">Nuolaidos</th>
              <th aria-hidden className="hidden p-0 min-[1920px]:table-cell" />
              <th className="px-4 py-2.5 font-medium">Būsena</th>
              <th className="px-4 py-2.5 font-medium">
                <span className="sr-only">Veiksmai</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EEEEF0]">
            {visible.map((r) => {
              const discountLabel = formatCategoryDiscountsLabel(r.discounts);
              const hasDiscount = discountLabel !== "Be nuolaidų";
              return (
                <tr key={r.id} className="h-[70px] hover:bg-[#FBF7F8]">
                  <td className="px-4 align-middle">
                    {r.proposal_number ? (
                      <span className="font-semibold text-[#17171B]">{r.proposal_number}</span>
                    ) : (
                      <span className="text-[13px] text-[#6F7077]">Dar nesugeneruotas</span>
                    )}
                  </td>
                  <td className="min-w-0 px-4 align-middle">
                    <RecipientCell row={r} />
                  </td>
                  <td className="hidden px-4 align-middle xl:table-cell">
                    <span className="block truncate text-[13px] text-[#5C5D64]" title={r.manager_name ?? undefined}>
                      {r.manager_name ?? "—"}
                    </span>
                  </td>
                  <td className="hidden whitespace-nowrap px-4 align-middle text-[13px] text-[#6F7077] min-[1600px]:table-cell">
                    {formatDate(r.created_at)}
                  </td>
                  <td className="hidden px-4 align-middle min-[1600px]:table-cell">
                    <span
                      className={["block truncate text-[13px]", hasDiscount ? "text-[#7C4A57]" : "text-[#6F7077]"].join(" ")}
                      title={discountLabel}
                    >
                      {discountLabel}
                    </span>
                  </td>
                  <td aria-hidden className="hidden p-0 min-[1920px]:table-cell" />
                  <td className="whitespace-nowrap px-4 align-middle">
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${statusChipClass(r.status)}`}
                    >
                      {statusLabel(r.status)}
                    </span>
                  </td>
                  <td className="px-4 align-middle">
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
              );
            })}
            {visible.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-[13px] text-[#6F7077]">
                  {emptyMessage}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </>
  );
}
