"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Settings2 } from "lucide-react";
import { CategoryIcon, DiscountChip } from "@/components/crm/commercial-proposal/studio/ProposalServiceCard";
import { ProposalLineRow } from "@/components/crm/commercial-proposal/studio/ProposalLineRow";
import { CATEGORY_LABEL, STUDIO_CARD, matchesQuery } from "@/components/crm/commercial-proposal/studio/shared";
import { categoryDiscount, isLineIncluded, type CpCategoryDiscounts } from "@/lib/commercialProposal/discounts";
import type { CommercialProposalLine, CpPriceCategory } from "@/lib/commercialProposal/types";

const PREVIEW_ROWS = 5;

function expandAllLabel(category: CpPriceCategory, count: number): string {
  if (category === "additional_service") return `Rodyti visas ${count} paslaugas`;
  return `Rodyti visas ${count} kalbų poras`;
}

export function ProposalPricingGroup({
  category,
  rows,
  discounts,
  readOnly,
  open,
  full,
  onToggleOpen,
  onToggleFull,
  onManage,
  onSaved,
  onToggleIncluded,
}: {
  category: CpPriceCategory;
  rows: CommercialProposalLine[];
  discounts: CpCategoryDiscounts;
  readOnly: boolean;
  open: boolean;
  full: boolean;
  onToggleOpen: () => void;
  onToggleFull: () => void;
  onManage: () => void;
  onSaved: (next: CommercialProposalLine) => void;
  onToggleIncluded: (id: string, included: boolean) => void;
}) {
  const [query, setQuery] = useState("");
  const [onlyIncluded, setOnlyIncluded] = useState(true);
  const selected = rows.filter(isLineIncluded).length;
  const excluded = selected === 0;
  const pct = categoryDiscount(discounts, category);
  const includedRows = rows.filter(isLineIncluded);
  const previewRows = (includedRows.length > 0 ? includedRows : rows).slice(0, PREVIEW_ROWS);

  const fullRows = useMemo(() => {
    return rows.filter((r) => {
      if (onlyIncluded && !isLineIncluded(r)) return false;
      return matchesQuery(r.label, query);
    });
  }, [rows, onlyIncluded, query]);

  return (
    <div className={`${STUDIO_CARD} overflow-hidden`}>
      <button
        type="button"
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left"
        aria-expanded={open}
        onClick={onToggleOpen}
      >
        <CategoryIcon category={category} size="sm" />
        <span className="min-w-0 flex-1">
          <span className="block text-[16px] font-semibold text-[#17171B]">{CATEGORY_LABEL[category]}</span>
          <span className="mt-0.5 block text-[13px] text-[#6F7077]">
            {excluded ? "Neįtraukta" : `${selected} iš ${rows.length} įtraukta`}
          </span>
        </span>
        <DiscountChip pct={pct} dimmed={excluded} />
        <ChevronDown
          className={[
            "h-4 w-4 shrink-0 text-[#989AA2] transition-transform duration-150 motion-reduce:transition-none",
            open ? "rotate-180" : "",
          ].join(" ")}
        />
      </button>

      <div
        className={[
          "grid transition-[grid-template-rows] duration-150 motion-reduce:transition-none",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        ].join(" ")}
      >
        <div className="overflow-hidden">
          <div className="border-t border-[#EEEEF0]">
            {excluded && !full ? (
              <p className="px-4 py-3 text-[13px] text-[#6F7077]">Ši kategorija neįtraukta į PDF.</p>
            ) : full ? (
              <div className="pb-1 pt-2">
                <div className="flex flex-wrap items-center gap-3 px-3 py-2">
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Paieška…"
                    className="h-9 min-w-[160px] flex-1 rounded-[10px] border border-[#E8E8EB] px-3 text-sm"
                  />
                  <label className="inline-flex items-center gap-2 text-[13px] text-[#17171B]">
                    <input
                      type="checkbox"
                      checked={onlyIncluded}
                      onChange={(e) => setOnlyIncluded(e.target.checked)}
                    />
                    Rodyti tik įtrauktas
                  </label>
                </div>
                <div
                  data-price-head="head"
                  className="border-b border-[#EEEEF0] px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-[#6F7077]"
                >
                  <div data-price-col="name">Pavadinimas</div>
                  <div data-price-col="base">Bazinė</div>
                  <div data-price-col="discount">Nuolaida</div>
                  <div data-price-col="final">Galutinė</div>
                  <div data-price-col="action" />
                </div>
                {fullRows.map((line) => (
                  <ProposalLineRow
                    key={line.id}
                    line={line}
                    discountPct={pct}
                    readOnly={readOnly}
                    variant="full"
                    onSaved={onSaved}
                    onToggleIncluded={(included) => onToggleIncluded(line.id, included)}
                  />
                ))}
                {fullRows.length === 0 ? (
                  <p className="px-3 py-8 text-center text-sm text-[#6F7077]">Nėra eilučių pagal filtrą.</p>
                ) : null}
              </div>
            ) : (
              <div className="text-sm">
                <div
                  data-price-head="head"
                  className="border-b border-[#EEEEF0] px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-[#6F7077]"
                >
                  <div data-price-col="name">Pavadinimas</div>
                  <div data-price-col="base">Bazinė</div>
                  <div data-price-col="discount">Nuolaida</div>
                  <div data-price-col="final">Galutinė</div>
                  <div data-price-col="action" />
                </div>
                {previewRows.map((line) => (
                  <ProposalLineRow
                    key={line.id}
                    line={line}
                    discountPct={pct}
                    readOnly={readOnly}
                    variant="compact"
                    onSaved={onSaved}
                    onToggleIncluded={(included) => onToggleIncluded(line.id, included)}
                  />
                ))}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              {rows.length > PREVIEW_ROWS || full ? (
                <button
                  type="button"
                  className="text-[13px] font-medium text-[#7C4A57] hover:underline"
                  onClick={onToggleFull}
                >
                  {full ? "Rodyti trumpą sąrašą" : expandAllLabel(category, selected || rows.length)}
                </button>
              ) : (
                <span />
              )}
              <button
                type="button"
                className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[#6F7077] hover:text-[#17171B]"
                onClick={onManage}
              >
                <Settings2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                Valdyti paslaugą
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
