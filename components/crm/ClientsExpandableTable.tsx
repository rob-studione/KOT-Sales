"use client";

import { useState } from "react";
import Link from "next/link";
import { displayClientName, formatCompanyCodeList, formatDate, formatMoney } from "@/lib/crm/format";
import { clientDetailPath } from "@/lib/crm/clientRouting";

export type ClientListRow = {
  client_key: string;
  company_code: string | null;
  client_id: string | null;
  company_name: string | null;
  vat_code: string | null;
  address: string | null;
  email: string | null;
  phone: string | null;
  last_invoice_date: string | null;
  invoice_count: number;
  total_revenue: string | number | null;
};

export type RecentInvoiceRow = {
  invoice_id: string;
  invoice_date: string;
  amount: string | number | null;
};

type Props = {
  rows: ClientListRow[];
  recentByClientKey: Record<string, RecentInvoiceRow[]>;
};

export function ClientsExpandableTable({ rows, recentByClientKey }: Props) {
  const [open, setOpen] = useState<Record<string, boolean>>({});

  function toggle(key: string) {
    setOpen((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  if (rows.length === 0) {
    return (
      <div className="px-3 py-8 text-center text-sm text-zinc-500">Klientų nerasta.</div>
    );
  }

  return (
    <div className="divide-y divide-zinc-100">
      {rows.map((row) => {
        const key = row.client_key;
        const rowDomId = key === "" ? "orphan" : key;
        const isOpen = Boolean(open[key]);
        const title = displayClientName(row.company_name, row.company_code);
        const recent = recentByClientKey[key] ?? [];

        return (
          <div key={key} className="bg-white">
            <div className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto_auto] items-center gap-x-2 gap-y-1 px-2 py-1.5 text-sm sm:px-3 sm:py-2">
              <div className="min-w-0">
                <button
                  type="button"
                  onClick={() => toggle(key)}
                  className="flex w-full min-w-0 items-center gap-1.5 text-left"
                  aria-expanded={isOpen}
                  aria-controls={`client-detail-${rowDomId}`}
                  id={`client-trigger-${rowDomId}`}
                >
                  <span className="text-zinc-400 select-none" aria-hidden>
                    {isOpen ? "▾" : "▸"}
                  </span>
                  <span className="truncate font-medium text-zinc-900">{title}</span>
                </button>
              </div>
              <div className="whitespace-nowrap text-right tabular-nums text-zinc-700">
                {formatDate(row.last_invoice_date)}
              </div>
              <div className="whitespace-nowrap text-right tabular-nums text-zinc-700">
                {new Intl.NumberFormat("lt-LT").format(Number(row.invoice_count ?? 0))}
              </div>
              <div className="whitespace-nowrap text-right font-medium tabular-nums text-zinc-900">
                {formatMoney(row.total_revenue)}
              </div>
              <div className="flex justify-end">
                <Link
                  href={clientDetailPath(key === "" ? null : key)}
                  className="text-xs font-medium text-zinc-600 hover:text-zinc-900 hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  Atidaryti
                </Link>
              </div>
            </div>

            {isOpen ? (
              <div
                id={`client-detail-${rowDomId}`}
                role="region"
                aria-labelledby={`client-trigger-${rowDomId}`}
                className="border-t border-zinc-100 bg-zinc-50/90 px-3 py-3 text-sm"
              >
                <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
                  <div>
                    <dt className="text-xs font-medium text-zinc-500">Įmonės kodas</dt>
                    <dd className="mt-0.5 font-mono text-zinc-900">{formatCompanyCodeList(row.company_code)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-zinc-500">PVM kodas</dt>
                    <dd className="mt-0.5 text-zinc-900">{row.vat_code?.trim() ? row.vat_code : "—"}</dd>
                  </div>
                  <div className="sm:col-span-2 lg:col-span-1">
                    <dt className="text-xs font-medium text-zinc-500">Adresas</dt>
                    <dd className="mt-0.5 text-zinc-900">{row.address?.trim() ? row.address : "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-zinc-500">El. paštas</dt>
                    <dd className="mt-0.5 break-all text-zinc-900">{row.email?.trim() ? row.email : "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-zinc-500">Tel. nr.</dt>
                    <dd className="mt-0.5 text-zinc-900">{row.phone?.trim() ? row.phone : "—"}</dd>
                  </div>
                </dl>

                <div className="mt-4">
                  <div className="text-xs font-medium text-zinc-600">Naujausios sąskaitos</div>
                  {recent.length === 0 ? (
                    <p className="mt-1 text-zinc-500">Nėra duomenų.</p>
                  ) : (
                    <div className="mt-2 overflow-x-auto rounded border border-zinc-200 bg-white">
                      <table className="min-w-full text-xs">
                        <thead className="bg-zinc-100/80">
                          <tr className="text-left text-zinc-600">
                            <th className="px-2 py-1.5 font-medium">Nr.</th>
                            <th className="px-2 py-1.5 font-medium">Data</th>
                            <th className="px-2 py-1.5 font-medium text-right">Suma</th>
                          </tr>
                        </thead>
                        <tbody>
                          {recent.map((inv) => (
                            <tr key={inv.invoice_id} className="border-t border-zinc-100">
                              <td className="px-2 py-1.5 font-mono text-zinc-900">{inv.invoice_id}</td>
                              <td className="px-2 py-1.5 text-zinc-700">{formatDate(inv.invoice_date)}</td>
                              <td className="px-2 py-1.5 text-right tabular-nums text-zinc-900">
                                {formatMoney(inv.amount)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
