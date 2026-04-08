"use client";

import { ROLE_LABELS, type UserRole } from "@/lib/crm/roles";

export type AccountListRow = {
  id: string;
  name: string;
  first_name?: string;
  last_name?: string;
  legacy_name?: string;
  email: string;
  role: UserRole;
  status: string;
  status_raw?: "active" | "inactive";
  lastActivityLabel: string;
  phone?: string | null;
  avatar_url?: string | null;
};

function initials(name: string): string {
  const t = (name ?? "").trim();
  if (!t || t === "—") return "?";
  const parts = t.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0]!.slice(0, 1) + parts[1]!.slice(0, 1)).toUpperCase();
  return t.slice(0, 2).toUpperCase();
}

function displayNameForRow(r: AccountListRow): string {
  const fn = String(r.first_name ?? "").trim();
  const ln = String(r.last_name ?? "").trim();
  const full = [fn, ln].filter(Boolean).join(" ").trim();
  return full || String(r.legacy_name ?? "").trim() || String(r.name ?? "").trim() || "—";
}

function IconDots({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <circle cx="5" cy="12" r="1.75" />
      <circle cx="12" cy="12" r="1.75" />
      <circle cx="19" cy="12" r="1.75" />
    </svg>
  );
}

function IconPencil({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M12 20h9" strokeLinecap="round" />
      <path
        d="M16.5 3.5a2.1 2.1 0 013 3L8 18l-4 1 1-4L16.5 3.5z"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconEye({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path
        d="M2.5 12s3.5-7 9.5-7 9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7z"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="2.75" />
    </svg>
  );
}

function IconPower({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M12 2v10" strokeLinecap="round" />
      <path d="M7 4.5a9 9 0 105 0" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function AccountsCardList({
  rows,
  onOpen,
}: {
  rows: AccountListRow[];
  onOpen: (row: AccountListRow) => void;
}) {
  const isEmpty = rows.length === 0;

  return (
    <div className="space-y-3">
      {isEmpty ? (
        <div className="rounded-[10px] border border-[#e5e5e5] bg-white px-6 py-12 text-center text-sm text-zinc-500">
          Pridėk daugiau paskyrų, kad galėtum valdyti komandą.
        </div>
      ) : (
        rows.map((r) => (
          // Ensure list uses the same display-name truth as drawer.
          // (first_name/last_name > legacy_name > name)
          <div
            key={r.id}
            role="button"
            tabIndex={0}
            className="flex cursor-pointer items-center justify-between gap-6 rounded-[10px] border border-[#e5e5e5] bg-white px-6 py-5 hover:bg-[#fafafa]"
            onClick={() => {
              onOpen(r);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onOpen(r);
              }
            }}
          >
            <div className="flex min-w-0 items-center gap-5">
              <div className="relative">
                {r.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={r.avatar_url}
                    alt=""
                    className="h-10 w-10 rounded-full object-cover ring-1 ring-black/5"
                  />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-zinc-200 text-sm font-semibold text-zinc-700">
                    {initials(displayNameForRow(r))}
                  </div>
                )}
                <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-500" aria-hidden />
              </div>

              <div className="min-w-0">
                <div className="truncate text-[15px] font-semibold leading-6 text-zinc-900">{displayNameForRow(r)}</div>
                <div className="truncate text-sm leading-5 text-zinc-500">{r.email}</div>
                <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm leading-5 text-zinc-500">
                  <span className="text-zinc-600">{ROLE_LABELS[r.role] ?? r.role}</span>
                  <span aria-hidden className="text-zinc-300">
                    •
                  </span>
                  <span>{r.status || "Aktyvi"}</span>
                  <span aria-hidden className="text-zinc-300">
                    •
                  </span>
                  <span>{r.lastActivityLabel || "-"}</span>
                </div>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-md border border-zinc-200 bg-white px-4 py-2.5 text-sm font-medium text-zinc-800 shadow-sm hover:bg-zinc-50"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpen(r);
                }}
              >
                <IconPencil className="h-4 w-4 text-zinc-500" />
                Redaguoti
              </button>

              <details className="relative" onClick={(e) => e.stopPropagation()}>
                <summary
                  className="inline-flex h-10 w-11 cursor-pointer list-none items-center justify-center rounded-md border border-zinc-200 bg-white text-zinc-700 shadow-sm hover:bg-zinc-50"
                  aria-label="Daugiau veiksmų"
                >
                  <IconDots className="h-5 w-5" />
                </summary>
                <div className="absolute right-0 top-12 z-20 w-44 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-lg">
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-zinc-800 hover:bg-zinc-50"
                    onClick={() => onOpen(r)}
                  >
                    <IconEye className="h-4 w-4 text-zinc-500" />
                    Peržiūrėti
                  </button>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-zinc-800 hover:bg-zinc-50"
                    onClick={() => console.log("[accounts] deactivate click", { id: r.id })}
                  >
                    <IconPower className="h-4 w-4 text-zinc-500" />
                    Deaktyvuoti
                  </button>
                </div>
              </details>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

