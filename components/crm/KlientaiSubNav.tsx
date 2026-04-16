"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CRM_UNDERLINE_TAB_NAV_CLASS, crmUnderlineTabClass } from "@/components/crm/crmUnderlineTabStyles";

const tabs: { href: string; label: string; match: (path: string) => boolean }[] = [
  {
    href: "/clients",
    label: "Visi klientai",
    match: (p) => p === "/clients" || p.startsWith("/clients/"),
  },
  {
    href: "/analitika/aktyvus",
    label: "Aktyvūs klientai",
    match: (p) => p === "/analitika/aktyvus" || p.startsWith("/analitika/aktyvus/"),
  },
  {
    href: "/analitika/prarasti",
    label: "Prarasti klientai",
    match: (p) => p === "/analitika/prarasti" || p.startsWith("/analitika/prarasti/"),
  },
];

/** Klientų sąrašų navigacija: tie patys trys taškai kaip CRM šoninėje „Klientai“ sekcijoje. */
export function KlientaiSubNav() {
  const pathname = usePathname();

  return (
    <nav className={CRM_UNDERLINE_TAB_NAV_CLASS} aria-label="Klientai">
      {tabs.map(({ href, label, match }) => {
        const active = match(pathname);
        return (
          <Link key={href} href={href} className={crmUnderlineTabClass(active)}>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
