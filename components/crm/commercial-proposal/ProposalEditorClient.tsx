"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  generateCommercialProposalAction,
  markProposalSentAction,
  overrideProposalLineAction,
  resetProposalLineAction,
  updateProposalLineInclusionAction,
  updateProposalSettingsAction,
  type ProposalEditorPayload,
} from "@/lib/crm/commercialProposalActions";
import {
  categoryDiscount,
  clampDiscountPct,
  isLineIncluded,
  normalizeCategoryDiscounts,
  type CpCategoryDiscounts,
} from "@/lib/commercialProposal/discounts";
import { applyGlobalDiscount, formatLtMoney, formatProposalPriceCell } from "@/lib/commercialProposal/money";
import { CP_CATEGORIES, type CommercialProposalLine, type CpPriceCategory } from "@/lib/commercialProposal/types";

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

function lineCountLabel(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (n === 1 || (mod10 === 1 && mod100 !== 11)) return `${n} eilutę`;
  if (mod10 >= 2 && mod10 <= 9 && (mod100 < 10 || mod100 >= 20)) return `${n} eilutes`;
  return `${n} eilučių`;
}

function CategoryCheckbox({
  selected,
  total,
  disabled,
  onChange,
  ariaLabel,
}: {
  selected: number;
  total: number;
  disabled: boolean;
  onChange: (included: boolean) => void;
  ariaLabel: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = selected > 0 && selected < total;
  }, [selected, total]);
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={total > 0 && selected === total}
      disabled={disabled || total === 0}
      onChange={(e) => onChange(e.target.checked)}
      aria-label={ariaLabel}
    />
  );
}

function LineRow({
  line,
  discountPct,
  readOnly,
  onSaved,
  onToggleIncluded,
}: {
  line: CommercialProposalLine;
  discountPct: number;
  readOnly: boolean;
  onSaved: (next: CommercialProposalLine) => void;
  onToggleIncluded: (included: boolean) => void;
}) {
  const [value, setValue] = useState(line.final_price == null ? "" : formatLtMoney(line.final_price));
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const included = isLineIncluded(line);

  return (
    <tr className={[!included ? "bg-zinc-50 text-zinc-400" : line.is_manual_override ? "bg-amber-50/80" : ""].join(" ")}>
      <td className="px-3 py-2">
        <input
          type="checkbox"
          checked={included}
          disabled={readOnly || pending}
          onChange={(e) => onToggleIncluded(e.target.checked)}
          aria-label={`${line.label} įtraukti į pasiūlymą`}
        />
      </td>
      <td className="px-3 py-2 text-zinc-500 tabular-nums">{line.sort_order}.</td>
      <td className={`px-3 py-2 ${included ? "text-zinc-900" : "text-zinc-400"}`}>{line.label}</td>
      <td className="px-3 py-2 text-right tabular-nums text-zinc-600">
        {line.is_free ? "nemokamas" : line.base_price == null ? "—" : formatLtMoney(line.base_price)}
      </td>
      <td className="px-3 py-2 text-right tabular-nums text-zinc-600">{discountPct} %</td>
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
              disabled={pending || line.is_free || !included}
              className={[
                "h-8 w-24 rounded-md border px-2 text-right text-sm tabular-nums",
                line.is_manual_override ? "border-amber-400 bg-amber-50" : "border-zinc-200 bg-white",
              ].join(" ")}
              aria-label={`${line.label} galutinė kaina`}
            />
            <button
              type="button"
              className="text-xs font-medium text-[#7C4A57] hover:underline disabled:opacity-50"
              disabled={pending || line.is_free || !included}
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
}: {
  initial: ProposalEditorPayload;
}) {
  const [proposal] = useState(initial.proposal);
  const [lines, setLines] = useState(initial.lines);
  const initialDiscounts = normalizeCategoryDiscounts(initial.discounts ?? initial.proposal.discounts);
  const [discounts, setDiscounts] = useState<CpCategoryDiscounts>(initialDiscounts);
  const [discountInputs, setDiscountInputs] = useState<Record<CpPriceCategory, string>>({
    translation: String(initialDiscounts.translation),
    ai_translation: String(initialDiscounts.ai_translation),
    additional_service: String(initialDiscounts.additional_service),
  });
  const [applyAll, setApplyAll] = useState("");
  const [recipientName, setRecipientName] = useState(initial.proposal.recipient_name || initial.proposal.client_name);
  const [managerId, setManagerId] = useState(initial.proposal.sales_manager_id ?? "");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewKey, setPreviewKey] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const readOnly = proposal.status !== "draft";

  const grouped = useMemo(() => {
    return CP_CATEGORIES.map((c) => ({
      category: c,
      rows: lines.filter((l) => l.category === c).sort((a, b) => a.sort_order - b.sort_order),
    }));
  }, [lines]);

  function applyDiscountsLocally(next: CpCategoryDiscounts) {
    setDiscounts(next);
    setDiscountInputs({
      translation: String(next.translation),
      ai_translation: String(next.ai_translation),
      additional_service: String(next.additional_service),
    });
    setLines((prev) =>
      prev.map((line) => {
        if (line.is_free || line.base_price == null) return line;
        const calculated = applyGlobalDiscount(line.base_price, categoryDiscount(next, line.category));
        return {
          ...line,
          calculated_price: calculated,
          final_price: line.is_manual_override ? line.final_price : calculated,
        };
      })
    );
  }

  function saveSettings(nextDiscounts?: CpCategoryDiscounts) {
    return updateProposalSettingsAction({
      proposalId: proposal.id,
      salesManagerId: managerId,
      recipientName,
      categoryDiscounts: nextDiscounts,
    });
  }

  function setLinesIncluded(nextIds: string[], included: boolean) {
    const idSet = new Set(nextIds);
    let rollback: CommercialProposalLine[] | null = null;
    setLines((prev) => {
      rollback = prev;
      return prev.map((line) => (idSet.has(line.id) ? { ...line, included } : line));
    });
    start(async () => {
      const res = await updateProposalLineInclusionAction({
        proposalId: proposal.id,
        lineIds: nextIds,
        included,
      });
      if (!res.ok) {
        if (rollback) setLines(rollback);
        setMessage(res.error);
      }
    });
  }

  const includedCount = lines.filter(isLineIncluded).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-sm text-zinc-500">
            {proposal.proposal_number ?? "Juodraštis"} · {statusLabel(proposal.status)}
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-zinc-900">Komercinis pasiūlymas</h1>
          <p className="mt-1 text-sm text-zinc-600">
            {proposal.recipient_type === "lead" ? "Lead" : "Klientas"}: {proposal.recipient_name || proposal.client_name}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={includedCount === 0}
            className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
            onClick={() => {
              setPreviewKey((k) => k + 1);
              setPreviewOpen(true);
            }}
          >
            Peržiūrėti PDF
          </button>
          {proposal.status === "draft" ? (
            <button
              type="button"
              disabled={pending || includedCount === 0}
              className="rounded-lg bg-[#7C4A57] px-4 py-2 text-sm font-medium text-white hover:bg-[#693948] disabled:opacity-50"
              onClick={() => {
                setMessage(null);
                start(async () => {
                  const next = normalizeCategoryDiscounts({
                    translation: discountInputs.translation.replace(",", "."),
                    ai_translation: discountInputs.ai_translation.replace(",", "."),
                    additional_service: discountInputs.additional_service.replace(",", "."),
                  });
                  setDiscounts(next);
                  const settings = await saveSettings(next);
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
        <h2 className="text-sm font-semibold text-zinc-900">Įtrauktos paslaugos</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Pagal nutylėjimą įtraukiamas visas kainynas. Nuimkite nereikalingas kategorijas ar eilutes — jos nebus PDF.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {grouped.map((g) => {
            const selected = g.rows.filter(isLineIncluded).length;
            return (
              <label key={g.category} className="flex items-start gap-2 text-sm text-zinc-800">
                <CategoryCheckbox
                  selected={selected}
                  total={g.rows.length}
                  disabled={readOnly || pending}
                  ariaLabel={`${CATEGORY_LABEL[g.category]} įtraukti`}
                  onChange={(included) => setLinesIncluded(g.rows.map((r) => r.id), included)}
                />
                <span>
                  <span className="font-medium">{CATEGORY_LABEL[g.category]}</span>
                  <span className="mt-0.5 block text-xs text-zinc-500">
                    {selected}/{g.rows.length} eil.
                  </span>
                </span>
              </label>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-zinc-500">
          {includedCount === 0
            ? "Pasirinkite bent vieną paslaugą."
            : `PDF turės ${lineCountLabel(includedCount)}.`}
        </p>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-zinc-900">Pasiūlymo nustatymai</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block text-sm sm:col-span-2">
            <span className="text-xs font-medium text-zinc-600">Gavėjo pavadinimas PDF</span>
            <input
              value={recipientName}
              disabled={readOnly || pending}
              onChange={(e) => setRecipientName(e.target.value)}
              onBlur={() => {
                if (readOnly) return;
                start(async () => {
                  const res = await saveSettings();
                  if (!res.ok) setMessage(res.error);
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
                    salesManagerId: id,
                    recipientName,
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
        <div className="mt-5">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Nuolaidos pagal kategoriją</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {CP_CATEGORIES.map((category) => {
              const selected = lines.filter((l) => l.category === category && isLineIncluded(l)).length;
              return (
              <label key={category} className={`block text-sm${selected === 0 ? " opacity-60" : ""}`}>
                <span className="text-xs font-medium text-zinc-600">{CATEGORY_LABEL[category]}</span>
                <div className="mt-1 flex items-center gap-2">
                  <input
                    value={discountInputs[category]}
                    disabled={readOnly || pending}
                    inputMode="decimal"
                    onChange={(e) => {
                      setDiscountInputs((prev) => ({ ...prev, [category]: e.target.value }));
                    }}
                    onBlur={() => {
                      if (readOnly) return;
                      const next = normalizeCategoryDiscounts({
                        ...discounts,
                        [category]: discountInputs[category].replace(",", "."),
                      });
                      applyDiscountsLocally(next);
                      start(async () => {
                        const res = await saveSettings(next);
                        if (!res.ok) setMessage(res.error);
                      });
                    }}
                    className="h-9 w-full rounded-lg border border-zinc-200 px-3 text-sm tabular-nums"
                    aria-label={`${CATEGORY_LABEL[category]} nuolaida %`}
                  />
                  <span className="text-sm text-zinc-500">%</span>
                </div>
                {selected === 0 ? (
                  <span className="mt-1 block text-[11px] text-zinc-500">Neįtraukta į PDF</span>
                ) : null}
              </label>
              );
            })}
          </div>
          {!readOnly ? (
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <label className="block text-sm">
                <span className="text-xs font-medium text-zinc-600">Taikyti visoms kategorijoms</span>
                <input
                  value={applyAll}
                  disabled={pending}
                  inputMode="decimal"
                  onChange={(e) => setApplyAll(e.target.value)}
                  className="mt-1 h-9 w-28 rounded-lg border border-zinc-200 px-3 text-sm tabular-nums"
                />
              </label>
              <button
                type="button"
                disabled={pending || applyAll.trim() === ""}
                className="h-9 rounded-lg border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
                onClick={() => {
                  const pct = clampDiscountPct(applyAll.replace(",", "."));
                  const next = normalizeCategoryDiscounts({
                    translation: pct,
                    ai_translation: pct,
                    additional_service: pct,
                  });
                  applyDiscountsLocally(next);
                  setApplyAll(String(pct));
                  start(async () => {
                    const res = await saveSettings(next);
                    if (!res.ok) setMessage(res.error);
                  });
                }}
              >
                Taikyti
              </button>
            </div>
          ) : null}
        </div>
        <p className="mt-3 text-xs text-zinc-500">
          Formulė: galutinė kaina = bazinė × (1 − kategorijos nuolaida / 100). Kiekviena kategorija skaičiuojama
          atskirai. Rankinis pakeitimas galioja tik šiam pasiūlymui ir neužrašo kainyno.
        </p>
      </section>

      {grouped.map((g) => {
        const selected = g.rows.filter(isLineIncluded).length;
        return (
        <section key={g.category} className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 px-4 py-3">
            <div className="text-sm font-medium text-zinc-900">
              <label className="inline-flex items-center gap-2">
                <CategoryCheckbox
                  selected={selected}
                  total={g.rows.length}
                  disabled={readOnly || pending}
                  ariaLabel={`${CATEGORY_LABEL[g.category]} įtraukti visas eilutes`}
                  onChange={(included) => setLinesIncluded(g.rows.map((r) => r.id), included)}
                />
                {CATEGORY_LABEL[g.category]}
              </label>
              <span className="ml-2 font-normal text-zinc-500">
                · nuolaida {categoryDiscount(discounts, g.category)} % · {selected}/{g.rows.length}
              </span>
            </div>
            {!readOnly ? (
              <div className="flex gap-3 text-xs">
                <button
                  type="button"
                  className="font-medium text-[#7C4A57] hover:underline disabled:opacity-50"
                  disabled={pending || selected === g.rows.length}
                  onClick={() => setLinesIncluded(g.rows.map((r) => r.id), true)}
                >
                  Pažymėti visas
                </button>
                <button
                  type="button"
                  className="font-medium text-zinc-600 hover:underline disabled:opacity-50"
                  disabled={pending || selected === 0}
                  onClick={() => setLinesIncluded(g.rows.map((r) => r.id), false)}
                >
                  Nuimti visas
                </button>
              </div>
            ) : null}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-left text-xs font-medium uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-3 py-2">Įtraukti</th>
                  <th className="px-3 py-2">Eil.</th>
                  <th className="px-3 py-2">Pavadinimas</th>
                  <th className="px-3 py-2 text-right">Bazinė</th>
                  <th className="px-3 py-2 text-right">Nuolaida</th>
                  <th className="px-3 py-2 text-right">Skaičiuota</th>
                  <th className="px-3 py-2 text-right">Galutinė</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {g.rows.map((line) => (
                  <LineRow
                    key={line.id}
                    line={line}
                    discountPct={categoryDiscount(discounts, g.category)}
                    readOnly={readOnly}
                    onSaved={(next) => {
                      setLines((prev) => prev.map((x) => (x.id === next.id ? next : x)));
                    }}
                    onToggleIncluded={(included) => setLinesIncluded([line.id], included)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </section>
        );
      })}

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

      {proposal.recipient_type === "client" && proposal.client_id ? (
        <p className="text-xs text-zinc-500">
          <a href={`/klientai/${encodeURIComponent(proposal.client_id)}`} className="hover:underline">
            Klientas: {proposal.recipient_name || proposal.client_name}
          </a>
        </p>
      ) : (
        <p className="text-xs text-zinc-500">Lead: {proposal.recipient_name || proposal.client_name}</p>
      )}
    </div>
  );
}
