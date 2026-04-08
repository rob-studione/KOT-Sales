"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { ROLE_LABELS, type UserRole } from "@/lib/crm/roles";
import type { AccountListRow } from "@/components/crm/accounts/AccountsCardList";
import { Mail, Phone } from "lucide-react";
import { getCrmUserAction, updateCrmUserAction, type CrmUserStatus } from "@/lib/crm/accountActions";

function initials(name: string): string {
  const t = (name ?? "").trim();
  if (!t || t === "—") return "?";
  const parts = t.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0]!.slice(0, 1) + parts[1]!.slice(0, 1)).toUpperCase();
  return t.slice(0, 2).toUpperCase();
}

function IconX({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
    </svg>
  );
}

function IconCamera({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path
        d="M4.5 7.5h3l1.2-2h6.6l1.2 2h3a2 2 0 012 2v9a2 2 0 01-2 2h-15a2 2 0 01-2-2v-9a2 2 0 012-2z"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="13" r="3.25" />
    </svg>
  );
}

function IconChevronDown({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function fieldClass() {
  return [
    "mt-1.5 w-full rounded-xl border border-zinc-200/80 bg-zinc-50/40 px-4 py-3 text-sm text-zinc-900",
    "shadow-none outline-none ring-0",
    "placeholder:text-zinc-400",
    "focus:border-zinc-300 focus:bg-white focus:ring-2 focus:ring-zinc-900/5",
  ].join(" ");
}

function labelClass() {
  return "text-[12px] font-medium text-zinc-500";
}

function LabelWithIcon({
  icon: Icon,
  children,
}: {
  icon?: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  children: React.ReactNode;
}) {
  if (!Icon) return <div className={labelClass()}>{children}</div>;
  return (
    <div className="flex items-center gap-2">
      <Icon size={16} strokeWidth={1.5} className="text-zinc-400" aria-hidden />
      <div className={labelClass()}>{children}</div>
    </div>
  );
}

export function AccountEditDrawer({
  open,
  user,
  onClose,
  onSaved,
  mode,
}: {
  open: boolean;
  user: AccountListRow | null;
  onClose: () => void;
  onSaved?: (user: {
    id: string;
    email: string;
    first_name: string;
    last_name: string;
    phone: string | null;
    role: UserRole;
    status: CrmUserStatus;
    avatar_url?: string | null;
  }) => void;
  mode?: "admin" | "self";
}) {
  const isSelf = mode === "self";
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<UserRole>("sales");
  const [status, setStatus] = useState<CrmUserStatus>("active");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, startSaving] = useTransition();
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!user) return;
    // Initialize immediately from list row (no flicker).
    setFirstName((user.first_name ?? "").trim());
    setLastName((user.last_name ?? "").trim());
    setEmail(user.email === "—" ? "" : user.email);
    setPhone(user.phone ? String(user.phone) : "");
    setRole(user.role);
    setStatus(user.status_raw ?? (user.status === "Neaktyvi" ? "inactive" : "active"));
    setAvatarUrl(user.avatar_url ?? null);
    setError(null);
  }, [user?.id]); // intentionally only on user change

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!open || !user?.id) return;
      // Background sync only: keep current values while fetching.
      setLoading(true);
      const res = await getCrmUserAction(user.id);
      if (cancelled) return;
      if (!res.ok) {
        setLoading(false);
        // Keep existing values; show error only if we have nothing to show.
        if (!firstName && !lastName && !email) setError(res.error);
        return;
      }
      // Overwrite only if actually different (prevents visible "reset").
      const nextFirst = res.user.first_name ?? "";
      const nextLast = res.user.last_name ?? "";
      const nextEmail = res.user.email ?? "";
      const nextPhone = res.user.phone ?? "";
      const nextRole = res.user.role;
      const nextStatus = res.user.status;

      setFirstName((prev) => (prev !== nextFirst ? nextFirst : prev));
      setLastName((prev) => (prev !== nextLast ? nextLast : prev));
      setEmail((prev) => (prev !== nextEmail ? nextEmail : prev));
      setPhone((prev) => (prev !== nextPhone ? nextPhone : prev));
      setRole((prev) => (prev !== nextRole ? nextRole : prev));
      setStatus((prev) => (prev !== nextStatus ? nextStatus : prev));
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [open, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-black/10"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
        aria-hidden
      />

      <aside
        className={[
          "absolute right-0 top-0 h-full w-full max-w-[500px] border-l border-zinc-200 bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.02),-20px_0_50px_-35px_rgba(0,0,0,0.35)]",
          "transition-transform duration-200 ease-out",
          open ? "translate-x-0" : "translate-x-full",
        ].join(" ")}
        aria-label="Paskyros redagavimas"
      >
        <div className="flex h-full flex-col">
          <div className="relative px-8 pb-7 pt-7">
            <button
              type="button"
              className="absolute right-5 top-5 inline-flex h-9 w-9 items-center justify-center rounded-full text-zinc-500 hover:bg-zinc-100"
              onClick={onClose}
              aria-label="Uždaryti"
            >
              <IconX className="h-5 w-5" />
            </button>

            <div className="flex flex-col items-center text-center">
              <div className="relative mt-1">
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={avatarUrl}
                    alt=""
                    className="h-[104px] w-[104px] rounded-full object-cover ring-1 ring-black/5"
                  />
                ) : (
                  <div className="flex h-[104px] w-[104px] items-center justify-center overflow-hidden rounded-full bg-zinc-200 text-2xl font-semibold text-zinc-700 ring-1 ring-black/5">
                    {initials(user?.name ?? "")}
                  </div>
                )}
                <button
                  type="button"
                  className={[
                    "absolute left-[62px] top-[70px] inline-flex items-center gap-2 rounded-full",
                    "border border-zinc-200/70 bg-white/65 px-3 py-2 text-sm font-medium text-zinc-700 shadow-sm backdrop-blur",
                    "hover:bg-white/90 hover:shadow-md transition",
                  ].join(" ")}
                  disabled={uploading}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-zinc-100 text-zinc-700">
                    <IconCamera className="h-4 w-4" />
                  </span>
                  {uploading ? "Įkeliama…" : "Keisti nuotrauką"}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={async (e) => {
                    const f = e.currentTarget.files?.[0] ?? null;
                    e.currentTarget.value = "";
                    if (!f || !user?.id) return;
                    setError(null);
                    const allowed = ["image/jpeg", "image/png", "image/webp"];
                    if (!allowed.includes(f.type)) {
                      setError("Neleistinas failo tipas. Leisti: JPG, PNG, WEBP.");
                      return;
                    }
                    if (f.size > 5 * 1024 * 1024) {
                      setError("Failas per didelis (max 5 MB).");
                      return;
                    }
                    setUploading(true);
                    try {
                      const fd = new FormData();
                      fd.set("file", f);
                      const resp = await fetch(`/api/crm-users/${encodeURIComponent(user.id)}/avatar`, {
                        method: "POST",
                        body: fd,
                      });
                      const json = (await resp.json()) as { ok: boolean; avatar_url?: string; error?: string };
                      if (!resp.ok || !json.ok || !json.avatar_url) {
                        setError(json.error ?? "Nepavyko įkelti nuotraukos.");
                        return;
                      }
                      const freshUrl = `${json.avatar_url}${json.avatar_url.includes("?") ? "&" : "?"}v=${Date.now()}`;
                      setAvatarUrl(freshUrl);
                      // Patch parent list immediately.
                      onSaved?.({
                        id: user.id,
                        email,
                        first_name: firstName,
                        last_name: lastName,
                        phone: phone.trim() ? phone : null,
                        role,
                        status,
                        avatar_url: freshUrl,
                      });
                    } finally {
                      setUploading(false);
                    }
                  }}
                />
              </div>

              <div className="mt-6 text-[24px] font-semibold leading-[1.05] tracking-tight text-zinc-900">
                {user?.name ?? "—"}
              </div>
              <div className="mt-1.5 text-[13px] font-medium text-zinc-500">
                {ROLE_LABELS[role] ?? role}
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto px-8 pb-28 pt-6">
            <form
              className="space-y-10"
              id="account-edit-form"
              onSubmit={(e) => {
                e.preventDefault();
                if (!user?.id) return;
                setError(null);
                startSaving(async () => {
                  const res = await updateCrmUserAction({
                    id: user.id,
                    first_name: firstName,
                    last_name: lastName,
                    phone: phone.trim() ? phone : null,
                    role,
                    status,
                  });
                  if (!res.ok) {
                    setError(res.error);
                    return;
                  }
                  onSaved?.(res.user);
                  onClose();
                });
              }}
            >
              <section>
                <div className="text-[12px] font-semibold uppercase tracking-[0.14em] text-zinc-400">
                  Pagrindinė informacija
                </div>
                <div className="mt-5 space-y-7">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <div className={labelClass()}>Vardas</div>
                      <input value={firstName} onChange={(e) => setFirstName(e.target.value)} className={fieldClass()} />
                    </div>
                    <div>
                      <div className={labelClass()}>Pavardė</div>
                      <input value={lastName} onChange={(e) => setLastName(e.target.value)} className={fieldClass()} />
                    </div>
                  </div>
                  <div>
                    <LabelWithIcon icon={Mail}>El. paštas</LabelWithIcon>
                    <input value={email} readOnly className={fieldClass()} />
                  </div>
                  <div>
                    <LabelWithIcon icon={Phone}>Telefono numeris</LabelWithIcon>
                    <input
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className={fieldClass()}
                      placeholder="+370 600 00000"
                    />
                  </div>
                </div>
              </section>

              <section>
                <div className="text-[12px] font-semibold uppercase tracking-[0.14em] text-zinc-400">
                  Prieiga
                </div>
                <div className="mt-5 space-y-7">
                  <div>
                    <div className={labelClass()}>Rolė</div>
                    <div className="relative">
                      <select
                        value={role}
                        onChange={(e) => setRole(e.target.value as UserRole)}
                        disabled={isSelf}
                        className={[fieldClass(), "appearance-none pr-10"].join(" ")}
                      >
                        <option value="admin">{ROLE_LABELS.admin}</option>
                        <option value="sales">{ROLE_LABELS.sales}</option>
                      </select>
                      <IconChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                    </div>
                  </div>
                  <div>
                    <div className={labelClass()}>Būsena</div>
                    <div className="relative">
                      <select
                        value={status}
                        onChange={(e) => setStatus(e.target.value as CrmUserStatus)}
                        disabled={isSelf}
                        className={[fieldClass(), "appearance-none pr-10"].join(" ")}
                      >
                        <option value="active">Aktyvi</option>
                        <option value="inactive">Neaktyvi</option>
                      </select>
                      <IconChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                    </div>
                  </div>
                </div>
              </section>

              {error ? <p className="text-sm text-red-600">{error}</p> : null}
            </form>
          </div>

          <div className="absolute bottom-0 left-0 right-0 border-t border-zinc-200/80 bg-white/90 px-6 py-5 backdrop-blur">
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                className="rounded-xl bg-transparent px-4 py-2.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900"
                onClick={onClose}
              >
                Atšaukti
              </button>
              <button
                type="submit"
                form="account-edit-form"
                className="rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-zinc-900/10 hover:bg-zinc-800"
                disabled={saving || loading || uploading}
              >
                {saving ? "Saugoma…" : loading ? "Įkeliama…" : "Išsaugoti"}
              </button>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}

