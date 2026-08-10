"use client";

import Link from "next/link";
import { formatDate } from "@/lib/crm/format";
import type { ClientProjectHistoryEntry } from "@/lib/crm/findMatchingExistingClient";

export function ClientProjectHistoryList({
  history,
  emptyText = "Kituose projektuose dar nebuvo paimtas į darbą.",
}: {
  history: ClientProjectHistoryEntry[];
  emptyText?: string;
}) {
  if (!history.length) {
    return <p className="mt-3 text-xs text-zinc-500">{emptyText}</p>;
  }
  return (
    <div className="mt-3">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Buvo projektuose</p>
      <ul className="mt-1.5 space-y-2">
        {history.map((h) => (
          <li key={`${h.project_id}-${h.work_item_id}`} className="rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2 text-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
              <Link href={h.href} className="font-medium text-[#7C4A57] hover:underline" target="_blank" rel="noreferrer">
                {h.project_name}
              </Link>
              <span className="tabular-nums text-xs text-zinc-500">{formatDate(h.last_activity_at ?? h.picked_at)}</span>
            </div>
            <p className="mt-0.5 text-xs text-zinc-600">
              {h.result_label}
              {h.last_action_summary ? ` · ${h.last_action_summary}` : null}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
