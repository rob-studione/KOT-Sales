import { UserAvatar } from "@/components/crm/UserAvatar";
import type { CrmUser } from "@/lib/crm/crmUsers";

export function ProjectOwnerCell({ user }: { user: CrmUser | undefined }) {
  if (!user) {
    return <span className="text-zinc-400">—</span>;
  }
  return (
    <div className="flex min-w-0 items-center gap-2">
      <UserAvatar displayName={user.name} avatarUrl={user.avatar_url} size={26} />
      <span className="min-w-0 truncate text-zinc-800">{user.name}</span>
    </div>
  );
}
