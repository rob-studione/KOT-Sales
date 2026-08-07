"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ProjectDetailTab } from "@/lib/crm/projectPageSearchParams";
import { crmUnderlineTabClass } from "@/components/crm/crmUnderlineTabStyles";

function activeTabFromPathname(pathname: string): ProjectDetailTab {
  const segment = pathname.split("/").filter(Boolean).pop() ?? "";
  if (
    segment === "kandidatai" ||
    segment === "sutartys" ||
    segment === "darbas" ||
    segment === "kontaktuota" ||
    segment === "pajamos"
  ) {
    return segment;
  }
  return "apzvalga";
}

/** Tik active stilius — href ateina iš serverio (RSC), todėl nėra hydration mismatch. */
export function ProjectDetailTabLink({
  href,
  tab,
  children,
}: {
  href: string;
  tab: ProjectDetailTab;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const active = activeTabFromPathname(pathname) === tab;

  return (
    <Link href={href} className={crmUnderlineTabClass(active)} role="tab" aria-selected={active}>
      {children}
    </Link>
  );
}
