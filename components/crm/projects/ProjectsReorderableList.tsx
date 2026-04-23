"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, arrayMove, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { formatDate } from "@/lib/crm/format";
import type { ProjectListRow } from "@/lib/crm/projectListHelpers";
import { updateProjectsSortOrderAction } from "@/lib/crm/projectActions";
import type { CrmUser } from "@/lib/crm/crmUsers";
import { ProjectListRowCard } from "@/components/crm/projects/ProjectListRowCard";

function SortableProjectRow({
  row,
  href,
  ownerColumnAvailable,
  userById,
  deletedAtAvailable,
  isDeleted,
  renderDeletedAt,
}: {
  row: ProjectListRow;
  href: string;
  ownerColumnAvailable: boolean;
  userById: Map<string, CrmUser>;
  deletedAtAvailable: boolean;
  isDeleted: boolean;
  renderDeletedAt: (p: ProjectListRow) => string | null;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging, setActivatorNodeRef } = useSortable({
    id: row.id,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const grip = (
    <button
      type="button"
      ref={setActivatorNodeRef}
      {...attributes}
      {...listeners}
      aria-label="Keisti projekto poziciją"
      className="flex w-10 shrink-0 cursor-grab items-center justify-center rounded-l-xl border-r border-zinc-100 text-zinc-400 hover:text-zinc-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/15 active:cursor-grabbing"
    >
      <GripVertical size={16} strokeWidth={1.75} aria-hidden />
    </button>
  );

  return (
    <li ref={setNodeRef} style={style} className={isDragging ? "opacity-80" : undefined}>
      <ProjectListRowCard
        row={row}
        href={href}
        ownerColumnAvailable={ownerColumnAvailable}
        userById={userById}
        deletedAtAvailable={deletedAtAvailable}
        isDeleted={isDeleted}
        renderDeletedAt={renderDeletedAt}
        leftSlot={grip}
      />
    </li>
  );
}

export function ProjectsReorderableList({
  initialRows,
  userById,
  ownerColumnAvailable,
  deletedAtAvailable,
  statusFilter,
  onExit,
}: {
  initialRows: ProjectListRow[];
  userById: Map<string, CrmUser>;
  ownerColumnAvailable: boolean;
  deletedAtAvailable: boolean;
  statusFilter: "active" | "archived" | "deleted";
  onExit: () => void;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<ProjectListRow[]>(() => initialRows);
  const [sortError, setSortError] = useState<string | null>(null);

  const initialRowsSignature = useMemo(
    () => initialRows.map((r) => `${r.id}:${r.sort_order ?? ""}`).join("|"),
    [initialRows],
  );
  useEffect(() => {
    setRows(initialRows);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialRowsSignature]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const ids = useMemo(() => rows.map((r) => r.id), [rows]);
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

  const onDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over) return;
      if (active.id === over.id) return;

      setSortError(null);

      const oldIndex = rows.findIndex((r) => r.id === active.id);
      const newIndex = rows.findIndex((r) => r.id === over.id);
      if (oldIndex < 0 || newIndex < 0) return;

      const previousRows = rows;
      const next = arrayMove(rows, oldIndex, newIndex);
      setRows(next);

      const res = await updateProjectsSortOrderAction(
        next.map((r) => r.id),
        statusFilter,
      );
      if (!res.ok) {
        setRows(previousRows);
        setSortError(res.error);
        return;
      }

      window.dispatchEvent(new Event("projects:order-changed"));
      router.refresh();
    },
    [rows, router, statusFilter],
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-zinc-600">Vilkite eilutes už rankenėlės, kad pakeistumėte projektų tvarką.</p>
        <button
          type="button"
          onClick={onExit}
          className="shrink-0 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 shadow-sm hover:bg-zinc-50"
        >
          Baigti rikiavimą
        </button>
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          {sortError ? <p className="mb-3 text-sm text-red-600">{sortError}</p> : null}
          <ul className="flex flex-col gap-4">
            {rows.map((p) => (
              <SortableProjectRow
                key={p.id}
                row={p}
                href={`/projektai/${p.id}`}
                ownerColumnAvailable={ownerColumnAvailable}
                userById={userById}
                deletedAtAvailable={deletedAtAvailable}
                isDeleted={isDeleted}
                renderDeletedAt={renderDeletedAt}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
    </div>
  );
}
