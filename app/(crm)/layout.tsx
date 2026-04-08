import type { Metadata } from "next";
import { CrmShellClient } from "@/components/crm/CrmShellClient";
import { getCurrentCrmUser } from "@/lib/crm/currentUser";

export const metadata: Metadata = {
  title: "CRM",
  description: "Klientai ir sąskaitos",
};

export default async function CrmLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentCrmUser();
  return <CrmShellClient user={user}>{children}</CrmShellClient>;
}
