"use client";

import { useState } from "react";
import { PriceCatalogAdminClient } from "@/components/crm/commercial-proposal/PriceCatalogAdminClient";
import { PricingGroupsAdminClient } from "@/components/crm/commercial-proposal/PricingGroupsAdminClient";
import { PROPOSAL_TOOL_CARD } from "@/components/crm/commercial-proposal/ProposalToolShell";
import type { CpPriceItem } from "@/lib/commercialProposal/types";
import type { CpPricingGroup } from "@/lib/crm/pricingGroups";

type Tab = "catalog" | "groups";

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
    { key: "groups", label: "Kainodaros grupės" },
  ];

  return (
    <section className={PROPOSAL_TOOL_CARD}>
      <div className="flex flex-wrap gap-1 border-b border-[#E8E8EB] px-4" role="tablist" aria-label="Kainų nustatymai">
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
                "inline-flex h-11 items-center px-3 text-sm",
                active
                  ? "-mb-px border-b-2 border-[#7C4A57] font-medium text-[#7C4A57]"
                  : "text-[#6F7077] hover:text-[#17171B]",
              ].join(" ")}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      <div className="p-4">
        {tab === "catalog" ? <PriceCatalogAdminClient initial={catalog} /> : <PricingGroupsAdminClient initial={groups} />}
      </div>
    </section>
  );
}
