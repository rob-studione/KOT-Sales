"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ProposalListActions } from "@/components/crm/commercial-proposal/ProposalListActions";
import { formatCategoryDiscountsLabel, templateVersionLabel } from "@/lib/commercialProposal/uiLabels";
import { formatDate } from "@/lib/crm/format";
import type { ProposalListRow } from "@/lib/crm/commercialProposalActions";

function statusLabel(status: string): string {
  if (status === "draft") return "Juodraštis";
  if (status === "generated") return "Sugeneruotas";
  if (status === "sent") return "Išsiųstas";
  return status;
}

export function CommercialProposalList({
  rows,
  canAdmin,
}: {
  rows: ProposalListRow[];
  canAdmin: boolean;
}) {
  const router = useRouter();
  const [hiddenIds, setHiddenIds] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const visible = useMemo(() => rows.filter((r) => !hiddenIds.includes(r.id)), [rows, hiddenIds]);

  return (
    <>
      {notice ? (
        <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {notice}
        </p>
      ) : null}
      <div className="mt-4 overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm">
        <table className="w-full min-w-[880px] text-sm">
          <thead className="border-b border-zinc-100 bg-zinc-50/80 text-left text-xs font-medium uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-4 py-3 font-medium text-zinc-700">Numeris</th>
              <th className="px-4 py-3 font-medium text-zinc-700">Gavėjas</th>
              <th className="px-4 py-3 font-medium text-zinc-700">Tipas</th>
              <th className="px-4 py-3 font-medium text-zinc-700">Vadybininkas</th>
              <th className="px-4 py-3 font-medium text-zinc-700">Sukurta</th>
              <th className="px-4 py-3 font-medium text-zinc-700">Nuolaida</th>
              <th className="px-4 py-3 font-medium text-zinc-700">Būsena</th>
              <th className="px-4 py-3 font-medium text-zinc-700">Šablonas</th>
              <th className="px-4 py-3 font-medium text-zinc-700">Veiksmai</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {visible.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-3 font-medium text-zinc-900">{r.proposal_number ?? "Juodraštis"}</td>
                <td className="px-4 py-3 text-zinc-800">{r.recipient_name || r.client_name || "—"}</td>
                <td className="px-4 py-3 text-zinc-700">{r.recipient_type === "lead" ? "Lead" : "Klientas"}</td>
                <td className="px-4 py-3 text-zinc-700">{r.manager_name ?? "—"}</td>
                <td className="px-4 py-3 text-zinc-700">{formatDate(r.created_at)}</td>
                <td className="px-4 py-3 text-zinc-700">{formatCategoryDiscountsLabel(r.discounts)}</td>
                <td className="px-4 py-3 text-zinc-700">{statusLabel(r.status)}</td>
                <td className="px-4 py-3 text-zinc-700">{templateVersionLabel(r.template_version)}</td>
                <td className="px-4 py-3">
                  <ProposalListActions
                    proposalId={r.id}
                    proposalNumber={r.proposal_number}
                    status={r.status}
                    hasPdf={Boolean(r.pdf_storage_path)}
                    canDelete={r.status === "draft" || canAdmin}
                    onDeleted={() => {
                      setHiddenIds((prev) => (prev.includes(r.id) ? prev : [...prev, r.id]));
                      setNotice("Pasiūlymas ištrintas.");
                      router.refresh();
                    }}
                  />
                </td>
              </tr>
            ))}
            {visible.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-sm text-zinc-500">
                  Komercinių pasiūlymų dar nėra.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </>
  );
}
