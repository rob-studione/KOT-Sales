"use client";

import { useMemo, useState, useTransition } from "react";
import {
  generateCommercialProposalAction,
  markProposalSentAction,
  overrideProposalLineAction,
  resetProposalLineAction,
  updateProposalSettingsAction,
  type ProposalEditorPayload,
} from "@/lib/crm/commercialProposalActions";
import { formatLtMoney, formatProposalPriceCell } from "@/lib/commercialProposal/money";
import type { CommercialProposalLine, CpPriceCategory } from "@/lib/commercialProposal/types";

const CATEGORY_LABEL: Record<CpPriceCategory, string> = {
  translation: "Vertimas raštu",
  ai_translation: "AI vertimas ir redagavimas",
  additional_service: "Papildomos paslaugos",
};

function statusLabel(status: string): string {
  if (status === "draft") return "Juodraštis";
  if (status === "generated") return "Sugeneruotas";
  if (status === "sent") return "Išsiųstas";
  return status;
}

function LineRow({
  line,
  readOnly,
  onSaved,
}: {
  line: CommercialProposalLine;
  readOnly: boolean;
  onSaved: (next: CommercialProposalLine) => void;
}) {
  const [value, setValue] = useState(line.final_price == null ? "" : formatLtMoney(line.final_price));
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <tr className={line.is_manual_override ? "bg-amber-50/80" : ""}>
      <td className="px-3 py-2 text-zinc-500 tabular-nums">{line.sort_order}.</td>
      <td className="px-3 py-2 text-zinc-900">{line.label}</td>
      <td className="px-3 py-2 text-right tabular-nums text-zinc-600">
        {line.is_free ? "nemokamas" : line.base_price == null ? "—" : formatLtMoney(line.base_price)}
      </td>
      <td className="px-3 py-2 text-right tabular-nums text-zinc-600">
        {line.is_free ? "—" : line.calculated_price == null ? "—" : formatLtMoney(line.calculated_price)}
      </td>
      <td className="px-3 py-2">
        {readOnly ? (
          <div className="text-right tabular-nums text-zinc-900">
            {formatProposalPriceCell(line)}
            {line.is_manual_override ? (
              <span className="ml-2 text-[11px] font-medium uppercase tracking-wide text-amber-700">rankinė</span>
            ) : null}
          </div>
        ) : (
          <div className="flex items-center justify-end gap-2">
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              disabled={pending || line.is_free}
              className={[
                "h-8 w-24 rounded-md border px-2 text-right text-sm tabular-nums",
                line.is_manual_override ? "border-amber-400 bg-amber-50" : "border-zinc-200 bg-white",
              ].join(" ")}
              aria-label={`${line.label} galutinė kaina`}
            />
            <button
              type="button"
              className="text-xs font-medium text-[#7C4A57] hover:underline disabled:opacity-50"
              disabled={pending || line.is_free}
              onClick={() => {
                setError(null);
                start(async () => {
                  const res = await overrideProposalLineAction({
                    proposalId: line.proposal_id,
                    lineId: line.id,
                    finalPrice: value,
                  });
                  if (!res.ok) {
                    setError(res.error);
                    return;
                  }
                  onSaved({
                    ...line,
                    is_manual_override: true,
                    is_free: false,
                    final_price: Number(value.replace(",", ".")),
                  });
                });
              }}
            >
              Įrašyti
            </button>
            {line.is_manual_override ? (
              <button
                type="button"
                className="text-xs text-zinc-600 hover:underline disabled:opacity-50"
                disabled={pending}
                onClick={() => {
                  setError(null);
                  start(async () => {
                    const res = await resetProposalLineAction({
                      proposalId: line.proposal_id,
                      lineId: line.id,
                    });
                    if (!res.ok) {
                      setError(res.error);
                      return;
                    }
                    const nextFinal = line.calculated_price;
                    setValue(nextFinal == null ? "" : formatLtMoney(nextFinal));
                    onSaved({
                      ...line,
                      is_manual_override: false,
                      final_price: nextFinal,
                    });
                  });
                }}
              >
                Atstatyti
              </button>
            ) : null}
          </div>
        )}
        {error ? <div className="mt-1 text-right text-xs text-red-600">{error}</div> : null}
      </td>
    </tr>
  );
}

export function ProposalEditorClient({
  initial,
  clientId,
}: {
  initial: ProposalEditorPayload;
  clientId: string;
}) {
  const [proposal, setProposal] = useState(initial.proposal);
  const [lines, setLines] = useState(initial.lines);
  const [discount, setDiscount] = useState(String(initial.proposal.global_discount_pct));
  const [managerId, setManagerId] = useState(initial.proposal.sales_manager_id ?? "");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewKey, setPreviewKey] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const readOnly = proposal.status !== "draft";

  const grouped = useMemo(() => {
    const cats: CpPriceCategory[] = ["translation", "ai_translation", "additional_service"];
    return cats.map((c) => ({
      category: c,
      rows: lines.filter((l) => l.category === c).sort((a, b) => a.sort_order - b.sort_order),
    }));
  }, [lines]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-sm text-zinc-500">
            {proposal.proposal_number ?? "Juodraštis"} · {statusLabel(proposal.status)}
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-zinc-900">Komercinis pasiūlymas</h1>
          <p className="mt-1 text-sm text-zinc-600">{proposal.client_name}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
            onClick={() => {
              setPreviewKey((k) => k + 1);
              setPreviewOpen(true);
            }}
          >
            Preview PDF
          </button>
          {proposal.status === "draft" ? (
            <button
              type="button"
              disabled={pending}
              className="rounded-lg bg-[#7C4A57] px-4 py-2 text-sm font-medium text-white hover:bg-[#693948] disabled:opacity-50"
              onClick={() => {
                setMessage(null);
                start(async () => {
                  const settings = await updateProposalSettingsAction({
                    proposalId: proposal.id,
                    globalDiscountPct: Number(discount.replace(",", ".")),
                    salesManagerId: managerId,
                  });
                  if (!settings.ok) {
                    setMessage(settings.error);
                    return;
                  }
                  const res = await generateCommercialProposalAction(proposal.id);
                  if (!res.ok) {
                    setMessage(res.error);
                    return;
                  }
                  window.location.reload();
                });
              }}
            >
              Generate PDF
            </button>
          ) : (
            <>
              <a
                className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
                href={`/api/crm/commercial-proposals/${proposal.id}/pdf`}
                target="_blank"
                rel="noreferrer"
              >
                Atidaryti PDF
              </a>
              <a
                className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
                href={`/api/crm/commercial-proposals/${proposal.id}/pdf?download=1`}
              >
                Atsisiųsti
              </a>
              {proposal.status === "generated" ? (
                <button
                  type="button"
                  className="rounded-lg bg-[#7C4A57] px-4 py-2 text-sm font-medium text-white hover:bg-[#693948]"
                  onClick={() => {
                    start(async () => {
                      const res = await markProposalSentAction(proposal.id);
                      if (!res.ok) setMessage(res.error);
                      else window.location.reload();
                    });
                  }}
                >
                  Pažymėti kaip išsiųstą
                </button>
              ) : null}
            </>
          )}
        </div>
      </div>

      {message ? <p className="text-sm text-red-600">{message}</p> : null}

      <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-zinc-900">Pasiūlymo nustatymai</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="text-xs font-medium text-zinc-600">Global discount %</span>
            <input
              value={discount}
              disabled={readOnly || pending}
              onChange={(e) => setDiscount(e.target.value)}
              onBlur={() => {
                if (readOnly) return;
                start(async () => {
                  const res = await updateProposalSettingsAction({
                    proposalId: proposal.id,
                    globalDiscountPct: Number(String(discount).replace(",", ".")),
                    salesManagerId: managerId,
                  });
                  if (!res.ok) setMessage(res.error);
                  else window.location.reload();
                });
              }}
              className="mt-1 h-9 w-full rounded-lg border border-zinc-200 px-3 text-sm"
            />
          </label>
          <label className="block text-sm">
            <span className="text-xs font-medium text-zinc-600">Vadybininkas</span>
            <select
              value={managerId}
              disabled={readOnly || pending || !initial.canChangeManager}
              onChange={(e) => {
                const id = e.target.value;
                setManagerId(id);
                start(async () => {
                  const res = await updateProposalSettingsAction({
                    proposalId: proposal.id,
                    globalDiscountPct: Number(String(discount).replace(",", ".")),
                    salesManagerId: id,
                  });
                  if (!res.ok) setMessage(res.error);
                });
              }}
              className="mt-1 h-9 w-full rounded-lg border border-zinc-200 px-3 text-sm"
            >
              {initial.managers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} · {m.job_title}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="mt-2 text-xs text-zinc-500">
          Formulė: galutinė kaina = bazinė × (1 − nuolaida / 100). Rankinis pakeitimas galioja tik šiam pasiūlymui.
        </p>
      </section>

      {grouped.map((g) => (
        <section key={g.category} className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
          <div className="border-b border-zinc-100 px-4 py-3 text-sm font-medium text-zinc-900">
            {CATEGORY_LABEL[g.category]}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-left text-xs font-medium uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-3 py-2">Eil.</th>
                  <th className="px-3 py-2">Pavadinimas</th>
                  <th className="px-3 py-2 text-right">Bazinė</th>
                  <th className="px-3 py-2 text-right">Skaičiuota</th>
                  <th className="px-3 py-2 text-right">Galutinė</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {g.rows.map((line) => (
                  <LineRow
                    key={line.id}
                    line={line}
                    readOnly={readOnly}
                    onSaved={(next) => {
                      setLines((prev) => prev.map((x) => (x.id === next.id ? next : x)));
                      setProposal((p) => p);
                    }}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      {previewOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="flex h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div className="text-sm font-medium text-zinc-900">PDF preview (ne snapshot)</div>
              <button type="button" className="text-sm text-zinc-600 hover:underline" onClick={() => setPreviewOpen(false)}>
                Uždaryti
              </button>
            </div>
            <iframe
              title="Proposal preview"
              className="min-h-0 flex-1"
              src={`/api/crm/commercial-proposals/${proposal.id}/preview?t=${previewKey}`}
            />
          </div>
        </div>
      ) : null}

      <p className="text-xs text-zinc-500">Klientas: {clientId}</p>
    </div>
  );
}
