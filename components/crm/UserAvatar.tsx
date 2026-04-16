import { initialsFromDisplayName } from "@/lib/crm/crmUsers";

type Props = {
  displayName: string;
  avatarUrl: string | null | undefined;
  /** Numatytai 26px (24–28 diapazonas). */
  size?: number;
  className?: string;
};

export function UserAvatar({ displayName, avatarUrl, size = 26, className = "" }: Props) {
  const label = displayName.trim() || "?";
  const initials = initialsFromDisplayName(label);
  const dim = `${size}px`;

  if (avatarUrl?.trim()) {
    return (
      <img
        src={avatarUrl.trim()}
        alt=""
        width={size}
        height={size}
        className={`inline-block shrink-0 rounded-full object-cover ring-1 ring-zinc-200/80 ${className}`}
        style={{ width: dim, height: dim }}
      />
    );
  }

  const fs = size <= 24 ? 10 : 11;
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-zinc-200 font-medium text-zinc-700 ring-1 ring-zinc-300/80 ${className}`}
      style={{ width: dim, height: dim, fontSize: `${fs}px` }}
      aria-hidden
    >
      {initials}
    </span>
  );
}
