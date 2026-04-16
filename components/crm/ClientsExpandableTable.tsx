"use client";

import { useRouter } from "next/navigation";
import { displayClientName, formatMoney } from "@/lib/crm/format";
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

type Props = {
  rows: ClientListRow[];
};

const th =
  "px-3 py-1.5 text-[10px] font-medium uppercase tracking-wide text-zinc-500 sm:px-4 sm:text-[11px]";
const td = "px-3 py-1.5 sm:px-4";

export function ClientsExpandableTable({ rows }: Props) {
  const router = useRouter();

  if (rows.length === 0) {
    return (
      <div className="px-4 py-6 text-center text-sm text-zinc-500">Klientų nerasta.</div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-0 table-fixed border-collapse text-sm">
        <colgroup>
          <col />
          <col className="w-[9.5rem] sm:w-40" />
        </colgroup>
        <thead>
          <tr className="border-b border-zinc-100 bg-white">
            <th scope="col" className={`${th} text-left`}>
              Pavadinimas
            </th>
            <th scope="col" className={`${th} text-right whitespace-nowrap`}>
              Bendra apyvarta
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const key = row.client_key;
            const reactKey = key === "" ? "__client_orphan__" : key;
            const title = displayClientName(row.company_name, row.company_code);
            const href = clientDetailPath(key === "" ? null : key);

            function go() {
              router.push(href);
            }

            return (
              <tr
                key={reactKey}
                tabIndex={0}
                aria-label={`Klientas: ${title}. Atidaryti detales.`}
                onClick={go}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    go();
                  }
                }}
                className="cursor-pointer border-t border-zinc-100 transition-colors hover:bg-zinc-50 focus-visible:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-zinc-400"
              >
                <td className={`${td} max-w-0 min-w-0`}>
                  <span className="block truncate font-medium text-zinc-900" title={title}>
                    {title}
                  </span>
                </td>
                <td className={`${td} whitespace-nowrap text-right font-medium tabular-nums text-zinc-900`}>
                  {formatMoney(row.total_revenue)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
