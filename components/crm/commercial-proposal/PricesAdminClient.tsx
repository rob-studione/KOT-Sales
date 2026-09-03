"use client";

import { useState } from "react";
import { PriceCatalogAdminClient } from "@/components/crm/commercial-proposal/PriceCatalogAdminClient";
import { PricingGroupsAdminClient } from "@/components/crm/commercial-proposal/PricingGroupsAdminClient";
import type { CpPriceItem } from "@/lib/commercialProposal/types";
import type { CpPricingGroup } from "@/lib/crm/pricingGroups";

type Tab = "catalog" | "groups";

const FOCUS_RING =
  "outline-none focus-visible:ring-2 focus-visible:ring-[#7C4A57] focus-visible:ring-offset-2";

export function PricesAdminClient({
  catalog,
  groups,
}: {
  catalog: CpPriceItem[];
  groups: CpPricingGroup[];
}) {
  const [tab, setTab] = useState<Tab>("catalog");
  const tabs: Array<{ key: Tab; label: string }> = [
    { key: "catalog", label: "Kainynas" },
    { key: "groups", label: "Nuolaidų grupės" },
  ];

  return (
    <div>
      <div className="inline-flex rounded-[10px] border border-[#E8E8EB] bg-white p-0.5" role="tablist" aria-label="Kainų nustatymai">
        {tabs.map((item) => {
          const active = tab === item.key;
          return (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(item.key)}
              className={[
                "inline-flex h-9 items-center rounded-[8px] px-3 text-sm",
                active ? "bg-[#F7EEF0] font-medium text-[#7C4A57]" : "text-[#6F7077] hover:text-[#17171B]",
                FOCUS_RING,
              ].join(" ")}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      <div className="mt-5">
        {tab === "catalog" ? <PriceCatalogAdminClient initial={catalog} /> : <PricingGroupsAdminClient initial={groups} />}
      </div>
    </div>
  );
}
