"use client";

import { useEffect, useRef, useState } from "react";
import { ProposalCreateClient } from "@/components/crm/commercial-proposal/ProposalCreateClient";
import { getFocusable, lockStudioScroll } from "@/components/crm/commercial-proposal/studio/lockStudioScroll";

export function NewProposalButton() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const unlock = lockStudioScroll();
    const dialog = dialogRef.current;
    const id = window.requestAnimationFrame(() => {
      dialog?.querySelector<HTMLInputElement>("input")?.focus();
    });
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        const nested = (e.target as HTMLElement | null)?.closest("[aria-modal='true']");
        if (nested && nested !== dialog) return;
        e.preventDefault();
        setOpen(false);
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
      triggerRef.current?.focus();
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="inline-flex h-10 shrink-0 items-center rounded-[10px] bg-[#7C4A57] px-4 text-sm font-medium text-white hover:bg-[#693948]"
        onClick={() => setOpen(true)}
      >
        Naujas pasiūlymas
      </button>
      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-proposal-title"
            className="w-full max-w-xl rounded-[16px] border border-[#E8E8EB] bg-white p-5 shadow-[0_8px_24px_rgba(0,0,0,0.08)]"
          >
            <h2 id="new-proposal-title" className="text-[18px] font-semibold text-[#17171B]">
              Naujas pasiūlymas
            </h2>
            <p className="mt-1 text-[13px] text-[#6F7077]">Pirmiausia pasirinkite gavėją — esamą klientą arba leadą.</p>
            <div className="mt-4">
              <ProposalCreateClient asDialog onCancel={() => setOpen(false)} />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
