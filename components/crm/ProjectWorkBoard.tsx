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
import { useCallback, useEffect, useMemo, useState } from "react";
import { FileText, Mail, Phone } from "lucide-react";
import { formatDate, formatMoney } from "@/lib/crm/format";
import { kanbanCardClientTotalEuros, kanbanCardInvoiceBlockText } from "@/lib/crm/kanbanCardClientFooter";
import {
  followUpDateVsTodayVilnius,
  kanbanColumnShowsFollowUpOnCard,
} from "@/lib/crm/kanbanNextActionDate";
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
import { vilniusDateWhenEnteredUžbaigtaColumn, vilniusTodayDateString } from "@/lib/crm/projectWorkBoardDoneDate";
import { KanbanMoveConfirmModal, type PendingKanbanMove } from "@/components/crm/KanbanMoveConfirmModal";
import { WorkItemDetailSheet } from "@/components/crm/WorkItemDetailSheet";

function KanbanCopyFeedbackBadge({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <span
      className="pointer-events-none absolute right-0 top-[-14px] z-20 select-none text-[10px] font-medium whitespace-nowrap text-emerald-600/90"
      role="status"
      aria-live="polite"
    >
      Copied
    </span>
  );
}

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
  boardVariant,
  onOpen,
}: {
  item: ProjectWorkItemDto;
  priority: CallListPriority;
  columnKey: string;
  boardVariant: "default" | "procurement";
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
      ? "border-amber-400/90 ring-1 ring-amber-300/60"
      : isLauktiColumn && waitHint === "today"
        ? "border-amber-300/80 ring-1 ring-amber-200/50"
        : "";

  const cardSurface = isUrgentColumn
    ? "border-zinc-200 bg-white shadow-sm border-l-[3px] border-l-rose-400/85"
    : isDoneColumn
      ? "border-zinc-200/80 bg-zinc-50/90 opacity-95 shadow-none"
      : "border-zinc-200 bg-white shadow-sm";

  const followColLabel =
    boardVariant === "procurement" ? procurementKanbanColumnTitle(col) : callStatusOptionLabel(col);
  const showFollowUp =
    kanbanColumnShowsFollowUpOnCard(col) &&
    item.next_action_date &&
    /^\d{4}-\d{2}-\d{2}$/.test(String(item.next_action_date).trim());
  const followVs = followUpDateVsTodayVilnius(item.next_action_date);
  const invBlock = kanbanCardInvoiceBlockText(item);
  const [copyHint, setCopyHint] = useState<"invoice" | "phone" | "email" | null>(null);
  useEffect(() => {
    if (!copyHint) return;
    const t = window.setTimeout(() => setCopyHint(null), 1500);
    return () => clearTimeout(t);
  }, [copyHint]);

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
          {showFollowUp ? (
            <div className="mt-1.5 flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                {followColLabel}
              </span>
              <span
                className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-xs font-semibold tabular-nums ${
                  followVs === "past"
                    ? "border-red-200/90 bg-red-50/90 text-red-800"
                    : followVs === "today"
                      ? "border-amber-200/90 bg-amber-50/90 text-amber-950"
                      : "border-zinc-200/80 bg-white text-zinc-800"
                }`}
              >
                {formatDate(item.next_action_date)}
              </span>
            </div>
          ) : null}
          <div className="mt-1 space-y-0.5 overflow-visible text-xs text-zinc-500">
            <div className="tabular-nums">Visa vertė: {formatMoney(kanbanCardClientTotalEuros(item))}</div>
            {invBlock.mode === "procurement" ? (
              <div className="tabular-nums">{invBlock.mainText}</div>
            ) : (
              <>
                {invBlock.invoiceNumberCopy ? (
                  <div
                    className="relative w-full min-w-0 cursor-pointer overflow-visible text-zinc-500 hover:text-zinc-600"
                    title="Kopijuoti"
                    role="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      if (invBlock.mode !== "invoice" || !invBlock.invoiceNumberCopy) return;
                      const { invoiceNumberCopy } = invBlock;
                      void navigator.clipboard
                        .writeText(invoiceNumberCopy)
                        .then(() => setCopyHint("invoice"));
                    }}
                  >
                    <div className="flex min-w-0 items-start gap-1 tabular-nums">
                      <FileText
                        className="mt-0.5 h-3 w-3 shrink-0 text-zinc-400"
                        strokeWidth={1.5}
                        aria-hidden
                      />
                      <span className="min-w-0">{invBlock.mainText}</span>
                    </div>
                    <KanbanCopyFeedbackBadge show={copyHint === "invoice"} />
                  </div>
                ) : (
                  <div className="flex min-w-0 items-start gap-1 tabular-nums">
                    <FileText
                      className="mt-0.5 h-3 w-3 shrink-0 text-zinc-400"
                      strokeWidth={1.5}
                      aria-hidden
                    />
                    <span className="min-w-0">{invBlock.mainText}</span>
                  </div>
                )}
                {invBlock.phone != null ? (
                  <div
                    className="relative w-full min-w-0 cursor-pointer overflow-visible text-zinc-500 hover:text-zinc-600"
                    title="Kopijuoti"
                    role="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      if (invBlock.mode !== "invoice" || !invBlock.phone) return;
                      const { copy } = invBlock.phone;
                      void navigator.clipboard.writeText(copy).then(() => setCopyHint("phone"));
                    }}
                  >
                    <div className="flex min-w-0 items-start gap-1 tabular-nums break-all">
                      <Phone
                        className="mt-0.5 h-3 w-3 shrink-0 text-zinc-400"
                        strokeWidth={1.5}
                        aria-hidden
                      />
                      <span className="min-w-0">{invBlock.phone.display}</span>
                    </div>
                    <KanbanCopyFeedbackBadge show={copyHint === "phone"} />
                  </div>
                ) : null}
                {invBlock.email != null ? (
                  <div
                    className="relative w-full min-w-0 cursor-pointer overflow-visible break-all text-zinc-500 hover:text-zinc-600"
                    title="Kopijuoti"
                    role="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      if (invBlock.mode !== "invoice" || !invBlock.email) return;
                      const { copy } = invBlock.email;
                      void navigator.clipboard.writeText(copy).then(() => setCopyHint("email"));
                    }}
                  >
                    <div className="flex min-w-0 items-start gap-1">
                      <Mail
                        className="mt-0.5 h-3 w-3 shrink-0 text-zinc-400"
                        strokeWidth={1.5}
                        aria-hidden
                      />
                      <span className="min-w-0 break-all">{invBlock.email.display}</span>
                    </div>
                    <KanbanCopyFeedbackBadge show={copyHint === "email"} />
                  </div>
                ) : null}
              </>
            )}
          </div>
        </button>
      </div>
    </div>
  );
}

function CardDragPreview({ item, priority }: { item: ProjectWorkItemDto; priority: CallListPriority }) {
  const b = kanbanCardInvoiceBlockText(item);
  return (
    <div className="max-w-[min(260px,85vw)] min-w-0 rounded-lg border border-zinc-300 bg-white p-2 shadow-lg">
      <div className="text-xs font-medium text-zinc-600">{callListPriorityLabel(priority)}</div>
      <div className="mt-0.5 text-sm font-semibold text-zinc-900">{item.client_name_snapshot}</div>
      <div className="space-y-0.5 text-xs text-zinc-600">
        <div className="tabular-nums">Visa vertė: {formatMoney(kanbanCardClientTotalEuros(item))}</div>
        {b.mode === "procurement" ? (
          <div className="tabular-nums text-zinc-500">{b.mainText}</div>
        ) : (
          <>
            <div className="flex min-w-0 items-start gap-1 tabular-nums text-zinc-500">
              <FileText className="mt-0.5 h-3 w-3 shrink-0 text-zinc-400" strokeWidth={1.5} aria-hidden />
              <span className="min-w-0">{b.mainText}</span>
            </div>
            {b.phone != null ? (
              <div className="flex min-w-0 items-start gap-1 tabular-nums break-all text-zinc-500">
                <Phone className="mt-0.5 h-3 w-3 shrink-0 text-zinc-400" strokeWidth={1.5} aria-hidden />
                <span className="min-w-0">{b.phone.display}</span>
              </div>
            ) : null}
            {b.email != null ? (
              <div className="flex min-w-0 items-start gap-1 break-all text-zinc-500">
                <Mail className="mt-0.5 h-3 w-3 shrink-0 text-zinc-400" strokeWidth={1.5} aria-hidden />
                <span className="min-w-0 break-all">{b.email.display}</span>
              </div>
            ) : null}
          </>
        )}
      </div>
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

  const buckets = useMemo(() => {
    const m = new Map<string, ProjectWorkItemDto[]>();
    const todayVilnius = vilniusTodayDateString();
    for (const k of columnKeys) m.set(k, []);
    for (const it of boardItems) {
      const k =
        boardVariant === "procurement"
          ? mapCallStatusToProcurementBoardColumn(it.call_status)
          : normalizeKanbanCallStatus(it.call_status);
      if (k === "Užbaigta") {
        const moved = vilniusDateWhenEnteredUžbaigtaColumn(it, activitiesByWorkItemId[it.id] ?? []);
        if (moved !== todayVilnius) continue;
      }
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(it);
    }
    return m;
  }, [boardItems, boardVariant, columnKeys, activitiesByWorkItemId]);

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
                    boardVariant={boardVariant}
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
          key={`${detailItem.id}-${detailItem.call_status}`}
          item={detailItem}
          activities={activitiesByWorkItemId[detailItem.id] ?? []}
          allWorkPriorities={items.map((i) => i.snapshot_priority)}
          onClose={() => setDetailItemId(null)}
        />
      ) : null}

      {pendingMove ? (
        <KanbanMoveConfirmModal
          key={`${pendingMove.workItemId}-${pendingMove.toColumn}`}
          pending={pendingMove}
          onCancel={() => setPendingMove(null)}
          onSuccess={onMoveSuccess}
        />
      ) : null}
    </div>
  );
}
