"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CRM_UNDERLINE_TAB_NAV_CLASS, crmUnderlineTabClass } from "@/components/crm/crmUnderlineTabStyles";

type ClientsView = "all" | "active" | "lost";

const tabs: { href: string; label: string; view: ClientsView }[] = [
  { href: "/klientai?view=all", label: "Visi", view: "all" },
  { href: "/klientai?view=active", label: "Aktyvūs", view: "active" },
  { href: "/klientai?view=lost", label: "Prarasti", view: "lost" },
];

/** Klientų sąrašų navigacija: tie patys trys taškai kaip CRM šoninėje „Klientai“ sekcijoje. */
export function KlientaiSubNav() {
  const sp = useSearchParams();
  const viewRaw = (sp.get("view") ?? "").trim();
  const view: ClientsView = viewRaw === "active" ? "active" : viewRaw === "lost" ? "lost" : "all";

  return (
    <nav className={CRM_UNDERLINE_TAB_NAV_CLASS} aria-label="Klientai">
      {tabs.map(({ href, label, view: tabView }) => {
        const active = tabView === view;
        return (
          <Link key={href} href={href} className={crmUnderlineTabClass(active)}>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
