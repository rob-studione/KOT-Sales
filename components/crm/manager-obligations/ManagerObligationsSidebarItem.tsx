"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AlertCircle, ChevronDown } from "lucide-react";
import { useManagerObligations } from "@/components/crm/manager-obligations/useManagerObligations";
import {
  formatManagerObligationProjectSummary,
  groupManagerObligationsByProject,
} from "@/lib/crm/managerObligations";

const SIDEBAR_ICON_PX = 14;
const SUBMENU_MS = "duration-[180ms]";
const SUBMENU_EASE = "ease-out";

function formatSidebarBadgeCount(n: number): string {
  if (n > 999) return "999+";
  return String(n);
}

export function ManagerObligationsSidebarItem({
  userId,
  headerBase,
  submenuItemBase,
  itemInactive,
}: {
  userId: string;
  headerBase: string;
  submenuItemBase: string;
  itemInactive: string;
}) {
  const { items, counts, hasOverdue } = useManagerObligations(userId);
  const [expanded, setExpanded] = useState(false);
  const projects = useMemo(() => groupManagerObligationsByProject(items), [items]);

  if (counts.total === 0) return null;

  return (
    <div className="rounded-lg pb-1.5">
      <div
        className={[
          headerBase,
          SUBMENU_MS,
          expanded || hasOverdue ? "bg-white/12 text-white" : "text-white/90 hover:bg-white/10 hover:text-white",
        ].join(" ")}
      >
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-md text-left text-inherit focus:outline-none"
          aria-expanded={expanded}
        >
          <AlertCircle
            size={SIDEBAR_ICON_PX}
            strokeWidth={1.5}
            className={hasOverdue ? "shrink-0 text-red-300" : "shrink-0 text-white/65"}
            aria-hidden
          />
          <span className="min-w-0 flex-1 truncate">Neatlikta</span>
          <span
            className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold tabular-nums leading-none text-white ${
              hasOverdue ? "bg-red-500/85" : "bg-white/20"
            }`}
          >
            {formatSidebarBadgeCount(counts.total)}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-label={expanded ? "Suskleisti" : "Išskleisti"}
          className="shrink-0 rounded-md p-1.5 text-white/80 hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/35"
        >
          <ChevronDown
            size={SIDEBAR_ICON_PX}
            strokeWidth={1.75}
            className={[
              "text-white/70 transition-transform",
              SUBMENU_MS,
              SUBMENU_EASE,
              expanded ? "rotate-180" : "rotate-0",
            ].join(" ")}
            aria-hidden
          />
        </button>
      </div>

      <div
        className={[
          "grid transition-[grid-template-rows] motion-reduce:transition-none",
          SUBMENU_MS,
          SUBMENU_EASE,
          expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        ].join(" ")}
      >
        <div className="min-h-0 overflow-hidden">
          <ul className="flex flex-col gap-0.5 pb-1.5 pl-1 pt-0.5">
            {projects.map((row) => (
              <li key={row.projectId}>
                <Link
                  href={row.href}
                  className={`${submenuItemBase} ${itemInactive} min-w-0 flex-col items-start gap-0 py-2`}
                >
                  <span className="w-full truncate">{row.projectName}</span>
                  <span
                    className={`mt-0.5 w-full truncate text-[10px] leading-3 ${
                      row.hasOverdue ? "text-red-200/90" : "text-white/55"
                    }`}
                  >
                    {formatManagerObligationProjectSummary(row)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
