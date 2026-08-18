"use client";

import Link from "next/link";
import { useTransition } from "react";
import { duplicateCommercialProposalAction } from "@/lib/crm/commercialProposalActions";
import { formatDate } from "@/lib/crm/format";
import type { CommercialProposalRow } from "@/lib/commercialProposal/types";

function statusLabel(status: string): string {
  if (status === "draft") return "Juodraštis";
  if (status === "generated") return "Sugeneruotas";
  if (status === "sent") return "Išsiųstas";
  return status;
}

export function ProposalHistorySection({
  clientId,
  rows,
}: {
  clientId: string;
  rows: Array<CommercialProposalRow & { manager_name: string | null }>;
}) {
  const [pending, start] = useTransition();

  return (
    <div className="mt-8 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3">
        <div className="text-sm font-medium text-zinc-900">Commercial proposals</div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-zinc-100 bg-zinc-50/80 text-left text-xs font-medium uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-4 py-3 font-medium text-zinc-700">Proposal No.</th>
              <th className="px-4 py-3 font-medium text-zinc-700">Created</th>
              <th className="px-4 py-3 font-medium text-zinc-700">Sales manager</th>
              <th className="px-4 py-3 font-medium text-zinc-700">Discount</th>
              <th className="px-4 py-3 font-medium text-zinc-700">Status</th>
              <th className="px-4 py-3 font-medium text-zinc-700">PDF</th>
              <th className="px-4 py-3 font-medium text-zinc-700">Veiksmai</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-3 font-medium text-zinc-900">
                  <Link
                    href={`/klientai/${encodeURIComponent(clientId)}/pasiulymai/${r.id}`}
                    className="hover:underline"
                  >
                    {r.proposal_number ?? "Juodraštis"}
                  </Link>
                </td>
                <td className="px-4 py-3 text-zinc-700">{formatDate(r.created_at)}</td>
                <td className="px-4 py-3 text-zinc-700">{r.manager_name ?? "—"}</td>
                <td className="px-4 py-3 tabular-nums text-zinc-700">{Number(r.global_discount_pct)} %</td>
                <td className="px-4 py-3 text-zinc-700">{statusLabel(r.status)}</td>
                <td className="px-4 py-3">
                  {r.status === "draft" ? (
                    <span className="text-zinc-400">—</span>
                  ) : (
                    <div className="flex gap-2">
                      <a
                        className="text-[#7C4A57] hover:underline"
                        href={`/api/crm/commercial-proposals/${r.id}/pdf`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        View
                      </a>
                      <a
                        className="text-[#7C4A57] hover:underline"
                        href={`/api/crm/commercial-proposals/${r.id}/pdf?download=1`}
                      >
                        Download
                      </a>
                    </div>
                  )}
                </td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    disabled={pending}
                    className="text-sm text-[#7C4A57] hover:underline disabled:opacity-50"
                    onClick={() => {
                      start(async () => {
                        const res = await duplicateCommercialProposalAction(r.id);
                        if (res.ok) {
                          window.location.href = `/klientai/${encodeURIComponent(res.clientId)}/pasiulymai/${res.id}`;
                        }
                      });
                    }}
                  >
                    Duplicate
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-zinc-500">
                  Komercinių pasiūlymų dar nėra.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
