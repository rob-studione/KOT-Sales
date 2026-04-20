"use client";

import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useDroppable,
  useDraggable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { formatDate, formatMoney } from "@/lib/crm/format";
import {
  boardColumnIdFromCallStatus,
  buildBoardColumnOrder,
  callStatusFromBoardColumnId,
  callStatusOptionLabel,
  isWorkItemOnKanbanBoard,
  kanbanColumnHeaderBorderClass,
  kanbanColumnShellClass,
  mapCallStatusToProcurementBoardColumn,
  normalizeKanbanCallStatus,
  procurementKanbanColumnTitle,
  waitColumnHighlightState,
} from "@/lib/crm/projectBoardConstants";
import {
  callListPriorityLabel,
  priorityFromSnapshotScore,
  type CallListPriority,
} from "@/lib/crm/callListPriority";
import type { ProjectWorkItemActivityDto } from "@/lib/crm/projectWorkItemActivityDto";
import type { ProjectWorkItemDto } from "@/lib/crm/projectWorkItemDto";
import { KanbanMoveConfirmModal, type PendingKanbanMove } from "@/components/crm/KanbanMoveConfirmModal";
import { WorkItemDetailSheet } from "@/components/crm/WorkItemDetailSheet";

function KanbanColumn({
  columnKey,
  title,
  count,
  children,
}: {
  columnKey: string;
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  const columnId = boardColumnIdFromCallStatus(columnKey);
  const { setNodeRef, isOver } = useDroppable({ id: columnId });
  const shell = kanbanColumnShellClass(columnKey);
  const isDone = normalizeKanbanCallStatus(columnKey) === "Užbaigta";

  return (
    <div
      ref={setNodeRef}
      className={`flex min-h-0 min-w-0 w-full max-h-[min(70vh,calc(100vh-12rem))] flex-col rounded-xl border transition-colors ${shell} ${
        isOver ? "border-zinc-400 bg-zinc-100/60 ring-2 ring-zinc-200" : ""
      }`}
    >
      <div
        className={`sticky top-0 z-10 px-2.5 py-2.5 backdrop-blur-sm ${
          isDone ? "bg-zinc-100/90" : "bg-zinc-50/95"
        } ${kanbanColumnHeaderBorderClass(columnKey)}`}
      >
        <div className="truncate text-base font-bold leading-snug text-zinc-900" title={title}>
          {title}
        </div>
        <div className="mt-0.5 text-lg font-bold tabular-nums leading-none text-zinc-800">{count}</div>
      </div>
      <div className="flex min-h-0 flex-col gap-1.5 overflow-y-auto p-1.5">{children}</div>
    </div>
  );
}

function KanbanCard({
  item,
  priority,
  columnKey,
  onOpen,
}: {
  item: ProjectWorkItemDto;
  priority: CallListPriority;
  columnKey: string;
  onOpen: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: item.id });

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
      }
    : undefined;

  const col = normalizeKanbanCallStatus(columnKey);
  const waitHint = waitColumnHighlightState(item.call_status, item.next_action_date);
  const isLauktiColumn = col === "Laukti";
  const isDoneColumn = col === "Užbaigta";
  const isUrgentColumn = col === "Skubus veiksmas";

  const waitRing =
    isLauktiColumn && waitHint === "overdue"
      ? "border-amber-500 ring-2 ring-amber-400/90"
      : isLauktiColumn && waitHint === "today"
        ? "border-amber-400 ring-2 ring-amber-300/90"
        : "";

  const cardSurface = isUrgentColumn
    ? "border-red-300/90 bg-red-50/40 shadow-sm"
    : isDoneColumn
      ? "border-zinc-200/80 bg-zinc-50/90 opacity-95 shadow-none"
      : "border-zinc-200 bg-white shadow-sm";

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`rounded-lg border transition-shadow ${cardSurface} ${
        isDragging ? "opacity-40 shadow-md" : isDoneColumn ? "hover:border-zinc-300" : "hover:border-zinc-300 hover:shadow"
      } ${waitRing}`}
    >
      <div className="flex gap-1 p-1.5">
        <button
          type="button"
          className="mt-0.5 cursor-grab touch-none rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 active:cursor-grabbing"
          aria-label="Vilkti"
          {...listeners}
          {...attributes}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
            <circle cx="5" cy="4" r="1.2" />
            <circle cx="11" cy="4" r="1.2" />
            <circle cx="5" cy="8" r="1.2" />
            <circle cx="11" cy="8" r="1.2" />
            <circle cx="5" cy="12" r="1.2" />
            <circle cx="11" cy="12" r="1.2" />
          </svg>
        </button>
        <button
          type="button"
          onClick={onOpen}
          className={`min-w-0 flex-1 cursor-pointer rounded-md px-1 py-0.5 text-left transition-colors ${
            isDoneColumn ? "hover:bg-zinc-100/80" : "hover:bg-zinc-50"
          }`}
        >
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs font-bold text-zinc-800">
              {callListPriorityLabel(priority)}
            </span>
          </div>
          <div className="mt-1 line-clamp-2 break-words text-sm font-bold leading-snug text-zinc-900">
            {item.client_name_snapshot}
          </div>
          <div className="mt-1 text-xs tabular-nums text-zinc-500">{formatMoney(item.snapshot_revenue)}</div>
          {item.source_type === "procurement_contract" ? (
            <div className="mt-0.5 text-xs text-zinc-400">
              Galioja iki {formatDate(item.snapshot_last_invoice_date)}
            </div>
          ) : (
            <div className="mt-0.5 text-xs text-zinc-400">
              {item.snapshot_order_count} sąsk. · {formatDate(item.snapshot_last_invoice_date)}
            </div>
          )}
          {isLauktiColumn && item.next_action_date ? (
            <div
              className={`mt-1 text-xs tabular-nums font-semibold ${
                waitHint === "overdue" ? "text-red-600" : waitHint === "today" ? "text-amber-600" : "text-zinc-400"
              }`}
            >
              {formatDate(item.next_action_date)}
              {(waitHint === "overdue" || waitHint === "today") && " ⚠️"}
            </div>
          ) : null}
        </button>
      </div>
    </div>
  );
}

function CardDragPreview({ item, priority }: { item: ProjectWorkItemDto; priority: CallListPriority }) {
  return (
    <div className="max-w-[min(260px,85vw)] min-w-0 rounded-lg border border-zinc-300 bg-white p-2 shadow-lg">
      <div className="text-xs font-medium text-zinc-600">{callListPriorityLabel(priority)}</div>
      <div className="mt-0.5 text-sm font-semibold text-zinc-900">{item.client_name_snapshot}</div>
      <div className="text-xs text-zinc-600">{formatMoney(item.snapshot_revenue)}</div>
      {item.source_type === "procurement_contract" ? (
        <div className="mt-0.5 text-xs text-zinc-500">
          Galioja iki {formatDate(item.snapshot_last_invoice_date)}
        </div>
      ) : null}
    </div>
  );
}

export function ProjectWorkBoard({
  projectId,
  items,
  activitiesByWorkItemId,
  boardVariant = "default",
}: {
  projectId: string;
  items: ProjectWorkItemDto[];
  activitiesByWorkItemId: Record<string, ProjectWorkItemActivityDto[]>;
  boardVariant?: "default" | "procurement";
}) {
  const router = useRouter();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [boardError, setBoardError] = useState<string | null>(null);
  const [pendingMove, setPendingMove] = useState<PendingKanbanMove | null>(null);
  const [detailItemId, setDetailItemId] = useState<string | null>(null);

  const boardItems = useMemo(() => items.filter((i) => isWorkItemOnKanbanBoard(i)), [items]);
  const prios = useMemo(() => boardItems.map((w) => w.snapshot_priority), [boardItems]);

  const columnKeys = useMemo(
    () => buildBoardColumnOrder({ variant: boardVariant === "procurement" ? "procurement" : "default" }),
    [boardVariant]
  );

  function isoDateLocal(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  const todayLocal = useMemo(() => isoDateLocal(new Date()), []);

  const movedToDoneDateLocal = useCallback(
    (workItemId: string): string | null => {
      const acts = activitiesByWorkItemId[workItemId] ?? [];
      for (const a of acts) {
        if (normalizeKanbanCallStatus(a.call_status) === "Užbaigta") {
          const dt = new Date(a.occurred_at);
          if (!Number.isNaN(dt.getTime())) return isoDateLocal(dt);
        }
      }
      return null;
    },
    [activitiesByWorkItemId]
  );

  const buckets = useMemo(() => {
    const m = new Map<string, ProjectWorkItemDto[]>();
    for (const k of columnKeys) m.set(k, []);
    for (const it of boardItems) {
      const k =
        boardVariant === "procurement"
          ? mapCallStatusToProcurementBoardColumn(it.call_status)
          : normalizeKanbanCallStatus(it.call_status);
      if (k === "Užbaigta") {
        const moved = movedToDoneDateLocal(it.id);
        if (moved !== todayLocal) continue;
      }
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(it);
    }
    return m;
  }, [boardItems, boardVariant, columnKeys, movedToDoneDateLocal, todayLocal]);

  const lauktiAttention = useMemo(() => {
    const list = buckets.get("Laukti") ?? [];
    let today = 0;
    let overdue = 0;
    for (const it of list) {
      const h = waitColumnHighlightState(it.call_status, it.next_action_date);
      if (h === "today") today += 1;
      if (h === "overdue") overdue += 1;
    }
    return { today, overdue };
  }, [buckets]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  const activeItem = activeId ? boardItems.find((i) => i.id === activeId) : null;
  const activePriority = activeItem
    ? priorityFromSnapshotScore(activeItem.snapshot_priority, prios)
    : "medium";

  const detailItem = detailItemId ? items.find((i) => i.id === detailItemId) : null;

  const onMoveSuccess = useCallback(() => {
    setPendingMove(null);
    router.refresh();
  }, [router]);

  function onDragStart(e: DragStartEvent) {
    setBoardError(null);
    setActiveId(String(e.active.id));
  }

  function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const overId = e.over?.id;
    if (!overId || !e.active.id) return;
    const newStatus = callStatusFromBoardColumnId(String(overId));
    const wid = String(e.active.id);
    const item = boardItems.find((i) => i.id === wid);
    if (!item) return;
    const from =
      boardVariant === "procurement"
        ? mapCallStatusToProcurementBoardColumn(item.call_status)
        : normalizeKanbanCallStatus(item.call_status);
    const to = normalizeKanbanCallStatus(newStatus);
    if (from === to) return;
    setPendingMove({ workItemId: wid, fromColumn: from, toColumn: to, item });
  }

  function onDragCancel() {
    setActiveId(null);
  }

  return (
    <div className="min-w-0" data-project-board={projectId}>
      {boardError ? (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{boardError}</div>
      ) : null}
      {lauktiAttention.today > 0 || lauktiAttention.overdue > 0 ? (
        <div
          className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-amber-200/90 bg-amber-50/90 px-3 py-2 text-sm font-medium text-amber-950"
          role="status"
        >
          {lauktiAttention.today > 0 ? (
            <span>
              ⚠️ {lauktiAttention.today}{" "}
              {lauktiAttention.today === 1 ? "klientas laukia šiandien" : "klientai laukia šiandien"}
            </span>
          ) : null}
          {lauktiAttention.overdue > 0 ? (
            <span className={lauktiAttention.today > 0 ? "text-red-700" : "text-red-800"}>
              ⚠️ {lauktiAttention.overdue}{" "}
              {lauktiAttention.overdue === 1 ? "klientas vėluoja" : "klientai vėluoja"}
            </span>
          ) : null}
        </div>
      ) : null}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={onDragCancel}
      >
        <div
          className={`grid min-w-0 grid-cols-1 gap-3 pb-4 ${
            boardVariant === "procurement" ? "xl:grid-cols-5" : "xl:grid-cols-7"
          }`}
        >
          {columnKeys.map((colKey) => {
            const list = buckets.get(colKey) ?? [];
            const title =
              boardVariant === "procurement" ? procurementKanbanColumnTitle(colKey) : callStatusOptionLabel(colKey);
            return (
              <KanbanColumn key={boardColumnIdFromCallStatus(colKey)} columnKey={colKey} title={title} count={list.length}>
                {list.map((it) => (
                  <KanbanCard
                    key={it.id}
                    columnKey={colKey}
                    item={it}
                    priority={priorityFromSnapshotScore(it.snapshot_priority, prios)}
                    onOpen={() => setDetailItemId(it.id)}
                  />
                ))}
              </KanbanColumn>
            );
          })}
        </div>

        <DragOverlay dropAnimation={null}>
          {activeItem ? <CardDragPreview item={activeItem} priority={activePriority} /> : null}
        </DragOverlay>
      </DndContext>

      {detailItem ? (
        <WorkItemDetailSheet
          item={detailItem}
          activities={activitiesByWorkItemId[detailItem.id] ?? []}
          allWorkPriorities={items.map((i) => i.snapshot_priority)}
          onClose={() => setDetailItemId(null)}
        />
      ) : null}

      {pendingMove ? (
        <KanbanMoveConfirmModal
          pending={pendingMove}
          onCancel={() => setPendingMove(null)}
          onSuccess={onMoveSuccess}
        />
      ) : null}
    </div>
  );
}
