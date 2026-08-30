"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { MoreHorizontal } from "lucide-react";
import { duplicateCommercialProposalAction } from "@/lib/crm/commercialProposalActions";
import { commercialProposalPath } from "@/lib/crm/commercialProposalPaths";
import {
  ProposalDeleteControl,
  type ProposalDeleteControlHandle,
} from "@/components/crm/commercial-proposal/ProposalDeleteControl";

const MENU_GAP = 4;
const MENU_PAD = 8;

export function ProposalListActions({
  proposalId,
  proposalNumber,
  status,
  hasPdf,
  canDelete,
  menuOpen,
  onMenuOpenChange,
  onDeleted,
  onDeleteError,
}: {
  proposalId: string;
  proposalNumber: string | null;
  status: string;
  hasPdf: boolean;
  canDelete: boolean;
  menuOpen: boolean;
  onMenuOpenChange: (open: boolean) => void;
  onDeleted: () => void;
  onDeleteError?: (message: string) => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [mounted, setMounted] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const deleteRef = useRef<ProposalDeleteControlHandle>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useLayoutEffect(() => {
    if (!menuOpen) {
      setCoords(null);
      return;
    }
    function place() {
      const btn = btnRef.current;
      const menu = menuRef.current;
      if (!btn || !menu) return;

      const b = btn.getBoundingClientRect();
      const mh = menu.offsetHeight;
      const mw = menu.offsetWidth;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const spaceBelow = vh - b.bottom - MENU_PAD;
      const spaceAbove = b.top - MENU_PAD;
      const openUp = spaceBelow < mh && spaceAbove > spaceBelow;

      let top = openUp ? b.top - mh - MENU_GAP : b.bottom + MENU_GAP;
      top = Math.max(MENU_PAD, Math.min(top, vh - mh - MENU_PAD));

      let left = b.right - mw;
      left = Math.max(MENU_PAD, Math.min(left, vw - mw - MENU_PAD));

      setCoords({ top, left });
    }

    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [menuOpen, mounted]);

  useEffect(() => {
    if (!menuOpen) return;

    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node | null;
      if (!target) return;
      if (btnRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      onMenuOpenChange(false);
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onMenuOpenChange(false);
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen, onMenuOpenChange]);

  const menu =
    menuOpen && mounted ? (
      <div
        ref={menuRef}
        role="menu"
        className="fixed z-[60] min-w-[150px] rounded-lg border border-zinc-200 bg-white py-1 shadow-lg"
        style={{
          top: coords?.top ?? 0,
          left: coords?.left ?? 0,
          visibility: coords ? "visible" : "hidden",
        }}
      >
        <a
          role="menuitem"
          href={
            hasPdf
              ? `/api/crm/commercial-proposals/${proposalId}/pdf`
              : `/api/crm/commercial-proposals/${proposalId}/preview`
          }
          target="_blank"
          rel="noreferrer"
          className="block px-3 py-2 text-sm text-zinc-800 hover:bg-zinc-50"
          onClick={() => onMenuOpenChange(false)}
        >
          PDF
        </a>
        <a
          role="menuitem"
          href={`/api/crm/commercial-proposals/${proposalId}/preview`}
          target="_blank"
          rel="noreferrer"
          className="block px-3 py-2 text-sm text-zinc-800 hover:bg-zinc-50"
          onClick={() => onMenuOpenChange(false)}
        >
          Peržiūrėti
        </a>
        <button
          type="button"
          role="menuitem"
          disabled={pending}
          className="block w-full px-3 py-2 text-left text-sm text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
          onClick={() => {
            onMenuOpenChange(false);
            start(async () => {
              const res = await duplicateCommercialProposalAction(proposalId);
              if (res.ok) router.push(commercialProposalPath(res.id));
            });
          }}
        >
          Dubliuoti
        </button>
        {canDelete ? (
          <button
            type="button"
            role="menuitem"
            className="block w-full border-t border-zinc-100 px-3 py-2 text-left text-sm text-red-700 hover:bg-red-50"
            onClick={() => {
              onMenuOpenChange(false);
              deleteRef.current?.open();
            }}
          >
            Ištrinti
          </button>
        ) : null}
      </div>
    ) : null;

  return (
    <div className="flex items-center justify-end gap-x-1 whitespace-nowrap">
      <Link
        href={commercialProposalPath(proposalId)}
        className="inline-flex h-10 items-center px-1.5 text-[13px] font-medium text-[#7C4A57] hover:underline"
      >
        Atidaryti
      </Link>
      <button
        ref={btnRef}
        type="button"
        className="inline-flex h-10 w-10 items-center justify-center rounded-[8px] text-[#6F7077] hover:bg-[#F7F7F8]"
        aria-label="Daugiau veiksmų"
        title="Daugiau veiksmų"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={() => onMenuOpenChange(!menuOpen)}
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>

      {menu ? createPortal(menu, document.body) : null}

      {canDelete ? (
        <ProposalDeleteControl
          ref={deleteRef}
          proposalId={proposalId}
          proposalNumber={proposalNumber}
          status={status}
          variant="link"
          hideTrigger
          onDeleted={onDeleted}
          onDeleteError={onDeleteError}
        />
      ) : null}
    </div>
  );
}
