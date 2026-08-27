import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { CrmTableContainer } from "@/components/crm/CrmTableContainer";
import {
  formatManagerObligationProjectSummary,
  type ManagerObligationProjectSummary,
} from "@/lib/crm/managerObligations";

export function ManagerObligationsProjectList({ rows }: { rows: ManagerObligationProjectSummary[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-white px-4 py-10 text-center">
        <p className="text-sm font-medium text-zinc-900">Viskas atlikta</p>
        <p className="mt-1 text-sm text-zinc-500">Šiuo metu neturite neatliktų veiksmų Kanban lentose.</p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-zinc-100 overflow-hidden rounded-xl border border-zinc-200 bg-white">
      {rows.map((row) => (
        <li key={row.projectId}>
          <Link
            href={row.href}
            className="flex items-center gap-4 px-4 py-3.5 transition-colors hover:bg-zinc-50"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-zinc-900">{row.projectName}</p>
              <p className={`mt-0.5 text-sm ${row.hasOverdue ? "text-red-700" : "text-zinc-500"}`}>
                {formatManagerObligationProjectSummary(row)}
              </p>
            </div>
            <span className="shrink-0 text-xs font-medium text-zinc-400">Kanban</span>
            <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400" aria-hidden />
          </Link>
        </li>
      ))}
    </ul>
  );
}
