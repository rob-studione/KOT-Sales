"use client";

import nextDynamic from "next/dynamic";
import type { InvoiceBreakdownRow } from "@/components/crm/InvoicesBreakdownTable";

const InvoicesBreakdownTableInner = nextDynamic(
  () => import("@/components/crm/InvoicesBreakdownTable").then((m) => m.InvoicesBreakdownTable),
  {
    ssr: false,
    loading: () => <div className="h-40 animate-pulse rounded-md border border-zinc-200 bg-zinc-50" />,
  }
);

export function InvoicesBreakdownTableClientOnly({
  rows,
  title,
  className,
  previewRows,
}: {
  rows: InvoiceBreakdownRow[];
  title: string;
  className?: string;
  previewRows?: number;
}) {
  return (
    <InvoicesBreakdownTableInner rows={rows} title={title} className={className} previewRows={previewRows} />
  );
}
