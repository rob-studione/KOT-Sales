"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { Check, Pencil, RotateCcw, X } from "lucide-react";
import {
  overrideProposalLineAction,
  resetProposalLineAction,
} from "@/lib/crm/commercialProposalActions";
import { formatDiscountCell, formatDiscountPct } from "@/components/crm/commercial-proposal/studio/shared";
import { isLineIncluded } from "@/lib/commercialProposal/discounts";
import { formatLtMoney, formatProposalPriceCell } from "@/lib/commercialProposal/money";
import type { CommercialProposalLine } from "@/lib/commercialProposal/types";

export function ProposalLineRow({
  line,
  discountPct,
  readOnly,
  variant = "full",
  onSaved,
  onToggleIncluded,
}: {
  line: CommercialProposalLine;
  discountPct: number;
  readOnly: boolean;
  variant?: "full" | "compact";
  onSaved: (next: CommercialProposalLine) => void;
  onToggleIncluded: (included: boolean) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(line.final_price == null ? "" : formatLtMoney(line.final_price));
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const included = isLineIncluded(line);
  const compact = variant === "compact";
  const rowTint = !included ? "" : line.is_manual_override ? "bg-amber-50/40" : "";

  useEffect(() => {
    if (!editing) {
      setValue(line.final_price == null ? "" : formatLtMoney(line.final_price));
    }
  }, [line.final_price, line.is_manual_override, editing]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  function beginEdit() {
    setError(null);
    const source = line.is_manual_override ? line.final_price : line.calculated_price;
    setValue(source == null ? "" : formatLtMoney(source));
    setEditing(true);
  }

  function cancelEdit() {
    setError(null);
    setValue(line.final_price == null ? "" : formatLtMoney(line.final_price));
    setEditing(false);
  }

  function saveEdit() {
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
      setEditing(false);
      onSaved({
        ...line,
        is_manual_override: true,
        is_free: false,
        final_price: Number(value.replace(",", ".")),
      });
    });
  }

  function resetToDiscount() {
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
      setEditing(false);
      onSaved({
        ...line,
        is_manual_override: false,
        final_price: nextFinal,
      });
    });
  }

  const money = (n: number | null | undefined) => (n == null ? "—" : `${formatLtMoney(n)} €`);

  const canEditPrice = !readOnly && included && !line.is_free;
  const keistiButton =
    canEditPrice && !editing && !line.is_manual_override ? (
      <button
        type="button"
        className="inline-flex h-7 shrink-0 items-center gap-0.5 rounded-md px-1 text-[11px] font-medium text-[#7C4A57] hover:underline"
        onClick={beginEdit}
      >
        <Pencil className="h-3 w-3" strokeWidth={2} />
        Keisti
      </button>
    ) : null;

  let finalCell: ReactNode;
  if (readOnly) {
    finalCell = (
      <div className="flex h-7 items-center justify-end gap-1.5 whitespace-nowrap">
        <span className="text-[15px] font-semibold tabular-nums text-[#17171B]">{formatProposalPriceCell(line)}</span>
        {line.is_manual_override ? (
          <span className="rounded border border-amber-200/80 bg-amber-50/80 px-1 py-px text-[9px] font-medium uppercase tracking-wide text-amber-700">
            Rankinė
          </span>
        ) : null}
      </div>
    );
  } else if (!included || line.is_free) {
    finalCell = (
      <div className="flex h-7 items-center justify-end whitespace-nowrap tabular-nums text-[#989AA2]">
        {formatProposalPriceCell(line)}
      </div>
    );
  } else if (editing) {
    finalCell = (
      <div className="flex h-7 items-center justify-end gap-0.5 whitespace-nowrap">
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={pending}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (!pending) saveEdit();
            } else if (e.key === "Escape") {
              e.preventDefault();
              cancelEdit();
            }
          }}
          className={[
            "h-7 w-[4.75rem] rounded-md border px-1.5 text-right text-sm tabular-nums",
            error ? "border-red-400 bg-red-50" : "border-amber-300 bg-amber-50/80",
          ].join(" ")}
          aria-invalid={error ? true : undefined}
          aria-label={`${line.label} galutinė kaina`}
          title={error ?? undefined}
        />
        <button
          type="button"
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[#7C4A57] hover:bg-zinc-100 disabled:opacity-50"
          disabled={pending}
          aria-label="Įrašyti"
          title="Įrašyti"
          onClick={saveEdit}
        >
          <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
        </button>
        <button
          type="button"
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100 disabled:opacity-50"
          disabled={pending}
          aria-label="Atšaukti"
          title="Atšaukti"
          onClick={cancelEdit}
        >
          <X className="h-3.5 w-3.5" strokeWidth={2.25} />
        </button>
      </div>
    );
  } else if (line.is_manual_override) {
    finalCell = (
      <div className="flex h-7 items-center justify-end gap-1.5 whitespace-nowrap">
        {line.calculated_price != null && line.final_price != null && line.calculated_price !== line.final_price ? (
          <span className="text-[12px] tabular-nums text-[#989AA2] line-through">{money(line.calculated_price)}</span>
        ) : null}
        <button type="button" className="text-[15px] font-semibold tabular-nums text-[#17171B] hover:underline" onClick={beginEdit}>
          {line.final_price == null ? "—" : `${formatLtMoney(line.final_price)} €`}
        </button>
        <span className="rounded border border-amber-200/80 bg-amber-50/80 px-1 py-px text-[9px] font-medium uppercase tracking-wide text-amber-700">
          Rankinė
        </span>
        <button
          type="button"
          className="inline-flex items-center gap-0.5 text-[11px] text-[#6F7077] hover:text-[#17171B] disabled:opacity-50"
          disabled={pending}
          title="Atstatyti pagal nuolaidą"
          aria-label="Atstatyti pagal nuolaidą"
          onClick={resetToDiscount}
        >
          <RotateCcw className="h-3 w-3" strokeWidth={2.25} />
        </button>
      </div>
    );
  } else {
    finalCell = (
      <div className="flex h-7 items-center justify-end gap-1.5 whitespace-nowrap">
        <span className="text-[15px] font-semibold tabular-nums text-[#17171B]">{money(line.calculated_price)}</span>
        {keistiButton ? <span data-price-keisti-inline>{keistiButton}</span> : null}
      </div>
    );
  }

  const baseText = line.is_free ? "nemokamas" : money(line.base_price);
  const discountLabel = formatDiscountPct(discountPct);
  const discountText = formatDiscountCell(discountPct);
  const discountClass = discountLabel ? "text-[#7C4A57]" : "text-[#989AA2]";

  return (
    <div
      data-price-row="row"
      className={`border-b border-[#EEEEF0] px-3 py-2 ${rowTint} ${!included ? "text-[#989AA2]" : ""}`}
    >
      <div data-price-col="name" className="flex min-w-0 items-center gap-2">
        {compact ? null : readOnly ? (
          <span className="w-4 shrink-0" />
        ) : (
          <input
            type="checkbox"
            className="shrink-0"
            checked={included}
            disabled={pending}
            onChange={(e) => onToggleIncluded(e.target.checked)}
            aria-label={`${line.label} įtraukti į pasiūlymą`}
          />
        )}
        <span className="min-w-0 truncate text-[13px] text-[#17171B]" title={line.label}>
          {line.label}
        </span>
      </div>
      <div data-price-col="base" className="whitespace-nowrap text-[13px] tabular-nums text-[#989AA2]">
        {baseText}
      </div>
      <div data-price-col="discount" className={`whitespace-nowrap text-[12px] tabular-nums ${discountClass}`}>
        {discountText}
      </div>
      <div data-price-col="final">{finalCell}</div>
      <div data-price-col="action">{keistiButton}</div>
    </div>
  );
}
