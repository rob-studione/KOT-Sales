import { previewCatalogPrices } from "@/lib/commercialProposal/catalogPreview";
import { categoryDiscount, type CpCategoryDiscounts } from "@/lib/commercialProposal/discounts";
import { formatLtMoney } from "@/lib/commercialProposal/money";
import type { CpPriceItem } from "@/lib/commercialProposal/types";
import { CATEGORY_LABEL } from "@/components/crm/commercial-proposal/studio/shared";

function amountLabel(
  isFrom: boolean,
  value: number | null,
  currency: string
): string {
  if (value == null) return "—";
  const text = `${formatLtMoney(value)} ${currency}`.trim();
  return isFrom ? `nuo ${text}` : text;
}

export function CategoryPricePreviewList({
  items,
  discounts,
}: {
  items: CpPriceItem[];
  discounts: CpCategoryDiscounts;
}) {
  const rows = previewCatalogPrices(items, discounts);
  return (
    <ul className="divide-y divide-[#E8E8EB] overflow-hidden rounded-[12px] border border-[#E8E8EB]">
      {rows.map((row) => {
        const pct = categoryDiscount(discounts, row.category);
        const changed = row.minAfter != null && row.minBase != null && pct > 0;
        return (
          <li key={row.category} className="flex items-start justify-between gap-4 px-3 py-2.5">
            <p className="min-w-0 text-[13px] font-medium text-[#17171B]">{CATEGORY_LABEL[row.category]}</p>
            <p className="shrink-0 text-right text-[13px] tabular-nums text-[#17171B]">
              {row.count === 0 ? (
                <span className="font-normal text-[#6F7077]">Nėra kainų</span>
              ) : changed ? (
                <>
                  <span className="text-[#6F7077] line-through">{amountLabel(row.isFrom, row.minBase, row.currency)}</span>
                  <span className="mx-1.5 text-[#6F7077]">→</span>
                  <span>{amountLabel(row.isFrom, row.minAfter, row.currency)}</span>
                </>
              ) : (
                amountLabel(row.isFrom, row.minBase, row.currency)
              )}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
