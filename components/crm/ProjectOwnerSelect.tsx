"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { UserAvatar } from "@/components/crm/UserAvatar";
import { updateProjectOwnerAction } from "@/lib/crm/projectActions";
import type { CrmUser } from "@/lib/crm/crmUsers";

type Props = {
  projectId: string;
  users: CrmUser[];
  currentOwnerId: string | null;
};

export function ProjectOwnerSelect({ projectId, users, currentOwnerId }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const current = currentOwnerId ? users.find((u) => u.id === currentOwnerId) : undefined;

  if (users.length === 0) {
    return <span className="text-zinc-500">—</span>;
  }

  const selectValue = currentOwnerId ?? "";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <UserAvatar
        displayName={current?.name ?? "?"}
        avatarUrl={current?.avatar_url ?? null}
        size={26}
      />
      <select
        className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-sm text-zinc-900 disabled:opacity-60"
        value={selectValue}
        disabled={pending}
        aria-label="Atsakingas"
        onChange={(e) => {
          const next = e.target.value;
          setError(null);
          if (!next) return;
          startTransition(async () => {
            const r = await updateProjectOwnerAction(projectId, next);
            if (!r.ok) {
              setError(r.error);
              return;
            }
            router.refresh();
          });
        }}
      >
        <option value="" disabled>
          Pasirinkti atsakingą
        </option>
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name}
          </option>
        ))}
      </select>
      {error ? <span className="text-xs text-red-600">{error}</span> : null}
    </div>
  );
}
