"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import {
  createPricingGroupAction,
  deletePricingGroupAction,
  updatePricingGroupAction,
} from "@/lib/crm/commercialProposalActions";
import { parseDiscountInput, type CpCategoryDiscounts } from "@/lib/commercialProposal/discounts";
import { formatCategoryDiscountsLabel } from "@/lib/commercialProposal/uiLabels";
import { CATEGORY_LABEL, STUDIO_CARD } from "@/components/crm/commercial-proposal/studio/shared";
import type { CpPriceCategory } from "@/lib/commercialProposal/types";
import type { CpPricingGroup } from "@/lib/crm/pricingGroups";

const FOCUS_RING =
  "outline-none focus-visible:ring-2 focus-visible:ring-[#7C4A57] focus-visible:ring-offset-2";
const FIELD =
  "h-9 w-full rounded-[10px] border border-[#E8E8EB] bg-white px-3 text-[13px] text-[#17171B]";
const LABEL = "block text-[12px] font-medium text-[#6F7077]";

type Draft = {
  name: string;
  translation: string;
  ai_translation: string;
  additional_service: string;
  active: boolean;
  isDefault: boolean;
};

function pctField(value: number): string {
  return value > 0 ? String(value) : "";
}

function draftFromGroup(group: CpPricingGroup): Draft {
  return {
    name: group.name,
    translation: pctField(group.discounts.translation),
    ai_translation: pctField(group.discounts.ai_translation),
    additional_service: pctField(group.discounts.additional_service),
    active: group.active,
    isDefault: group.is_default,
  };
}

const EMPTY_DRAFT: Draft = {
  name: "",
  translation: "",
  ai_translation: "",
  additional_service: "",
  active: true,
  isDefault: false,
};

function parseDraftDiscounts(draft: Draft): { ok: true; discounts: CpCategoryDiscounts } | { ok: false; error: string } {
  const translation = parseDiscountInput(draft.translation);
  const ai = parseDiscountInput(draft.ai_translation);
  const extra = parseDiscountInput(draft.additional_service);
  if (!translation.ok) return { ok: false, error: translation.error };
  if (!ai.ok) return { ok: false, error: ai.error };
  if (!extra.ok) return { ok: false, error: extra.error };
  return {
    ok: true,
    discounts: {
      translation: translation.value,
      ai_translation: ai.value,
      additional_service: extra.value,
    },
  };
}

function DiscountFields({
  draft,
  onChange,
}: {
  draft: Draft;
  onChange: (next: Partial<Draft>) => void;
}) {
  const fields: Array<{ key: CpPriceCategory; draftKey: "translation" | "ai_translation" | "additional_service" }> = [
    { key: "translation", draftKey: "translation" },
    { key: "ai_translation", draftKey: "ai_translation" },
    { key: "additional_service", draftKey: "additional_service" },
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {fields.map(({ key, draftKey }) => (
        <label key={key} className="block">
          <span className={LABEL}>{CATEGORY_LABEL[key]}</span>
          <div className="relative mt-1">
            <input
              value={String(draft[draftKey])}
              placeholder="0"
              inputMode="decimal"
              onChange={(e) => onChange({ [draftKey]: e.target.value })}
              className={`${FIELD} pr-7 text-right tabular-nums placeholder:text-[#C5C6CB] ${FOCUS_RING}`}
            />
            <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-[12px] text-[#6F7077]">
              %
            </span>
          </div>
        </label>
      ))}
    </div>
  );
}

export function PricingGroupsAdminClient({ initial }: { initial: CpPricingGroup[] }) {
  const router = useRouter();
  const [groups, setGroups] = useState(initial);
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() =>
    Object.fromEntries(initial.map((g) => [g.id, draftFromGroup(g)]))
  );
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createDraft, setCreateDraft] = useState<Draft>(EMPTY_DRAFT);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    setGroups(initial);
    setDrafts(Object.fromEntries(initial.map((g) => [g.id, draftFromGroup(g)])));
  }, [initial]);

  function patchDraft(id: string, next: Partial<Draft>) {
    setDrafts((prev) => {
      const current = prev[id];
      if (!current) return prev;
      return { ...prev, [id]: { ...current, ...next } };
    });
    setMessage(null);
  }

  return (
    <div className="max-w-[840px]">
      <div className="mb-4">
        <h2 className="text-[22px] font-semibold tracking-tight text-[#17171B]">Nuolaidų grupės</h2>
        <p className="mt-1 text-[13px] text-[#5C5D64]">
          Grupė užpildo nuolaidų procentus kuriant pasiūlymą. Kainynas lieka bendras.
        </p>
      </div>

      <div className="grid gap-3">
        {groups.map((group) => {
          const draft = drafts[group.id] ?? draftFromGroup(group);
          const parsed = parseDraftDiscounts(draft);
          const summary = parsed.ok ? formatCategoryDiscountsLabel(parsed.discounts) : "…";
          const open = openId === group.id;
          return (
            <div key={group.id} className={`${STUDIO_CARD} overflow-hidden ${group.active ? "" : "opacity-70"}`}>
              <button
                type="button"
                className={`flex w-full items-start gap-3 p-4 text-left ${FOCUS_RING}`}
                aria-expanded={open}
                onClick={() => setOpenId(open ? null : group.id)}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[16px] font-semibold text-[#17171B]">{group.name}</span>
                    {group.is_default ? (
                      <span className="inline-flex rounded-full bg-[#F7EEF0] px-2 py-0.5 text-[11px] font-medium text-[#7C4A57]">
                        Numatytoji
                      </span>
                    ) : null}
                    {!group.active ? (
                      <span className="inline-flex rounded-full bg-[#F7F7F8] px-2 py-0.5 text-[11px] font-medium text-[#6F7077]">
                        Neaktyvi
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 text-[13px] text-[#6F7077]">{summary}</p>
                </div>
                <span className="shrink-0 pt-0.5 text-[13px] font-medium text-[#7C4A57]">{open ? "Uždaryti" : "Keisti"}</span>
              </button>

              {open ? (
                <div className="border-t border-[#EEEEF0] px-4 py-4">
                  <label className="block">
                    <span className={LABEL}>Pavadinimas</span>
                    <input
                      value={draft.name}
                      onChange={(e) => patchDraft(group.id, { name: e.target.value })}
                      className={`${FIELD} mt-1 ${FOCUS_RING}`}
                    />
                  </label>
                  <div className="mt-3">
                    <DiscountFields draft={draft} onChange={(next) => patchDraft(group.id, next)} />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-4">
                    <label className="inline-flex items-center gap-2 text-[13px] text-[#17171B]">
                      <input
                        type="checkbox"
                        className="rounded border-[#E8E8EB] text-[#7C4A57]"
                        checked={draft.active}
                        onChange={(e) => patchDraft(group.id, { active: e.target.checked })}
                      />
                      Aktyvi
                    </label>
                    <label className="inline-flex items-center gap-2 text-[13px] text-[#17171B]">
                      <input
                        type="checkbox"
                        className="rounded border-[#E8E8EB] text-[#7C4A57]"
                        checked={draft.isDefault}
                        disabled={group.is_default}
                        onChange={(e) => patchDraft(group.id, { isDefault: e.target.checked })}
                      />
                      Numatytoji
                    </label>
                  </div>
                  <div className="mt-4 flex flex-wrap justify-end gap-2">
                    <button
                      type="button"
                      disabled={pending || groups.length <= 1}
                      className={`h-9 rounded-[10px] px-3 text-sm text-[#6F7077] hover:text-red-700 disabled:opacity-50 ${FOCUS_RING}`}
                      onClick={() => {
                        start(async () => {
                          const res = await deletePricingGroupAction(group.id);
                          if (!res.ok) {
                            setMessage(res.error);
                            return;
                          }
                          setOpenId(null);
                          setMessage("Grupė ištrinta.");
                          router.refresh();
                        });
                      }}
                    >
                      Ištrinti
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      className={`h-9 rounded-[10px] bg-[#7C4A57] px-4 text-sm font-medium text-white hover:bg-[#693948] disabled:opacity-50 ${FOCUS_RING}`}
                      onClick={() => {
                        const next = parseDraftDiscounts(draft);
                        if (!next.ok) {
                          setMessage(next.error);
                          return;
                        }
                        start(async () => {
                          const res = await updatePricingGroupAction({
                            id: group.id,
                            name: draft.name,
                            discounts: next.discounts,
                            active: draft.active,
                            isDefault: draft.isDefault,
                          });
                          if (!res.ok) {
                            setMessage(res.error);
                            return;
                          }
                          setMessage("Grupė išsaugota.");
                          router.refresh();
                        });
                      }}
                    >
                      {pending ? "Saugoma…" : "Išsaugoti"}
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}

        {creating ? (
          <div className={`${STUDIO_CARD} p-4`}>
            <h3 className="text-[16px] font-semibold text-[#17171B]">Nauja grupė</h3>
            <label className="mt-3 block">
              <span className={LABEL}>Pavadinimas</span>
              <input
                value={createDraft.name}
                onChange={(e) => setCreateDraft((prev) => ({ ...prev, name: e.target.value }))}
                className={`${FIELD} mt-1 ${FOCUS_RING}`}
              />
            </label>
            <div className="mt-3">
              <DiscountFields
                draft={createDraft}
                onChange={(next) => setCreateDraft((prev) => ({ ...prev, ...next }))}
              />
            </div>
            <label className="mt-3 inline-flex items-center gap-2 text-[13px] text-[#17171B]">
              <input
                type="checkbox"
                className="rounded border-[#E8E8EB] text-[#7C4A57]"
                checked={createDraft.isDefault}
                onChange={(e) => setCreateDraft((prev) => ({ ...prev, isDefault: e.target.checked }))}
              />
              Padaryti numatytąja
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className={`h-9 rounded-[10px] px-3 text-sm text-[#6F7077] hover:underline ${FOCUS_RING}`}
                onClick={() => {
                  setCreating(false);
                  setCreateDraft(EMPTY_DRAFT);
                }}
              >
                Atšaukti
              </button>
              <button
                type="button"
                disabled={pending || !createDraft.name.trim()}
                className={`h-9 rounded-[10px] bg-[#7C4A57] px-4 text-sm font-medium text-white hover:bg-[#693948] disabled:opacity-50 ${FOCUS_RING}`}
                onClick={() => {
                  const parsed = parseDraftDiscounts(createDraft);
                  if (!parsed.ok) {
                    setMessage(parsed.error);
                    return;
                  }
                  start(async () => {
                    const res = await createPricingGroupAction({
                      name: createDraft.name,
                      discounts: parsed.discounts,
                      isDefault: createDraft.isDefault,
                    });
                    if (!res.ok) {
                      setMessage(res.error);
                      return;
                    }
                    setCreateDraft(EMPTY_DRAFT);
                    setCreating(false);
                    setMessage("Grupė sukurta.");
                    router.refresh();
                  });
                }}
              >
                Sukurti grupę
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className={`flex items-center justify-center gap-2 rounded-[14px] border border-dashed border-[#E8E8EB] bg-white px-4 py-4 text-[13px] font-medium text-[#7C4A57] hover:bg-[#F7F7F8] ${FOCUS_RING}`}
            onClick={() => setCreating(true)}
          >
            <Plus className="h-4 w-4" strokeWidth={1.75} />
            Nauja grupė
          </button>
        )}
      </div>

      {message ? <p className="mt-4 text-[13px] text-[#17171B]">{message}</p> : null}
    </div>
  );
}
