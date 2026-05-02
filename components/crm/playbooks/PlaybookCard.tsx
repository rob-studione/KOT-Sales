"use client";

import Link from "next/link";
import { MoreVertical } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { normalizePlaybookStatus, playbookStatusBadgeClasses, playbookStatusLabel } from "@/lib/crm/playbooks/playbookStatus";
import type { PlaybookListRow } from "./playbookListTypes";

export default function PlaybookCard({
  row,
  onDeleteClick,
  onDuplicateClick,
  duplicatePending,
}: {
  row: PlaybookListRow;
  onDeleteClick: (row: PlaybookListRow) => void;
  onDuplicateClick: (row: PlaybookListRow) => void;
  duplicatePending: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onDocMouseDown(e: MouseEvent) {
      const el = menuWrapRef.current;
      if (el && !el.contains(e.target as Node)) setMenuOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const desc = row.description?.trim() || null;
  const pbStatus = normalizePlaybookStatus(row.status);
  const canRun = pbStatus === "active";
  return (
    <div className="group relative rounded-xl border border-zinc-200/90 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.05),0_2px_12px_-4px_rgba(15,23,42,0.08)] transition-all duration-200 hover:border-zinc-300/90 hover:bg-white hover:shadow-[0_4px_20px_-6px_rgba(15,23,42,0.12)]">
      <div className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="min-w-0 text-lg font-semibold tracking-tight text-zinc-900 group-hover:text-zinc-800">
              {row.name}
            </h2>
            <span
              className={[
                "mt-2 inline-flex rounded-md px-2 py-0.5 text-xs font-semibold uppercase tracking-wide",
                playbookStatusBadgeClasses(pbStatus),
              ].join(" ")}
            >
              {playbookStatusLabel(pbStatus)}
            </span>
          </div>
        </div>

        <p className={`mt-2 text-sm leading-relaxed ${desc ? "text-zinc-600" : "text-zinc-400 italic"}`}>
          {desc || "Be aprašymo"}
        </p>

        <div className="mt-5 flex flex-wrap items-center justify-end gap-2 border-t border-zinc-100 pt-4">
          <Link
            href={`/scenarijai/${row.id}/edit`}
            className="inline-flex items-center justify-center rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-800 shadow-sm transition-colors hover:border-zinc-300 hover:bg-zinc-50"
          >
            Redaguoti
          </Link>
          {canRun ? (
            <Link
              href={`/scenarijai/${row.id}/run`}
              className="inline-flex items-center justify-center rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm ring-1 ring-zinc-900/10 transition-colors hover:bg-zinc-800"
            >
              Paleisti
            </Link>
          ) : (
            <span
              title="Paleisti galima tik aktyviems scenarijams."
              className="inline-flex cursor-not-allowed items-center justify-center rounded-lg bg-zinc-200 px-4 py-2.5 text-sm font-semibold text-zinc-500 ring-1 ring-zinc-200/80"
            >
              Paleisti
            </span>
          )}

          <div className="relative" ref={menuWrapRef}>
            <button
              type="button"
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              aria-label="Daugiau veiksmų"
              onClick={() => setMenuOpen((o) => !o)}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800"
            >
              <MoreVertical size={18} strokeWidth={1.5} aria-hidden />
            </button>
            {menuOpen ? (
              <div
                role="menu"
                className="absolute right-0 top-full z-20 mt-1 min-w-[11rem] rounded-lg border border-zinc-200/90 bg-white py-1 shadow-[0_8px_24px_-8px_rgba(15,23,42,0.2)]"
              >
                <button
                  type="button"
                  role="menuitem"
                  disabled={duplicatePending}
                  className={[
                    "flex w-full items-center px-3 py-2 text-left text-sm font-medium text-zinc-700 transition-colors",
                    duplicatePending ? "cursor-wait text-zinc-400" : "hover:bg-zinc-50",
                  ].join(" ")}
                  onClick={() => {
                    onDuplicateClick(row);
                    setMenuOpen(false);
                  }}
                >
                  {duplicatePending ? "Dubliuojama…" : "Dubliuoti"}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center px-3 py-2 text-left text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
                  onClick={() => {
                    onDeleteClick(row);
                    setMenuOpen(false);
                  }}
                >
                  Šalinti
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
