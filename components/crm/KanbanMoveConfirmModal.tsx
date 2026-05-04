"use client";

import { useActionState, useCallback, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  defaultNextActionDateYmdForKanbanColumn,
  kanbanColumnHidesDateFieldInModal,
  kanbanColumnShowsDateFieldInModal,
} from "@/lib/crm/kanbanNextActionDate";
import { confirmKanbanMove } from "@/lib/crm/projectActions";
import { CrmIsoDatePicker } from "@/components/crm/CrmIsoDatePicker";
import {
  callStatusOptionLabel,
  callStatusSelectOptions,
  defaultKanbanCompletedAction,
  kanbanCompletedActionLabel,
  KANBAN_COMPLETED_ACTION_VALUES,
  normalizeKanbanCallStatus,
  PROCUREMENT_KANBAN_COLUMNS,
  procurementKanbanColumnTitle,
  type KanbanCompletedAction,
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
      className="cursor-pointer rounded-lg bg-[#7C4A57] px-3 py-2 text-sm font-medium text-white hover:bg-[#693948] disabled:opacity-50"
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
  const completedActionOptions: KanbanCompletedAction[] = [...KANBAN_COMPLETED_ACTION_VALUES];
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
  const [completedAction, setCompletedAction] = useState<KanbanCompletedAction>(() =>
    defaultKanbanCompletedAction(pending.fromColumn, pending.toColumn)
  );

  const hideDateField = kanbanColumnHidesDateFieldInModal(callStatus);
  const showEditableDate = kanbanColumnShowsDateFieldInModal(callStatus);
  const dateDefault = defaultNextActionDateYmdForKanbanColumn(callStatus) ?? "";
  const completionPreset =
    callStatus === "Užbaigta" && normalizeKanbanCallStatus(pending.item.call_status) === "Užbaigta"
      ? pending.item.result_status
      : "";

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-[#7C4A57]/40 backdrop-blur-[1px]"
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
            Atliktas veiksmas
            <select
              name="completed_action"
              value={completedAction}
              onChange={(e) => setCompletedAction(e.target.value as KanbanCompletedAction)}
              className="rounded-lg border border-zinc-200 px-2.5 py-2 text-sm text-zinc-900"
            >
              {completedActionOptions.map((v) => (
                <option key={v} value={v}>
                  {kanbanCompletedActionLabel(v)}
                </option>
              ))}
            </select>
            <span className="text-xs text-zinc-400">
              KPI „Skambučiai“ didėja tik pasirinkus skambutį. „Tik pakeisti statusą“ — tik istorijos įrašas be
              skambučio.
            </span>
          </label>

          <label className="flex flex-col gap-1 text-xs text-zinc-500">
            Sekantis veiksmas (Kanban)
            <select
              name="call_status"
              value={callStatus}
              onChange={(e) => {
                const next = normalizeKanbanCallStatus(e.target.value);
                setCallStatus(next);
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

          {hideDateField ? null : showEditableDate ? (
            <label className="flex flex-col gap-1 text-xs text-zinc-500">
              <span>
                Planuojamas veiksmas (data)
                <span className="text-red-600"> *</span>
              </span>
              <CrmIsoDatePicker name="next_action_date" defaultValue={dateDefault} required />
              <span className="text-xs text-zinc-400">
                Pasirinkite planuojamo veiksmo datą.
              </span>
            </label>
          ) : null}

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
