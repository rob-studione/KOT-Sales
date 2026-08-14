"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  createRoleAction,
  deleteRoleAction,
  updateRoleAction,
  type CrmRoleSummary,
} from "@/lib/crm/roleActions";
import { RoleEditModal } from "@/components/crm/roles/RoleEditModal";
import { PERMISSION_DEFINITIONS } from "@/lib/crm/permissions/catalog";

function badgePermissions(role: CrmRoleSummary): string[] {
  if (role.permission_keys.length <= 4) return role.permission_keys;
  return [...role.permission_keys.slice(0, 4), `+${role.permission_keys.length - 4}`];
}

const PERMISSION_LABEL_BY_KEY = new Map<string, string>(PERMISSION_DEFINITIONS.map((x) => [x.key, x.label]));

export function RolesPageClient({ initialRoles }: { initialRoles: CrmRoleSummary[] }) {
  const router = useRouter();
  const roles = initialRoles;
  const [query, setQuery] = useState("");
  const [editingRole, setEditingRole] = useState<CrmRoleSummary | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return roles;
    return roles.filter((r) => {
      const hay = [r.name, r.description ?? "", r.key].join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [roles, query]);

  function refreshAfterSave() {
    startTransition(async () => {
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight text-zinc-900">Rolės</h1>
          <p className="mt-1 text-sm text-zinc-600">Sukurkite roles ir nuspręskite, ką kiekvienas darbuotojas gali daryti.</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setError(null);
            setCreateOpen(true);
          }}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-semibold text-white"
        >
          + Nauja rolė
        </button>
      </div>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Ieškoti rolės..."
        className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
      />

      <div className="grid gap-4 lg:grid-cols-3">
        {filtered.map((role) => (
          <article key={role.id} className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: role.color }} />
                  <h2 className="truncate text-xl font-semibold tracking-tight text-zinc-900">{role.name}</h2>
                </div>
                <p className="mt-2 line-clamp-2 text-sm text-zinc-600">{role.description || "—"}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setEditingRole(role);
                }}
                className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100"
                title="Redaguoti"
              >
                ✎
              </button>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-zinc-600">
              {role.is_system ? <span className="rounded bg-zinc-100 px-2 py-0.5">Sisteminė rolė</span> : null}
              <span>{role.user_count} vartotojų</span>
              <span>·</span>
              <span>{role.permission_keys.length} teisių</span>
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5">
              {badgePermissions(role).map((key) => (
                <span key={key} className="rounded bg-zinc-100 px-2 py-1 text-xs text-zinc-700">
                  {key.startsWith("+") ? key : (PERMISSION_LABEL_BY_KEY.get(key) ?? key)}
                </span>
              ))}
            </div>

            {!role.is_system ? (
              <div className="mt-3 border-t border-zinc-100 pt-3">
                <button
                  type="button"
                  disabled={pending}
                  className="text-xs font-medium text-red-700 hover:underline"
                  onClick={() => {
                    if (!confirm(`Ištrinti rolę „${role.name}“?`)) return;
                    setError(null);
                    startTransition(async () => {
                      const res = await deleteRoleAction({ role_id: role.id });
                      if (!res.ok) {
                        setError(res.error);
                        return;
                      }
                      refreshAfterSave();
                    });
                  }}
                >
                  Ištrinti rolę
                </button>
              </div>
            ) : null}
          </article>
        ))}
      </div>

      {createOpen ? (
        <RoleEditModal
          role={null}
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          pending={pending}
          error={error}
          onSave={(payload) => {
            setError(null);
            startTransition(async () => {
              const res = await createRoleAction(payload);
              if (!res.ok) {
                setError(res.error);
                return;
              }
              setCreateOpen(false);
              refreshAfterSave();
            });
          }}
        />
      ) : null}

      {editingRole ? (
        <RoleEditModal
          role={editingRole}
          open={Boolean(editingRole)}
          onClose={() => setEditingRole(null)}
          pending={pending}
          error={error}
          onSave={(payload) => {
            const roleId = payload.role_id;
            if (!roleId) return;
            setError(null);
            startTransition(async () => {
              const res = await updateRoleAction({
                role_id: roleId,
                name: payload.name,
                description: payload.description,
                color: payload.color,
                permission_keys: payload.permission_keys,
              });
              if (!res.ok) {
                setError(res.error);
                return;
              }
              setEditingRole(null);
              refreshAfterSave();
            });
          }}
        />
      ) : null}

      {error && !createOpen && !editingRole ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
