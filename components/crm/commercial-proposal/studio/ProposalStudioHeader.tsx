"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, Check, Download, Eye, Loader2, MoreVertical } from "lucide-react";
import { ProposalDeleteControl } from "@/components/crm/commercial-proposal/ProposalDeleteControl";
import { CP_TOOL_PATH } from "@/lib/crm/commercialProposalPaths";
import { statusChipClass, statusLabel } from "@/components/crm/commercial-proposal/studio/shared";

function StudioSaveStatus({
  saving,
  saveError,
  savedLabel,
}: {
  saving: boolean;
  saveError: boolean;
  savedLabel: string | null;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return (
    <div className="hidden min-h-[18px] min-w-[5.5rem] whitespace-nowrap text-[12px] lg:block" aria-live="polite">
      {!mounted ? null : saving ? (
        <span className="inline-flex items-center gap-1 text-[#5C5D64]">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Saugoma…
        </span>
      ) : saveError ? (
        <span className="inline-flex items-center gap-1 text-red-700">
          <AlertCircle className="h-3.5 w-3.5" />
          Nepavyko išsaugoti
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 text-emerald-700">
          <Check className="h-3.5 w-3.5" />
          {savedLabel || "Išsaugota"}
        </span>
      )}
    </div>
  );
}

export function ProposalStudioHeader({
  proposalNumber,
  status,
  recipientName,
  saving,
  saveError,
  savedLabel,
  includedCount,
  pending,
  canDelete,
  readOnly,
  proposalId,
  menuOpen,
  onMenuOpenChange,
  onPreview,
  onDuplicate,
  onDeleted,
  onMarkSent,
  onEditRecipient,
  showEditRecipient,
}: {
  proposalNumber: string | null;
  status: string;
  recipientName: string;
  saving: boolean;
  saveError: boolean;
  savedLabel: string | null;
  includedCount: number;
  pending: boolean;
  canDelete: boolean;
  readOnly: boolean;
  proposalId: string;
  menuOpen: boolean;
  onMenuOpenChange: (open: boolean) => void;
  onPreview: () => void;
  onDuplicate: () => void;
  onDeleted: () => void;
  onMarkSent: () => void;
  onEditRecipient: () => void;
  showEditRecipient: boolean;
}) {
  const isDraft = status === "draft";
  return (
    <header className="shrink-0 border-b border-[#E8E8EB] bg-[#F7F7F8] px-1 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <Link href={CP_TOOL_PATH} className="shrink-0 text-[12px] text-[#5C5D64] hover:underline">
              ← Pasiūlymai
            </Link>
            <h1 className="truncate text-base font-semibold tracking-tight text-[#17171B]">
              {proposalNumber || "Komercinis pasiūlymas"}
            </h1>
            <span
              className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${statusChipClass(status)}`}
            >
              {statusLabel(status)}
            </span>
          </div>
          <div className="mt-0.5 flex min-w-0 items-center gap-2">
            <p className="truncate text-[13px] text-[#5C5D64]">{recipientName || "—"}</p>
            {showEditRecipient ? (
              <button
                type="button"
                className="shrink-0 text-[12px] font-medium text-[#7C4A57] hover:underline"
                title="Keisti gavėją"
                aria-label="Keisti gavėją"
                onClick={onEditRecipient}
              >
                Keisti gavėją
              </button>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 flex-nowrap items-center gap-3">
          <StudioSaveStatus saving={saving} saveError={saveError} savedLabel={savedLabel} />
          <button
            type="button"
            disabled={includedCount === 0}
            className="inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-[#E8E8EB] bg-white px-3 text-sm font-medium text-[#17171B] hover:bg-zinc-50 disabled:opacity-50"
            onClick={onPreview}
          >
            <Eye className="h-4 w-4" />
            <span className="hidden sm:inline">Atidaryti PDF</span>
            <span className="sm:hidden">PDF</span>
          </button>
          {isDraft ? null : (
            <>
              <a
                className="inline-flex h-9 items-center rounded-[10px] border border-[#E8E8EB] bg-white px-3 text-sm font-medium text-[#17171B] hover:bg-zinc-50"
                href={`/api/crm/commercial-proposals/${proposalId}/pdf`}
                target="_blank"
                rel="noreferrer"
              >
                Atidaryti
              </a>
              <a
                className="inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-[#7C4A57] px-3.5 text-sm font-medium text-white hover:bg-[#693948]"
                href={`/api/crm/commercial-proposals/${proposalId}/pdf?download=1`}
              >
                <Download className="h-4 w-4" />
                Atsisiųsti
              </a>
              {status === "generated" ? (
                <button
                  type="button"
                  className="inline-flex h-9 items-center rounded-[10px] border border-[#E8E8EB] bg-white px-3 text-sm font-medium text-[#17171B] hover:bg-zinc-50"
                  onClick={onMarkSent}
                >
                  Pažymėti kaip išsiųstą
                </button>
              ) : null}
            </>
          )}

          <div className="relative">
            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] border border-[#E8E8EB] bg-white text-[#5C5D64] hover:bg-zinc-50"
              aria-label="Daugiau veiksmų"
              onClick={() => onMenuOpenChange(!menuOpen)}
            >
              <MoreVertical className="h-4 w-4" />
            </button>
            {menuOpen ? (
              <div
                role="menu"
                className="absolute right-0 z-30 mt-1 min-w-[160px] rounded-[12px] border border-[#E8E8EB] bg-white py-1 shadow-[0_8px_24px_rgba(0,0,0,0.06)]"
              >
                <button
                  type="button"
                  role="menuitem"
                  disabled={pending}
                  className="block w-full px-3 py-2 text-left text-sm text-[#17171B] hover:bg-zinc-50 disabled:opacity-50"
                  onClick={onDuplicate}
                >
                  Dubliuoti
                </button>
                {canDelete ? (
                  <div className="border-t border-[#E8E8EB] px-3 py-2">
                    <ProposalDeleteControl
                      proposalId={proposalId}
                      proposalNumber={proposalNumber}
                      status={status}
                      variant="link"
                      onDeleted={onDeleted}
                    />
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
}
