"use client";

import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { CategoryIcon, DiscountChip } from "@/components/crm/commercial-proposal/studio/ProposalServiceCard";
import { CATEGORY_LABEL, STUDIO_CARD, formatDiscountCell } from "@/components/crm/commercial-proposal/studio/shared";
import { applyGlobalDiscount, formatLtMoney } from "@/lib/commercialProposal/money";
import { categoryDiscount, type CpCategoryDiscounts } from "@/lib/commercialProposal/discounts";
import { CP_CATEGORIES, type CpPriceCategory, type CpPriceItem } from "@/lib/commercialProposal/types";

const VISIBLE_ROWS = 5;
const ROW_H = 40;
const HEAD_H = 36;

function moneyLabel(item: CpPriceItem, amount: number | null): string {
  if (item.is_free || amount == null) return item.is_free ? "nemokamas" : "—";
  const text = `${formatLtMoney(amount)} €`;
  return item.is_from_price ? `nuo ${text}` : text;
}

function ExpressPriceRow({
  item,
  pct,
}: {
  item: CpPriceItem;
  pct: number;
}) {
  const after = item.is_free || item.base_price == null ? null : applyGlobalDiscount(item.base_price, pct);
  return (
    <div
      className="grid grid-cols-[minmax(0,1fr)_4.75rem_3.25rem_5.75rem] items-center gap-x-2 border-b border-[#EEEEF0] px-3 last:border-b-0"
      style={{ minHeight: ROW_H }}
    >
      <p className="min-w-0 truncate text-[13px] text-[#17171B]" title={item.label}>
        {item.label}
      </p>
      <p className="text-right text-[13px] tabular-nums text-[#989AA2]">{moneyLabel(item, item.base_price)}</p>
      <p className={`text-right text-[12px] tabular-nums ${pct > 0 ? "text-[#7C4A57]" : "text-[#989AA2]"}`}>
        {formatDiscountCell(pct)}
      </p>
      <p className="text-right text-[13px] font-semibold tabular-nums text-[#17171B]">{moneyLabel(item, after)}</p>
    </div>
  );
}

export function ExpressCategoryAccordion({
  items,
  discounts,
}: {
  items: CpPriceItem[];
  discounts: CpCategoryDiscounts;
}) {
  const [open, setOpen] = useState<CpPriceCategory | null>("translation");
  const groups = useMemo(
    () =>
      CP_CATEGORIES.map((category) => ({
        category,
        rows: items
          .filter((item) => item.category === category && item.active)
          .sort((a, b) => a.sort_order - b.sort_order),
      })),
    [items]
  );

  return (
    <div className="grid gap-2">
      {groups.map(({ category, rows }) => {
        const expanded = open === category;
        const pct = categoryDiscount(discounts, category);
        return (
          <div key={category} className={`${STUDIO_CARD} overflow-hidden`}>
            <button
              type="button"
              className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
              aria-expanded={expanded}
              onClick={() => setOpen(expanded ? null : category)}
            >
              <CategoryIcon category={category} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-semibold text-[#17171B]">{CATEGORY_LABEL[category]}</span>
                <span className="mt-0.5 block text-[12px] text-[#6F7077]">
                  {rows.length === 0 ? "Kainų nėra" : `${rows.length} iš ${rows.length} įtraukta`}
                </span>
              </span>
              <DiscountChip pct={pct} />
              <ChevronDown
                className={[
                  "h-4 w-4 shrink-0 text-[#989AA2] transition-transform duration-150",
                  expanded ? "rotate-180" : "",
                ].join(" ")}
              />
            </button>
            {expanded ? (
              <div className="border-t border-[#EEEEF0]">
                <div
                  className="grid grid-cols-[minmax(0,1fr)_4.75rem_3.25rem_5.75rem] items-center gap-x-2 px-3 text-[11px] font-medium uppercase tracking-wide text-[#6F7077]"
                  style={{ height: HEAD_H }}
                >
                  <span>Pavadinimas</span>
                  <span className="text-right">Bazinė</span>
                  <span className="text-right">Nuolaida</span>
                  <span className="text-right">Galutinė</span>
                </div>
                {rows.length === 0 ? (
                  <p className="px-3 py-6 text-center text-[13px] text-[#6F7077]">Šioje kategorijoje kainų nėra.</p>
                ) : (
                  <div className="overflow-y-auto overscroll-contain" style={{ maxHeight: VISIBLE_ROWS * ROW_H }}>
                    {rows.map((item) => (
                      <ExpressPriceRow key={item.id} item={item} pct={pct} />
                    ))}
                  </div>
                )}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
