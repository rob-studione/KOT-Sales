"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { useActionState, useCallback, useEffect, useState } from "react";
import {
  CRM_DATE_INPUT_PLACEHOLDER,
  crmDateInputDefaultToday,
  formatDate,
  formatMoney,
} from "@/lib/crm/format";
import { workItemClientDetailHref } from "@/lib/crm/clientRouting";
import {
  callStatusOptionLabel,
  callStatusSelectOptions,
  defaultWorkItemActionTypeForKanbanColumn,
  isCallKpiActionType,
  isReturnedToCandidates,
  mapCallStatusToProcurementBoardColumn,
  normalizeKanbanCallStatus,
  PROCUREMENT_KANBAN_COLUMNS,
  procurementKanbanColumnTitle,
  WORK_ITEM_ACTION_TYPES,
  workItemActionTypeLabel,
  type WorkItemTouchActionType,
} from "@/lib/crm/projectBoardConstants";
import { saveWorkItemTouchpoint } from "@/lib/crm/projectActions";
import type { ProjectWorkItemActivityDto } from "@/lib/crm/projectWorkItemActivityDto";
import type { ProjectWorkItemDto } from "@/lib/crm/projectWorkItemDto";
import { ReturnToCandidatesFlow } from "@/components/crm/ReturnToCandidatesFlow";
import { WorkItemActivityTimeline } from "@/components/crm/WorkItemActivityTimeline";
import { WorkItemCompletionSelect } from "@/components/crm/WorkItemCompletionSelect";
import {
  callListPriorityLabel,
  priorityFromSnapshotScore,
  type CallListPriority,
} from "@/lib/crm/callListPriority";

function SaveBtn({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="cursor-pointer rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
    >
      {pending ? "…" : label}
    </button>
  );
}

export function WorkItemDetailSheet({
  item,
  activities,
  allWorkPriorities,
  onClose,
}: {
  item: ProjectWorkItemDto;
  activities: ProjectWorkItemActivityDto[];
  allWorkPriorities: number[];
  onClose: () => void;
}) {
  const router = useRouter();
  const isProcurementItem = item.source_type === "procurement_contract";
  const statusOptions = isProcurementItem ? [...PROCUREMENT_KANBAN_COLUMNS] : callStatusSelectOptions();
  const actionTypeOptions = isProcurementItem
    ? (WORK_ITEM_ACTION_TYPES.filter((t) => t !== "commercial") as WorkItemTouchActionType[])
    : [...WORK_ITEM_ACTION_TYPES];
  const callKpiCount = activities.filter((a) => isCallKpiActionType(a.action_type)).length;

  const formAction = useCallback(
    async (_prev: { error: string | null }, fd: FormData) => {
      const r = await saveWorkItemTouchpoint(item.id, fd);
      if (!r.error) router.refresh();
      return r;
    },
    [item.id, router]
  );

  const [state, dispatch] = useActionState(formAction, { error: null });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const detailHref = workItemClientDetailHref(item.client_key);
  const level: CallListPriority = priorityFromSnapshotScore(item.snapshot_priority, allWorkPriorities);

  const dateDefault = crmDateInputDefaultToday();

  const [callStatus, setCallStatus] = useState(() =>
    isProcurementItem
      ? mapCallStatusToProcurementBoardColumn(item.call_status)
      : normalizeKanbanCallStatus(item.call_status)
  );
  const [actionType, setActionType] = useState<WorkItemTouchActionType>(() => {
    const d = defaultWorkItemActionTypeForKanbanColumn(item.call_status);
    return isProcurementItem && d === "commercial" ? "call" : d;
  });
  useEffect(() => {
    const col = isProcurementItem
      ? mapCallStatusToProcurementBoardColumn(item.call_status)
      : normalizeKanbanCallStatus(item.call_status);
    setCallStatus(col);
    const d = defaultWorkItemActionTypeForKanbanColumn(col);
    setActionType(isProcurementItem && d === "commercial" ? "call" : d);
  }, [item.id, item.call_status, isProcurementItem]);

  const completionPreset =
    callStatus === "Užbaigta" && normalizeKanbanCallStatus(item.call_status) === "Užbaigta"
      ? item.result_status
      : "";

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        className="absolute inset-0 bg-zinc-900/20 backdrop-blur-[1px]"
        aria-label="Uždaryti"
        onClick={onClose}
      />
      <div className="relative flex h-full w-full max-w-md flex-col border-l border-zinc-200 bg-white shadow-xl">
        <div className="flex items-start justify-between gap-2 border-b border-zinc-100 px-4 py-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-700">
                {callListPriorityLabel(level)}
              </span>
            </div>
            <h2 className="mt-1 text-base font-semibold leading-snug text-zinc-900">
              {detailHref ? (
                <Link href={detailHref} className="hover:underline" onClick={(e) => e.stopPropagation()}>
                  {item.client_name_snapshot}
                </Link>
              ) : (
                <span>{item.client_name_snapshot}</span>
              )}
            </h2>
            <p className="mt-1 text-xs text-zinc-500">
              {isProcurementItem ? (
                <>
                  {formatMoney(item.snapshot_revenue)} · galioja iki {formatDate(item.snapshot_last_invoice_date)}
                </>
              ) : (
                <>
                  {formatMoney(item.snapshot_revenue)} · {item.snapshot_order_count} sąsk. · pask.{" "}
                  {formatDate(item.snapshot_last_invoice_date)}
                </>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-lg p-2 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
            aria-label="Uždaryti"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          <form key={`${item.id}-${activities.length}`} action={dispatch} className="space-y-4">
            <div>
              <h3 className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">Naujas veiksmas</h3>
              <div className="mt-2 space-y-3">
                <label className="flex flex-col gap-1 text-xs text-zinc-500">
                  Veiksmo tipas
                  <select
                    name="action_type"
                    required
                    value={actionType}
                    onChange={(e) => setActionType(e.target.value as WorkItemTouchActionType)}
                    className="rounded-lg border border-zinc-200 px-2.5 py-2 text-sm text-zinc-900"
                  >
                    {actionTypeOptions.map((t) => (
                      <option key={t} value={t}>
                        {workItemActionTypeLabel(t)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs text-zinc-500">
                  Sekantis veiksmas (Kanban)
                  <select
                    name="call_status"
                    value={callStatus}
                    onChange={(e) => {
                      const next = normalizeKanbanCallStatus(e.target.value);
                      setCallStatus(next);
                      setActionType(defaultWorkItemActionTypeForKanbanColumn(next));
                    }}
                    className="rounded-lg border border-zinc-200 px-2.5 py-2 text-sm text-zinc-900"
                  >
                    {statusOptions.map((k) => (
                      <option key={k || "__empty"} value={k}>
                        {isProcurementItem ? procurementKanbanColumnTitle(k) : callStatusOptionLabel(k)}
                      </option>
                    ))}
                  </select>
                </label>
                {callStatus === "Užbaigta" ? (
                  <WorkItemCompletionSelect
                    key={`${item.id}-completion-${completionPreset}`}
                    required
                    defaultValue={completionPreset}
                    variant={isProcurementItem ? "procurement" : "default"}
                  />
                ) : null}
                {callStatus === "Užbaigta" && isProcurementItem ? (
                  <p className="text-[11px] text-zinc-500">Pasirinkus „Kita“, komentaras privalomas.</p>
                ) : null}
                <label className="flex flex-col gap-1 text-xs text-zinc-500">
                  Data
                  <input
                    name="next_action_date"
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder={CRM_DATE_INPUT_PLACEHOLDER}
                    defaultValue={dateDefault}
                    className="rounded-lg border border-zinc-200 px-2.5 py-2 text-sm text-zinc-900 placeholder:text-zinc-400"
                  />
                  <span className="text-[11px] text-zinc-400">
                    Formatas: {CRM_DATE_INPUT_PLACEHOLDER}. Numatyta — šiandien. Privaloma, jei „Sekantis veiksmas“ =
                    Laukti (laukimo pabaiga).
                  </span>
                </label>
                <label className="flex flex-col gap-1 text-xs text-zinc-500">
                  Komentaras
                  <textarea
                    name="comment"
                    rows={3}
                    defaultValue=""
                    placeholder="Įrašykite pastabą šiam kontaktui…"
                    className="resize-y rounded-lg border border-zinc-200 px-2.5 py-2 text-sm text-zinc-900"
                  />
                </label>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <SaveBtn label="Įrašyti veiksmą" />
              {state.error ? <span className="text-sm text-red-600">{state.error}</span> : null}
            </div>
          </form>

          {!isProcurementItem && !isReturnedToCandidates(item.result_status) ? (
            <div className="mt-8 border-t border-zinc-100 pt-6">
              <ReturnToCandidatesFlow
                workItemId={item.id}
                clientLabel={item.client_name_snapshot}
                activities={activities}
                onAfterSuccess={onClose}
              />
            </div>
          ) : null}

          <div className="mt-8 border-t border-zinc-100 pt-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">Veiklos istorija</h3>
              <span className="text-[11px] tabular-nums text-zinc-500">
                Skambučių (KPI): <span className="font-medium text-zinc-700">{callKpiCount}</span>
              </span>
            </div>
            <div className="mt-3">
              <WorkItemActivityTimeline activities={activities} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
