"use client";

import Link from "next/link";
import { useFormStatus } from "react-dom";
import { useActionState, useCallback, useMemo, useState } from "react";
import { formatDate, formatDateTimeLt, formatMoney } from "@/lib/crm/format";
import {
  defaultNextActionDateYmdForKanbanColumn,
  kanbanColumnHidesDateFieldInModal,
  kanbanColumnShowsDateFieldInModal,
} from "@/lib/crm/kanbanNextActionDate";
import { CrmIsoDatePicker } from "@/components/crm/CrmIsoDatePicker";
import { workItemClientDetailHref } from "@/lib/crm/clientRouting";
import {
  callListPriorityLabel,
  priorityFromSnapshotScore,
  type CallListPriority,
} from "@/lib/crm/callListPriority";
import { projectResultStatusLabel } from "@/lib/crm/projectSnapshot";
import {
  callStatusOptionLabel,
  callStatusSelectOptions,
  defaultWorkItemActionTypeForKanbanColumn,
  isReturnedToCandidates,
  mapCallStatusToProcurementBoardColumn,
  normalizeKanbanCallStatus,
  PROCUREMENT_KANBAN_COLUMNS,
  procurementKanbanColumnTitle,
  WORK_ITEM_ACTION_TYPES,
  workItemActionTypeLabel,
  type WorkItemTouchActionType,
} from "@/lib/crm/projectBoardConstants";
import { loadCandidateExpandDetailsAction, saveWorkItemTouchpoint } from "@/lib/crm/projectActions";
import { parseProcurementContractIdFromClientKey } from "@/lib/crm/procurementContractClientKey";
import type { CandidateExpandDetails } from "@/lib/crm/candidateExpandTypes";
import type { ProjectWorkItemActivityDto } from "@/lib/crm/projectWorkItemActivityDto";
import type { ProjectWorkItemDto } from "@/lib/crm/projectWorkItemDto";
import { ReturnToCandidatesFlow } from "@/components/crm/ReturnToCandidatesFlow";
import { WorkItemActivityTimeline } from "@/components/crm/WorkItemActivityTimeline";
import { WorkItemCompletionSelect } from "@/components/crm/WorkItemCompletionSelect";

function PriorityBadge({ level }: { level: CallListPriority }) {
  const styles =
    level === "high"
      ? "bg-rose-50 text-rose-800 ring-rose-100"
      : level === "low"
        ? "bg-zinc-100 text-zinc-600 ring-zinc-200/80"
        : "bg-amber-50 text-amber-900 ring-amber-100";

  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${styles}`}
    >
      {callListPriorityLabel(level)}
    </span>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <span className={`text-zinc-400 transition-transform duration-200 ${open ? "rotate-90" : ""}`} aria-hidden>
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path
          d="M6 4l4 4-4 4"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="cursor-pointer rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50"
    >
      {pending ? "…" : "Įrašyti veiksmą"}
    </button>
  );
}

function WorkExpandPanel({
  item,
  loading,
  detail,
  activities,
  formAction,
  onAfterReturn,
  allowEdit,
}: {
  item: ProjectWorkItemDto;
  loading: boolean;
  detail: CandidateExpandDetails | null;
  activities: ProjectWorkItemActivityDto[];
  formAction: (prev: { error: string | null }, fd: FormData) => Promise<{ error: string | null }>;
  onAfterReturn?: () => void;
  allowEdit: boolean;
}) {
  const isProcurementItem = item.source_type === "procurement_contract";
  const statusOpts = isProcurementItem ? [...PROCUREMENT_KANBAN_COLUMNS] : callStatusSelectOptions();
  const actionTypeOptions = isProcurementItem
    ? (WORK_ITEM_ACTION_TYPES.filter((t) => t !== "commercial") as WorkItemTouchActionType[])
    : [...WORK_ITEM_ACTION_TYPES];

  const [state, dispatch] = useActionState(formAction, { error: null });
  const [callStatus, setCallStatus] = useState(() =>
    isProcurementItem
      ? mapCallStatusToProcurementBoardColumn(item.call_status)
      : normalizeKanbanCallStatus(item.call_status)
  );
  const [actionType, setActionType] = useState<WorkItemTouchActionType>(() => {
    const d = defaultWorkItemActionTypeForKanbanColumn(item.call_status);
    return isProcurementItem && d === "commercial" ? "call" : d;
  });

  const completionPreset =
    callStatus === "Užbaigta" && normalizeKanbanCallStatus(item.call_status) === "Užbaigta"
      ? item.result_status
      : "";

  const hideDateField = kanbanColumnHidesDateFieldInModal(callStatus);
  const showEditableDate = kanbanColumnShowsDateFieldInModal(callStatus);
  const dateDefault = defaultNextActionDateYmdForKanbanColumn(callStatus) ?? "";

  return (
    <div className="space-y-4 border-t border-zinc-100 bg-zinc-50/40 px-4 py-4 pl-[3.25rem]">
      {loading ? <p className="text-sm text-zinc-500">Kraunama kontaktus ir sąskaitas…</p> : null}

      {!loading && (detail?.email || detail?.phone || detail?.address) ? (
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-400">Kontaktai</div>
          <dl className="mt-2 space-y-1 text-sm text-zinc-700">
            {detail.email ? (
              <div className="flex flex-wrap gap-x-2">
                <dt className="text-zinc-500">El. paštas</dt>
                <dd>
                  <a href={`mailto:${detail.email}`} className="text-zinc-900 underline-offset-2 hover:underline">
                    {detail.email}
                  </a>
                </dd>
              </div>
            ) : null}
            {detail.phone ? (
              <div className="flex flex-wrap gap-x-2">
                <dt className="text-zinc-500">Tel.</dt>
                <dd>
                  <a href={`tel:${detail.phone}`} className="text-zinc-900 underline-offset-2 hover:underline">
                    {detail.phone}
                  </a>
                </dd>
              </div>
            ) : null}
            {detail.address ? (
              <div className="flex flex-wrap gap-x-2">
                <dt className="shrink-0 text-zinc-500">Adresas</dt>
                <dd>{detail.address}</dd>
              </div>
            ) : null}
          </dl>
        </div>
      ) : null}

      {!loading && item.client_key && detail && !detail.email && !detail.phone && !detail.address ? (
        <p className="text-sm text-zinc-500">Kontaktų duomenų nėra.</p>
      ) : null}

      {!loading && detail && detail.invoices.length > 0 ? (
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-400">Naujausios sąskaitos</div>
          <ul className="mt-2 divide-y divide-zinc-100 rounded-md border border-zinc-100 bg-white">
            {detail.invoices.map((inv) => (
              <li
                key={inv.invoice_id}
                className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-3 py-2 text-sm"
              >
                <span className="font-medium text-zinc-900">{inv.label}</span>
                <span className="tabular-nums text-zinc-500">{formatDate(inv.invoice_date)}</span>
                <span className="w-full text-right text-xs tabular-nums text-zinc-700 sm:w-auto">{inv.amount}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="border-t border-zinc-100 pt-4" onClick={(e) => e.stopPropagation()}>
        <div className="text-xs font-medium uppercase tracking-wide text-zinc-400">Neseniai</div>
        <div className="mt-2">
          <WorkItemActivityTimeline activities={activities} compact />
        </div>
      </div>

      {allowEdit ? (
        <form
          key={`${item.id}-${activities.length}`}
          action={dispatch}
          className="space-y-3 border-t border-zinc-100 pt-4"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-400">Naujas veiksmas</div>
          {item.comment?.trim() ? (
            <p className="text-xs text-zinc-500">
              <span className="font-medium text-zinc-600">Paskutinis komentaras kortelėje: </span>
              {item.comment}
            </p>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="flex flex-col gap-1 text-xs text-zinc-500">
              Veiksmo tipas
              <select
                name="action_type"
                required
                value={actionType}
                onChange={(e) => setActionType(e.target.value as WorkItemTouchActionType)}
                className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-sm text-zinc-900"
              >
                {actionTypeOptions.map((t) => (
                  <option key={t} value={t}>
                    {workItemActionTypeLabel(t)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-zinc-500 sm:col-span-2">
              Sekantis veiksmas (Kanban)
              <select
                name="call_status"
                value={callStatus}
                onChange={(e) => {
                  const next = normalizeKanbanCallStatus(e.target.value);
                  setCallStatus(next);
                  setActionType(defaultWorkItemActionTypeForKanbanColumn(next));
                }}
                className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-sm text-zinc-900"
              >
                {statusOpts.map((k) => (
                  <option key={k || "__empty"} value={k}>
                    {isProcurementItem ? procurementKanbanColumnTitle(k) : callStatusOptionLabel(k)}
                  </option>
                ))}
              </select>
            </label>
            {callStatus === "Užbaigta" ? (
              <div className="sm:col-span-2 lg:col-span-3">
                <WorkItemCompletionSelect
                  key={`${item.id}-completion-${completionPreset}`}
                  required
                  defaultValue={completionPreset}
                  variant={isProcurementItem ? "procurement" : "default"}
                  selectClassName="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-sm text-zinc-900"
                />
              </div>
            ) : null}
            {callStatus === "Užbaigta" && isProcurementItem ? (
              <p className="text-xs text-zinc-500 sm:col-span-2 lg:col-span-3">
                Pasirinkus „Kita“, komentaras privalomas.
              </p>
            ) : null}
            {hideDateField ? null : showEditableDate ? (
              <label className="flex flex-col gap-1 text-xs text-zinc-500">
                <span>
                  Planuojamas veiksmas (data)
                  <span className="text-red-600"> *</span>
                </span>
                <CrmIsoDatePicker name="next_action_date" defaultValue={dateDefault} required />
                <span className="text-xs text-zinc-400">Pasirinkite planuojamo veiksmo datą.</span>
              </label>
            ) : null}
            <label className="flex flex-col gap-1 text-xs text-zinc-500 sm:col-span-2 lg:col-span-3">
              Komentaras
              <textarea
                name="comment"
                rows={2}
                defaultValue=""
                placeholder="Įrašykite šio kontakto pastabą…"
                className="resize-y rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-sm text-zinc-900"
              />
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <SaveButton />
            {state.error ? <span className="text-xs text-red-600">{state.error}</span> : null}
          </div>
        </form>
      ) : null}

      {!isProcurementItem && !isReturnedToCandidates(item.result_status) ? (
        <div onClick={(e) => e.stopPropagation()}>
          <ReturnToCandidatesFlow
            workItemId={item.id}
            clientLabel={item.client_name_snapshot}
            activities={activities}
            onAfterSuccess={onAfterReturn}
          />
        </div>
      ) : null}
    </div>
  );
}

function WorkItemCard({
  item,
  priority,
  activities,
  variant,
}: {
  item: ProjectWorkItemDto;
  priority: CallListPriority;
  activities: ProjectWorkItemActivityDto[];
  variant: "default" | "contacted";
}) {
  const [open, setOpen] = useState(false);
  const [detailsCache, setDetailsCache] = useState<Map<string, CandidateExpandDetails>>(() => new Map());
  const [fetching, setFetching] = useState(false);

  const detailHref = workItemClientDetailHref(item.client_key);
  const picked = item.picked_at
    ? formatDateTimeLt(item.picked_at)
    : "—";

  const meta =
    item.source_type === "procurement_contract"
      ? [
          item.assigned_to?.trim() ? `Prisk.: ${item.assigned_to.trim()}` : "Nepriskirta",
          `Paėmė ${picked}`,
          `Galioja iki ${formatDate(item.snapshot_last_invoice_date)}`,
        ].join(" · ")
      : [
          item.assigned_to?.trim() ? `Prisk.: ${item.assigned_to.trim()}` : "Nepriskirta",
          `Paėmė ${picked}`,
          `${item.snapshot_order_count} sąsk. (snap.)`,
          `Pask. ${formatDate(item.snapshot_last_invoice_date)}`,
        ].join(" · ");

  const contactedOutcome = useMemo((): { label: string; at: string | null } => {
    const col = normalizeKanbanCallStatus(item.call_status);
    const outcomeLabel = (() => {
      switch (col) {
        case "Siųsti komercinį":
          return "Išsiųstas komercinis";
        case "Siųsti laišką":
          return "Išsiųstas laiškas";
        case "Perskambinti":
          return "Neperskambino";
        case "Laukti":
          return "Laukti";
        case "Užbaigta":
          return item.source_type === "procurement_contract"
            ? projectResultStatusLabel(item.result_status)
            : "Užbaigta";
        default:
          return callStatusOptionLabel(col);
      }
    })();

    // Kada pasiektas dabartinis rezultatas (paskutinis įrašas su šiuo call_status).
    let at: string | null = null;
    for (let i = activities.length - 1; i >= 0; i -= 1) {
      const a = activities[i];
      if (normalizeKanbanCallStatus(a.call_status) === col) {
        const iso = String(a.occurred_at ?? "").trim();
        if (iso) {
          at = iso;
          break;
        }
      }
    }
    return { label: outcomeLabel, at };
  }, [activities, item.call_status, item.result_status, item.source_type]);

  const formAction = useCallback(
    async (_prev: { error: string | null }, formData: FormData) => saveWorkItemTouchpoint(item.id, formData),
    [item.id]
  );

  const toggle = () => setOpen((prev) => !prev);

  useEffect(() => {
    if (!open) {
      setFetching(false);
      return;
    }
    const ck = item.client_key;
    if (!ck) return;
    if (parseProcurementContractIdFromClientKey(ck)) return;
    if (detailsCache.has(ck)) return;

    let cancelled = false;
    setFetching(true);
    loadCandidateExpandDetailsAction(ck)
      .then((d) => {
        if (cancelled) return;
        setDetailsCache((prevMap) => new Map(prevMap).set(ck, d));
      })
      .finally(() => {
        if (cancelled) return;
        setFetching(false);
      });
    return () => {
      cancelled = true;
    };
  }, [detailsCache, item.client_key, open]);

  const detail = item.client_key ? detailsCache.get(item.client_key) ?? null : null;
  const showLoading = open && fetching && item.client_key !== "" && !detailsCache.has(item.client_key);

  return (
    <div
      className={`rounded-lg border border-zinc-200/90 bg-white transition-colors duration-150 hover:border-zinc-300/90 hover:bg-zinc-50/60 ${
        open ? "ring-1 ring-zinc-200" : ""
      }`}
    >
      <div className="flex items-stretch gap-2 sm:gap-3">
        <button
          type="button"
          onClick={toggle}
          className="flex shrink-0 cursor-pointer items-center px-2 text-zinc-400 hover:bg-zinc-100/80 hover:text-zinc-600 sm:px-3"
          aria-expanded={open}
          aria-label={open ? "Suskleisti" : "Išplėsti"}
        >
          <Chevron open={open} />
        </button>

        <div
          role="button"
          tabIndex={0}
          onClick={toggle}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              toggle();
            }
          }}
          className="flex min-w-0 flex-1 cursor-pointer flex-col gap-2 py-3.5 pr-2 outline-none sm:flex-row sm:items-center sm:gap-3 sm:pr-4 focus-visible:ring-2 focus-visible:ring-zinc-300"
        >
          <PriorityBadge level={priority} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-base font-semibold tracking-tight text-zinc-900">
              {detailHref ? (
                <Link
                  href={detailHref}
                  onClick={(e) => e.stopPropagation()}
                  className="rounded-sm hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-400"
                >
                  {item.client_name_snapshot}
                </Link>
              ) : (
                <span className="rounded-sm">{item.client_name_snapshot}</span>
              )}
            </div>
            {variant === "contacted" ? (
              <div className="mt-1">
                <div className="text-sm font-medium text-zinc-700">
                  Rezultatas: <span className="font-semibold text-zinc-900">{contactedOutcome.label}</span>
                </div>
                {item.source_type === "procurement_contract" &&
                String(item.result_status ?? "").trim() === "completion_procurement_other" &&
                item.comment?.trim() ? (
                  <div className="mt-1 text-xs text-zinc-600">
                    <span className="font-medium text-zinc-700">Komentaras: </span>
                    {item.comment}
                  </div>
                ) : null}
                <div className="mt-0.5 text-xs tabular-nums text-zinc-500">
                  {contactedOutcome.at ? formatDateTimeLt(contactedOutcome.at) : "—"}
                </div>
              </div>
            ) : (
              <p className="mt-0.5 line-clamp-2 text-sm leading-snug text-zinc-500">{meta}</p>
            )}
          </div>
        </div>

        {variant === "default" ? (
          <div
            className="flex shrink-0 flex-col items-end justify-center gap-1 border-l border-zinc-100 py-3.5 pl-3 pr-3 sm:pl-4 sm:pr-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-right text-base font-semibold tabular-nums text-zinc-900">
              {formatMoney(item.snapshot_revenue)}
            </div>
            <p className="text-xs text-zinc-400">{projectResultStatusLabel(item.result_status)}</p>
          </div>
        ) : null}
      </div>

      {open ? (
        <WorkExpandPanel
          key={`${item.id}-${item.call_status}`}
          item={item}
          loading={showLoading}
          detail={detail}
          activities={activities}
          formAction={formAction}
          onAfterReturn={() => setOpen(false)}
          allowEdit={variant !== "contacted"}
        />
      ) : null}
    </div>
  );
}

export function ProjectWorkQueueCallList({
  items,
  activitiesByWorkItemId,
  variant = "default",
  emptyHint = "kandidatai",
}: {
  items: ProjectWorkItemDto[];
  activitiesByWorkItemId: Record<string, ProjectWorkItemActivityDto[]>;
  variant?: "default" | "contacted";
  /** Tuščiam sąrašui (skirtukas „Darbas“ / sąrašas). */
  emptyHint?: "kandidatai" | "procurement";
}) {
  const prios = items.map((w) => w.snapshot_priority);

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-zinc-200 bg-zinc-50/50 px-6 py-12 text-center text-sm text-zinc-500">
        {emptyHint === "procurement"
          ? "Dar nėra darbo įrašų — eikite į „Sutartys“ ir spauskite „Priskirti sau“."
          : "Dar niekas nepaėmė — eikite į „Kandidatai“."}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      {items.map((m) => (
        <WorkItemCard
          key={m.id}
          item={m}
          priority={priorityFromSnapshotScore(m.snapshot_priority, prios)}
          activities={activitiesByWorkItemId[m.id] ?? []}
          variant={variant}
        />
      ))}
    </div>
  );
}
