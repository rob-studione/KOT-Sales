"use client";

import Link from "next/link";
import type { MouseEvent } from "react";
import { buildProjectDetailHref, type ProjectDetailTab } from "@/lib/crm/projectPageSearchParams";

type Status = "active" | "netinkamas";

/**
 * Aktyvūs / Netinkami perjungimas.
 * Full navigation (`location.assign`) — soft-nav + live search debounce
 * anksčiau grąžindavo atgal į `candidateStatus=netinkamas`.
 */
export function CandidatesListStatusToggle({
  projectId,
  currentStatus,
  q,
  period,
  from,
  to,
  pageSize,
}: {
  projectId: string;
  currentStatus: Status;
  q?: string;
  period?: string;
  from?: string;
  to?: string;
  pageSize?: number;
}) {
  const tab: ProjectDetailTab = "kandidatai";
  const base = {
    tab,
    page: 0 as const,
    ...(period ? { period } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    ...(pageSize && pageSize !== 20 ? { pageSize } : {}),
    ...(q ? { q } : {}),
  };

  const hrefActive = buildProjectDetailHref(projectId, {
    ...base,
    candidateStatus: "active",
  });
  const hrefNetinkamas = buildProjectDetailHref(projectId, {
    ...base,
    candidateStatus: "netinkamas",
  });

  const go = (href: string) => (e: MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    window.location.assign(href);
  };

  return (
    <div className="inline-flex h-10 items-center overflow-hidden rounded-md border border-zinc-200 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <Link
        prefetch={false}
        href={hrefActive}
        onClick={go(hrefActive)}
        className={[
          "inline-flex h-full min-w-[6.5rem] items-center justify-center px-4 text-sm font-medium transition-colors",
          currentStatus === "active" ? "bg-[#7C4A57] text-white" : "text-zinc-700 hover:bg-zinc-50",
        ].join(" ")}
      >
        Aktyvūs
      </Link>
      <Link
        prefetch={false}
        href={hrefNetinkamas}
        onClick={go(hrefNetinkamas)}
        className={[
          "inline-flex h-full min-w-[6.5rem] items-center justify-center border-l border-zinc-200 px-4 text-sm font-medium transition-colors",
          currentStatus === "netinkamas" ? "bg-[#7C4A57] text-white" : "text-zinc-700 hover:bg-zinc-50",
        ].join(" ")}
      >
        Netinkami
      </Link>
    </div>
  );
}
