"use client";

import { AlertCircle } from "lucide-react";
import { useState } from "react";
import { ManagerObligationsDrawer } from "@/components/crm/manager-obligations/ManagerObligationsDrawer";
import { useManagerObligations } from "@/components/crm/manager-obligations/useManagerObligations";
import type { ManagerObligationKind } from "@/lib/crm/managerObligations";

const SIDEBAR_ICON_PX = 14;

function formatSidebarBadgeCount(n: number): string {
  if (n > 999) return "999+";
  return String(n);
}

export function ManagerObligationsSidebarItem({
  userId,
  itemBase,
  itemInactive,
}: {
  userId: string;
  itemBase: string;
  itemInactive: string;
}) {
  const { items, counts, hasOverdue } = useManagerObligations(userId);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [filterKind, setFilterKind] = useState<ManagerObligationKind | null>(null);

  if (counts.total === 0) return null;

  function openDrawer(kind: ManagerObligationKind | null) {
    setFilterKind(kind);
    setDrawerOpen(true);
  }

  return (
    <>
      <div className="pb-1.5">
        <button
          type="button"
          onClick={() => openDrawer(null)}
          className={`${itemBase} ${itemInactive} w-full`}
          aria-live="polite"
        >
          <AlertCircle
            size={SIDEBAR_ICON_PX}
            strokeWidth={1.5}
            className={hasOverdue ? "shrink-0 text-red-300" : "shrink-0 text-white/65"}
            aria-hidden
          />
          <span className="min-w-0 flex-1 truncate text-left">Neatlikta</span>
          <span
            className={`ml-auto shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold tabular-nums leading-none text-white ${
              hasOverdue ? "bg-red-500/85" : "bg-white/20"
            }`}
          >
            {formatSidebarBadgeCount(counts.total)}
          </span>
        </button>
      </div>

      <ManagerObligationsDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        items={items}
        filterKind={filterKind}
      />
    </>
  );
}
