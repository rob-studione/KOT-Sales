import type { ReactNode } from "react";

export function ProposalToolShell({
  title = "Komerciniai pasiūlymai",
  actions,
  nav,
  children,
}: {
  title?: string;
  actions?: ReactNode;
  nav?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="-mx-4 -my-4 min-h-[calc(100vh-3.5rem)] bg-[#F7F7F8] px-6 pb-10 pt-6 min-[1920px]:px-8">
      <div className="w-full min-w-0 min-[1920px]:max-w-[1624px]">
        <header className="flex items-center justify-between gap-4">
          <h1 className="min-w-0 truncate text-[22px] font-semibold tracking-tight text-[#17171B]">{title}</h1>
          {actions}
        </header>
        {nav ? <div className="mt-4">{nav}</div> : null}
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

export const PROPOSAL_TOOL_CARD =
  "overflow-hidden rounded-[16px] border border-[#E8E8EB] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.03)]";
