"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { CrmAnalyticsHeader } from "@/components/crm/CrmAnalyticsHeader";
import { KlientaiSubNav } from "@/components/crm/KlientaiSubNav";

/**
 * Analitika — be klientų skirtukų; jie rodomi tik klientų kontekste (/klientai/*).
 */
export function AnalitikaLayoutShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const showClientTabs = pathname.startsWith("/klientai/aktyvus") || pathname.startsWith("/klientai/prarasti");

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
