"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updatePriceItemAction } from "@/lib/crm/commercialProposalActions";
import { formatLtMoney } from "@/lib/commercialProposal/money";
import type { CpPriceCategory, CpPriceItem } from "@/lib/commercialProposal/types";

const CATEGORY_LABEL: Record<CpPriceCategory, string> = {
  translation: "Vertimas raštu",
  ai_translation: "AI vertimas ir redagavimas",
  additional_service: "Papildomos paslaugos",
};

const CATEGORIES: CpPriceCategory[] = ["translation", "ai_translation", "additional_service"];

type PriceKind = "fixed" | "from" | "free";

type RowDraft = {
  label: string;
  price: string;
  kind: PriceKind;
  unit: string;
  active: boolean;
};

function kindFromItem(item: CpPriceItem): PriceKind {
  if (item.is_free) return "free";
  if (item.is_from_price) return "from";
  return "fixed";
}

function draftFromItem(item: CpPriceItem): RowDraft {
  return {
    label: item.label,
    price: item.base_price == null ? "" : formatLtMoney(item.base_price),
    kind: kindFromItem(item),
    unit: item.unit ?? "",
    active: item.active,
  };
}

function draftsDiffer(a: RowDraft | undefined, b: RowDraft | undefined): boolean {
  if (!a || !b) return Boolean(a || b);
  return a.label !== b.label || a.price !== b.price || a.kind !== b.kind || a.unit !== b.unit || a.active !== b.active;
}

export function PriceCatalogAdminClient({ initial }: { initial: CpPriceItem[] }) {
  const router = useRouter();
  const [tab, setTab] = useState<CpPriceCategory>("translation");
  const [drafts, setDrafts] = useState<Record<string, RowDraft>>(() =>
    Object.fromEntries(initial.map((item) => [item.id, draftFromItem(item)]))
  );
  const [pristine, setPristine] = useState<Record<string, RowDraft>>(() =>
    Object.fromEntries(initial.map((item) => [item.id, draftFromItem(item)]))
  );
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    const next = Object.fromEntries(initial.map((item) => [item.id, draftFromItem(item)]));
    setDrafts(next);
    setPristine(next);
  }, [initial]);

  const counts = useMemo(() => {
    const next = { translation: 0, ai_translation: 0, additional_service: 0 } satisfies Record<CpPriceCategory, number>;
    for (const item of initial) next[item.category] += 1;
    return next;
  }, [initial]);

  const visible = useMemo(
    () => initial.filter((item) => item.category === tab).sort((a, b) => a.sort_order - b.sort_order),
    [initial, tab]
  );

  const dirtyItems = useMemo(
    () => initial.filter((item) => draftsDiffer(drafts[item.id], pristine[item.id])),
    [drafts, initial, pristine]
  );

  function patch(id: string, next: Partial<RowDraft>) {
    setDrafts((prev) => {
      const current = prev[id];
      if (!current) return prev;
      return { ...prev, [id]: { ...current, ...next } };
    });
    setMessage(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1 border-b border-zinc-200 pb-px" role="tablist" aria-label="Kainų kategorijos">
          {CATEGORIES.map((cat) => {
            const active = tab === cat;
            return (
              <button
                key={cat}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(cat)}
                className={[
                  "rounded-t-md px-3 py-2 text-sm",
                  active
                    ? "bg-white font-medium text-[#7C4A57] shadow-[inset_0_-2px_0_0_#7C4A57]"
                    : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900",
                ].join(" ")}
              >
                {CATEGORY_LABEL[cat]} ({counts[cat]})
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {dirtyItems.length ? (
            <span className="text-sm text-zinc-600">Yra neišsaugotų pakeitimų</span>
          ) : null}
          <button
            type="button"
            disabled={pending || dirtyItems.length === 0}
            className="rounded-lg bg-[#7C4A57] px-4 py-2 text-sm font-medium text-white hover:bg-[#693948] disabled:opacity-50"
            onClick={() => {
              start(async () => {
                const savedIds: string[] = [];
                for (const item of dirtyItems) {
                  const draft = drafts[item.id];
                  if (!draft) continue;
                  const res = await updatePriceItemAction({
                    id: item.id,
                    label: draft.label,
                    basePrice: draft.price,
                    isFromPrice: draft.kind === "from",
                    isFree: draft.kind === "free",
                    active: draft.active,
                    sortOrder: item.sort_order,
                    unit: draft.unit.trim() || null,
                  });
                  if (!res.ok) {
                    if (savedIds.length) {
                      setPristine((prev) => {
                        const next = { ...prev };
                        for (const id of savedIds) {
                          const saved = drafts[id];
                          if (saved) next[id] = saved;
                        }
                        return next;
                      });
                    }
                    setMessage(res.error);
                    return;
                  }
                  savedIds.push(item.id);
                }
                setPristine((prev) => {
                  const next = { ...prev };
                  for (const id of savedIds) {
                    const saved = drafts[id];
                    if (saved) next[id] = saved;
                  }
                  return next;
                });
                setMessage("Pakeitimai išsaugoti.");
                router.refresh();
              });
            }}
          >
            {pending ? "Saugoma…" : "Išsaugoti pakeitimus"}
          </button>
        </div>
      </div>
      {message ? <p className="text-sm text-zinc-700">{message}</p> : null}

      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-zinc-50 text-left text-xs font-medium uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-3 py-2">Pavadinimas</th>
                <th className="px-3 py-2">Bazinė kaina</th>
                <th className="px-3 py-2">Kainos tipas</th>
                <th className="px-3 py-2">Vnt.</th>
                <th className="px-3 py-2">Aktyvi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {visible.map((item) => {
                const draft = drafts[item.id] ?? draftFromItem(item);
                const dirty = draftsDiffer(draft, pristine[item.id]);
                const free = draft.kind === "free";
                return (
                  <tr key={item.id} className={dirty ? "bg-[#7C4A57]/5" : item.active ? "" : "opacity-60"}>
                    <td className="px-3 py-2">
                      <input
                        value={draft.label}
                        onChange={(e) => patch(item.id, { label: e.target.value })}
                        className="h-8 w-full min-w-[180px] rounded-md border border-zinc-200 px-2 text-sm"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        value={draft.price}
                        disabled={free}
                        onChange={(e) => patch(item.id, { price: e.target.value })}
                        className="h-8 w-24 rounded-md border border-zinc-200 px-2 text-right text-sm tabular-nums disabled:bg-zinc-50 disabled:text-zinc-400"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <select
                        value={draft.kind}
                        onChange={(e) => patch(item.id, { kind: e.target.value as PriceKind })}
                        className="h-8 rounded-md border border-zinc-200 bg-white px-2 text-sm"
                      >
                        <option value="fixed">Fiksuota</option>
                        <option value="from">Nuo</option>
                        <option value="free">Nemokama</option>
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <input
                        value={draft.unit}
                        onChange={(e) => patch(item.id, { unit: e.target.value })}
                        className="h-8 w-20 rounded-md border border-zinc-200 px-2 text-sm"
                      />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={draft.active}
                        onChange={(e) => patch(item.id, { active: e.target.checked })}
                      />
                    </td>
                  </tr>
                );
              })}
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-zinc-500">
                    Šioje kategorijoje kainų nėra.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
