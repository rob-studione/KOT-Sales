"use client";

import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatDate } from "@/lib/crm/format";
import type { ProjectListRow } from "@/lib/crm/projectListHelpers";
import type { CrmUser } from "@/lib/crm/crmUsers";
import { ProjectListRowCard } from "@/components/crm/projects/ProjectListRowCard";

const ProjectsReorderableList = lazy(() =>
  import("@/components/crm/projects/ProjectsReorderableList").then((m) => ({ default: m.ProjectsReorderableList })),
);

export function ProjectsSortableList({
  initialRows,
  userById,
  ownerColumnAvailable,
  deletedAtAvailable,
  statusFilter,
}: {
  initialRows: ProjectListRow[];
  userById: Map<string, CrmUser>;
  ownerColumnAvailable: boolean;
  deletedAtAvailable: boolean;
  statusFilter: "active" | "archived" | "deleted";
}) {
  const [rows, setRows] = useState<ProjectListRow[]>(() => initialRows);
  const [reorderMode, setReorderMode] = useState(false);
  const mountMark = useRef<number | null>(null);

  if (mountMark.current == null && typeof performance !== "undefined") {
    mountMark.current = performance.now();
  }

  const initialRowsSignature = useMemo(
    () => initialRows.map((r) => `${r.id}:${r.sort_order ?? ""}`).join("|"),
    [initialRows],
  );
  useEffect(() => {
    setRows(initialRows);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialRowsSignature]);

  useEffect(() => {
    if (process.env.NEXT_PUBLIC_CRM_PERF_LOG !== "1") return;
    const t0 = mountMark.current ?? 0;
    let raf = 0;
    raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        console.info("[CRM perf] /projektai list client interactive-ish", {
          approxHydrationToPaintMs: Math.round(performance.now() - t0),
        });
      });
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  const isDeleted = statusFilter === "deleted";

  const plusDaysIso = useCallback((iso: string, days: number): string | null => {
    if (!iso || typeof iso !== "string") return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  }, []);

  const renderDeletedAt = useCallback(
    (p: ProjectListRow) => {
      const raw = String((p as { deleted_at?: string | null }).deleted_at ?? "");
      const d = plusDaysIso(raw, 7);
      return d ? formatDate(d) : null;
    },
    [plusDaysIso],
  );

  if (reorderMode) {
    return (
      <Suspense
        fallback={<p className="text-sm text-zinc-500">Įkeliamas rikiavimo režimas…</p>}
      >
        <ProjectsReorderableList
          initialRows={rows}
          userById={userById}
          ownerColumnAvailable={ownerColumnAvailable}
          deletedAtAvailable={deletedAtAvailable}
          statusFilter={statusFilter}
          onExit={() => setReorderMode(false)}
        />
      </Suspense>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setReorderMode(true)}
          className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 shadow-sm hover:bg-zinc-50"
        >
          Keisti projektų eiliškumą
        </button>
      </div>
      <ul className="flex flex-col gap-4">
        {rows.map((p) => (
          <li key={p.id}>
            <ProjectListRowCard
              row={p}
              href={`/projektai/${p.id}`}
              ownerColumnAvailable={ownerColumnAvailable}
              userById={userById}
              deletedAtAvailable={deletedAtAvailable}
              isDeleted={isDeleted}
              renderDeletedAt={renderDeletedAt}
              leftSlot={null}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
