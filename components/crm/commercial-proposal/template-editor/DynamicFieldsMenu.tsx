"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Braces, ChevronDown } from "lucide-react";
import { CP_TEMPLATE_VARIABLES } from "@/lib/commercialProposal/content";

export function DynamicFieldsMenu() {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
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
      const vh = window.innerHeight;
      const vw = window.innerWidth;
      const top = Math.min(b.bottom + 4, vh - menu.offsetHeight - 8);
      const left = Math.max(8, Math.min(b.right - mw, vw - mw - 8));
      setCoords({ top, left });
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

    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node | null;
      if (!target) return;
      if (btnRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  async function copyToken(key: string) {
    const token = `{{${key}}}`;
    try {
      await navigator.clipboard.writeText(token);
      setCopied(key);
      window.setTimeout(() => setCopied((current) => (current === key ? null : current)), 1200);
    } catch {
      setCopied(null);
    }
  }

  const menu =
    open && mounted ? (
      <div
        ref={menuRef}
        role="dialog"
        aria-label="Galimi dinaminiai laukai"
        className="fixed z-[60] w-[min(calc(100vw-48px),320px)] overflow-hidden rounded-[12px] border border-[#E8E8EB] bg-white py-1 shadow-[0_8px_24px_rgba(0,0,0,0.08)]"
        style={{
          top: coords?.top ?? 0,
          left: coords?.left ?? 0,
          visibility: coords ? "visible" : "hidden",
        }}
      >
        <ul>
          {CP_TEMPLATE_VARIABLES.map((v) => {
            const token = `{{${v.key}}}`;
            return (
              <li key={v.key} className="flex items-center gap-2 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] text-[#17171B]">{v.label}</div>
                  <code className="block truncate text-[11px] text-[#6F7077]">{token}</code>
                </div>
                <button
                  type="button"
                  className="shrink-0 rounded-[6px] px-2 py-1 text-[12px] font-medium text-[#7C4A57] hover:bg-[#F7EEF0]"
                  onClick={() => void copyToken(v.key)}
                >
                  {copied === v.key ? "Nukopijuota" : "Kopijuoti"}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    ) : null;

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        className={[
          "inline-flex h-8 items-center gap-1.5 rounded-[8px] border px-2.5 text-[12px] font-medium",
          open
            ? "border-[#7C4A57]/20 bg-[#F7EEF0] text-[#7C4A57]"
            : "border-[#E8E8EB] bg-white text-[#5C5D64] hover:bg-[#F7F7F8]",
        ].join(" ")}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((v) => !v)}
      >
        <Braces className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>Dinaminiai laukai</span>
        <ChevronDown
          className={["h-3.5 w-3.5 shrink-0 transition-transform", open ? "rotate-180" : ""].join(" ")}
          aria-hidden
        />
      </button>
      {menu ? createPortal(menu, document.body) : null}
    </div>
  );
}
