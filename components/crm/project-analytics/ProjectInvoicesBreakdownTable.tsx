"use client";

import nextDynamic from "next/dynamic";
import type { InvoiceBreakdownRow } from "@/components/crm/InvoicesBreakdownTable";

/** Pajamos: iškart 15 eilučių; daugiau — „Rodyti daugiau“, tada scroll. */
const PROJECT_PREVIEW_ROWS = 15;

const InvoicesBreakdownTableInner = nextDynamic(
  () => import("@/components/crm/InvoicesBreakdownTable").then((m) => m.InvoicesBreakdownTable),
  {
    ssr: false,
    loading: () => <div className="h-64 animate-pulse rounded-md border border-zinc-200 bg-zinc-50" />,
  }
);

export function ProjectInvoicesBreakdownTable({
  rows,
  title = "Projekto sąskaitos",
}: {
  rows: InvoiceBreakdownRow[];
  title?: string;
}) {
  return <InvoicesBreakdownTableInner rows={rows} title={title} previewRows={PROJECT_PREVIEW_ROWS} />;
}
