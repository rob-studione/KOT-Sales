"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items: { href: string; label: string }[] = [
  { href: "/", label: "Apžvalga" },
  { href: "/clients", label: "Klientai" },
  { href: "/invoices", label: "Sąskaitos" },
];

export function CrmSidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex w-52 shrink-0 flex-col border-r border-zinc-200 bg-white">
      <div className="border-b border-zinc-100 px-4 py-3">
        <Link href="/" className="text-sm font-semibold text-zinc-900">
          CRM
        </Link>
        <p className="mt-0.5 text-xs text-zinc-500">Saskaita123</p>
      </div>
      <nav className="flex flex-col gap-0.5 p-2" aria-label="Pagrindinis meniu">
        {items.map(({ href, label }) => {
          const active =
            href === "/"
              ? pathname === "/"
              : pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={
                active
                  ? "rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white"
                  : "rounded-md px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-100"
              }
            >
              {label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
