"use client";

import type { ReactNode } from "react";
import { Check, Download } from "lucide-react";
import { formatDiscountPct, ltPlural } from "@/components/crm/commercial-proposal/studio/shared";
import type { EditorTab } from "@/components/crm/commercial-proposal/studio/types";

const STEPS: { id: EditorTab; n: string; title: string }[] = [
  { id: "recipient", n: "01", title: "Gavėjas" },
  { id: "services", n: "02", title: "Paslaugos" },
  { id: "prices", n: "03", title: "Kainodara" },
  { id: "review", n: "04", title: "Peržiūra" },
];

export function ProposalWorkflowRail({
  tab,
  onTab,
  summaries,
  completed,
}: {
  tab: EditorTab;
  onTab: (id: EditorTab) => void;
  summaries: Record<EditorTab, string>;
  completed: Record<EditorTab, boolean>;
}) {
  const order: EditorTab[] = ["recipient", "services", "prices", "review"];
  const activeIdx = order.indexOf(tab);

  return (
    <nav className="flex gap-1 overflow-x-auto lg:flex-col lg:gap-1" aria-label="Pasiūlymo eiga">
      {STEPS.map((s, i) => {
        const active = tab === s.id;
        const done = completed[s.id] && !active;
        return (
          <button
            key={s.id}
            type="button"
            title={`${s.title}: ${summaries[s.id]}`}
            onClick={() => onTab(s.id)}
            className={[
              "flex min-w-[9.5rem] items-start gap-2.5 rounded-[12px] px-2.5 py-2 text-left lg:min-w-0",
              active ? "bg-[#F7EEF0]" : "hover:bg-white/80",
            ].join(" ")}
          >
            <span
              className={[
                "mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
                active
                  ? "bg-[#7C4A57] text-white"
                  : done
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-zinc-100 text-[#5C5D64]",
              ].join(" ")}
            >
              {done ? <Check className="h-3.5 w-3.5" strokeWidth={2.5} /> : s.n}
            </span>
            <span className="min-w-0">
              <span className={`block text-[13px] font-semibold ${active ? "text-[#7C4A57]" : i > activeIdx ? "text-[#6F7077]" : "text-[#17171B]"}`}>
                {s.title}
              </span>
              <span className="mt-0.5 block truncate text-[12px] text-[#5C5D64]" title={summaries[s.id]}>
                {summaries[s.id]}
              </span>
            </span>
          </button>
        );
      })}
    </nav>
  );
}

export function ProposalSummaryBar({
  includedCategories,
  includedCount,
  manualCount,
  translationPct,
  aiPct,
  extraPct,
  onGenerate,
  readOnly,
  pending,
}: {
  includedCategories: number;
  includedCount: number;
  manualCount: number;
  translationPct: number;
  aiPct: number;
  extraPct: number;
  onGenerate: () => void;
  readOnly: boolean;
  pending: boolean;
}) {
  const translationLabel = formatDiscountPct(translationPct);
  const aiLabel = formatDiscountPct(aiPct);
  const extraLabel = formatDiscountPct(extraPct);
  const discounts = [
    translationLabel ? `Vertimas ${translationLabel}` : null,
    aiLabel ? `AI ${aiLabel}` : null,
    extraLabel ? `Papildomos ${extraLabel}` : null,
  ].filter((v): v is string => Boolean(v));

  return (
    <div className="flex h-[54px] shrink-0 items-center border-t border-[#E8E8EB] bg-white px-1 shadow-[0_-4px_16px_rgba(0,0,0,0.03)]">
      <div className="flex w-full items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-x-3 overflow-hidden text-[12px] text-[#5C5D64]">
          <span className="font-medium text-[#17171B]">Santrauka</span>
          <span className="hidden h-3.5 w-px bg-[#E8E8EB] sm:block" />
          <span>
            <strong className="font-semibold text-[#17171B]">{includedCategories}</strong>{" "}
            {ltPlural(includedCategories, "kategorija", "kategorijos", "kategorijų")}
          </span>
          <span className="hidden h-3.5 w-px bg-[#E8E8EB] sm:block" />
          <span>
            <strong className="font-semibold text-[#17171B]">{includedCount}</strong>{" "}
            {ltPlural(includedCount, "įtraukta kaina", "įtrauktos kainos", "įtrauktų kainų")}
          </span>
          {manualCount > 0 ? (
            <>
              <span className="hidden h-3.5 w-px bg-[#E8E8EB] sm:block" />
              <span>
                <strong className="font-semibold text-[#17171B]">{manualCount}</strong>{" "}
                {ltPlural(manualCount, "rankinė kaina", "rankinės kainos", "rankinių kainų")}
              </span>
            </>
          ) : null}
          <span className="hidden h-3.5 w-px bg-[#E8E8EB] sm:block" />
          {discounts.length === 0 ? (
            <span>Be nuolaidų</span>
          ) : (
            <span className="text-[#7C4A57]">{discounts.join(" · ")}</span>
          )}
        </div>
        {!readOnly ? (
          <button
            type="button"
            disabled={pending || includedCount === 0}
            className="inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-[#7C4A57] px-3.5 text-sm font-medium text-white hover:bg-[#693948] disabled:opacity-50"
            onClick={onGenerate}
          >
            <Download className="h-4 w-4" />
            Generuoti PDF
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function StudioSection({
  title,
  subtitle,
  action,
  children,
  maxWidth,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  maxWidth?: string;
}) {
  return (
    <section className={maxWidth ?? ""}>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-[22px] font-semibold tracking-tight text-[#17171B]">{title}</h2>
          {subtitle ? <p className="mt-1 text-[13px] text-[#5C5D64]">{subtitle}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
