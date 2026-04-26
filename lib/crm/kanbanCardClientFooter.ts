import type { ProjectWorkItemDto } from "@/lib/crm/projectWorkItemDto";

/** DB naudojamas rankiniams leadams be sąskaitų; UI rodyti kaip „nėra datos“. */
export const CRM_PLACEHOLDER_INVOICE_ISO = "2000-01-01";

export function isPlaceholderInvoiceIsoDate(iso: string | null | undefined): boolean {
  const s = String(iso ?? "").trim().slice(0, 10);
  return !s || s === CRM_PLACEHOLDER_INVOICE_ISO;
}

/** Kanban apačia: sutartims — sutarties vertė; invoice klientams — viso kliento suma iš live lookup. */
export function kanbanCardClientTotalEuros(item: ProjectWorkItemDto): number {
  if (item.source_type === "procurement_contract") return Number(item.snapshot_revenue ?? 0);
  const live = item.client_live_all_time_revenue;
  if (live != null && Number.isFinite(live)) return live;
  return Number(item.snapshot_revenue ?? 0);
}

export type KanbanCardSecondMeta = { label: string; dateDisplay: string };

export function kanbanCardSecondMeta(item: ProjectWorkItemDto): KanbanCardSecondMeta {
  if (item.source_type === "procurement_contract") {
    const snap = String(item.snapshot_last_invoice_date ?? "").slice(0, 10);
    return {
      label: "Galioja iki",
      dateDisplay: isPlaceholderInvoiceIsoDate(snap) ? "—" : snap,
    };
  }
  const live = item.client_live_last_invoice_date;
  if (live && !isPlaceholderInvoiceIsoDate(live)) {
    return { label: "Pask. sąsk.", dateDisplay: live.slice(0, 10) };
  }
  const snap = String(item.snapshot_last_invoice_date ?? "").slice(0, 10);
  if (snap && !isPlaceholderInvoiceIsoDate(snap)) {
    return { label: "Pask. sąsk.", dateDisplay: snap };
  }
  return { label: "Pask. sąsk.", dateDisplay: "—" };
}
