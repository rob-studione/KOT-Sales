"use client";

import { useState } from "react";
import { formatMoney } from "@/lib/crm/format";

export type InvoiceBreakdownRow = {
  invoiceNumber: string;
  date: string;
  amount: number;
  clientKey: string;
  companyName: string | null;
};

const DEFAULT_PREVIEW_ROWS = 10;

export function InvoicesBreakdownTable({
  rows,
  title,
  className,
  previewRows = DEFAULT_PREVIEW_ROWS,
}: {
  rows: InvoiceBreakdownRow[];
  title: string;
  className?: string;
  /** Kiek eilučių matyti prieš „Rodyti daugiau“ (ir expand viewport aukštis). */
  previewRows?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const preview = Math.max(1, Math.floor(previewRows));
  /** ~eilutės aukštis + thead; expand'inus scroll'inama šiame rėmelyje. */
  const expandedMaxHeightStyle = { maxHeight: `${Math.max(preview * 1.75 + 2, 10)}rem` };

  if (rows.length === 0) return null;

  const canExpand = rows.length > preview;
  const shown = expanded || !canExpand ? rows : rows.slice(0, preview);

  return (
    <div className={className}>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <div className="text-[11px] font-medium text-zinc-500">{title}</div>
        {canExpand ? (
          <div className="text-[11px] tabular-nums text-zinc-400">
            {expanded ? rows.length : preview} / {rows.length}
          </div>
        ) : null}
      </div>
      <div
        className={
          expanded && canExpand
            ? "overflow-auto rounded-md border border-zinc-200 bg-white"
            : "overflow-x-auto rounded-md border border-zinc-200 bg-white"
        }
        style={expanded && canExpand ? expandedMaxHeightStyle : undefined}
      >
        <table className="min-w-full text-[11px]">
          <thead className="sticky top-0 z-10 border-b border-zinc-100 bg-zinc-50 text-left font-medium uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-2.5 py-1.5">Sąskaitos Nr.</th>
              <th className="px-2.5 py-1.5">Įmonė</th>
              <th className="px-2.5 py-1.5">Data</th>
              <th className="px-2.5 py-1.5 text-right">Suma</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {shown.map((inv) => (
              <tr key={`${inv.invoiceNumber}-${inv.date}-${inv.clientKey}`} className="text-zinc-800">
                <td className="px-2.5 py-1.5 font-medium text-zinc-900">{inv.invoiceNumber}</td>
                <td className="max-w-[18rem] truncate px-2.5 py-1.5 text-zinc-700">
                  {inv.companyName?.trim() ? inv.companyName : inv.clientKey}
                </td>
                <td className="px-2.5 py-1.5 tabular-nums">{inv.date}</td>
                <td className="px-2.5 py-1.5 text-right tabular-nums font-semibold text-zinc-900">
                  {formatMoney(inv.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {canExpand ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className={
            expanded
              ? "mt-2 text-[11px] font-medium text-zinc-500 hover:underline"
              : "mt-2 text-[11px] font-medium text-[#7C4A57] hover:underline"
          }
        >
          {expanded ? "Suskleisti" : `Rodyti daugiau (+${rows.length - preview})`}
        </button>
      ) : null}
    </div>
  );
}
