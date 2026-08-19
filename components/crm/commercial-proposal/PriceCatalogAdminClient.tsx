"use client";

import { useState, useTransition } from "react";
import { updatePriceItemAction } from "@/lib/crm/commercialProposalActions";
import { formatLtMoney } from "@/lib/commercialProposal/money";
import type { CpPriceCategory, CpPriceItem } from "@/lib/commercialProposal/types";

const CATEGORY_LABEL: Record<CpPriceCategory, string> = {
  translation: "Vertimas raštu",
  ai_translation: "AI vertimas ir redagavimas",
  additional_service: "Papildomos paslaugos",
};

function PriceRow({ item }: { item: CpPriceItem }) {
  const [label, setLabel] = useState(item.label);
  const [price, setPrice] = useState(item.base_price == null ? "" : formatLtMoney(item.base_price));
  const [from, setFrom] = useState(item.is_from_price);
  const [free, setFree] = useState(item.is_free);
  const [active, setActive] = useState(item.active);
  const [unit, setUnit] = useState(item.unit ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <tr className={active ? "" : "opacity-60"}>
      <td className="px-3 py-2">
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="h-8 w-full min-w-[180px] rounded-md border border-zinc-200 px-2 text-sm"
        />
      </td>
      <td className="px-3 py-2">
        <input
          value={price}
          disabled={free}
          onChange={(e) => setPrice(e.target.value)}
          className="h-8 w-24 rounded-md border border-zinc-200 px-2 text-right text-sm tabular-nums"
        />
      </td>
      <td className="px-3 py-2 text-center">
        <input type="checkbox" checked={from} onChange={(e) => setFrom(e.target.checked)} />
      </td>
      <td className="px-3 py-2 text-center">
        <input type="checkbox" checked={free} onChange={(e) => setFree(e.target.checked)} />
      </td>
      <td className="px-3 py-2">
        <input
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
          className="h-8 w-20 rounded-md border border-zinc-200 px-2 text-sm"
        />
      </td>
      <td className="px-3 py-2 text-center">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
      </td>
      <td className="px-3 py-2">
        <button
          type="button"
          disabled={pending}
          className="text-sm font-medium text-[#7C4A57] hover:underline disabled:opacity-50"
          onClick={() => {
            start(async () => {
              const res = await updatePriceItemAction({
                id: item.id,
                label,
                basePrice: price,
                isFromPrice: from,
                isFree: free,
                active,
                sortOrder: item.sort_order,
                unit: unit.trim() || null,
              });
              setMessage(res.ok ? "Išsaugota" : res.error);
            });
          }}
        >
          Įrašyti
        </button>
        {message ? <div className="text-[11px] text-zinc-500">{message}</div> : null}
      </td>
    </tr>
  );
}

export function PriceCatalogAdminClient({ initial }: { initial: CpPriceItem[] }) {
  const cats: CpPriceCategory[] = ["translation", "ai_translation", "additional_service"];
  return (
    <div className="space-y-8">
      {cats.map((cat) => {
        const rows = initial.filter((x) => x.category === cat).sort((a, b) => a.sort_order - b.sort_order);
        return (
          <section key={cat} className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
            <div className="border-b border-zinc-100 px-4 py-3 text-sm font-medium text-zinc-900">
              {CATEGORY_LABEL[cat]}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-zinc-50 text-left text-xs font-medium uppercase tracking-wide text-zinc-500">
                  <tr>
                    <th className="px-3 py-2">Pavadinimas</th>
                    <th className="px-3 py-2">Bazinė kaina</th>
                    <th className="px-3 py-2">Nuo</th>
                    <th className="px-3 py-2">Nemokama</th>
                    <th className="px-3 py-2">Vnt.</th>
                    <th className="px-3 py-2">Aktyvi</th>
                    <th className="px-3 py-2"> </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {rows.map((item) => (
                    <PriceRow key={item.id} item={item} />
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </div>
  );
}
