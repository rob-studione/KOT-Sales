"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { CrmAnalyticsHeader } from "@/components/crm/CrmAnalyticsHeader";
import { KlientaiSubNav } from "@/components/crm/KlientaiSubNav";

/**
 * Apžvalga (/analitika) — be klientų skirtukų; jie rodomi tik aktyvūs/prarasti ir /clients kontekste.
 */
export function AnalitikaLayoutShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const showClientTabs =
    pathname.startsWith("/analitika/aktyvus") || pathname.startsWith("/analitika/prarasti");

  return (
    <div>
      <CrmAnalyticsHeader
        title="Analitika"
        tabs={showClientTabs ? <KlientaiSubNav /> : undefined}
      />
      <div className="mt-6">{children}</div>
    </div>
  );
}
