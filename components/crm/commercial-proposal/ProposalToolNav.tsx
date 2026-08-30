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
    <nav className="flex flex-wrap items-end gap-1 border-b border-[#E8E8EB]" aria-label="Komerciniai pasiūlymai">
      {items.map((item) => {
        const isActive = item.key === active;
        return (
          <Link
            key={item.key}
            href={item.href}
            className={[
              "inline-flex h-11 items-center px-3 text-sm",
              isActive
                ? "-mb-px border-b-2 border-[#7C4A57] font-medium text-[#7C4A57]"
                : "text-[#6F7077] hover:text-[#17171B]",
            ].join(" ")}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
