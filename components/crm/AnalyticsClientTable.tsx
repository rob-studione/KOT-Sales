import Link from "next/link";
import {
  displayClientName,
  formatCompanyCodeList,
  formatDate,
  formatMoney,
} from "@/lib/crm/format";
import { clientDetailPath } from "@/lib/crm/clientRouting";
import {
  formatInactivityDurationLt,
  wholeDaysBetweenIsoDateAndToday,
} from "@/lib/crm/analyticsDates";
import type { ClientListViewRow } from "@/lib/crm/mapClientViewRow";

type Props = {
  rows: ClientListViewRow[];
  /** „Prarasti klientai“: show days/months since last invoice. */
  showInactivity?: boolean;
};

const th =
  "px-3 py-1.5 text-[10px] font-medium uppercase tracking-wide text-zinc-500 sm:px-4 sm:text-[11px]";
const td = "px-3 py-1.5 sm:px-4";

export function AnalyticsClientTable({ rows, showInactivity }: Props) {
  if (rows.length === 0) {
    return <div className="px-4 py-6 text-center text-sm text-zinc-500">Nėra įrašų.</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-0 table-fixed border-collapse text-sm">
        <colgroup>
          <col />
          <col className="w-[7rem] sm:w-28" />
          <col className="w-[9rem] sm:w-36" />
          <col className="w-[9.5rem] sm:w-40" />
          {showInactivity ? <col className="w-[7rem] sm:w-32" /> : null}
        </colgroup>
        <thead>
          <tr className="border-b border-zinc-100 bg-white">
            <th scope="col" className={`${th} text-left`}>
              Pavadinimas
            </th>
            <th scope="col" className={`${th} text-left whitespace-nowrap`}>
              Įm. kodas
            </th>
            <th scope="col" className={`${th} text-left whitespace-nowrap`}>
              Paskutinė sąskaita
            </th>
            <th scope="col" className={`${th} text-right whitespace-nowrap`}>
              Bendra apyvarta
            </th>
            {showInactivity ? (
              <th scope="col" className={`${th} text-right whitespace-nowrap`}>
                Neaktyvumas
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const key = row.client_key;
            const reactKey = key === "" ? "__client_orphan__" : key;
            const title = displayClientName(row.company_name, row.company_code);
            const href = clientDetailPath(key === "" ? null : key);
            const last = row.last_invoice_date ?? "";
            const daysInactive = last ? wholeDaysBetweenIsoDateAndToday(last) : 0;

            return (
              <tr key={reactKey} className="border-t border-zinc-100">
                <td className={`${td} max-w-0 min-w-0`}>
                  <Link
                    href={href}
                    className="block truncate font-medium text-zinc-900 underline-offset-2 hover:underline"
                    title={title}
                  >
                    {title}
                  </Link>
                </td>
                <td className={`${td} whitespace-nowrap text-zinc-600`}>
                  {formatCompanyCodeList(row.company_code)}
                </td>
                <td className={`${td} whitespace-nowrap text-zinc-600`}>{formatDate(row.last_invoice_date)}</td>
                <td className={`${td} whitespace-nowrap text-right font-medium tabular-nums text-zinc-900`}>
                  {formatMoney(row.total_revenue)}
                </td>
                {showInactivity ? (
                  <td className={`${td} whitespace-nowrap text-right text-sm text-zinc-600`}>
                    {formatInactivityDurationLt(daysInactive)}
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
