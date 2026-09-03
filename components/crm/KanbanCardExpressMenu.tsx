"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MoreHorizontal } from "lucide-react";
import type { ExpressProposalState } from "@/lib/crm/expressProposal";

function labelForState(state: ExpressProposalState): string {
  if (state === "draft") return "Tęsti pasiūlymą";
  if (state === "generated") return "Atidaryti pasiūlymą";
  return "Kurti komercinį pasiūlymą";
}

export function KanbanCardExpressMenu({
  state,
  onAction,
}: {
  state: ExpressProposalState;
  onAction: (trigger: HTMLButtonElement) => void;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setCoords(null);
      return;
    }
    function place() {
      const btn = btnRef.current;
      const menu = menuRef.current;
      if (!btn || !menu) return;
      const b = btn.getBoundingClientRect();
      const mw = menu.offsetWidth;
      const mh = menu.offsetHeight;
      const top = Math.min(b.bottom + 4, window.innerHeight - mh - 8);
      const left = Math.max(8, Math.min(b.right - mw, window.innerWidth - mw - 8));
      setCoords({ top: Math.max(8, top), left });
    }
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, mounted]);

  useEffect(() => {
    if (!open) return;
    const item = menuRef.current?.querySelector("[role=\"menuitem\"]");
    if (item instanceof HTMLElement) item.focus();
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node | null;
      if (!target) return;
      if (btnRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
        btnRef.current?.focus();
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const menu =
    open && mounted ? (
      <div
        ref={menuRef}
        role="menu"
        className="fixed z-[60] min-w-[220px] overflow-hidden rounded-[12px] border border-[#E8E8EB] bg-white py-1 shadow-[0_8px_24px_rgba(0,0,0,0.08)]"
        style={{
          top: coords?.top ?? 0,
          left: coords?.left ?? 0,
          visibility: coords ? "visible" : "hidden",
        }}
      >
        <button
          type="button"
          role="menuitem"
          className="block w-full px-3 py-2 text-left text-[13px] text-[#17171B] outline-none hover:bg-[#F7F7F8] focus-visible:bg-[#F7F7F8] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#7C4A57]"
          onClick={() => {
            setOpen(false);
            if (btnRef.current) onAction(btnRef.current);
          }}
        >
          {labelForState(state)}
        </button>
      </div>
    ) : null;

  return (
    <div
      className="shrink-0"
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <button
        ref={btnRef}
        type="button"
        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 outline-none hover:bg-zinc-100 hover:text-zinc-700 focus-visible:ring-2 focus-visible:ring-[#7C4A57] focus-visible:ring-offset-2"
        aria-label="Daugiau veiksmų"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          setOpen((v) => !v);
        }}
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {menu ? createPortal(menu, document.body) : null}
    </div>
  );
}
