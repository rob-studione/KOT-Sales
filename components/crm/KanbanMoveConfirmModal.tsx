"use client";

import { useActionState, useCallback, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { CRM_DATE_INPUT_PLACEHOLDER, crmDateInputDefaultToday } from "@/lib/crm/format";
import { confirmKanbanMove } from "@/lib/crm/projectActions";
import {
  callStatusOptionLabel,
  callStatusSelectOptions,
  defaultWorkItemActionTypeForKanbanColumn,
  normalizeKanbanCallStatus,
  PROCUREMENT_KANBAN_COLUMNS,
  procurementKanbanColumnTitle,
  WORK_ITEM_ACTION_TYPES,
  workItemActionTypeLabel,
  type WorkItemTouchActionType,
} from "@/lib/crm/projectBoardConstants";
import type { ProjectWorkItemDto } from "@/lib/crm/projectWorkItemDto";
import { WorkItemCompletionSelect } from "@/components/crm/WorkItemCompletionSelect";

export type PendingKanbanMove = {
  workItemId: string;
  fromColumn: string;
  toColumn: string;
  item: ProjectWorkItemDto;
};

function SubmitBtn() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="cursor-pointer rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
    >
      {pending ? "…" : "Įrašyti veiksmą"}
    </button>
  );
}

export function KanbanMoveConfirmModal({
  pending,
  onCancel,
  onSuccess,
}: {
  pending: PendingKanbanMove;
  onCancel: () => void;
  onSuccess: () => void;
}) {
  const isProcurementWorkItem = pending.item.source_type === "procurement_contract";
  const statusOptions = isProcurementWorkItem
    ? [...PROCUREMENT_KANBAN_COLUMNS]
    : callStatusSelectOptions();
  const actionTypeOptions = isProcurementWorkItem
    ? (WORK_ITEM_ACTION_TYPES.filter((t) => t !== "commercial") as WorkItemTouchActionType[])
    : [...WORK_ITEM_ACTION_TYPES];

  const formAction = useCallback(
    async (_prev: { error: string | null }, fd: FormData) => {
      const r = await confirmKanbanMove(fd);
      if (!r.error) onSuccess();
      return r;
    },
    [onSuccess]
  );

  const [state, dispatch] = useActionState(formAction, { error: null });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const [callStatus, setCallStatus] = useState(() => normalizeKanbanCallStatus(pending.toColumn));
  const [actionType, setActionType] = useState<WorkItemTouchActionType>(() => {
    const d = defaultWorkItemActionTypeForKanbanColumn(pending.toColumn);
    return isProcurementWorkItem && d === "commercial" ? "call" : d;
  });
  useEffect(() => {
    const col = normalizeKanbanCallStatus(pending.toColumn);
    setCallStatus(col);
    const d = defaultWorkItemActionTypeForKanbanColumn(col);
    setActionType(isProcurementWorkItem && d === "commercial" ? "call" : d);
  }, [pending.workItemId, pending.toColumn, isProcurementWorkItem]);

  const toIsLaukti = callStatus === "Laukti";
  const dateDefault = crmDateInputDefaultToday();
  const completionPreset =
    callStatus === "Užbaigta" && normalizeKanbanCallStatus(pending.item.call_status) === "Užbaigta"
      ? pending.item.result_status
      : "";

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-zinc-900/40 backdrop-blur-[1px]"
        aria-label="Atšaukti"
        onClick={onCancel}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="kanban-move-title"
        className="relative z-10 w-full max-w-md rounded-xl border border-zinc-200 bg-white p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="kanban-move-title" className="text-base font-semibold text-zinc-900">
          Patvirtinti perkėlimą
        </h2>
        <p className="mt-1 text-sm text-zinc-600">
          <span className="font-medium text-zinc-800">{pending.item.client_name_snapshot}</span>
          <br />
          {isProcurementWorkItem ? procurementKanbanColumnTitle(pending.fromColumn) : callStatusOptionLabel(pending.fromColumn)}{" "}
          →{" "}
          {isProcurementWorkItem ? procurementKanbanColumnTitle(pending.toColumn) : callStatusOptionLabel(pending.toColumn)}
        </p>

        <form
          key={`${pending.workItemId}-${pending.toColumn}`}
          action={dispatch}
          className="mt-4 space-y-3"
        >
          <input type="hidden" name="work_item_id" value={pending.workItemId} />

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
                  {isProcurementWorkItem ? procurementKanbanColumnTitle(k) : callStatusOptionLabel(k)}
                </option>
              ))}
            </select>
            <span className="text-xs text-zinc-400">
              Pagal nutylėjimą — stulpelis, į kurį perkėlėte kortelę; galite pakeisti prieš įrašant.
            </span>
          </label>

          {callStatus === "Užbaigta" ? (
            <WorkItemCompletionSelect
              key={`${pending.workItemId}-completion-${completionPreset}`}
              required
              defaultValue={completionPreset}
              variant={isProcurementWorkItem ? "procurement" : "default"}
            />
          ) : null}

          {callStatus === "Užbaigta" && isProcurementWorkItem ? (
            <p className="text-xs text-zinc-500">
              Pasirinkus „Kita“, komentaras žemiau privalomas.
            </p>
          ) : null}

          <label className="flex flex-col gap-1 text-xs text-zinc-500">
            Data
            {toIsLaukti ? <span className="text-red-600">*</span> : null}
            <input
              name="next_action_date"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              placeholder={CRM_DATE_INPUT_PLACEHOLDER}
              defaultValue={dateDefault}
              required={toIsLaukti}
              className="rounded-lg border border-zinc-200 px-2.5 py-2 text-sm text-zinc-900 placeholder:text-zinc-400"
            />
            {toIsLaukti ? (
              <span className="text-xs text-zinc-400">
                Stulpeliui „Laukti“ data privaloma. Formatas: {CRM_DATE_INPUT_PLACEHOLDER}.
              </span>
            ) : (
              <span className="text-xs text-zinc-400">
                Formatas: {CRM_DATE_INPUT_PLACEHOLDER}. Numatyta — šiandien. Privaloma, jei „Sekantis veiksmas“ =
                Laukti (laukimo pabaiga).
              </span>
            )}
          </label>

          <label className="flex flex-col gap-1 text-xs text-zinc-500">
            Komentaras
            <textarea
              name="comment"
              rows={3}
              placeholder="Kodėl perkėlate ir kas toliau…"
              className="resize-y rounded-lg border border-zinc-200 px-2.5 py-2 text-sm text-zinc-900"
            />
          </label>

          {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}

          <div className="flex flex-wrap justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onCancel}
              className="cursor-pointer rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
            >
              Atšaukti
            </button>
            <SubmitBtn />
          </div>
        </form>
      </div>
    </div>
  );
}
