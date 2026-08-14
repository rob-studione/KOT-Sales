"use client";

import { buildPermissionGroups, type PermissionKey } from "@/lib/crm/permissions/catalog";

const GROUPS = buildPermissionGroups();

export function RolePermissionGroups({
  selected,
  onToggle,
  onToggleGroup,
  onSetGroup,
}: {
  selected: Set<string>;
  onToggle: (key: PermissionKey, enabled: boolean) => void;
  onToggleGroup: (keys: PermissionKey[], enabled: boolean) => void;
  onSetGroup: (keys: PermissionKey[], mode: "all" | "none") => void;
}) {
  return (
    <div className="space-y-3">
      {GROUPS.map((group) => {
        const keys = group.items.map((x) => x.key);
        const selectedCount = keys.filter((k) => selected.has(k)).length;
        const allSelected = selectedCount === keys.length;
        return (
          <section key={group.key} className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={(e) => onToggleGroup(keys, e.target.checked)}
                />
                {group.label}
              </label>
              <span className="text-xs text-zinc-500">
                {selectedCount}/{keys.length}
              </span>
            </div>
            <div className="mt-1 flex items-center gap-3 text-xs text-zinc-500">
              <button
                type="button"
                className="underline underline-offset-2 hover:text-zinc-700"
                onClick={() => onSetGroup(keys, "all")}
              >
                Žymėti visus
              </button>
              <button
                type="button"
                className="underline underline-offset-2 hover:text-zinc-700"
                onClick={() => onSetGroup(keys, "none")}
              >
                Išvalyti
              </button>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {group.items.map((item) => (
                <label key={item.key} className="flex items-start gap-2 text-sm text-zinc-800">
                  <input
                    type="checkbox"
                    checked={selected.has(item.key)}
                    onChange={(e) => onToggle(item.key, e.target.checked)}
                    className="mt-0.5"
                  />
                  <span>{item.label}</span>
                </label>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
