"use client";

import { useEffect, useState } from "react";

import type { CrmRoleSummary } from "@/lib/crm/roleActions";
import { ADMIN_DEFAULT_PERMISSIONS } from "@/lib/crm/permissions/catalog";
import { RolePermissionGroups } from "@/components/crm/roles/RolePermissionGroups";
import { isSystemAdminRole } from "@/lib/crm/roles";

const COLOR_OPTIONS = [
  "#3f7f72",
  "#4b6fa7",
  "#7560ac",
  "#a9558b",
  "#b24a45",
  "#bb7a32",
  "#c09a2f",
  "#5f9b57",
  "#566179",
  "#b28a62",
] as const;

export function RoleEditModal({
  role,
  open,
  onClose,
  onSave,
  pending,
  error,
}: {
  role: CrmRoleSummary | null;
  open: boolean;
  onClose: () => void;
  onSave: (payload: { role_id?: string; name: string; description: string | null; color: string; permission_keys: string[] }) => void;
  pending: boolean;
  error: string | null;
}) {
  const [name, setName] = useState(role?.name ?? "");
  const [description, setDescription] = useState(role?.description ?? "");
  const [color, setColor] = useState(role?.color ?? "#7C4A57");
  const [selected, setSelected] = useState<Set<string>>(new Set(role?.permission_keys ?? []));

  const roleId = role?.id ?? null;
  const isAdminSystemRole = isSystemAdminRole(role?.key ?? null, role?.is_system);

  useEffect(() => {
    setName(role?.name ?? "");
    setDescription(role?.description ?? "");
    setColor(role?.color ?? "#7C4A57");
    setSelected(new Set(role?.permission_keys ?? []));
  }, [role?.id, role?.name, role?.description, role?.color, role?.permission_keys]);

  if (!open) return null;

  const selectedKeys = isAdminSystemRole ? [...ADMIN_DEFAULT_PERMISSIONS] : [...selected];

  return (
    <div className="fixed inset-0 z-[80]">
      <div className="absolute inset-0 bg-black/35" onClick={onClose} />
      <div className="absolute left-1/2 top-1/2 max-h-[92vh] w-[min(960px,96vw)] -translate-x-1/2 -translate-y-1/2 overflow-auto rounded-2xl border border-zinc-200 bg-white p-6">
        <div className="mb-5 flex items-center justify-between gap-3">
          <h2 className="text-3xl font-semibold tracking-tight text-zinc-900">{roleId ? "Redaguoti rolę" : "Nauja rolė"}</h2>
          <button type="button" onClick={onClose} className="rounded-md px-2 py-1 text-zinc-500 hover:bg-zinc-100">
            ✕
          </button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm text-zinc-700">
            Pavadinimas *
            <input
              className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              disabled={pending}
            />
          </label>
          <div>
            <div className="text-sm text-zinc-700">Spalva</div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {COLOR_OPTIONS.map((swatch) => {
                const active = swatch.toLowerCase() === color.toLowerCase();
                return (
                  <button
                    key={swatch}
                    type="button"
                    title={swatch}
                    onClick={() => setColor(swatch)}
                    className={[
                      "h-7 w-7 rounded-full border",
                      active ? "ring-2 ring-zinc-500" : "ring-0",
                    ].join(" ")}
                    style={{ backgroundColor: swatch }}
                    disabled={pending}
                  />
                );
              })}
            </div>
          </div>
        </div>

        <label className="mt-4 block text-sm text-zinc-700">
          Aprašymas
          <textarea
            className="mt-1 min-h-[78px] w-full rounded-md border border-zinc-200 px-3 py-2"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={240}
            disabled={pending}
          />
        </label>

        <div className="mt-5">
          <RolePermissionGroups
            selected={selected}
            onToggle={(key, enabled) => {
              if (isAdminSystemRole) return;
              setSelected((prev) => {
                const next = new Set(prev);
                if (enabled) next.add(key);
                else next.delete(key);
                return next;
              });
            }}
            onToggleGroup={(keys, enabled) => {
              if (isAdminSystemRole) return;
              setSelected((prev) => {
                const next = new Set(prev);
                keys.forEach((k) => {
                  if (enabled) next.add(k);
                  else next.delete(k);
                });
                return next;
              });
            }}
            onSetGroup={(keys, mode) => {
              if (isAdminSystemRole) return;
              setSelected((prev) => {
                const next = new Set(prev);
                keys.forEach((k) => {
                  if (mode === "all") next.add(k);
                  else next.delete(k);
                });
                return next;
              });
            }}
          />
        </div>

        <div className="mt-5 flex items-center justify-between gap-4">
          <p className="text-sm text-zinc-600">Pasirinkta teisių: {selectedKeys.length}</p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700"
              disabled={pending}
            >
              Atšaukti
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                onSave({
                  ...(roleId ? { role_id: roleId } : {}),
                  name: name.trim(),
                  description: description.trim() || null,
                  color,
                  permission_keys: selectedKeys,
                });
              }}
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {pending ? "Saugoma..." : "Išsaugoti"}
            </button>
          </div>
        </div>
        {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
      </div>
    </div>
  );
}
