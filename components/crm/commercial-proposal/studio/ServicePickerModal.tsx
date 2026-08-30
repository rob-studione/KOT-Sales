"use client";

import { useEffect, useRef, useState } from "react";
import { CATEGORY_LABEL, matchesQuery } from "@/components/crm/commercial-proposal/studio/shared";
import { getFocusable, lockStudioScroll } from "@/components/crm/commercial-proposal/studio/lockStudioScroll";
import { isLineIncluded } from "@/lib/commercialProposal/discounts";
import type { CommercialProposalLine, CpPriceCategory } from "@/lib/commercialProposal/types";

export function ServicePickerModal({
  category,
  rows,
  readOnly,
  pending,
  returnFocusTo,
  onClose,
  onSetIncluded,
}: {
  category: CpPriceCategory;
  rows: CommercialProposalLine[];
  readOnly: boolean;
  pending: boolean;
  returnFocusTo: HTMLElement | null;
  onClose: () => void;
  onSetIncluded: (ids: string[], included: boolean) => void;
}) {
  const [q, setQ] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const filtered = rows.filter((r) => matchesQuery(r.label, q));
  const selected = rows.filter(isLineIncluded).length;
  const filteredSelected = filtered.filter(isLineIncluded).length;
  const searching = q.trim().length > 0;

  useEffect(() => {
    const unlock = lockStudioScroll();
    const dialog = dialogRef.current;
    const previouslyFocused = returnFocusTo;
    const id = window.requestAnimationFrame(() => {
      const input = dialog?.querySelector<HTMLInputElement>("input[type='search'], input:not([type='checkbox'])");
      (input ?? getFocusable(dialog!)[0])?.focus();
    });

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        closeRef.current();
        return;
      }
      if (e.key !== "Tab" || !dialog) return;
      const nodes = getFocusable(dialog);
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKey, true);
    return () => {
      window.cancelAnimationFrame(id);
      document.removeEventListener("keydown", onKey, true);
      unlock();
      previouslyFocused?.focus();
    };
  }, [returnFocusTo]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="service-picker-title"
        className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-[16px] border border-[#E8E8EB] bg-white shadow-[0_8px_24px_rgba(0,0,0,0.08)]"
      >
        <div className="flex items-start justify-between gap-3 border-b border-[#EEEEF0] bg-white px-4 py-3">
          <div>
            <div id="service-picker-title" className="text-[15px] font-semibold text-[#17171B]">
              {CATEGORY_LABEL[category]}
            </div>
            <div className="text-[12px] tabular-nums text-[#6F7077]">
              {selected} / {rows.length}
              {searching ? ` · ${filtered.length} rodomos` : ""}
            </div>
          </div>
          <button type="button" className="text-sm text-[#6F7077] hover:underline" onClick={onClose}>
            Uždaryti
          </button>
        </div>
        <div className="space-y-3 border-b border-[#EEEEF0] bg-white px-4 py-3">
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Paieška…"
            className="h-9 w-full rounded-[10px] border border-[#E8E8EB] px-3 text-sm"
          />
          {!readOnly ? (
            <div className="flex gap-3 text-[12px]">
              <button
                type="button"
                className="font-medium text-[#7C4A57] hover:underline disabled:opacity-50"
                disabled={pending || filtered.length === 0 || filteredSelected === filtered.length}
                onClick={() => onSetIncluded(filtered.map((r) => r.id), true)}
              >
                {searching ? "Pažymėti rodomas" : "Pažymėti visas"}
              </button>
              <button
                type="button"
                className="font-medium text-[#6F7077] hover:underline disabled:opacity-50"
                disabled={pending || filteredSelected === 0}
                onClick={() => onSetIncluded(filtered.map((r) => r.id), false)}
              >
                {searching ? "Nuimti rodomas" : "Nuimti visas"}
              </button>
            </div>
          ) : null}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
          {filtered.map((line) => {
            const included = isLineIncluded(line);
            return (
              <label
                key={line.id}
                className="flex cursor-pointer items-center gap-3 rounded-[10px] px-2 py-2 text-sm hover:bg-[#F7F7F8]"
              >
                <input
                  type="checkbox"
                  checked={included}
                  disabled={readOnly || pending}
                  onChange={(e) => onSetIncluded([line.id], e.target.checked)}
                />
                <span className={included ? "text-[#17171B]" : "text-[#989AA2]"}>{line.label}</span>
              </label>
            );
          })}
          {filtered.length === 0 ? <p className="px-2 py-6 text-center text-sm text-[#6F7077]">Nerasta.</p> : null}
        </div>
      </div>
    </div>
  );
}
