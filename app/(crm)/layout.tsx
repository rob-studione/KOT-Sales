import type { Metadata } from "next";
import { CrmSidebar } from "@/components/crm/CrmSidebar";

export const metadata: Metadata = {
  title: "CRM",
  description: "Klientai ir sąskaitos",
};

export default function CrmLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 bg-zinc-50">
      <CrmSidebar />
      <main className="min-w-0 flex-1 overflow-auto p-6">{children}</main>
    </div>
  );
}
