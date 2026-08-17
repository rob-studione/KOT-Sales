"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { clientDetailPath } from "@/lib/crm/clientRouting";
import {
  createManualProjectLeadAction,
  importManualProjectLeadsCsvAction,
  linkExistingClientToManualProjectAction,
  markManualCandidateAsInvalidAction,
  previewManualProjectLeadsCsvAction,
  restoreManualCandidateAction,
  type CreateManualProjectLeadActionResult,
  type ImportManualProjectLeadsCsvResult,
  type ManualCsvImportMapping,
  type PreviewManualProjectLeadsCsvResult,
} from "@/lib/crm/projectActions";
import { ClientProjectHistoryList } from "@/components/crm/ClientProjectHistoryList";
import { ProjectCandidatePickForm } from "@/components/crm/ProjectCandidatePickForm";
import { formatDate, formatDateTimeLt, formatMoney } from "@/lib/crm/format";
import type { ExistingClientMatch, ExistingProjectLeadMatch } from "@/lib/crm/findMatchingExistingClient";
import type {
  ManualCandidatePageRow,
  ProjectManualLeadRow,
} from "@/lib/crm/projectManualLeads";
import { getManualImportCsvFields } from "@/lib/crm/manualImportCsv";
import { TablePagination } from "@/components/crm/TablePagination";
import type { PageSize } from "@/lib/crm/pagination";
import type { ReactNode } from "react";

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

function isDuplicateResult(
  r: CreateManualProjectLeadActionResult
): r is { ok: false; duplicate: true; match: ExistingClientMatch } {
  return r.ok === false && "duplicate" in r && r.duplicate === true && "match" in r;
}

function isSuggestionsResult(
  r: CreateManualProjectLeadActionResult
): r is { ok: false; nameSuggestions: true; suggestions: ExistingClientMatch[] } {
  return r.ok === false && "nameSuggestions" in r && r.nameSuggestions === true && Array.isArray(r.suggestions);
}

function isExistingProjectLeadResult(
  r: CreateManualProjectLeadActionResult
): r is { ok: false; existingProjectLead: true; lead: ExistingProjectLeadMatch } {
  return r.ok === false && "existingProjectLead" in r && r.existingProjectLead === true && "lead" in r;
}

function matchReasonLabel(reason: ExistingClientMatch["match_reason"]): string {
  switch (reason) {
    case "company_code":
      return "įmonės kodą";
    case "vat_code":
      return "PVM kodą";
    case "client_id":
      return "kliento ID";
    case "email":
      return "el. paštą";
    case "name":
      return "pavadinimą";
    default:
      return "duomenis";
  }
}

function ClientMatchHistoryList({ history }: { history: ExistingClientMatch["project_history"] }) {
  return <ClientProjectHistoryList history={history} />;
}

/** Vienas CSV stulpelis gali būti priskirtas tik vienam target laukui. */
function applyCsvColumnMapping(
  prev: ManualCsvImportMapping,
  field: "companyName" | "companyCode" | "annualRevenue",
  value: string
): ManualCsvImportMapping {
  const next: ManualCsvImportMapping = { ...prev };
  if (field === "companyName") next.companyNameColumn = value;
  if (field === "companyCode") next.companyCodeColumn = value;
  if (field === "annualRevenue") next.annualRevenueColumn = value;
  if (!value) return next;
  if (field !== "companyName" && next.companyNameColumn === value) next.companyNameColumn = "";
  if (field !== "companyCode" && next.companyCodeColumn === value) next.companyCodeColumn = "";
  if (field !== "annualRevenue" && next.annualRevenueColumn === value) next.annualRevenueColumn = "";
  return next;
}

export function ManualProjectCandidatesPanel({
  projectId,
  pageRows,
  totalCount,
  pageIndex0,
  pageSize,
  totalPages,
  showingFrom,
  showingTo,
  paginationBasePath,
  paginationExtraQuery,
  defaultAssignee,
  listStatus,
  controlsLeft,
}: {
  projectId: string;
  pageRows: ManualCandidatePageRow[];
  totalCount: number;
  pageIndex0: number;
  pageSize: PageSize;
  totalPages: number;
  showingFrom: number;
  showingTo: number;
  paginationBasePath: string;
  paginationExtraQuery: Record<string, string | undefined>;
  defaultAssignee: string;
  listStatus: "active" | "netinkamas";
  controlsLeft?: ReactNode;
}) {
  const router = useRouter();
  const [hiddenLeadIds, setHiddenLeadIds] = useState<Set<string>>(() => new Set());
  const [hiddenLinkIds, setHiddenLinkIds] = useState<Set<string>>(() => new Set());
  const formRef = useRef<HTMLFormElement | null>(null);
  const [open, setOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [rowActionPending, startRowActionTransition] = useTransition();
  const [rowError, setRowError] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);
  const [copyToastKey, setCopyToastKey] = useState<string | null>(null);
  const invalidDialogRef = useRef<HTMLDialogElement>(null);
  const [pendingInvalidLeadId, setPendingInvalidLeadId] = useState<string | null>(null);
  const [duplicateMatch, setDuplicateMatch] = useState<ExistingClientMatch | null>(null);
  const [nameSuggestions, setNameSuggestions] = useState<ExistingClientMatch[] | null>(null);
  const [existingProjectLead, setExistingProjectLead] = useState<ExistingProjectLeadMatch | null>(null);
  const [linkPending, setLinkPending] = useState(false);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const importCloseBtnRef = useRef<HTMLButtonElement | null>(null);
  const csvFileInputRef = useRef<HTMLInputElement | null>(null);
  const csvDragDepthRef = useRef(0);

  const [importError, setImportError] = useState<string | null>(null);
  const [importPending, startImport] = useTransition();
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<ManualCsvImportMapping>({
    companyNameColumn: "",
    companyCodeColumn: "",
    annualRevenueColumn: "",
    annualRevenueYear: null,
  });
  const [importResult, setImportResult] = useState<ImportManualProjectLeadsCsvResult | null>(null);
  const [updateExistingLeads, setUpdateExistingLeads] = useState(true);
  const [importPreview, setImportPreview] = useState<PreviewManualProjectLeadsCsvResult | null>(null);
  const [importPreviewPending, setImportPreviewPending] = useState(false);
  const [csvDropActive, setCsvDropActive] = useState(false);

  const importJustSucceeded = importResult?.ok === true;
  const importLocked = importPending || importJustSucceeded;
  const rows = useMemo(() => {
    return pageRows.filter((row) => {
      if (row.kind === "lead") return !hiddenLeadIds.has(row.lead.id);
      return !hiddenLinkIds.has(row.linked.id);
    });
  }, [pageRows, hiddenLeadIds, hiddenLinkIds]);
  const empty = totalCount === 0;

  useEffect(() => {
    if (!successToast) return;
    const t = window.setTimeout(() => setSuccessToast(null), 2600);
    return () => window.clearTimeout(t);
  }, [successToast]);

  useEffect(() => {
    if (!copyToastKey) return;
    const t = window.setTimeout(() => setCopyToastKey(null), 1400);
    return () => window.clearTimeout(t);
  }, [copyToastKey]);

  function copyToClipboard(value: string, key: string) {
    const text = String(value ?? "").trim();
    if (!text) return;
    void navigator.clipboard.writeText(text).then(() => setCopyToastKey(key));
  }

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => closeBtnRef.current?.focus(), 0);
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (duplicateMatch) setDuplicateMatch(null);
        else if (nameSuggestions) setNameSuggestions(null);
        else if (existingProjectLead) setExistingProjectLead(null);
        else setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, duplicateMatch, nameSuggestions, existingProjectLead]);

  useEffect(() => {
    if (!importOpen) return;
    const t = window.setTimeout(() => importCloseBtnRef.current?.focus(), 0);
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (!importPending) setImportOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("keydown", onKey);
    };
  }, [importOpen, importPending]);

  async function extractHeaders(file: File): Promise<string[]> {
    const txt = await file.text();
    if (!txt.trim()) return [];
    const { delimiter, fields } = getManualImportCsvFields(txt);
    if (process.env.NODE_ENV === "development") {
      console.log("[manual CSV import UI]", { delimiter, fields, fieldCount: fields.length });
    }
    return fields;
  }

  async function applyImportedCsvFile(file: File | null) {
    setImportError(null);
    setImportResult(null);
    setCsvFile(file);
    if (!file) {
      setCsvHeaders([]);
      return;
    }
    if (!isLikelyCsvFile(file)) {
      setImportError("Pasirinkite CSV failą (.csv).");
      setCsvFile(null);
      setCsvHeaders([]);
      return;
    }
    const headers = await extractHeaders(file);
    setCsvHeaders(headers);
    const lower = new Map(headers.map((h) => [h.toLowerCase(), h] as const));
    const guess = (keys: string[]) => keys.map((k) => lower.get(k)).find(Boolean) ?? "";
    setMapping((m) => {
      const companyNameColumn = guess(["company_name", "pavadinimas", "imone", "įmonė", "imonė"]) || m.companyNameColumn;
      let companyCodeColumn =
        guess(["company_code", "kodas", "įm. kodas", "imones_kodas", "imones kodas"]) || m.companyCodeColumn;
      let annualRevenueColumn =
        guess(["annual_revenue", "revenue", "apyvarta", "pajamos"]) || m.annualRevenueColumn;
      if (companyCodeColumn === companyNameColumn) companyCodeColumn = "";
      if (annualRevenueColumn === companyNameColumn || annualRevenueColumn === companyCodeColumn) {
        annualRevenueColumn = "";
      }
      return { ...m, companyNameColumn, companyCodeColumn, annualRevenueColumn };
    });
  }

  function canImportNow(): boolean {
    return (
      !!csvFile &&
      mapping.companyNameColumn.trim().length > 0 &&
      mapping.companyCodeColumn.trim().length > 0 &&
      mapping.annualRevenueColumn.trim().length > 0
    );
  }

  const mappingComplete = canImportNow();

  useEffect(() => {
    if (!importOpen || !mappingComplete || importResult?.ok) {
      setImportPreview(null);
      setImportPreviewPending(false);
      return;
    }
    let cancelled = false;
    setImportPreviewPending(true);
    setImportPreview(null);
    (async () => {
      const fd = new FormData();
      fd.set("file", csvFile!);
      const r = await previewManualProjectLeadsCsvAction(projectId, mapping, fd);
      if (cancelled) return;
      setImportPreview(r);
      setImportPreviewPending(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [
    importOpen,
    csvFile,
    mapping.companyNameColumn,
    mapping.companyCodeColumn,
    mapping.annualRevenueColumn,
    mapping.annualRevenueYear,
    projectId,
    importResult,
    mappingComplete,
  ]);

  function crmStatusBadge(st: ProjectManualLeadRow["crm_status"]) {
    if (st === "existing_client") {
      return "inline-flex rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-900 ring-1 ring-inset ring-emerald-100";
    }
    if (st === "former_client") {
      return "inline-flex rounded-md bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-700 ring-1 ring-inset ring-zinc-200";
    }
    return "inline-flex rounded-md bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-900 ring-1 ring-inset ring-amber-100";
  }

  function crmStatusLabel(st: ProjectManualLeadRow["crm_status"]) {
    if (st === "existing_client") return "Esamas klientas";
    if (st === "former_client") return "Buvęs klientas";
    return "Naujas leadas";
  }

  return (
    <div className="space-y-4">
      {successToast ? (
        <div className="fixed right-4 top-4 z-50 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 shadow-sm">
          {successToast}
        </div>
      ) : null}

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
                setPendingInvalidLeadId(null);
              }}
            >
              Atšaukti
            </button>
            <button
              type="button"
              className="cursor-pointer rounded-md bg-[#7C4A57] px-3 py-2 text-sm font-semibold text-white hover:bg-[#693948] disabled:opacity-60"
              disabled={!pendingInvalidLeadId || rowActionPending}
              onClick={() => {
                const leadId = pendingInvalidLeadId;
                if (!leadId) return;
                invalidDialogRef.current?.close();
                setPendingInvalidLeadId(null);
                setRowError(null);
                setHiddenLeadIds((prev) => new Set(prev).add(leadId));
                startRowActionTransition(async () => {
                  const res = await markManualCandidateAsInvalidAction(projectId, leadId);
                  if (!res.ok) {
                    setHiddenLeadIds((prev) => {
                      const next = new Set(prev);
                      next.delete(leadId);
                      return next;
                    });
                    setRowError(res.error);
                    return;
                  }
                  setSuccessToast("Kandidatas pažymėtas kaip netinkamas");
                  router.refresh();
                });
              }}
            >
              Pažymėti kaip netinkamą
            </button>
          </div>
        </div>
      </dialog>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0 flex-1">{controlsLeft ?? null}</div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setError(null);
              setDuplicateMatch(null);
              setOpen(true);
            }}
            className="rounded-lg bg-[#7C4A57] px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-[#693948]"
          >
            Pridėti kandidatą
          </button>
          <button
            type="button"
            onClick={() => {
              setImportError(null);
              setImportResult(null);
              setCsvFile(null);
              setCsvHeaders([]);
              setMapping({ companyNameColumn: "", companyCodeColumn: "", annualRevenueColumn: "", annualRevenueYear: null });
              setUpdateExistingLeads(true);
              setImportPreview(null);
              setCsvDropActive(false);
              csvDragDepthRef.current = 0;
              setImportOpen(true);
            }}
            className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-800 shadow-sm hover:bg-zinc-50"
          >
            Importuoti CSV
          </button>
        </div>
      </div>

      {rowError ? (
        <div className="rounded-lg border border-red-200 bg-red-50/60 px-3 py-2 text-sm text-red-700">{rowError}</div>
      ) : null}

      {empty ? (
        <div className="rounded-lg border border-dashed border-zinc-200 bg-zinc-50/50 px-6 py-10 text-center">
          <p className="text-sm text-zinc-600">
            {listStatus === "netinkamas" ? "Nėra netinkamų kandidatų." : "Dar nėra kandidatų."}
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <button
              type="button"
              onClick={() => {
                setError(null);
                setDuplicateMatch(null);
                setOpen(true);
              }}
              className="rounded-lg bg-[#7C4A57] px-4 py-2 text-sm font-medium text-white hover:bg-[#693948]"
            >
              Pridėti kandidatą
            </button>
            <button
              type="button"
              onClick={() => {
                setImportError(null);
                setImportResult(null);
                setCsvFile(null);
                setCsvHeaders([]);
                setMapping({ companyNameColumn: "", companyCodeColumn: "", annualRevenueColumn: "", annualRevenueYear: null });
                setUpdateExistingLeads(true);
                setImportPreview(null);
                setCsvDropActive(false);
                csvDragDepthRef.current = 0;
                setImportOpen(true);
              }}
              className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
            >
              Importuoti CSV
            </button>
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
        <ul className="divide-y divide-zinc-100">
          {rows.map((row) =>
            row.kind === "lead" ? (
              <li key={`lead-${row.lead.id}`} className="flex flex-col gap-0 sm:flex-row sm:items-stretch">
                <div className="min-w-0 flex-1 px-4 py-3.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={crmStatusBadge(row.lead.crm_status)}>
                      {crmStatusLabel(row.lead.crm_status)}
                    </span>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(row.lead.company_name, `lead-name-${row.lead.id}`)}
                      className="font-medium text-zinc-900 underline-offset-2 hover:underline"
                      title="Kopijuoti pavadinimą"
                    >
                      {row.lead.company_name}
                    </button>
                    {copyToastKey === `lead-name-${row.lead.id}` ? (
                      <span className="rounded bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">Nukopijuota</span>
                    ) : null}
                  </div>
                  <dl className="mt-1.5 grid gap-x-4 gap-y-0.5 text-sm text-zinc-600 sm:grid-cols-2">
                    {row.lead.company_code ? (
                      <div>
                        <span className="text-zinc-400">Įm. kodas: </span>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(row.lead.company_code ?? "", `lead-code-${row.lead.id}`)}
                          className="text-zinc-700 underline-offset-2 hover:underline"
                          title="Kopijuoti įmonės kodą"
                        >
                          {row.lead.company_code}
                        </button>
                        {copyToastKey === `lead-code-${row.lead.id}` ? (
                          <span className="ml-2 rounded bg-emerald-50 px-1.5 py-0.5 text-xs font-medium text-emerald-700">Nukopijuota</span>
                        ) : null}
                      </div>
                    ) : null}
                    <div>
                      <span className="text-zinc-400">Paskutinis užsakymas: </span>
                      {row.lead.last_order_at ? formatDate(String(row.lead.last_order_at).slice(0, 10)) : "—"}
                    </div>
                    <div className="sm:col-span-2">
                      <span className="text-zinc-400">
                        {row.lead.annual_revenue_year ? `Apyvarta ${row.lead.annual_revenue_year}` : "Apyvarta"}:{" "}
                      </span>
                      {row.lead.annual_revenue == null ? "—" : formatMoney(Number(row.lead.annual_revenue))}
                    </div>
                    {row.lead.contact_name ? (
                      <div>
                        <span className="text-zinc-400">Kontaktas: </span>
                        {row.lead.contact_name}
                      </div>
                    ) : null}
                    {row.lead.email ? (
                      <div>
                        <span className="text-zinc-400">El. paštas: </span>
                        <a href={`mailto:${row.lead.email}`} className="text-zinc-900 underline-offset-2 hover:underline">
                          {row.lead.email}
                        </a>
                      </div>
                    ) : null}
                    {row.lead.phone ? (
                      <div>
                        <span className="text-zinc-400">Tel.: </span>
                        <a href={`tel:${row.lead.phone}`} className="text-zinc-900 underline-offset-2 hover:underline">
                          {row.lead.phone}
                        </a>
                      </div>
                    ) : null}
                    {row.lead.notes ? (
                      <div className="sm:col-span-2">
                        <span className="text-zinc-400">Pastaba: </span>
                        {row.lead.notes}
                      </div>
                    ) : null}
                    <div className="text-xs text-zinc-400 sm:col-span-2">Pridėta: {formatDateTimeLt(row.lead.created_at)}</div>
                  </dl>
                </div>
                <div
                  className="flex shrink-0 flex-col items-end justify-center gap-1 border-t border-zinc-100 px-4 py-3 sm:border-t-0 sm:border-l sm:pl-4"
                  onClick={(e) => e.stopPropagation()}
                >
                  {listStatus === "active" ? (
                    <>
                      <ProjectCandidatePickForm
                        projectId={projectId}
                        defaultAssignee={defaultAssignee}
                        candidateType="manual_lead"
                        candidateId={row.lead.id}
                        onOptimisticPick={(t) => {
                          if (t.kind === "manual_lead") setHiddenLeadIds((s) => new Set(s).add(t.leadId));
                        }}
                        onOptimisticRevert={(t) => {
                          if (t.kind === "manual_lead") {
                            setHiddenLeadIds((s) => {
                              const n = new Set(s);
                              n.delete(t.leadId);
                              return n;
                            });
                          }
                        }}
                      />
                      <button
                        type="button"
                        disabled={rowActionPending}
                        className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
                        onClick={() => {
                          setRowError(null);
                          setPendingInvalidLeadId(row.lead.id);
                          invalidDialogRef.current?.showModal();
                        }}
                      >
                        Netinkamas
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      disabled={rowActionPending}
                      className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
                      onClick={() => {
                        const leadId = row.lead.id;
                        setRowError(null);
                        setHiddenLeadIds((prev) => new Set(prev).add(leadId));
                        startRowActionTransition(async () => {
                          const res = await restoreManualCandidateAction(projectId, leadId);
                          if (!res.ok) {
                            setHiddenLeadIds((prev) => {
                              const next = new Set(prev);
                              next.delete(leadId);
                              return next;
                            });
                            setRowError(res.error);
                            return;
                          }
                          setSuccessToast("Kandidatas grąžintas į aktyvius");
                          router.refresh();
                        });
                      }}
                    >
                      Grąžinti
                    </button>
                  )}
                </div>
              </li>
            ) : (
              <li key={`linked-${row.linked.id}`} className="flex flex-col gap-0 sm:flex-row sm:items-stretch">
                <div className="min-w-0 flex-1 px-4 py-3.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={crmStatusBadge(row.linked.crm_status)}>
                      {crmStatusLabel(row.linked.crm_status)}
                    </span>
                    <Link
                      href={clientDetailPath(row.linked.client_key)}
                      className="font-medium text-zinc-900 underline-offset-2 hover:underline"
                    >
                      {row.linked.company_name}
                    </Link>
                  </div>
                  <dl className="mt-1.5 grid gap-x-4 gap-y-0.5 text-sm text-zinc-600 sm:grid-cols-2">
                    {row.linked.company_code ? (
                      <div>
                        <span className="text-zinc-400">Įm. kodas: </span>
                        {row.linked.company_code}
                      </div>
                    ) : null}
                    {row.linked.email ? (
                      <div>
                        <span className="text-zinc-400">El. paštas: </span>
                        <a href={`mailto:${row.linked.email}`} className="text-zinc-900 underline-offset-2 hover:underline">
                          {row.linked.email}
                        </a>
                      </div>
                    ) : null}
                    <div className="text-xs text-zinc-400 sm:col-span-2">Pridėta: {formatDateTimeLt(row.linked.created_at)}</div>
                  </dl>
                </div>
                <div
                  className="flex shrink-0 flex-col items-end justify-center gap-1 border-t border-zinc-100 px-4 py-3 sm:border-t-0 sm:border-l sm:pl-4"
                  onClick={(e) => e.stopPropagation()}
                >
                  <ProjectCandidatePickForm
                    projectId={projectId}
                    defaultAssignee={defaultAssignee}
                    candidateType="linked_client"
                    candidateId={row.linked.id}
                    onOptimisticPick={(t) => {
                      if (t.kind === "linked_client") setHiddenLinkIds((s) => new Set(s).add(t.linkId));
                    }}
                    onOptimisticRevert={(t) => {
                      if (t.kind === "linked_client") {
                        setHiddenLinkIds((s) => {
                          const n = new Set(s);
                          n.delete(t.linkId);
                          return n;
                        });
                      }
                    }}
                  />
                </div>
              </li>
            )
          )}
        </ul>
        <TablePagination
          basePath={paginationBasePath}
          pageIndex0={pageIndex0}
          pageSize={pageSize}
          totalCount={totalCount}
          totalPages={totalPages}
          showingFrom={showingFrom}
          showingTo={showingTo}
          extraQuery={paginationExtraQuery}
          ariaLabel="Kandidatų sąrašo puslapiai"
        />
        </div>
      )}

      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" role="presentation">
          <div
            className="absolute inset-0"
            aria-hidden
            onClick={() => !pending && !duplicateMatch && !nameSuggestions && !existingProjectLead && setOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="manual-lead-title"
            className="relative z-10 w-full max-w-lg rounded-xl border border-zinc-200 bg-white p-5 shadow-xl"
          >
            <div className="flex items-start justify-between gap-3">
              <h2 id="manual-lead-title" className="text-lg font-semibold text-zinc-900">
                Naujas kandidatas
              </h2>
              <button
                ref={closeBtnRef}
                type="button"
                disabled={pending || duplicateMatch != null || nameSuggestions != null || existingProjectLead != null}
                onClick={() => setOpen(false)}
                className="rounded-md p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
                aria-label="Uždaryti"
              >
                ✕
              </button>
            </div>
            <form
              ref={formRef}
              className="mt-4 space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.currentTarget;
                const fd = new FormData(form);
                fd.set("project_id", projectId);
                startTransition(async () => {
                  setError(null);
                  const r = await createManualProjectLeadAction(fd);
                  if (r.ok) {
                    form.reset();
                    setOpen(false);
                    setDuplicateMatch(null);
                    setNameSuggestions(null);
                    setExistingProjectLead(null);
                    router.refresh();
                  } else if (isExistingProjectLeadResult(r)) {
                    setDuplicateMatch(null);
                    setNameSuggestions(null);
                    setExistingProjectLead(r.lead);
                  } else if (isDuplicateResult(r)) {
                    setNameSuggestions(null);
                    setExistingProjectLead(null);
                    setDuplicateMatch(r.match);
                  } else if (isSuggestionsResult(r)) {
                    setDuplicateMatch(null);
                    setExistingProjectLead(null);
                    setNameSuggestions(r.suggestions);
                  } else {
                    setError(r.error);
                  }
                });
              }}
            >
              <label className="block text-sm">
                <span className="font-medium text-zinc-700">Įmonės pavadinimas *</span>
                <input
                  name="company_name"
                  required
                  autoComplete="organization"
                  className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-zinc-700">Įmonės kodas</span>
                <input name="company_code" autoComplete="off" className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm" />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-zinc-700">El. paštas</span>
                <input name="email" type="email" autoComplete="email" className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm" />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-zinc-700">Tel. nr.</span>
                <input name="phone" type="tel" autoComplete="tel" className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm" />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-zinc-700">Kontaktinis asmuo</span>
                <input name="contact_name" autoComplete="name" className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm" />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-zinc-700">Pastaba</span>
                <textarea name="notes" rows={3} className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm" />
              </label>
              {error ? <p className="text-sm text-red-600">{error}</p> : null}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => setOpen(false)}
                  className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
                >
                  Atšaukti
                </button>
                <button
                  type="submit"
                  disabled={pending}
                  className="rounded-lg bg-[#7C4A57] px-4 py-2 text-sm font-medium text-white hover:bg-[#693948] disabled:opacity-50"
                >
                  {pending ? "Tikrinama…" : "Išsaugoti"}
                </button>
              </div>
            </form>
          </div>

          {existingProjectLead ? (
            <div
              className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
              role="presentation"
              onClick={(e) => e.target === e.currentTarget && setExistingProjectLead(null)}
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="existing-lead-title"
                className="relative w-full max-w-md rounded-xl border border-zinc-200 bg-white p-5 shadow-xl"
                onClick={(e) => e.stopPropagation()}
              >
                <h3 id="existing-lead-title" className="text-base font-semibold text-zinc-900">
                  Kandidatas jau yra šiame projekte
                </h3>
                <p className="mt-2 text-sm text-zinc-600">
                  Rastas pagal {matchReasonLabel(existingProjectLead.match_reason)}. Naujo leado nekuriame — naudokite
                  esamą kandidatą sąraše.
                </p>
                <ul className="mt-3 space-y-1 rounded-lg bg-zinc-50 px-3 py-2 text-sm text-zinc-800">
                  <li>
                    <span className="text-zinc-500">Pavadinimas: </span>
                    {existingProjectLead.company_name}
                  </li>
                  {existingProjectLead.company_code ? (
                    <li>
                      <span className="text-zinc-500">Įm. kodas: </span>
                      {existingProjectLead.company_code}
                    </li>
                  ) : null}
                  {existingProjectLead.email ? (
                    <li>
                      <span className="text-zinc-500">El. paštas: </span>
                      {existingProjectLead.email}
                    </li>
                  ) : null}
                </ul>
                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setExistingProjectLead(null)}
                    className="rounded-lg bg-[#7C4A57] px-4 py-2 text-sm font-medium text-white hover:bg-[#693948]"
                  >
                    Supratau
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {duplicateMatch ? (
            <div
              className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
              role="presentation"
              onClick={(e) => e.target === e.currentTarget && !linkPending && setDuplicateMatch(null)}
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="dup-title"
                className="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border border-zinc-200 bg-white p-5 shadow-xl"
                onClick={(e) => e.stopPropagation()}
              >
                <h3 id="dup-title" className="text-base font-semibold text-zinc-900">
                  Klientas jau yra CRM
                </h3>
                <p className="mt-2 text-sm text-zinc-600">
                  Rastas pagal {matchReasonLabel(duplicateMatch.match_reason)}. Naujo leado nekuriame — pridėkite esamą
                  klientą į šį projektą.
                </p>
                <ul className="mt-3 space-y-1 rounded-lg bg-zinc-50 px-3 py-2 text-sm text-zinc-800">
                  <li>
                    <span className="text-zinc-500">Pavadinimas: </span>
                    {duplicateMatch.company_name}
                  </li>
                  {duplicateMatch.company_code ? (
                    <li>
                      <span className="text-zinc-500">Įm. kodas: </span>
                      {duplicateMatch.company_code}
                    </li>
                  ) : null}
                  {duplicateMatch.vat_code ? (
                    <li>
                      <span className="text-zinc-500">PVM: </span>
                      {duplicateMatch.vat_code}
                    </li>
                  ) : null}
                  {duplicateMatch.email ? (
                    <li>
                      <span className="text-zinc-500">El. paštas: </span>
                      {duplicateMatch.email}
                    </li>
                  ) : null}
                </ul>
                <ClientMatchHistoryList history={duplicateMatch.project_history} />
                <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
                  <button
                    type="button"
                    disabled={linkPending || pending}
                    onClick={() => setDuplicateMatch(null)}
                    className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
                  >
                    Atšaukti
                  </button>
                  <button
                    type="button"
                    disabled={linkPending || pending}
                    onClick={async () => {
                      setLinkPending(true);
                      setError(null);
                      try {
                        const r = await linkExistingClientToManualProjectAction(projectId, duplicateMatch.client_key);
                        if (r.ok) {
                          setDuplicateMatch(null);
                          setOpen(false);
                          formRef.current?.reset();
                          router.refresh();
                        } else {
                          setError(r.error);
                        }
                      } finally {
                        setLinkPending(false);
                      }
                    }}
                    className="rounded-lg bg-[#7C4A57] px-4 py-2 text-sm font-medium text-white hover:bg-[#693948] disabled:opacity-50"
                  >
                    {linkPending ? "Jungiama…" : "Pridėti esamą klientą į projektą"}
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {nameSuggestions && nameSuggestions.length > 0 ? (
            <div
              className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
              role="presentation"
              onClick={(e) => e.target === e.currentTarget && !linkPending && !pending && setNameSuggestions(null)}
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="sug-title"
                className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-zinc-200 bg-white p-5 shadow-xl"
                onClick={(e) => e.stopPropagation()}
              >
                <h3 id="sug-title" className="text-base font-semibold text-zinc-900">
                  Panašūs klientai CRM
                </h3>
                <p className="mt-2 text-sm text-zinc-600">
                  Pagal pavadinimą rastas CRM klientas. Naujo leado nekuriame — pridėkite esamą arba atšaukite.
                </p>
                <ul className="mt-3 space-y-3">
                  {nameSuggestions.map((s) => (
                    <li key={s.client_key} className="rounded-lg border border-zinc-200 p-3">
                      <div className="text-sm font-medium text-zinc-900">{s.company_name}</div>
                      <div className="mt-0.5 space-x-2 text-xs text-zinc-500">
                        {s.company_code ? <span>Kodas: {s.company_code}</span> : null}
                        {s.email ? <span>{s.email}</span> : null}
                      </div>
                      <ClientMatchHistoryList history={s.project_history} />
                      <div className="mt-2 flex justify-end">
                        <button
                          type="button"
                          disabled={linkPending || pending}
                          onClick={async () => {
                            setLinkPending(true);
                            setError(null);
                            try {
                              const r = await linkExistingClientToManualProjectAction(projectId, s.client_key);
                              if (r.ok) {
                                setNameSuggestions(null);
                                setOpen(false);
                                formRef.current?.reset();
                                router.refresh();
                              } else {
                                setError(r.error);
                              }
                            } finally {
                              setLinkPending(false);
                            }
                          }}
                          className="rounded-lg bg-[#7C4A57] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#693948] disabled:opacity-50"
                        >
                          {linkPending ? "Jungiama…" : "Pridėti šį"}
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    disabled={linkPending || pending}
                    onClick={() => setNameSuggestions(null)}
                    className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
                  >
                    Atšaukti
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {importOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" role="presentation">
          <div className="absolute inset-0" aria-hidden onClick={() => !importPending && setImportOpen(false)} />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="csv-import-title"
            className="relative z-10 w-full max-w-lg rounded-xl border border-zinc-200 bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <h2 id="csv-import-title" className="text-lg font-semibold text-zinc-900">
                Importuoti kandidatus iš CSV
              </h2>
              <button
                ref={importCloseBtnRef}
                type="button"
                disabled={importPending}
                onClick={() => setImportOpen(false)}
                className="rounded-md p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
                aria-label="Uždaryti"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <p className="text-sm font-medium text-zinc-800">CSV failas</p>
                <input
                  ref={csvFileInputRef}
                  id="manual-csv-import-file"
                  type="file"
                  accept=".csv,text/csv"
                  disabled={importLocked}
                  className="sr-only"
                  tabIndex={-1}
                  aria-label="Pasirinkti CSV failą"
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    void applyImportedCsvFile(f);
                    e.target.value = "";
                  }}
                />
                <div
                  role="button"
                  tabIndex={importLocked ? -1 : 0}
                  aria-disabled={importLocked}
                  aria-describedby="csv-import-dropzone-hint"
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
                    void applyImportedCsvFile(f);
                  }}
                  className={[
                    "group mt-2 flex min-h-[148px] w-full cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-8 text-center transition-[border-color,background-color,box-shadow] duration-150",
                    "outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2",
                    importLocked ? "cursor-not-allowed opacity-60" : "",
                    csvDropActive
                      ? "border-gray-900 bg-gray-50 shadow-[inset_0_0_0_1px_rgba(17,24,39,0.12)]"
                      : csvFile
                        ? "border-emerald-300/90 bg-emerald-50/40 hover:border-emerald-400 hover:bg-emerald-50/65"
                        : "border-zinc-300 bg-zinc-50/90 hover:border-zinc-400 hover:bg-zinc-100/95",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {csvFile ? (
                    <>
                      <span className="rounded-full bg-emerald-100/90 p-2.5 text-emerald-700">
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
                      <p id="csv-import-dropzone-hint" className="mt-3 text-xs text-zinc-500">
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
                      <p id="csv-import-dropzone-hint" className="mt-1.5 max-w-[16rem] text-sm leading-snug text-zinc-500">
                        {"Drag & drop arba spausk pasirinkti"}
                      </p>
                    </>
                  )}
                </div>
              </div>

              {csvHeaders.length > 0 ? (
                <div className="space-y-3">
                  <div className="text-sm font-medium text-zinc-800">Stulpelių mapping</div>
                  <p className="text-xs text-zinc-500">
                    Kiekvienam laukui pasirinkite vieną CSV stulpelį (vienas stulpelis negali kartotis keliuose laukuose).
                  </p>
                  <div className="space-y-3">
                    <div className="flex flex-col gap-1">
                      <label htmlFor="csv-map-company-name" className="text-sm font-medium text-zinc-700">
                        Įmonės pavadinimas (company_name) *
                      </label>
                      <select
                        id="csv-map-company-name"
                        multiple={false}
                        size={1}
                        disabled={importLocked}
                        className="w-full rounded-md border border-zinc-200 px-2 py-2 text-sm disabled:opacity-60"
                        value={mapping.companyNameColumn}
                        onChange={(e) => setMapping((m) => applyCsvColumnMapping(m, "companyName", e.target.value))}
                      >
                        <option value="">Pasirinkite stulpelį…</option>
                        {csvHeaders.map((h) => (
                          <option key={`name-${h}`} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label htmlFor="csv-map-company-code" className="text-sm font-medium text-zinc-700">
                        Įmonės kodas (company_code) *
                      </label>
                      <select
                        id="csv-map-company-code"
                        multiple={false}
                        size={1}
                        disabled={importLocked}
                        className="w-full rounded-md border border-zinc-200 px-2 py-2 text-sm disabled:opacity-60"
                        value={mapping.companyCodeColumn}
                        onChange={(e) => setMapping((m) => applyCsvColumnMapping(m, "companyCode", e.target.value))}
                      >
                        <option value="">Pasirinkite stulpelį…</option>
                        {csvHeaders.map((h) => (
                          <option key={`code-${h}`} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label htmlFor="csv-map-revenue" className="text-sm font-medium text-zinc-700">
                        Apyvarta / revenue (annual_revenue) *
                      </label>
                      <select
                        id="csv-map-revenue"
                        multiple={false}
                        size={1}
                        disabled={importLocked}
                        className="w-full rounded-md border border-zinc-200 px-2 py-2 text-sm disabled:opacity-60"
                        value={mapping.annualRevenueColumn}
                        onChange={(e) => setMapping((m) => applyCsvColumnMapping(m, "annualRevenue", e.target.value))}
                      >
                        <option value="">Pasirinkite stulpelį…</option>
                        {csvHeaders.map((h) => (
                          <option key={`rev-${h}`} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label htmlFor="csv-map-revenue-year" className="text-sm font-medium text-zinc-700">
                        Apyvartos metai (nebūtina)
                      </label>
                      <input
                        id="csv-map-revenue-year"
                        type="number"
                        min={1900}
                        max={3000}
                        disabled={importLocked}
                        className="w-full rounded-md border border-zinc-200 px-2 py-2 text-sm disabled:opacity-60"
                        value={mapping.annualRevenueYear ?? ""}
                        onChange={(e) => {
                          const v = e.target.value.trim();
                          setMapping((m) => ({ ...m, annualRevenueYear: v ? Number(v) : null }));
                        }}
                      />
                    </div>
                  </div>
                </div>
              ) : null}

              {mappingComplete && !importJustSucceeded ? (
                <div className="space-y-3 rounded-lg border border-zinc-200 bg-zinc-50/40 px-3 py-3">
                  <label className="flex cursor-pointer items-start gap-2 text-sm text-zinc-800">
                    <input
                      type="checkbox"
                      className="mt-0.5 rounded border-zinc-300"
                      checked={updateExistingLeads}
                      disabled={importLocked}
                      onChange={(e) => setUpdateExistingLeads(e.target.checked)}
                    />
                    <span>Atnaujinti esamus įrašus</span>
                  </label>
                  <div>
                    <div className="text-sm font-medium text-zinc-900">Importo peržiūra</div>
                    {importPreviewPending ? (
                      <p className="mt-1 text-sm text-zinc-500">Skaičiuojama…</p>
                    ) : importPreview?.ok ? (
                      <ul className="mt-2 space-y-1 text-sm text-zinc-700">
                        <li>
                          Bus sukurta:{" "}
                          <span className="font-semibold tabular-nums">{importPreview.wouldInsert}</span>
                        </li>
                        <li>
                          Bus atnaujinta:{" "}
                          <span className="font-semibold tabular-nums">
                            {updateExistingLeads ? importPreview.wouldUpdate : 0}
                          </span>
                        </li>
                        {importPreview.wouldSkipEverClient > 0 ? (
                          <li className="text-xs text-zinc-500">
                            Praleista (jau klientai / turi sąskaitų): {importPreview.wouldSkipEverClient}
                          </li>
                        ) : null}
                        {!updateExistingLeads && importPreview.wouldUpdate > 0 ? (
                          <li className="text-xs text-zinc-500">
                            Esami įrašai ({importPreview.wouldUpdate}) bus praleisti (tik įterpimas naujų).
                          </li>
                        ) : null}
                      </ul>
                    ) : importPreview && !importPreview.ok ? (
                      <p className="mt-1 text-sm text-red-600">{importPreview.error}</p>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {importError ? <p className="text-sm text-red-600">{importError}</p> : null}

              {importResult && importResult.ok ? (
                <div className="rounded-lg border border-zinc-200 bg-zinc-50/70 px-3 py-2 text-sm text-zinc-800">
                  <div className="font-medium text-zinc-900">Importo rezultatas</div>
                  <ul className="mt-2 space-y-1 text-zinc-700">
                    <li>
                      CSV eilučių: <span className="font-semibold tabular-nums">{importResult.totalRows}</span>
                    </li>
                    <li>
                      Praleista (trūksta pavadinimo/kodo):{" "}
                      <span className="font-semibold tabular-nums">{importResult.skippedMissingRequired}</span>
                    </li>
                    <li>
                      Įrašyta naujų: <span className="font-semibold tabular-nums">{importResult.inserted}</span>
                    </li>
                    <li>
                      Atnaujinta esamų: <span className="font-semibold tabular-nums">{importResult.updated}</span>
                    </li>
                    {importResult.skippedExisting > 0 ? (
                      <li>
                        Praleista esamų (nebuvo keista):{" "}
                        <span className="font-semibold tabular-nums">{importResult.skippedExisting}</span>
                      </li>
                    ) : null}
                    {importResult.skippedEverClient > 0 ? (
                      <li>
                        Praleista (jau klientai / turi sąskaitų):{" "}
                        <span className="font-semibold tabular-nums">{importResult.skippedEverClient}</span>
                      </li>
                    ) : null}
                    <li>
                      Nauji lead’ai: <span className="font-semibold tabular-nums">{importResult.newLead}</span>
                    </li>
                    <li>
                      Nevalidi apyvarta: <span className="font-semibold tabular-nums">{importResult.invalidRevenue}</span>
                    </li>
                  </ul>
                </div>
              ) : null}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  disabled={importPending}
                  onClick={() => setImportOpen(false)}
                  className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
                >
                  Uždaryti
                </button>
                {importJustSucceeded ? (
                  <button
                    type="button"
                    disabled
                    className="cursor-not-allowed rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-2 text-sm font-medium text-zinc-500"
                  >
                    Importuota
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={importPending || !canImportNow()}
                    onClick={() => {
                      if (!csvFile) {
                        setImportError("Pasirinkite CSV failą.");
                        return;
                      }
                      setImportError(null);
                      startImport(async () => {
                        const fd = new FormData();
                        fd.set("file", csvFile);
                        fd.set("updateExisting", updateExistingLeads ? "true" : "false");
                        const r = await importManualProjectLeadsCsvAction(projectId, mapping, fd);
                        setImportResult(r);
                        if (r.ok) {
                          router.refresh();
                        }
                        if (!r.ok) {
                          setImportError(r.error);
                        }
                      });
                    }}
                    className="rounded-lg bg-[#7C4A57] px-4 py-2 text-sm font-medium text-white hover:bg-[#693948] disabled:opacity-50"
                  >
                    {importPending ? "Importuojama…" : "Importuoti"}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
