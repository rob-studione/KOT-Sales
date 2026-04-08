"use client";

import { useEffect, useMemo, useState } from "react";
import { AccountsCardList, type AccountListRow } from "@/components/crm/accounts/AccountsCardList";
import { AccountEditDrawer } from "@/components/crm/accounts/AccountEditDrawer";
import { useRouter } from "next/navigation";

export function AccountsPageClient({ rows }: { rows: AccountListRow[] }) {
  const router = useRouter();
  const [localRows, setLocalRows] = useState<AccountListRow[]>(rows);
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    setLocalRows(rows);
  }, [rows]);

  const selected = useMemo(() => localRows.find((r) => r.id === selectedId) ?? null, [localRows, selectedId]);

  return (
    <>
      <AccountsCardList
        rows={localRows}
        onOpen={(row) => {
          setSelectedId(row.id);
          setOpen(true);
        }}
      />
      <AccountEditDrawer
        open={open}
        user={selected}
        onClose={() => {
          setOpen(false);
        }}
        onSaved={(updated) => {
          setLocalRows((prev) =>
            prev.map((r) => {
              if (r.id !== updated.id) return r;
              const full = [updated.first_name, updated.last_name].filter(Boolean).join(" ").trim();
              const nextName = full || r.legacy_name || r.name;
              return {
                ...r,
                name: nextName,
                first_name: updated.first_name,
                last_name: updated.last_name,
                phone: updated.phone,
                role: updated.role,
                status_raw: updated.status,
                status: updated.status === "inactive" ? "Neaktyvi" : "Aktyvi",
                avatar_url: updated.avatar_url ?? r.avatar_url ?? null,
              };
            })
          );
          router.refresh();
        }}
      />
    </>
  );
}

