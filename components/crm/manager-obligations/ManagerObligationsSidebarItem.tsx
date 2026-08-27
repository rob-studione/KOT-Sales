"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { useManagerObligations } from "@/components/crm/manager-obligations/useManagerObligations";

const SIDEBAR_ICON_PX = 14;

function formatSidebarBadgeCount(n: number): string {
  if (n > 999) return "999+";
  return String(n);
}

export function ManagerObligationsSidebarItem({
  userId,
  itemBase,
  itemInactive,
  itemActive,
}: {
  userId: string;
  itemBase: string;
  itemInactive: string;
  itemActive: string;
}) {
  const pathname = usePathname();
  const { counts, hasOverdue } = useManagerObligations(userId);
  const active = pathname === "/neatlikta";

  if (counts.total === 0) return null;

  return (
    <div className="pb-1.5">
      <Link
        href="/neatlikta"
        className={`${itemBase} ${active ? itemActive : itemInactive}`}
        aria-live="polite"
      >
        {active ? (
          <span className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-full bg-white" aria-hidden />
        ) : null}
        <AlertCircle
          size={SIDEBAR_ICON_PX}
          strokeWidth={1.5}
          className={hasOverdue ? "shrink-0 text-red-300" : "shrink-0 text-white/65"}
          aria-hidden
        />
        <span className="min-w-0 flex-1 truncate">Neatlikta</span>
        <span
          className={`ml-auto shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold tabular-nums leading-none text-white ${
            hasOverdue ? "bg-red-500/85" : "bg-white/20"
          }`}
        >
          {formatSidebarBadgeCount(counts.total)}
        </span>
      </Link>
    </div>
  );
}
