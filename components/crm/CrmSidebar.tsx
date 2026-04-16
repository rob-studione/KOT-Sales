"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Users,
  CheckCircle,
  XCircle,
  Folder,
  FileText,
  Settings,
  Target,
  CircleDot,
} from "lucide-react";

const analitikaChildren: { href: string; label: string; adminOnly?: boolean }[] = [
  { href: "/analitika", label: "Apžvalga" },
  { href: "/analitika/vadybininku-kpi", label: "Vadybininkų KPI", adminOnly: true },
  { href: "/lost-qa", label: "Lost QA", adminOnly: true },
];

const klientaiChildren: { href: string; label: string }[] = [
  { href: "/clients", label: "Visi klientai" },
  { href: "/analitika/aktyvus", label: "Aktyvūs klientai" },
  { href: "/analitika/prarasti", label: "Prarasti klientai" },
];

const projektaiNavHref = "/projektai";
const projektaiNavLabel = "Visi projektai";

const invoicesNavHref = "/invoices";
const invoicesNavLabel = "Sąskaitos";

const settingsChildren: { href: string; label: string; adminOnly?: boolean }[] = [
  { href: "/nustatymai/paskyros", label: "Paskyros", adminOnly: true },
  { href: "/nustatymai/crm", label: "Bendri nustatymai", adminOnly: true },
];

function settingsIconForHref(href: string): LucideIcon {
  if (href === "/nustatymai/paskyros") return Users;
  if (href === "/nustatymai/crm") return Settings;
  return Settings;
}

function SidebarIcon({
  icon: Icon,
  active,
}: {
  icon: LucideIcon;
  active: boolean;
}) {
  return (
    <Icon
      size={18}
      strokeWidth={1.5}
      className={active ? "text-zinc-900" : "text-zinc-400 group-hover:text-zinc-600"}
      aria-hidden
    />
  );
}

/**
 * Lucide renders SVGs; during dev (Turbopack/HMR) it's possible for the server chunk and client chunk
 * to briefly disagree on which icon component is wired to a given import, causing hydration mismatches.
 * We render a stable placeholder on SSR + the first client pass, then mount the real icon after hydration.
 */
function SidebarIconSlot({ icon, active }: { icon: LucideIcon; active: boolean }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return <span className="inline-block h-[18px] w-[18px] shrink-0" aria-hidden />;
  }
  return <SidebarIcon icon={icon} active={active} />;
}

function iconForHref(href: string): LucideIcon {
  if (href === "/analitika") return BarChart3;
  if (href === "/analitika/vadybininku-kpi") return Target;
  if (href === "/lost-qa") return CircleDot;
  if (href === "/clients") return Users;
  if (href === "/analitika/aktyvus") return CheckCircle;
  if (href === "/analitika/prarasti") return XCircle;
  if (href === "/projektai") return Folder;
  if (href === "/invoices") return FileText;
  return Settings;
}

function linkActive(pathname: string, href: string): boolean {
  if (href === "/analitika") return pathname === "/analitika";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function klientaiLinkActive(pathname: string, href: string): boolean {
  if (href === "/clients") return pathname === "/clients" || pathname.startsWith("/clients/");
  return pathname === href || pathname.startsWith(`${href}/`);
}

function projektaiLinkActive(pathname: string, href: string): boolean {
  if (href === "/projektai") {
    return (
      pathname === "/projektai" ||
      (pathname.startsWith("/projektai/") && !pathname.startsWith("/projektai/naujas"))
    );
  }
  return pathname === href;
}

export function CrmSidebar({ isAdmin }: { isAdmin?: boolean }) {
  const pathname = usePathname();
  const analitikaOpen = pathname.startsWith("/analitika");
  const projektaiOpen = pathname.startsWith("/projektai");
  const klientaiOpen = pathname.startsWith("/clients") || pathname.startsWith("/analitika/aktyvus") || pathname.startsWith("/analitika/prarasti");
  const settingsOpen = pathname.startsWith("/nustatymai");

  const itemBase =
    "group relative flex items-center gap-2 rounded-lg px-3 py-[7px] text-[15px] leading-5 transition-colors duration-150";
  const itemInactive = "text-zinc-700 hover:bg-[#f9fafb] hover:text-zinc-900";
  const itemActive = "bg-zinc-100 text-zinc-900 font-semibold";
  const sectionLabelBase = "px-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-400";

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-zinc-200 bg-white">
      <nav className="flex flex-col gap-5 px-3 py-4" aria-label="Pagrindinis meniu">
        <div>
          <div
            className={`${sectionLabelBase} ${analitikaOpen ? "text-zinc-500" : "text-zinc-400"}`}
          >
            Analitika
          </div>
          <div className="mt-1.5 flex flex-col gap-0.5">
            {analitikaChildren
              .filter((c) => !c.adminOnly || Boolean(isAdmin))
              .map(({ href, label }) => {
                const active = linkActive(pathname, href);
                const icon = iconForHref(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    className={`cursor-pointer ${itemBase} ${active ? itemActive : itemInactive}`}
                  >
                    {active ? (
                      <span className="absolute left-0 top-1 bottom-1 w-[3px] rounded-full bg-zinc-400" aria-hidden />
                    ) : null}
                    <SidebarIconSlot icon={icon} active={active} />
                    {label}
                  </Link>
                );
              })}
          </div>
        </div>
        <div>
          <div
            className={`${sectionLabelBase} ${klientaiOpen ? "text-zinc-500" : "text-zinc-400"}`}
          >
            Klientai
          </div>
          <div className="mt-1.5 flex flex-col gap-0.5">
            {klientaiChildren.map(({ href, label }) => {
              const active = klientaiLinkActive(pathname, href);
              const icon = iconForHref(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={`cursor-pointer ${itemBase} ${active ? itemActive : itemInactive}`}
                >
                  {active ? (
                    <span className="absolute left-0 top-1 bottom-1 w-[3px] rounded-full bg-zinc-400" aria-hidden />
                  ) : null}
                  <SidebarIconSlot icon={icon} active={active} />
                  {label}
                </Link>
              );
            })}
          </div>
        </div>
        <div>
          <div
            className={`${sectionLabelBase} ${projektaiOpen ? "text-zinc-500" : "text-zinc-400"}`}
          >
            Projektai
          </div>
          <div className="mt-1.5 flex flex-col gap-0.5">
            <Link
              href={projektaiNavHref}
              className={`cursor-pointer ${itemBase} ${
                projektaiLinkActive(pathname, projektaiNavHref) ? itemActive : itemInactive
              }`}
            >
              {projektaiLinkActive(pathname, projektaiNavHref) ? (
                <span className="absolute left-0 top-1 bottom-1 w-[3px] rounded-full bg-zinc-400" aria-hidden />
              ) : null}
              <SidebarIconSlot icon={iconForHref(projektaiNavHref)} active={projektaiLinkActive(pathname, projektaiNavHref)} />
              {projektaiNavLabel}
            </Link>
          </div>
        </div>
        <div className="flex flex-col gap-0.5">
          <Link
            href={invoicesNavHref}
            className={`cursor-pointer ${itemBase} ${
              pathname === invoicesNavHref || pathname.startsWith(`${invoicesNavHref}/`) ? itemActive : itemInactive
            }`}
          >
            {pathname === invoicesNavHref || pathname.startsWith(`${invoicesNavHref}/`) ? (
              <span className="absolute left-0 top-1 bottom-1 w-[3px] rounded-full bg-zinc-400" aria-hidden />
            ) : null}
            <SidebarIconSlot
              icon={iconForHref(invoicesNavHref)}
              active={pathname === invoicesNavHref || pathname.startsWith(`${invoicesNavHref}/`)}
            />
            {invoicesNavLabel}
          </Link>
        </div>
        <div>
          <div
            className={`${sectionLabelBase} ${settingsOpen ? "text-zinc-500" : "text-zinc-400"}`}
          >
            Nustatymai
          </div>
          <div className="mt-1.5 flex flex-col gap-0.5">
            {settingsChildren
              .filter((c) => !c.adminOnly || Boolean(isAdmin))
              .map(({ href, label }) => {
                const active = linkActive(pathname, href);
                const icon = settingsIconForHref(href);
                return (
                  <Link key={href} href={href} className={`cursor-pointer ${itemBase} ${active ? itemActive : itemInactive}`}>
                    {active ? (
                      <span className="absolute left-0 top-1 bottom-1 w-[3px] rounded-full bg-zinc-400" aria-hidden />
                    ) : null}
                    <SidebarIconSlot icon={icon} active={active} />
                    {label}
                  </Link>
                );
              })}
          </div>
        </div>
      </nav>
    </aside>
  );
}
