"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";
import { formatDate, formatMoney } from "@/lib/crm/format";
import { clientDetailPath } from "@/lib/crm/clientRouting";
import type { SnapshotCandidateRow } from "@/lib/crm/projectSnapshot";
import {
  callListPriorityLabel,
  priorityFromRankInList,
  type CallListPriority,
} from "@/lib/crm/callListPriority";
import type { CandidateExpandDetails } from "@/lib/crm/candidateExpandTypes";
import {
  loadCandidateExpandDetailsAction,
  markAutoCandidateAsInvalidAction,
  pickClientFromProject,
  restoreAutoCandidateAction,
} from "@/lib/crm/projectActions";
import { ProjectCandidatePickForm } from "@/components/crm/ProjectCandidatePickForm";

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
    <span
      className={`text-zinc-400 transition-transform duration-200 ${open ? "rotate-90" : ""}`}
      aria-hidden
    >
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

function ExpandPanel({
  loading,
  detail,
  indentClass,
}: {
  loading: boolean;
  detail: CandidateExpandDetails | null;
  indentClass: string;
}) {
  if (loading) {
    return (
      <div className={`px-4 py-4 text-sm text-zinc-500 ${indentClass}`}>
        Kraunama…
      </div>
    );
  }

  const hasContact = detail?.email || detail?.phone || detail?.address;
  const hasInv = detail && detail.invoices.length > 0;

  return (
    <div className={`space-y-4 border-t border-zinc-100 bg-zinc-50/40 px-4 py-4 text-sm ${indentClass}`}>
      {hasContact ? (
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-400">Kontaktai</div>
          <dl className="mt-2 space-y-1 text-zinc-700">
            {detail!.email ? (
              <div className="flex flex-wrap gap-x-2">
                <dt className="text-zinc-500">El. paštas</dt>
                <dd>
                  <a href={`mailto:${detail!.email}`} className="text-zinc-900 underline-offset-2 hover:underline">
                    {detail!.email}
                  </a>
                </dd>
              </div>
            ) : null}
            {detail!.phone ? (
              <div className="flex flex-wrap gap-x-2">
                <dt className="text-zinc-500">Tel.</dt>
                <dd>
                  <a href={`tel:${detail!.phone}`} className="text-zinc-900 underline-offset-2 hover:underline">
                    {detail!.phone}
                  </a>
                </dd>
              </div>
            ) : null}
            {detail!.address ? (
              <div className="flex flex-wrap gap-x-2">
                <dt className="shrink-0 text-zinc-500">Adresas</dt>
                <dd className="text-zinc-700">{detail!.address}</dd>
              </div>
            ) : null}
          </dl>
        </div>
      ) : (
        <p className="text-zinc-500">Kontaktų duomenų nėra.</p>
      )}

      {hasInv ? (
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-400">Naujausios sąskaitos</div>
          <ul className="mt-2 divide-y divide-zinc-100 rounded-md border border-zinc-100 bg-white">
            {detail!.invoices.map((inv) => (
              <li key={inv.invoice_id} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-3 py-2">
                <span className="font-medium text-zinc-900">{inv.label}</span>
                <span className="tabular-nums text-zinc-500">{formatDate(inv.invoice_date)}</span>
                <span className="w-full text-right text-xs tabular-nums text-zinc-700 sm:w-auto">{inv.amount}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-zinc-500">Sąskaitų sąrašas tuščias.</p>
      )}
    </div>
  );
}

export type ProjectCandidateCallListProps =
  | { mode: "preview"; candidates: SnapshotCandidateRow[] }
  | {
      mode: "pick";
      projectId: string;
      defaultAssignee: string;
      candidates: SnapshotCandidateRow[];
      listStatus?: "active" | "netinkamas";
      /**
       * Pilnas filtruotas sąrašas (visi puslapiai): „Aukštas/Vidutinis/Žemas“ pagal vietą
       * visame sąraše. Be šito — ženkliukas skaičiuojamas tik iš `candidates` (pvz. 20 eilučių puslapyje).
       */
      callListPriorityBasis?: { total: number; rankByClientKey: Record<string, number> };
    };

export function ProjectCandidateCallList(props: ProjectCandidateCallListProps) {
  const { mode, candidates } = props;
  const projectId = mode === "pick" ? props.projectId : "";
  const defaultAssignee = mode === "pick" ? props.defaultAssignee : "";
  const priorityBasis = mode === "pick" ? props.callListPriorityBasis : undefined;
  const listStatus = mode === "pick" ? (props.listStatus ?? "active") : "active";
  const router = useRouter();
  const totalCandidates = candidates.length;
  const totalForPriority = priorityBasis?.total ?? totalCandidates;
  const showBulk = mode === "pick" && projectId.length > 0;
  const expandPanelIndent = showBulk ? "pl-[5.75rem]" : "pl-[3.25rem]";

  const [hiddenClientKeys, setHiddenClientKeys] = useState<Set<string>>(() => new Set());
  const rankByKey = useMemo(() => {
    const m = new Map<string, number>();
    candidates.forEach((c, i) => {
      if (c.client_key) m.set(c.client_key, i + 1);
    });
    return m;
  }, [candidates]);

  const displayCandidates = useMemo(() => {
    if (mode !== "pick") return candidates;
    return candidates.filter((c) => !hiddenClientKeys.has(c.client_key));
  }, [mode, candidates, hiddenClientKeys]);

  const [openKey, setOpenKey] = useState<string | null>(null);
  const [detailsCache, setDetailsCache] = useState<Map<string, CandidateExpandDetails>>(() => new Map());
  const [fetchingKey, setFetchingKey] = useState<string | null>(null);
  const [selectedIdx, setSelectedIdx] = useState<Set<number>>(() => new Set());
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const [bulkPending, startBulkTransition] = useTransition();
  const [rowActionPending, startRowActionTransition] = useTransition();
  const invalidDialogRef = useRef<HTMLDialogElement>(null);
  const [pendingInvalidKey, setPendingInvalidKey] = useState<string | null>(null);

  const allSelected = totalCandidates > 0 && selectedIdx.size === totalCandidates;
  const selectedCount = selectedIdx.size;

  const toggleSelect = (index: number) => {
    setSelectedIdx((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
    setBulkError(null);
  };

  const toggleSelectAll = () => {
    setSelectedIdx(() => {
      if (allSelected) return new Set();
      return new Set(candidates.map((_, i) => i));
    });
    setBulkError(null);
  };

  const bulkAssignToSelf = () => {
    if (!projectId || selectedCount === 0) return;
    const assignee = (defaultAssignee ?? "").trim() || "";
    const ordered = [...selectedIdx].sort((a, b) => a - b);
    startBulkTransition(async () => {
      setBulkError(null);
      for (const i of ordered) {
        const row = candidates[i];
        if (!row) continue;
        const fd = new FormData();
        fd.set("project_id", projectId);
        fd.set("candidate_type", "auto");
        fd.set("client_key", row.client_key);
        fd.set("assigned_to", assignee);
        const globalPri = priorityBasis?.rankByClientKey[row.client_key] ?? i + 1;
        fd.set("snapshot_priority", String(globalPri));
        const r = await pickClientFromProject(fd);
        if (!r.ok) {
          setBulkError(r.error);
          router.refresh();
          return;
        }
        setHiddenClientKeys((prev) => new Set(prev).add(row.client_key));
      }
      setSelectedIdx(new Set());
    });
  };

  const toggle = (rowUiKey: string, clientKeyForFetch: string) => {
    if (openKey === rowUiKey) {
      setOpenKey(null);
      setFetchingKey(null);
      return;
    }
    setOpenKey(rowUiKey);
    if (!detailsCache.has(rowUiKey)) {
      setFetchingKey(rowUiKey);
      loadCandidateExpandDetailsAction(clientKeyForFetch)
        .then((d) => {
          setDetailsCache((prev) => new Map(prev).set(rowUiKey, d));
          setFetchingKey((fk) => (fk === rowUiKey ? null : fk));
        })
        .catch(() => setFetchingKey((fk) => (fk === rowUiKey ? null : fk)));
    } else {
      setFetchingKey(null);
    }
  };

  if (candidates.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-zinc-200 bg-zinc-50/50 px-6 py-12 text-center text-sm text-zinc-500">
        {mode === "pick" && listStatus === "netinkamas"
          ? "Nėra netinkamų kandidatų"
          : "Nėra kandidatų pagal taisykles."}
      </div>
    );
  }

  if (mode === "pick" && displayCandidates.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-emerald-200 bg-emerald-50/50 px-6 py-10 text-center text-sm text-emerald-900">
        Visi kandidatai šiame rodinyje jau pažymėti kaip priskirti šioje sesijoje. Pilną būseną atnaujinsite perkrovę puslapį.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      <dialog ref={invalidDialogRef} className="fixed inset-0 m-auto w-[min(92vw,28rem)] rounded-xl p-0 backdrop:bg-black/30">
        <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-[0_12px_40px_-12px_rgba(15,23,42,0.35)]">
          <div className="text-base font-semibold text-zinc-900">Pažymėti kandidatą kaip netinkamą?</div>
          <p className="mt-1 text-sm text-zinc-600">Jis dings iš aktyvaus kandidatų sąrašo šiame projekte.</p>
          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              type="button"
              className="cursor-pointer rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              onClick={() => {
                invalidDialogRef.current?.close();
                setPendingInvalidKey(null);
              }}
            >
              Atšaukti
            </button>
            <button
              type="button"
              className="cursor-pointer rounded-md bg-zinc-900 px-3 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-60"
              disabled={!pendingInvalidKey || rowActionPending}
              onClick={() => {
                const ck = pendingInvalidKey;
                if (!ck) return;
                invalidDialogRef.current?.close();
                setPendingInvalidKey(null);
                setRowError(null);
                setHiddenClientKeys((prev) => new Set(prev).add(ck));
                startRowActionTransition(async () => {
                  const res = await markAutoCandidateAsInvalidAction(projectId, ck);
                  if (!res.ok) {
                    setHiddenClientKeys((prev) => {
                      const next = new Set(prev);
                      next.delete(ck);
                      return next;
                    });
                    setRowError(res.error);
                    return;
                  }
                  router.refresh();
                });
              }}
            >
              Pažymėti kaip netinkamą
            </button>
          </div>
        </div>
      </dialog>

      {rowError ? (
        <div className="rounded-lg border border-red-200 bg-red-50/60 px-3 py-2 text-sm text-red-700">
          {rowError}
        </div>
      ) : null}
      {showBulk ? (
        <div className="flex min-h-10 flex-wrap items-center gap-3 rounded-lg border border-zinc-200 bg-white px-3 py-2">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-700">
            <input
              type="checkbox"
              className="h-4 w-4 shrink-0 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-400"
              checked={allSelected}
              disabled={bulkPending || totalCandidates === 0}
              onChange={toggleSelectAll}
              aria-label="Pažymėti visus kandidatus"
            />
            <span className="select-none">Pažymėti visus</span>
          </label>
          {selectedCount > 0 ? (
            <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-3 border-l border-zinc-100 pl-3 sm:justify-between">
              <span className="text-sm text-zinc-600">
                Pažymėta: <span className="font-medium tabular-nums text-zinc-900">{selectedCount}</span>
              </span>
              <div className="flex items-center gap-2">
                {bulkError ? <span className="max-w-[min(100%,20rem)] text-xs text-red-600">{bulkError}</span> : null}
                <button
                  type="button"
                  disabled={bulkPending}
                  onClick={bulkAssignToSelf}
                  className="cursor-pointer rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition-colors hover:bg-zinc-800 disabled:opacity-50"
                >
                  {bulkPending ? "…" : "Priskirti sau"}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {displayCandidates.map((r) => {
        const origIdx = candidates.findIndex((c) => c.client_key === r.client_key);
        const i = origIdx >= 0 ? origIdx : 0;
        const rowUiKey = `${i}:${r.client_key || "none"}`;
        const expandKey = r.client_key || `row-${i}`;
        const open = openKey === rowUiKey;
        const rank1 =
          priorityBasis?.rankByClientKey[r.client_key] ?? rankByKey.get(r.client_key) ?? i + 1;
        const level = priorityFromRankInList(rank1 - 1, totalForPriority);
        const href = clientDetailPath(r.client_key === "" ? null : r.client_key);
        const lastInv = formatDate(r.last_invoice_anywhere);
        const meta = `Paskutinė sąskaita: ${lastInv}`;

        return (
          <div
            key={rowUiKey}
            className={`rounded-lg border border-zinc-200/90 bg-white transition-colors duration-150 ${
              open ? "ring-1 ring-zinc-200" : ""
            } hover:border-zinc-300/90 hover:bg-zinc-50/60`}
          >
            <div className="flex items-stretch gap-2 sm:gap-3">
              {showBulk ? (
                <div
                  className="flex shrink-0 items-center pl-2"
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4 shrink-0 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-400"
                    checked={origIdx >= 0 && selectedIdx.has(origIdx)}
                    disabled={bulkPending}
                    onChange={() => origIdx >= 0 && toggleSelect(origIdx)}
                    aria-label={`Pažymėti: ${r.company_name?.trim() || "—"}`}
                  />
                </div>
              ) : null}
              <button
                type="button"
                onClick={() => toggle(rowUiKey, expandKey)}
                className="flex shrink-0 cursor-pointer items-center border-r border-transparent px-2 text-zinc-400 hover:bg-zinc-100/80 hover:text-zinc-600 sm:px-3"
                aria-expanded={open}
                aria-label={open ? "Suskleisti" : "Išplėsti"}
              >
                <Chevron open={open} />
              </button>

              <div
                role="button"
                tabIndex={0}
                onClick={() => toggle(rowUiKey, expandKey)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    toggle(rowUiKey, expandKey);
                  }
                }}
                className="flex min-w-0 flex-1 cursor-pointer flex-col items-stretch gap-2 py-3.5 pr-2 text-left outline-none sm:flex-row sm:items-center sm:gap-4 sm:pr-4 focus-visible:ring-2 focus-visible:ring-zinc-300"
              >
                <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                  <PriorityBadge level={level} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-base font-semibold tracking-tight text-zinc-900">
                      <Link
                        href={href}
                        onClick={(e) => e.stopPropagation()}
                        className="rounded-sm hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-400"
                      >
                        {r.company_name?.trim() || "—"}
                      </Link>
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-sm leading-snug text-zinc-500">{meta}</p>
                  </div>
                </div>
              </div>

              <div
                className="flex shrink-0 flex-col items-end justify-center gap-2 border-l border-zinc-100 py-3.5 pl-3 pr-3 sm:pl-4 sm:pr-4"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
              >
                <div className="text-right text-base font-semibold tabular-nums text-zinc-900">
                  {formatMoney(r.total_revenue)}
                </div>
                {mode === "pick" && projectId && listStatus === "active" ? (
                  <ProjectCandidatePickForm
                    projectId={projectId}
                    candidateType="auto"
                    clientKey={r.client_key}
                    defaultAssignee={defaultAssignee}
                    snapshotPriority={rank1}
                    onOptimisticPick={(t) => {
                      if (t.kind === "auto") {
                        setHiddenClientKeys((prev) => new Set(prev).add(t.clientKey));
                      }
                    }}
                    onOptimisticRevert={(t) => {
                      if (t.kind === "auto") {
                        setHiddenClientKeys((prev) => {
                          const next = new Set(prev);
                          next.delete(t.clientKey);
                          return next;
                        });
                      }
                    }}
                  />
                ) : null}

                {mode === "pick" && projectId ? (
                  listStatus === "active" ? (
                    <button
                      type="button"
                      className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
                      disabled={rowActionPending}
                      onClick={() => {
                        const ck = String(r.client_key ?? "").trim();
                        if (!ck) return;
                        setRowError(null);
                        setPendingInvalidKey(ck);
                        invalidDialogRef.current?.showModal();
                      }}
                    >
                      Netinkamas
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
                      disabled={rowActionPending}
                      onClick={() => {
                        const ck = String(r.client_key ?? "").trim();
                        if (!ck) return;
                        setRowError(null);
                        setHiddenClientKeys((prev) => new Set(prev).add(ck));
                        startRowActionTransition(async () => {
                          const res = await restoreAutoCandidateAction(projectId, ck);
                          if (!res.ok) {
                            setHiddenClientKeys((prev) => {
                              const next = new Set(prev);
                              next.delete(ck);
                              return next;
                            });
                            setRowError(res.error);
                            return;
                          }
                          router.refresh();
                        });
                      }}
                    >
                      Grąžinti
                    </button>
                  )
                ) : null}
              </div>
            </div>

            {open ? (
              <ExpandPanel
                loading={fetchingKey === rowUiKey && !detailsCache.has(rowUiKey)}
                detail={detailsCache.get(rowUiKey) ?? null}
                indentClass={expandPanelIndent}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
