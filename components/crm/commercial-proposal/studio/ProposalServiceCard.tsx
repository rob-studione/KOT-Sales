"use client";

import type { ReactNode } from "react";
import { Languages, Layers, Sparkles } from "lucide-react";
import { CATEGORY_LABEL, STUDIO_CARD, formatDiscountPct } from "@/components/crm/commercial-proposal/studio/shared";
import type { CpPriceCategory } from "@/lib/commercialProposal/types";

const ICON: Record<CpPriceCategory, { node: ReactNode; wrap: string }> = {
  translation: {
    node: <Languages className="h-4 w-4" strokeWidth={1.75} />,
    wrap: "bg-[#F7EEF0] text-[#7C4A57]",
  },
  ai_translation: {
    node: <Sparkles className="h-4 w-4" strokeWidth={1.75} />,
    wrap: "bg-[#F4F1F8] text-[#6B5B7A]",
  },
  additional_service: {
    node: <Layers className="h-4 w-4" strokeWidth={1.75} />,
    wrap: "bg-[#F8F4EE] text-[#8A6A3B]",
  },
};

export function CategoryIcon({ category, size = "md" }: { category: CpPriceCategory; size?: "sm" | "md" }) {
  const icon = ICON[category];
  const box = size === "sm" ? "h-8 w-8 rounded-[8px]" : "h-10 w-10 rounded-[10px]";
  return (
    <span className={`inline-flex shrink-0 items-center justify-center ${box} ${icon.wrap}`}>{icon.node}</span>
  );
}

export function DiscountChip({ pct, dimmed }: { pct: number; dimmed?: boolean }) {
  const text = formatDiscountPct(pct);
  if (!text) return null;
  return (
    <span
      className={[
        "inline-flex items-center rounded-full px-2 py-0.5 text-[12px] font-medium tabular-nums",
        dimmed ? "bg-zinc-100 text-[#989AA2]" : "bg-[#F7EEF0] text-[#7C4A57]",
      ].join(" ")}
    >
      {text}
    </span>
  );
}

export function ProposalServiceCard({
  category,
  selected,
  total,
  discountPct,
  readOnly,
  checkbox,
  onManage,
}: {
  category: CpPriceCategory;
  selected: number;
  total: number;
  discountPct: number;
  readOnly: boolean;
  checkbox: ReactNode;
  onManage: () => void;
}) {
  const excluded = selected === 0;
  return (
    <div
      className={[
        STUDIO_CARD,
        "p-4 transition-opacity duration-150 motion-reduce:transition-none",
        excluded ? "opacity-70" : "",
      ].join(" ")}
    >
      <div className="flex items-start gap-3">
        {checkbox}
        <CategoryIcon category={category} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-[16px] font-semibold text-[#17171B]">{CATEGORY_LABEL[category]}</div>
              <div className="mt-0.5 text-[13px] text-[#6F7077]">
                {excluded ? "Neįtraukta" : `${selected} iš ${total} įtraukta`}
              </div>
            </div>
            <DiscountChip pct={discountPct} dimmed={excluded} />
          </div>
          {excluded ? <p className="mt-2 text-[12px] font-medium text-[#6F7077]">Neįtraukta į PDF</p> : null}
          <button
            type="button"
            className="mt-3 text-[13px] font-medium text-[#7C4A57] hover:underline"
            onClick={onManage}
          >
            {readOnly ? "Peržiūrėti paslaugas" : "Keisti paslaugas"}
          </button>
        </div>
      </div>
    </div>
  );
}
