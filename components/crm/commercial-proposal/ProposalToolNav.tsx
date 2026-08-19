import Link from "next/link";
import { CP_TOOL_PATH, commercialProposalPricesPath, commercialProposalTemplatePath } from "@/lib/crm/commercialProposalPaths";

export function ProposalToolNav({
  active,
  canAdmin,
}: {
  active: "list" | "template" | "prices";
  canAdmin: boolean;
}) {
  const items = [
    { key: "list" as const, href: CP_TOOL_PATH, label: "Pasiūlymai" },
    ...(canAdmin
      ? [
          { key: "template" as const, href: commercialProposalTemplatePath(), label: "Šablonas" },
          { key: "prices" as const, href: commercialProposalPricesPath(), label: "Kainos" },
        ]
      : []),
  ];

  return (
    <nav className="flex flex-wrap gap-1 border-b border-zinc-200 pb-3" aria-label="Komerciniai pasiūlymai">
      {items.map((item) => {
        const isActive = item.key === active;
        return (
          <Link
            key={item.key}
            href={item.href}
            className={[
              "rounded-md px-3 py-1.5 text-sm",
              isActive ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900",
            ].join(" ")}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
