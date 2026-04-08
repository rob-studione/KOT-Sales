"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { CrmSidebar } from "@/components/crm/CrmSidebar";
import { CrmContentContainer } from "@/components/crm/CrmContentContainer";
import { AccountEditDrawer } from "@/components/crm/accounts/AccountEditDrawer";
import type { AccountListRow } from "@/components/crm/accounts/AccountsCardList";
import type { CurrentCrmUser } from "@/lib/crm/currentUser";

function displayName(u: CurrentCrmUser): string {
  const fn = (u.first_name ?? "").trim();
  const ln = (u.last_name ?? "").trim();
  const full = [fn, ln].filter(Boolean).join(" ").trim();
  return full || u.email;
}

export function CrmShellClient({
  user,
  children,
}: {
  user: CurrentCrmUser | null;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [selfDrawerOpen, setSelfDrawerOpen] = useState(false);
  const [selfRow, setSelfRow] = useState<AccountListRow | null>(null);

  const selfRowFromUser = useMemo<AccountListRow | null>(() => {
    if (!user) return null;
    return {
      id: user.id,
      name: displayName(user),
      first_name: user.first_name,
      last_name: user.last_name,
      legacy_name: undefined,
      email: user.email,
      role: user.role,
      status: user.status === "inactive" ? "Neaktyvi" : "Aktyvi",
      status_raw: user.status,
      lastActivityLabel: "-",
      phone: user.phone,
      avatar_url: user.avatar_url,
    };
  }, [user]);

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50">
      <AppHeader
        user={user}
        onOpenMyAccount={() => {
          const row = selfRowFromUser;
          if (!row) return;
          setSelfRow(row);
          setSelfDrawerOpen(true);
        }}
      />

      <div className="flex min-h-0 flex-1">
        <CrmSidebar isAdmin={user?.role === "admin"} />
        <main className="min-w-0 flex-1 overflow-auto py-4">
          <CrmContentContainer className="min-w-0">{children}</CrmContentContainer>
        </main>
      </div>

      <AccountEditDrawer
        open={selfDrawerOpen}
        user={selfRow}
        onClose={() => setSelfDrawerOpen(false)}
        mode="self"
        onSaved={(updated) => {
          setSelfRow((prev) => {
            if (!prev) return prev;
            const full = [updated.first_name, updated.last_name].filter(Boolean).join(" ").trim();
            return {
              ...prev,
              name: full || prev.name,
              first_name: updated.first_name,
              last_name: updated.last_name,
              phone: updated.phone,
              avatar_url: updated.avatar_url ?? prev.avatar_url ?? null,
              status_raw: updated.status,
              status: updated.status === "inactive" ? "Neaktyvi" : "Aktyvi",
              role: updated.role,
            };
          });
          router.refresh();
        }}
      />
    </div>
  );
}

