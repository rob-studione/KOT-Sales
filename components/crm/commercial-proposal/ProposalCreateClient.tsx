"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RecipientSelector } from "@/components/crm/commercial-proposal/RecipientSelector";
import { PricingGroupPicker } from "@/components/crm/commercial-proposal/PricingGroupPicker";
import {
  createCommercialProposalAction,
  listPricingGroupsAction,
  type ProposalRecipientOption,
} from "@/lib/crm/commercialProposalActions";
import { commercialProposalPath } from "@/lib/crm/commercialProposalPaths";
import { CATEGORY_LABEL } from "@/components/crm/commercial-proposal/studio/shared";
import { CP_CATEGORIES, type CpPriceCategory } from "@/lib/commercialProposal/types";
import { normalizeCategoryDiscounts, parseDiscountInput, type CpCategoryDiscounts } from "@/lib/commercialProposal/discounts";
import { defaultPricingGroup, type CpPricingGroup } from "@/lib/crm/pricingGroups";

const FOCUS_RING =
  "outline-none focus-visible:ring-2 focus-visible:ring-[#7C4A57] focus-visible:ring-offset-2";

function emptyInputs(): Record<CpPriceCategory, string> {
  return { translation: "0", ai_translation: "0", additional_service: "0" };
}

function inputsFromDiscounts(d: CpCategoryDiscounts): Record<CpPriceCategory, string> {
  return {
    translation: String(d.translation),
    ai_translation: String(d.ai_translation),
    additional_service: String(d.additional_service),
  };
}

export function ProposalCreateClient({
  preset,
  onCancel,
  asDialog,
  pricingGroups = [],
}: {
  preset?: ProposalRecipientOption | null;
  onCancel?: () => void;
  asDialog?: boolean;
  pricingGroups?: CpPricingGroup[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<ProposalRecipientOption | null>(preset ?? null);
  const [groups, setGroups] = useState<CpPricingGroup[]>(pricingGroups);
  const [groupId, setGroupId] = useState<string | null>(() => defaultPricingGroup(pricingGroups)?.id ?? null);
  const [inputs, setInputs] = useState<Record<CpPriceCategory, string>>(() => {
    const def = defaultPricingGroup(pricingGroups);
    return def ? inputsFromDiscounts(def.discounts) : emptyInputs();
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (pricingGroups.length) return;
    void listPricingGroupsAction()
      .then((rows) => {
        setGroups(rows);
        const def = defaultPricingGroup(rows);
        if (def) {
          setGroupId(def.id);
          setInputs(inputsFromDiscounts(def.discounts));
        }
      })
      .catch(() => setGroups([]));
  }, [pricingGroups.length]);

  function collectDiscounts(): CpCategoryDiscounts | null {
    const raw: Partial<CpCategoryDiscounts> = {};
    for (const c of CP_CATEGORIES) {
      const parsed = parseDiscountInput(inputs[c]);
      if (!parsed.ok) {
        setError(parsed.error);
        return null;
      }
      raw[c] = parsed.value;
    }
    return normalizeCategoryDiscounts(raw);
  }

  function createDraft() {
    if (!selected) return;
    const discounts = collectDiscounts();
    if (!discounts) return;
    setError(null);
    start(async () => {
      const res = await createCommercialProposalAction({
        recipientType: selected.recipientType,
        recipientId: selected.recipientId,
        workItemId: selected.workItemId ?? undefined,
        categoryDiscounts: discounts,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.push(commercialProposalPath(res.id));
    });
  }

  return (
    <div className={asDialog ? "" : "mx-auto max-w-xl"}>
      {!asDialog ? (
        <>
          <h2 className="text-[16px] font-semibold text-[#17171B]">Gavėjas</h2>
          <p className="mt-1 text-[13px] text-[#6F7077]">Pasirinkite esamą klientą arba leadą. Be gavėjo juodraštis nesukuriamas.</p>
        </>
      ) : null}

      <div className={asDialog ? "" : "mt-4"}>
        <RecipientSelector selected={selected} onSelect={setSelected} onClear={() => setSelected(null)} autoFocus />
      </div>

      {selected ? (
        <div className="mt-4 space-y-3">
          <PricingGroupPicker
            groups={groups}
            selectedId={groupId}
            disabled={pending}
            onSelect={(group) => {
              setGroupId(group.id);
              setInputs(inputsFromDiscounts(group.discounts));
              setError(null);
            }}
          />
          <div className="grid gap-2 sm:grid-cols-3">
            {CP_CATEGORIES.map((c) => (
              <label key={c} className="block">
                <span className="text-[12px] text-[#6F7077]">{CATEGORY_LABEL[c]}</span>
                <div className="relative mt-1">
                  <input
                    value={inputs[c]}
                    disabled={pending}
                    inputMode="decimal"
                    aria-label={`${CATEGORY_LABEL[c]} nuolaida procentais`}
                    onChange={(e) => setInputs((prev) => ({ ...prev, [c]: e.target.value }))}
                    className={`h-9 w-full rounded-[8px] border border-[#E8E8EB] px-2 pr-6 text-right text-[13px] tabular-nums text-[#17171B] ${FOCUS_RING}`}
                  />
                  <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-[12px] text-[#6F7077]">
                    %
                  </span>
                </div>
              </label>
            ))}
          </div>
        </div>
      ) : null}

        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

        <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
          {onCancel ? (
            <button type="button" className="h-9 rounded-[10px] px-3 text-sm text-[#6F7077] hover:underline" onClick={onCancel}>
              Atšaukti
            </button>
          ) : null}
          <button
            type="button"
            disabled={!selected || pending}
            className="inline-flex h-9 items-center rounded-[10px] bg-[#7C4A57] px-4 text-sm font-medium text-white hover:bg-[#693948] disabled:opacity-50"
            onClick={createDraft}
          >
            Sukurti juodraštį
          </button>
        </div>
    </div>
  );
}
