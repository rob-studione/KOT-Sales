"use client";

import {
  PROCUREMENT_WORK_ITEM_COMPLETION_RESULT_VALUES,
  WORK_ITEM_COMPLETION_RESULT_VALUES,
  completionResultLabel,
  parseCompletionResult,
} from "@/lib/crm/projectCompletion";

export function WorkItemCompletionSelect({
  required,
  selectClassName,
  defaultValue,
  variant = "default",
}: {
  required?: boolean;
  /** Sąrašo forma naudoja šiek tiek kompaktiškesnius stilius. */
  selectClassName?: string;
  /** Jau išsaugotas kodas (pvz. iš DB), arba tuščia. */
  defaultValue?: string | null;
  variant?: "default" | "procurement";
}) {
  const sel =
    selectClassName ??
    "rounded-lg border border-zinc-200 px-2.5 py-2 text-sm text-zinc-900";
  const initial = parseCompletionResult(defaultValue) ?? "";
  const values =
    variant === "procurement"
      ? PROCUREMENT_WORK_ITEM_COMPLETION_RESULT_VALUES
      : WORK_ITEM_COMPLETION_RESULT_VALUES;
  return (
    <label className="flex flex-col gap-1 text-xs text-zinc-500">
      Užbaigimo rezultatas <span className="text-red-600">*</span>
      <select name="completion_result" required={required} defaultValue={initial} className={sel}>
        <option value="" disabled>
          Pasirinkite…
        </option>
        {values.map((v) => (
          <option key={v} value={v}>
            {completionResultLabel(v)}
          </option>
        ))}
      </select>
    </label>
  );
}
