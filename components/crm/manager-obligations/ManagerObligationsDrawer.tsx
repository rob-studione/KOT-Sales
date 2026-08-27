"use client";

import Link from "next/link";
import { useEffect, useMemo } from "react";
import { formatDate } from "@/lib/crm/format";
import type { ManagerObligationItem, ManagerObligationKind } from "@/lib/crm/managerObligations";

const KIND_LABEL: Record<ManagerObligationKind, string> = {
  urgent: "Skubus veiksmas",
  callback: "Neperskambinta",
  email: "Siųsti laišką",
  commercial: "Siųsti komercinį",
};

function detailLine(item: ManagerObligationItem): string {
  if (item.kind === "callback") {
    return item.workingDaysOverdue === 1
      ? "1 darbo diena vėluoja"
      : `${item.workingDaysOverdue} darbo dienos vėluoja`;
  }
  if (item.tone === "overdue" && item.dueDate) {
    return `Planuota ${formatDate(item.dueDate)}`;
  }
  if (item.kind === "email" || item.kind === "commercial") {
    return "Šiandien iki 18:00 — patvirtinkite lentoje";
  }
  return item.dueDate ? `Planuota ${formatDate(item.dueDate)}` : "";
}

export function ManagerObligationsDrawer({
  open,
  onClose,
  items,
  filterKind,
}: {
  open: boolean;
  onClose: () => void;
  items: ManagerObligationItem[];
  filterKind: ManagerObligationKind | null;
}) {
  const visible = useMemo(() => {
    if (!filterKind) return items;
    return items.filter((i) => i.kind === filterKind);
  }, [items, filterKind]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const title = filterKind ? KIND_LABEL[filterKind] : "Neatlikti įsipareigojimai";

  return (
    <div className="fixed inset-0 z-[70] flex justify-end">
      <button type="button" className="absolute inset-0 bg-black/30" aria-label="Uždaryti" onClick={onClose} />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="obligations-drawer-title"
        className="relative flex h-full w-full max-w-md flex-col border-l border-zinc-200 bg-white shadow-xl"
      >
        <div className="flex items-start justify-between border-b border-zinc-100 px-4 py-3">
          <div>
            <h2 id="obligations-drawer-title" className="text-base font-semibold text-zinc-900">
              {title}
            </h2>
            <p className="mt-0.5 text-xs text-zinc-500">
              {visible.length === 0
                ? "Nėra įrašų šioje kategorijoje."
                : `${visible.length} ${visible.length === 1 ? "kortelė" : "kortelės"} — atnaujinkite Kanban lentoje.`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
          >
            ✕
          </button>
        </div>

        <ul className="min-h-0 flex-1 overflow-y-auto divide-y divide-zinc-100">
          {visible.map((item) => (
            <li key={item.workItemId}>
              <Link
                href={item.href}
                onClick={onClose}
                className="block px-4 py-3 transition-colors hover:bg-zinc-50"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-zinc-900">{item.clientName}</p>
                    <p className="mt-0.5 truncate text-xs text-zinc-500">{item.projectName}</p>
                    <p className="mt-1 text-xs text-zinc-600">{detailLine(item)}</p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                      item.tone === "overdue" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-900"
                    }`}
                  >
                    {KIND_LABEL[item.kind]}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
