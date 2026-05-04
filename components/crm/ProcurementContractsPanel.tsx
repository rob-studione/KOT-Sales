"use client";

import { useRouter } from "next/navigation";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { formatDate, formatMoney } from "@/lib/crm/format";
import {
  importProcurementContractsCsvAction,
  updateProjectProcurementNotifyDaysAction,
  type ImportProcurementContractsCsvResult,
} from "@/lib/crm/projectActions";
import type { ProcurementContractRow } from "@/lib/crm/procurementContracts";
import {
  mapProcurementCsvRows,
  parseProcurementImportCsv,
  resolveProcurementCsvColumnKeys,
  type ProcurementCsvMappedRow,
} from "@/lib/crm/procurementImportCsv";
import {
  procurementCalendarDaysLeft,
} from "@/lib/crm/procurementDates";
import {
  procurementContractTypeFullLabel,
  procurementContractTypeTableParts,
} from "@/lib/crm/procurementContractTypeDisplay";
import { ProjectCandidatePickForm } from "@/components/crm/ProjectCandidatePickForm";
import { TruncateTooltip } from "@/components/crm/TruncateTooltip";

function formatCsvFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isLikelyCsvFile(file: File): boolean {
  const n = file.name.toLowerCase();
  const t = (file.type ?? "").toLowerCase();
  return n.endsWith(".csv") || t === "text/csv" || t === "application/vnd.ms-excel" || t === "text/plain";
}

function CsvDropzoneGraphic({ className }: { className?: string }) {
  return (
    <svg className={className} width="44" height="44" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 15V3m0 0l4 4m-4-4L8 7"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M2 17.5V19a2 2 0 002 2h16a2 2 0 002-2v-1.5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <path
        d="M4 17.5h16"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeDasharray="3 4"
      />
    </svg>
  );
}

type ImportPreviewState = {
  toCreate: number;
  toUpdate: number;
  mergedInCsv: number;
  /** Eilutės su klaidomis (neįeina į sukurti / atnaujinti skaičių). */
  issueRows: number;
  blocked: boolean;
  blockedMessage: string | null;
};

function computeImportPreview(
  rows: ProcurementCsvMappedRow[],
  issues: { line: number; message: string }[],
  existingDedupeKeys: Set<string>
): ImportPreviewState {
  const issueRows = issues.filter((i) => i.line > 0).length;
  if (rows.length === 0) {
    return {
      toCreate: 0,
      toUpdate: 0,
      mergedInCsv: 0,
      issueRows,
      blocked: true,
      blockedMessage:
        issues.length > 0
          ? issues[0]?.message ?? "Nepavyko nuskaityti eilučių."
          : "Nėra tinkamų eilučių (patikrinkite stulpelius ir datas).",
    };
  }
  const byKey = new Map<string, (typeof rows)[number]>();
  for (const r of rows) {
    byKey.set(r.import_dedupe_key, r);
  }
  const unique = [...byKey.values()];
  const mergedInCsv = rows.length - unique.length;
  let toCreate = 0;
  let toUpdate = 0;
  for (const r of unique) {
    if (existingDedupeKeys.has(r.import_dedupe_key)) toUpdate += 1;
    else toCreate += 1;
  }
  return {
    toCreate,
    toUpdate,
    mergedInCsv,
    issueRows,
    blocked: false,
    blockedMessage: null,
  };
}

export function ProcurementContractsPanel({
  projectId,
  contracts,
  procurementNotifyDaysBefore,
  defaultAssignee,
  openPickedContractIds,
  filterOptions,
  resultsSummary,
  pagination,
}: {
  projectId: string;
  contracts: ProcurementContractRow[];
  procurementNotifyDaysBefore: number;
  defaultAssignee: string;
  openPickedContractIds: string[];
  filterOptions: { organizations: string[]; suppliers: string[]; types: string[] };
  resultsSummary: { count: number; totalValueEur: number };
  pagination: {
    showAll: boolean;
    pageIndex0: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
    showingFrom: number;
    showingTo: number;
    basePath: string;
    baseQuery: Record<string, string>;
  };
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const [importOpen, setImportOpen] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<ImportProcurementContractsCsvResult | null>(null);
  const [importPending, startImport] = useTransition();
  const [notifyPending, startNotify] = useTransition();
  const [notifyMsg, setNotifyMsg] = useState<string | null>(null);
  const [notifyEditOpen, setNotifyEditOpen] = useState(false);
  const [notifyDraft, setNotifyDraft] = useState(() => String(procurementNotifyDaysBefore));

  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvDropActive, setCsvDropActive] = useState(false);
  const csvDragDepthRef = useRef(0);
  const csvFileInputRef = useRef<HTMLInputElement | null>(null);
  const importCloseBtnRef = useRef<HTMLButtonElement | null>(null);

  const [importPreview, setImportPreview] = useState<ImportPreviewState | null>(null);
  const [importPreviewPending, setImportPreviewPending] = useState(false);

  const showAllContracts = pagination.showAll;
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filterSearchOrg, setFilterSearchOrg] = useState("");
  const [filterSearchSupplier, setFilterSearchSupplier] = useState("");
  const [filterDraftOrgs, setFilterDraftOrgs] = useState<Set<string>>(() => new Set());
  const [filterDraftSuppliers, setFilterDraftSuppliers] = useState<Set<string>>(() => new Set());
  const [filterDraftTypes, setFilterDraftTypes] = useState<Set<string>>(() => new Set());
  const [filterDraftFrom, setFilterDraftFrom] = useState("");
  const [filterDraftTo, setFilterDraftTo] = useState("");

  const [searchDraft, setSearchDraft] = useState(() => sp.get("q") ?? "");
  useEffect(() => {
    setSearchDraft(sp.get("q") ?? "");
  }, [sp]);

  const sortBy = sp.get("sortBy") ?? "";
  const sortDir = sp.get("sortDir") ?? "";
  const sortValue = `${sortBy || "valid_until"}:${sortDir || "asc"}`;

  const pickedSet = useMemo(() => new Set(openPickedContractIds.map((x) => String(x).trim()).filter(Boolean)), [openPickedContractIds]);
  const [optimisticPickedContractIds, setOptimisticPickedContractIds] = useState<Set<string>>(() => new Set());

  const listContracts = useMemo(
    () => contracts.filter((c) => !pickedSet.has(String(c.id))),
    [contracts, pickedSet]
  );

  const visibleContracts = useMemo(
    () => listContracts.filter((c) => !optimisticPickedContractIds.has(String(c.id))),
    [listContracts, optimisticPickedContractIds],
  );

  const buildHref = useMemo(() => {
    return (pageIndex0: number, opts?: { all?: boolean }) => {
      const params = new URLSearchParams();
      // Preserve any unknown query params as well (future-proof).
      for (const [k, v] of sp.entries()) params.set(k, v);
      // Force canonical base query.
      for (const [k, v] of Object.entries(pagination.baseQuery)) params.set(k, v);

      // Pagination params.
      if (pageIndex0 > 0) params.set("page", String(pageIndex0));
      else params.delete("page");

      if (pagination.pageSize !== 20) params.set("pageSize", String(pagination.pageSize));
      else params.delete("pageSize");

      const all = opts?.all ?? pagination.showAll;
      if (all) params.set("all", "1");
      else params.delete("all");

      return `${pagination.basePath}?${params.toString()}`;
    };
  }, [pagination.basePath, pagination.baseQuery, pagination.pageSize, pagination.showAll, sp]);

  const paginationHref = buildHref;

  function setParam(params: URLSearchParams, key: string, value: string) {
    const v = value.trim();
    if (v) params.set(key, v);
    else params.delete(key);
  }

  function replaceWithParams(next: URLSearchParams) {
    // Always reset to first page on control changes.
    next.delete("page");
    router.replace(`${pagination.basePath}?${next.toString()}`);
  }

  const activeFilters = useMemo(() => {
    const org = (sp.get("org") ?? "").trim();
    const supplier = (sp.get("supplier") ?? "").trim();
    const type = (sp.get("type") ?? "").trim();
    const validFrom = (sp.get("validFrom") ?? "").trim();
    const validTo = (sp.get("validTo") ?? "").trim();
    const q = (sp.get("q") ?? "").trim();
    return { org, supplier, type, validFrom, validTo, q };
  }, [sp]);

  function openFilters() {
    const parseSet = (raw: string) => new Set(raw.split(",").map((x) => x.trim()).filter(Boolean));
    setFilterDraftOrgs(parseSet(sp.get("org") ?? ""));
    setFilterDraftSuppliers(parseSet(sp.get("supplier") ?? ""));
    setFilterDraftTypes(parseSet(sp.get("type") ?? ""));
    setFilterDraftFrom(sp.get("validFrom") ?? "");
    setFilterDraftTo(sp.get("validTo") ?? "");
    setFilterSearchOrg("");
    setFilterSearchSupplier("");
    setFiltersOpen(true);
  }

  const pageButtons = useMemo(() => {
    const total = Math.max(0, pagination.totalPages);
    const cur = Math.max(0, Math.min(pagination.pageIndex0, Math.max(0, total - 1)));
    if (total <= 1) return { pages: [] as number[], leftGap: false, rightGap: false, cur, total };

    const windowSize = 5;
    let start = Math.max(0, cur - Math.floor(windowSize / 2));
    const end = Math.min(total - 1, start + windowSize - 1);
    start = Math.max(0, end - windowSize + 1);

    const pages: number[] = [];
    for (let i = start; i <= end; i += 1) pages.push(i);
    const leftGap = start > 1;
    const rightGap = end < total - 2;
    return { pages, leftGap, rightGap, cur, total };
  }, [pagination.pageIndex0, pagination.totalPages]);

  const empty = contracts.length === 0;

  const importJustSucceeded = importResult?.ok === true;
  const importLocked = importPending || importJustSucceeded;

  useEffect(() => {
    if (!importOpen || !csvFile) {
      setImportPreview(null);
      setImportPreviewPending(false);
      return;
    }
    let cancelled = false;
    setImportPreviewPending(true);
    setImportPreview(null);
    (async () => {
      try {
        const text = await csvFile.text();
        const parsed = parseProcurementImportCsv(text);
        const first = parsed.data?.[0];
        if (!first || typeof first !== "object") {
          if (!cancelled) {
            setImportPreview({
              toCreate: 0,
              toUpdate: 0,
              mergedInCsv: 0,
              issueRows: 0,
              blocked: true,
              blockedMessage: "CSV tuščias arba be antraštės.",
            });
          }
          return;
        }
        const keys = resolveProcurementCsvColumnKeys(first as Record<string, unknown>);
        const { rows, issues } = mapProcurementCsvRows(parsed, keys);
        const existingDedupeKeys = new Set(
          contracts
            .map((c) => c.import_dedupe_key)
            .filter((k): k is string => typeof k === "string" && k.length > 0)
        );
        if (!cancelled) {
          setImportPreview(computeImportPreview(rows, issues, existingDedupeKeys));
        }
      } catch {
        if (!cancelled) {
          setImportPreview({
            toCreate: 0,
            toUpdate: 0,
            mergedInCsv: 0,
            issueRows: 0,
            blocked: true,
            blockedMessage: "Nepavyko perskaityti failo.",
          });
        }
      } finally {
        if (!cancelled) setImportPreviewPending(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [importOpen, csvFile, contracts]);

  useEffect(() => {
    if (!importOpen) return;
    const t = window.setTimeout(() => importCloseBtnRef.current?.focus(), 0);
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !importPending) setImportOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("keydown", onKey);
    };
  }, [importOpen, importPending]);

  function applyCsvFile(file: File | null) {
    setImportError(null);
    setImportResult(null);
    if (!file) {
      setCsvFile(null);
      return;
    }
    if (!isLikelyCsvFile(file)) {
      setImportError("Pasirinkite CSV failą (.csv).");
      setCsvFile(null);
      return;
    }
    setCsvFile(file);
  }

  function openImportModal() {
    setImportOpen(true);
    setCsvFile(null);
    setCsvDropActive(false);
    csvDragDepthRef.current = 0;
    setImportError(null);
    setImportResult(null);
    setImportPreview(null);
  }

  function closeImportModal() {
    if (importPending) return;
    setImportOpen(false);
    setCsvFile(null);
    setCsvDropActive(false);
    csvDragDepthRef.current = 0;
  }

  const canImport = !!csvFile && importPreview && !importPreview.blocked && !importPreviewPending;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 rounded-xl border border-zinc-200/80 bg-zinc-50/40 p-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 text-sm text-zinc-600">
          <p className="font-medium text-zinc-800">Numatytasis priminimas</p>
          <p className="mt-1 text-xs text-zinc-500">
            Naujai importuotoms sutartims priskiriama „Pranešti prieš (dienomis)“ reikšmė ir projekto atsakingasis.
          </p>
        </div>
        <div className="flex flex-col items-start gap-2 sm:items-end">
          {!notifyEditOpen ? (
            <div className="flex flex-wrap items-center justify-end gap-2">
              <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800">
                <span className="text-zinc-500">Pranešti prieš:</span>{" "}
                <span className="font-semibold tabular-nums">{procurementNotifyDaysBefore}</span>{" "}
                <span className="text-zinc-500">dienų</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setNotifyMsg(null);
                  setNotifyDraft(String(procurementNotifyDaysBefore));
                  setNotifyEditOpen(true);
                }}
                className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
              >
                Keisti
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-end justify-end gap-2">
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-zinc-700">Pranešti prieš (dienomis)</span>
                <input
                  type="number"
                  min={0}
                  max={365}
                  inputMode="numeric"
                  value={notifyDraft}
                  onChange={(e) => setNotifyDraft(e.target.value)}
                  className="w-28 rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-sm tabular-nums"
                />
              </label>
              <button
                type="button"
                disabled={notifyPending}
                onClick={() => {
                  setNotifyMsg(null);
                  const n = Math.max(0, Math.min(365, Math.floor(Number(notifyDraft) || 0)));
                  const fd = new FormData();
                  fd.set("procurement_notify_days_before", String(n));
                  startNotify(async () => {
                    const r = await updateProjectProcurementNotifyDaysAction(projectId, fd);
                    if (r.ok) {
                      setNotifyMsg("Išsaugota.");
                      setNotifyEditOpen(false);
                      router.refresh();
                    } else {
                      setNotifyMsg(r.error);
                    }
                  });
                }}
                className="rounded-md bg-[#7C4A57] px-3 py-2 text-sm font-medium text-white hover:bg-[#693948] disabled:opacity-50"
              >
                {notifyPending ? "…" : "Išsaugoti"}
              </button>
              <button
                type="button"
                disabled={notifyPending}
                onClick={() => {
                  setNotifyMsg(null);
                  setNotifyDraft(String(procurementNotifyDaysBefore));
                  setNotifyEditOpen(false);
                }}
                className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
              >
                Atšaukti
              </button>
            </div>
          )}
        </div>
        {notifyMsg ? <p className="w-full text-xs text-zinc-600 sm:order-last">{notifyMsg}</p> : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[min(280px,100%)] flex-1">
              <input
                value={searchDraft}
                onChange={(e) => setSearchDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const params = new URLSearchParams(sp.toString());
                    setParam(params, "q", searchDraft);
                    replaceWithParams(params);
                  }
                }}
                placeholder="Paieška: organizacija / objektas / tiekėjas…"
                className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400"
              />
            </div>

            <label className="flex items-center gap-2 text-sm text-zinc-700">
              <span className="hidden sm:inline">Rikiuoti</span>
              <select
                value={sortValue}
                onChange={(e) => {
                  const [by, dir] = e.target.value.split(":");
                  const params = new URLSearchParams(sp.toString());
                  setParam(params, "sortBy", by);
                  setParam(params, "sortDir", dir);
                  replaceWithParams(params);
                }}
                className="rounded-md border border-zinc-300 bg-white px-2.5 py-2 text-sm text-zinc-900"
              >
                <option value="valid_until:asc">Iki (artimiausios viršuje)</option>
                <option value="valid_until:desc">Iki (tolimiausios viršuje)</option>
                <option value="value:desc">Vertė (didžiausios viršuje)</option>
                <option value="value:asc">Vertė (mažiausios viršuje)</option>
                <option value="days_left:asc">Liko dienų (mažiausiai)</option>
                <option value="days_left:desc">Liko dienų (daugiausiai)</option>
              </select>
            </label>

            <button
              type="button"
              onClick={openFilters}
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
            >
              Filtrai
            </button>
          </div>

          {(activeFilters.q || activeFilters.org || activeFilters.supplier || activeFilters.type || activeFilters.validFrom || activeFilters.validTo) ? (
            <div className="flex flex-wrap gap-2">
              {activeFilters.q ? (
                <button
                  type="button"
                  onClick={() => {
                    const params = new URLSearchParams(sp.toString());
                    params.delete("q");
                    replaceWithParams(params);
                  }}
                  className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs text-zinc-700 hover:bg-zinc-50"
                >
                  Paieška: <span className="font-medium">{activeFilters.q}</span> ✕
                </button>
              ) : null}
              {activeFilters.org ? (
                <button
                  type="button"
                  onClick={() => {
                    const params = new URLSearchParams(sp.toString());
                    params.delete("org");
                    replaceWithParams(params);
                  }}
                  className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs text-zinc-700 hover:bg-zinc-50"
                >
                  Organizacija ({activeFilters.org.split(",").filter(Boolean).length}) ✕
                </button>
              ) : null}
              {activeFilters.supplier ? (
                <button
                  type="button"
                  onClick={() => {
                    const params = new URLSearchParams(sp.toString());
                    params.delete("supplier");
                    replaceWithParams(params);
                  }}
                  className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs text-zinc-700 hover:bg-zinc-50"
                >
                  Tiekėjas ({activeFilters.supplier.split(",").filter(Boolean).length}) ✕
                </button>
              ) : null}
              {activeFilters.type ? (
                <button
                  type="button"
                  onClick={() => {
                    const params = new URLSearchParams(sp.toString());
                    params.delete("type");
                    replaceWithParams(params);
                  }}
                  className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs text-zinc-700 hover:bg-zinc-50"
                >
                  Tipas ({activeFilters.type.split(",").filter(Boolean).length}) ✕
                </button>
              ) : null}
              {activeFilters.validFrom || activeFilters.validTo ? (
                <button
                  type="button"
                  onClick={() => {
                    const params = new URLSearchParams(sp.toString());
                    params.delete("validFrom");
                    params.delete("validTo");
                    replaceWithParams(params);
                  }}
                  className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs text-zinc-700 hover:bg-zinc-50"
                >
                  Data ✕
                </button>
              ) : null}
            </div>
          ) : null}

          <p className="text-xs text-zinc-600">
            Rasta <span className="font-semibold tabular-nums text-zinc-900">{Math.max(0, resultsSummary.count)}</span>{" "}
            sutarčių <span className="text-zinc-400">•</span> Bendra vertė{" "}
            <span className="font-semibold tabular-nums text-zinc-900">{formatMoney(Math.max(0, resultsSummary.totalValueEur))}</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!empty ? (
            <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-700">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-zinc-300"
                checked={showAllContracts}
                onChange={(e) => {
                  const nextAll = e.target.checked;
                  // "Rodyti viską viename puslapyje" (be puslapiavimo).
                  router.replace(paginationHref(0, { all: nextAll }));
                }}
              />
              Rodyti viską (be puslapiavimo)
            </label>
          ) : null}
          <button
            type="button"
            onClick={openImportModal}
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
          >
            Įkelti CSV
          </button>
        </div>
      </div>

      {filtersOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" role="presentation">
          <button type="button" className="absolute inset-0" aria-label="Uždaryti" onClick={() => setFiltersOpen(false)} />
          <div
            role="dialog"
            aria-modal="true"
            className="relative z-10 w-full max-w-2xl rounded-2xl border border-zinc-200/90 bg-white p-5 shadow-2xl shadow-[#7C4A57]/15"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-base font-semibold text-zinc-900">Filtrai</h2>
              <button
                type="button"
                onClick={() => setFiltersOpen(false)}
                className="rounded-md p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
                aria-label="Uždaryti"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="min-w-0">
                <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Organizacija</div>
                <input
                  value={filterSearchOrg}
                  onChange={(e) => setFilterSearchOrg(e.target.value)}
                  placeholder="Ieškoti…"
                  className="mt-2 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm"
                />
                <div className="mt-2 max-h-44 overflow-auto rounded-md border border-zinc-100">
                  {filterOptions.organizations
                    .filter((o) => o.toLowerCase().includes(filterSearchOrg.trim().toLowerCase()))
                    .slice(0, 80)
                    .map((o) => (
                      <label key={o} className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-zinc-50">
                        <input
                          type="checkbox"
                          checked={filterDraftOrgs.has(o)}
                          onChange={() => {
                            setFilterDraftOrgs((prev) => {
                              const next = new Set(prev);
                              if (next.has(o)) next.delete(o);
                              else next.add(o);
                              return next;
                            });
                          }}
                        />
                        <span className="truncate">{o}</span>
                      </label>
                    ))}
                </div>
              </div>

              <div className="min-w-0">
                <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Tiekėjas</div>
                <input
                  value={filterSearchSupplier}
                  onChange={(e) => setFilterSearchSupplier(e.target.value)}
                  placeholder="Ieškoti…"
                  className="mt-2 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm"
                />
                <div className="mt-2 max-h-44 overflow-auto rounded-md border border-zinc-100">
                  {filterOptions.suppliers
                    .filter((o) => o.toLowerCase().includes(filterSearchSupplier.trim().toLowerCase()))
                    .slice(0, 80)
                    .map((o) => (
                      <label key={o} className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-zinc-50">
                        <input
                          type="checkbox"
                          checked={filterDraftSuppliers.has(o)}
                          onChange={() => {
                            setFilterDraftSuppliers((prev) => {
                              const next = new Set(prev);
                              if (next.has(o)) next.delete(o);
                              else next.add(o);
                              return next;
                            });
                          }}
                        />
                        <span className="truncate">{o}</span>
                      </label>
                    ))}
                </div>
              </div>

              <div className="min-w-0 sm:col-span-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Tipas</div>
                <div className="mt-2 grid gap-2 sm:grid-cols-3">
                  {filterOptions.types.slice(0, 60).map((t) => (
                    <label key={t} className="flex cursor-pointer items-center gap-2 text-sm text-zinc-800">
                      <input
                        type="checkbox"
                        checked={filterDraftTypes.has(t)}
                        onChange={() => {
                          setFilterDraftTypes((prev) => {
                            const next = new Set(prev);
                            if (next.has(t)) next.delete(t);
                            else next.add(t);
                            return next;
                          });
                        }}
                      />
                      <span className="truncate" title={t}>
                        {t}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="min-w-0 sm:col-span-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Data (Iki)</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <label className="flex flex-col gap-1 text-sm">
                    <span className="text-xs text-zinc-500">Nuo</span>
                    <input
                      value={filterDraftFrom}
                      onChange={(e) => setFilterDraftFrom(e.target.value)}
                      placeholder="YYYY-MM-DD"
                      className="w-36 rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm tabular-nums"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-sm">
                    <span className="text-xs text-zinc-500">Iki</span>
                    <input
                      value={filterDraftTo}
                      onChange={(e) => setFilterDraftTo(e.target.value)}
                      placeholder="YYYY-MM-DD"
                      className="w-36 rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm tabular-nums"
                    />
                  </label>
                </div>
              </div>
            </div>

            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => {
                  const params = new URLSearchParams(sp.toString());
                  params.delete("org");
                  params.delete("supplier");
                  params.delete("type");
                  params.delete("validFrom");
                  params.delete("validTo");
                  replaceWithParams(params);
                  setFiltersOpen(false);
                }}
                className="rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
              >
                Išvalyti
              </button>
              <button
                type="button"
                onClick={() => {
                  const params = new URLSearchParams(sp.toString());
                  setParam(params, "org", [...filterDraftOrgs].join(","));
                  setParam(params, "supplier", [...filterDraftSuppliers].join(","));
                  setParam(params, "type", [...filterDraftTypes].join(","));
                  setParam(params, "validFrom", filterDraftFrom);
                  setParam(params, "validTo", filterDraftTo);
                  replaceWithParams(params);
                  setFiltersOpen(false);
                }}
                className="rounded-md bg-[#7C4A57] px-4 py-2 text-sm font-medium text-white hover:bg-[#693948]"
              >
                Taikyti
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {importOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" role="presentation">
          <div className="absolute inset-0" aria-hidden onClick={() => closeImportModal()} />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="proc-import-title"
            className="relative z-10 w-full max-w-lg rounded-2xl border border-zinc-200/90 bg-white p-6 shadow-2xl shadow-[#7C4A57]/15"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <h2 id="proc-import-title" className="text-lg font-semibold tracking-tight text-zinc-900">
                CSV importas (sutartys)
              </h2>
              <button
                ref={importCloseBtnRef}
                type="button"
                disabled={importPending}
                onClick={() => closeImportModal()}
                className="rounded-md p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
                aria-label="Uždaryti"
              >
                ✕
              </button>
            </div>

            <p className="mt-3 text-sm text-zinc-600">
              Reikalingi stulpeliai: organizacija, kodas, objektas, galiojimo data
            </p>

            <input
              ref={csvFileInputRef}
              type="file"
              accept=".csv,text/csv"
              disabled={importLocked}
              className="sr-only"
              tabIndex={-1}
              aria-label="Pasirinkti CSV failą"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                applyCsvFile(f);
                e.target.value = "";
              }}
            />

            <div className="mt-4">
              <div
                role="button"
                tabIndex={importLocked ? -1 : 0}
                aria-disabled={importLocked}
                aria-describedby={csvFile ? "proc-csv-drop-replace" : "proc-csv-drop-hint"}
                onClick={() => {
                  if (importLocked) return;
                  csvFileInputRef.current?.click();
                }}
                onKeyDown={(e) => {
                  if (importLocked) return;
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    csvFileInputRef.current?.click();
                  }
                }}
                onDragEnter={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (importLocked) return;
                  csvDragDepthRef.current += 1;
                  setCsvDropActive(true);
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (importLocked) return;
                  csvDragDepthRef.current -= 1;
                  if (csvDragDepthRef.current <= 0) {
                    csvDragDepthRef.current = 0;
                    setCsvDropActive(false);
                  }
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (importLocked) return;
                  e.dataTransfer.dropEffect = "copy";
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  csvDragDepthRef.current = 0;
                  setCsvDropActive(false);
                  if (importLocked) return;
                  const f = e.dataTransfer.files?.[0] ?? null;
                  applyCsvFile(f);
                }}
                className={[
                  "group flex min-h-[168px] w-full cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-5 py-10 text-center transition-[border-color,background-color,box-shadow] duration-150",
                  "outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2",
                  importLocked ? "cursor-not-allowed opacity-60" : "",
                  csvDropActive
                    ? "border-gray-900 bg-gray-50 shadow-[inset_0_0_0_1px_rgba(17,24,39,0.12)]"
                    : csvFile
                      ? "border-emerald-300/90 bg-emerald-50/45 hover:border-emerald-400 hover:bg-emerald-50/70"
                      : "border-zinc-300 bg-zinc-50/90 hover:border-zinc-400 hover:bg-zinc-100",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                {csvFile ? (
                  <>
                    <span className="rounded-full bg-emerald-100 p-2.5 text-emerald-700 ring-1 ring-emerald-200/80">
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
                        <path
                          d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                          stroke="currentColor"
                          strokeWidth="1.75"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                    <p className="mt-3 max-w-full truncate text-sm font-semibold text-zinc-900" title={csvFile.name}>
                      {csvFile.name}
                    </p>
                    <p className="mt-1 text-xs tabular-nums text-zinc-500">{formatCsvFileSize(csvFile.size)}</p>
                    <p id="proc-csv-drop-replace" className="mt-3 text-xs text-zinc-500">
                      Spauskite arba vilkite kitą failą, jei norite pakeisti.
                    </p>
                  </>
                ) : (
                  <>
                    <CsvDropzoneGraphic
                      className={
                        csvDropActive ? "text-gray-700" : "text-zinc-400 transition-colors group-hover:text-zinc-500"
                      }
                    />
                    <p className="mt-3 text-base font-semibold tracking-tight text-zinc-900">Įkelk CSV failą</p>
                    <p id="proc-csv-drop-hint" className="mt-1.5 max-w-[18rem] text-sm leading-snug text-zinc-500">
                      Drag & drop arba spausk pasirinkti
                    </p>
                  </>
                )}
              </div>
            </div>

            {csvFile ? (
              <div className="mt-5 rounded-xl border border-zinc-200 bg-zinc-50/60 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Peržiūra</p>
                {importPreviewPending ? (
                  <p className="mt-2 text-sm text-zinc-500">Skaičiuojama…</p>
                ) : importPreview ? (
                  importPreview.blocked ? (
                    <p className="mt-2 text-sm text-amber-800">{importPreview.blockedMessage}</p>
                  ) : (
                    <ul className="mt-3 grid gap-3 sm:grid-cols-3">
                      <li className="rounded-lg border border-zinc-200/80 bg-white px-3 py-2.5 text-center shadow-sm">
                        <div className="text-xs font-medium uppercase tracking-wide text-zinc-400">Bus sukurta</div>
                        <div className="mt-1 text-2xl font-semibold tabular-nums text-zinc-900">{importPreview.toCreate}</div>
                      </li>
                      <li className="rounded-lg border border-zinc-200/80 bg-white px-3 py-2.5 text-center shadow-sm">
                        <div className="text-xs font-medium uppercase tracking-wide text-zinc-400">Bus atnaujinta</div>
                        <div className="mt-1 text-2xl font-semibold tabular-nums text-zinc-900">{importPreview.toUpdate}</div>
                      </li>
                      <li className="rounded-lg border border-zinc-200/80 bg-white px-3 py-2.5 text-center shadow-sm">
                        <div className="text-xs font-medium uppercase tracking-wide text-zinc-400">
                          Dublikatų (sujungta)
                        </div>
                        <div className="mt-1 text-2xl font-semibold tabular-nums text-zinc-900">{importPreview.mergedInCsv}</div>
                      </li>
                    </ul>
                  )
                ) : null}
                {importPreview && !importPreview.blocked && importPreview.issueRows > 0 ? (
                  <p className="mt-2 text-xs text-amber-800">
                    Dalis CSV eilučių praleistos dėl klaidų ({importPreview.issueRows}). Jos neįtraukiamos į skaičius
                    aukščiau.
                  </p>
                ) : null}
              </div>
            ) : null}

            {importError ? <p className="mt-3 text-sm text-red-600">{importError}</p> : null}

            {importResult?.ok ? (
              <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-sm text-emerald-950">
                <span className="font-medium">Atlikta.</span> Apdorota eilučių:{" "}
                <span className="font-semibold tabular-nums">{importResult.merged}</span>
                {importResult.issueCount > 0 ? (
                  <span className="mt-1 block text-xs text-amber-900">
                    Įspėjimų: {importResult.issueCount}. Pvz.: {importResult.issues[0] ?? "—"}
                  </span>
                ) : null}
              </div>
            ) : null}

            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
              <button
                type="button"
                disabled={importPending}
                onClick={() => closeImportModal()}
                className="rounded-lg border border-zinc-200 bg-white px-4 py-2.5 text-sm font-medium text-zinc-800 shadow-sm hover:bg-zinc-50 disabled:opacity-50"
              >
                Uždaryti
              </button>
              {importJustSucceeded ? (
                <button
                  type="button"
                  disabled
                  className="cursor-default rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-900"
                >
                  Importuota
                </button>
              ) : (
                <button
                  type="button"
                  disabled={importPending || !canImport}
                  onClick={() => {
                    if (!csvFile) {
                      setImportError("Pasirinkite CSV failą.");
                      return;
                    }
                    if (!canImport) {
                      setImportError("Patikrinkite peržiūrą — importuoti negalima.");
                      return;
                    }
                    setImportError(null);
                    startImport(async () => {
                      const fd = new FormData();
                      fd.set("project_id", projectId);
                      fd.set("csv_file", csvFile);
                      const r = await importProcurementContractsCsvAction(fd);
                      setImportResult(r);
                      if (!r.ok) {
                        setImportError(r.error);
                      } else {
                        router.refresh();
                      }
                    });
                  }}
                  className="rounded-lg bg-[#7C4A57] px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-[#693948] disabled:opacity-50"
                >
                  {importPending ? "Importuojama…" : "Importuoti"}
                </button>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {empty ? (
        <div className="rounded-lg border border-dashed border-zinc-200 bg-zinc-50/50 px-6 py-12 text-center text-sm text-zinc-500">
          Nėra sutarčių. Įkelkite CSV su viešųjų pirkimų sutartimis.
        </div>
      ) : listContracts.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-200 bg-zinc-50/50 px-6 py-12 text-center text-sm text-zinc-500">
          Visos sutartys jau priskirtos darbui. Perjunkite į skirtuką „Darbas“.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-200/80 bg-white shadow-sm ring-1 ring-zinc-100/80">
          <table className="min-w-[900px] w-full border-collapse text-left text-sm">
            <thead className="sticky top-0 z-[1] border-b border-zinc-200 bg-zinc-50/95 text-xs font-semibold uppercase tracking-wide text-zinc-500 backdrop-blur-sm">
              <tr>
                <th className="px-3 py-3">Organizacija</th>
                <th className="px-3 py-3">Sutarties objektas</th>
                <th className="whitespace-nowrap px-3 py-3">Iki</th>
                <th className="whitespace-nowrap px-3 py-3">Liko dienų</th>
                <th className="whitespace-nowrap px-3 py-3">Vertė</th>
                <th className="min-w-[14rem] px-3 py-3">Dabartinis tiekėjas (-ai)</th>
                <th className="w-20 whitespace-nowrap px-2 py-3 text-right">Tipas</th>
                <th className="whitespace-nowrap px-3 py-3 text-right">Veiksmas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {visibleContracts.map((c) => {
                const daysLeft = procurementCalendarDaysLeft(c.valid_until);
                const typeParts = procurementContractTypeTableParts(c.type);
                const supplierRaw = c.supplier?.trim() ? c.supplier.trim() : "";
                const uidRaw = c.contract_uid?.trim() ? c.contract_uid.trim() : "";
                const orgCode = c.organization_code?.trim() ? c.organization_code.trim() : "—";
                return (
                  <tr key={c.id} className="hover:bg-zinc-50/80">
                    <td className="max-w-[200px] px-3 py-2.5 align-middle font-medium text-zinc-900">
                      <div className="min-w-0">
                        <TruncateTooltip
                          text={c.organization_name?.trim() ? c.organization_name : "—"}
                          className="truncate"
                        />
                        {orgCode !== "—" ? (
                          <div className="mt-0.5 whitespace-nowrap text-xs font-mono font-normal text-zinc-500">
                            kodas: <span className="tabular-nums">{orgCode}</span>
                          </div>
                        ) : null}
                      </div>
                    </td>
                    <td className="max-w-[200px] px-3 py-2.5 align-middle text-zinc-800">
                      <div className="min-w-0">
                        <TruncateTooltip
                          text={c.contract_object?.trim() ? c.contract_object : "—"}
                          className="line-clamp-2"
                        />
                        {uidRaw ? (
                          <div className="mt-0.5 max-w-full whitespace-nowrap text-xs font-mono text-zinc-500">
                            <span className="block truncate" title={uidRaw}>
                              ID: <span className="tabular-nums">{uidRaw}</span>
                            </span>
                          </div>
                        ) : null}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 align-middle tabular-nums text-zinc-800">
                      {formatDate(c.valid_until)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 align-middle tabular-nums text-zinc-700">
                      {daysLeft === null ? "—" : daysLeft}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 align-middle tabular-nums font-medium text-zinc-900">
                      {c.value != null ? formatMoney(c.value) : "—"}
                    </td>
                    <td className="max-w-[18rem] px-3 py-2.5 align-middle text-zinc-800">
                      {supplierRaw ? (
                        <TruncateTooltip text={supplierRaw} className="truncate" />
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="w-20 whitespace-nowrap px-2 py-2.5 align-middle text-right text-zinc-800">
                      <span
                        className="block truncate text-right"
                        title={(() => {
                          const cell = String(typeParts.cellText ?? "").trim();
                          const full = procurementContractTypeFullLabel(c.type);
                          if (!cell || cell === "—") return "";
                          // Jei mappingo nėra, `full` = originalas, t.y. title == cell.
                          return full || cell;
                        })()}
                      >
                        {typeParts.cellText}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 align-middle">
                      <div className="flex justify-end">
                        <ProjectCandidatePickForm
                          projectId={projectId}
                          defaultAssignee={defaultAssignee}
                          candidateType="procurement_contract"
                          candidateId={c.id}
                          onOptimisticPick={(t) => {
                            if (t.kind === "procurement_contract") {
                              setOptimisticPickedContractIds((s) => new Set(s).add(t.contractId));
                            }
                          }}
                          onOptimisticRevert={(t) => {
                            if (t.kind === "procurement_contract") {
                              setOptimisticPickedContractIds((s) => {
                                const n = new Set(s);
                                n.delete(t.contractId);
                                return n;
                              });
                            }
                          }}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!empty && !showAllContracts ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-zinc-600">
            Rodoma{" "}
            <span className="tabular-nums font-medium text-zinc-900">{pagination.showingFrom}</span>–{" "}
            <span className="tabular-nums font-medium text-zinc-900">{pagination.showingTo}</span> iš{" "}
            <span className="tabular-nums font-medium text-zinc-900">{pagination.totalCount}</span>
          </p>

          {pagination.totalPages > 1 ? (
            <nav className="flex flex-wrap items-center gap-1" aria-label="Puslapiavimas">
              <Link
                href={paginationHref(0)}
                aria-label="Pirmas puslapis"
                className={`rounded-md border px-2.5 py-1.5 text-sm ${
                  pagination.pageIndex0 <= 0 ? "pointer-events-none border-zinc-200 text-zinc-400" : "border-zinc-200 text-zinc-700 hover:bg-zinc-50"
                }`}
              >
                «
              </Link>
              <Link
                href={paginationHref(Math.max(0, pagination.pageIndex0 - 1))}
                aria-label="Atgal"
                className={`rounded-md border px-2.5 py-1.5 text-sm ${
                  pagination.pageIndex0 <= 0 ? "pointer-events-none border-zinc-200 text-zinc-400" : "border-zinc-200 text-zinc-700 hover:bg-zinc-50"
                }`}
              >
                ‹
              </Link>

              <Link
                href={paginationHref(0)}
                className={`rounded-md border px-2.5 py-1.5 text-sm tabular-nums ${
                  pagination.pageIndex0 === 0 ? "border-[#7C4A57] bg-[#7C4A57] text-white" : "border-zinc-200 text-zinc-700 hover:bg-zinc-50"
                }`}
              >
                1
              </Link>
              {pageButtons.leftGap ? <span className="px-1 text-sm text-zinc-400">…</span> : null}
              {pageButtons.pages
                .filter((p) => p !== 0 && p !== pageButtons.total - 1)
                .map((p) => (
                  <Link
                    key={p}
                    href={paginationHref(p)}
                    className={`rounded-md border px-2.5 py-1.5 text-sm tabular-nums ${
                      p === pagination.pageIndex0 ? "border-[#7C4A57] bg-[#7C4A57] text-white" : "border-zinc-200 text-zinc-700 hover:bg-zinc-50"
                    }`}
                    aria-current={p === pagination.pageIndex0 ? "page" : undefined}
                  >
                    {p + 1}
                  </Link>
                ))}
              {pageButtons.rightGap ? <span className="px-1 text-sm text-zinc-400">…</span> : null}
              {pageButtons.total > 1 ? (
                <Link
                  href={paginationHref(pageButtons.total - 1)}
                  className={`rounded-md border px-2.5 py-1.5 text-sm tabular-nums ${
                    pagination.pageIndex0 === pageButtons.total - 1
                      ? "border-[#7C4A57] bg-[#7C4A57] text-white"
                      : "border-zinc-200 text-zinc-700 hover:bg-zinc-50"
                  }`}
                >
                  {pageButtons.total}
                </Link>
              ) : null}

              <Link
                href={paginationHref(Math.min(pageButtons.total - 1, pagination.pageIndex0 + 1))}
                aria-label="Pirmyn"
                className={`rounded-md border px-2.5 py-1.5 text-sm ${
                  pagination.pageIndex0 >= pageButtons.total - 1
                    ? "pointer-events-none border-zinc-200 text-zinc-400"
                    : "border-zinc-200 text-zinc-700 hover:bg-zinc-50"
                }`}
              >
                ›
              </Link>
              <Link
                href={paginationHref(pageButtons.total - 1)}
                aria-label="Paskutinis puslapis"
                className={`rounded-md border px-2.5 py-1.5 text-sm ${
                  pagination.pageIndex0 >= pageButtons.total - 1
                    ? "pointer-events-none border-zinc-200 text-zinc-400"
                    : "border-zinc-200 text-zinc-700 hover:bg-zinc-50"
                }`}
              >
                »
              </Link>
            </nav>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
