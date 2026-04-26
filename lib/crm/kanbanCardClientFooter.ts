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

/** Rodymui: minimalus LT mobilus formatas, be griežtos validacijos. */
export function formatKanbanPhoneForDisplay(raw: string): string {
  const t = raw.trim();
  if (!t) return t;
  if (t.startsWith("+370")) return t;
  if (t.startsWith("370")) return t.startsWith("+") ? t : `+${t}`;
  if (t.startsWith("8")) {
    const after = t.slice(1).replace(/[^\d]/g, "");
    return "+370" + after;
  }
  return t;
}

export type KanbanCardInvoiceBlock =
  | {
      mode: "procurement";
      mainText: string;
    }
  | {
      mode: "invoice";
      mainText: string;
      /** Nukopijuoti: tik `invoice_number`; `null` jei numerio nėra. */
      invoiceNumberCopy: string | null;
      phone: { display: string; copy: string } | null;
      email: { display: string; copy: string } | null;
    };

/** Sąskaitos sekcija Kanban kortelėje (invoices: numeris, data, tel., el. paštas). Piktogramos – komponente. */
export function kanbanCardInvoiceBlockText(item: ProjectWorkItemDto): KanbanCardInvoiceBlock {
  if (item.source_type === "procurement_contract") {
    const snap = String(item.snapshot_last_invoice_date ?? "").slice(0, 10);
    const d = isPlaceholderInvoiceIsoDate(snap) ? "—" : snap;
    return { mode: "procurement", mainText: `Galioja iki: ${d}` };
  }
  const num = item.client_last_invoice_number?.trim() || null;
  const live = item.client_live_last_invoice_date;
  const date =
    live && !isPlaceholderInvoiceIsoDate(live)
      ? live.slice(0, 10)
      : (() => {
          const s = String(item.snapshot_last_invoice_date ?? "").slice(0, 10);
          if (s && !isPlaceholderInvoiceIsoDate(s)) return s;
          return null;
        })();
  const mainText = `${num ?? "—"} · ${date ?? "—"}`;

  const p =
    item.client_invoice_phone != null && String(item.client_invoice_phone).trim() !== ""
      ? String(item.client_invoice_phone).trim()
      : null;
  const eRaw =
    item.client_invoice_email != null && String(item.client_invoice_email).trim() !== ""
      ? String(item.client_invoice_email).trim()
      : null;
  const e = eRaw != null ? eRaw.toLowerCase() : null;

  const phone =
    p != null
      ? (() => {
          const display = formatKanbanPhoneForDisplay(p);
          return { display, copy: display };
        })()
      : null;
  const email = e != null ? { display: e, copy: e } : null;

  const invoiceNumberCopy = num != null && num !== "" ? num : null;

  return { mode: "invoice", mainText, invoiceNumberCopy, phone, email };
}

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
