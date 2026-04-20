"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { clientDetailPath } from "@/lib/crm/clientRouting";
import {
  createManualProjectLeadAction,
  importManualProjectLeadsCsvAction,
  linkExistingClientToManualProjectAction,
  previewManualProjectLeadsCsvAction,
  type CreateManualProjectLeadActionResult,
  type ImportManualProjectLeadsCsvResult,
  type ManualCsvImportMapping,
  type PreviewManualProjectLeadsCsvResult,
} from "@/lib/crm/projectActions";
import { ProjectCandidatePickForm } from "@/components/crm/ProjectCandidatePickForm";
import { formatDate, formatDateTimeLt, formatMoney } from "@/lib/crm/format";
import type { ExistingClientMatch } from "@/lib/crm/findMatchingExistingClient";
import type {
  ManualCandidatePageRow,
  ProjectManualLeadRow,
} from "@/lib/crm/projectManualLeads";
import { getManualImportCsvFields } from "@/lib/crm/manualImportCsv";
import { TablePagination } from "@/components/crm/TablePagination";
import type { PageSize } from "@/lib/crm/pagination";

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
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement | null>(null);
  const [open, setOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [duplicateMatch, setDuplicateMatch] = useState<ExistingClientMatch | null>(null);
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
  const rows = pageRows;
  const empty = totalCount === 0;

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => closeBtnRef.current?.focus(), 0);
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (duplicateMatch) setDuplicateMatch(null);
        else setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, duplicateMatch]);

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
      let companyNameColumn =
        guess(["company_name", "pavadinimas", "imone", "įmonė", "imonė"]) || m.companyNameColumn;
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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-xl text-sm leading-relaxed text-zinc-600">
          Rankinis projektas: kandidatai neįtraukiami pagal sąskaitų taisykles. Pridėkite įmones kaip leadus arba prijunkite jau
          esančius CRM klientus — jie rodomi tik šiame projekte.
        </p>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setError(null);
              setDuplicateMatch(null);
              setOpen(true);
            }}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-zinc-800"
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

      {empty ? (
        <div className="rounded-lg border border-dashed border-zinc-200 bg-zinc-50/50 px-6 py-10 text-center">
          <p className="text-sm text-zinc-600">Dar nėra kandidatų.</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <button
              type="button"
              onClick={() => {
                setError(null);
                setDuplicateMatch(null);
                setOpen(true);
              }}
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
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
                    <div className="font-medium text-zinc-900">{row.lead.company_name}</div>
                  </div>
                  <dl className="mt-1.5 grid gap-x-4 gap-y-0.5 text-sm text-zinc-600 sm:grid-cols-2">
                    {row.lead.company_code ? (
                      <div>
                        <span className="text-zinc-400">Įm. kodas: </span>
                        {row.lead.company_code}
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
                  <ProjectCandidatePickForm
                    projectId={projectId}
                    defaultAssignee={defaultAssignee}
                    candidateType="manual_lead"
                    candidateId={row.lead.id}
                  />
                </div>
              </li>
            ) : (
              <li key={`linked-${row.linked.id}`} className="flex flex-col gap-0 sm:flex-row sm:items-stretch">
                <div className="min-w-0 flex-1 px-4 py-3.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800">Esamas klientas</span>
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
            onClick={() => !pending && !duplicateMatch && setOpen(false)}
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
                disabled={pending || duplicateMatch != null}
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
                fd.delete("force_new_lead");
                startTransition(async () => {
                  setError(null);
                  const r = await createManualProjectLeadAction(fd);
                  if (r.ok) {
                    form.reset();
                    setOpen(false);
                    setDuplicateMatch(null);
                    router.refresh();
                  } else if (isDuplicateResult(r)) {
                    setDuplicateMatch(r.match);
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
                  className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
                >
                  {pending ? "Tikrinama…" : "Išsaugoti"}
                </button>
              </div>
            </form>
          </div>

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
                className="relative w-full max-w-md rounded-xl border border-zinc-200 bg-white p-5 shadow-xl"
                onClick={(e) => e.stopPropagation()}
              >
                <h3 id="dup-title" className="text-base font-semibold text-zinc-900">
                  Rastas galimai sutampantis klientas
                </h3>
                <p className="mt-2 text-sm text-zinc-600">
                  CRM jau turi įrašą pagal įmonės kodą arba el. paštą. Galite prijungti šį klientą prie projekto arba vis tiek sukurti naują rankinį leadą.
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
                  {duplicateMatch.email ? (
                    <li>
                      <span className="text-zinc-500">El. paštas: </span>
                      {duplicateMatch.email}
                    </li>
                  ) : null}
                </ul>
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
                    onClick={() => {
                      const form = formRef.current;
                      if (!form) return;
                      const fd = new FormData(form);
                      fd.set("project_id", projectId);
                      fd.set("force_new_lead", "1");
                      startTransition(async () => {
                        setError(null);
                        const r = await createManualProjectLeadAction(fd);
                        if (r.ok) {
                          form.reset();
                          setDuplicateMatch(null);
                          setOpen(false);
                          router.refresh();
                        } else if (isDuplicateResult(r)) {
                          setDuplicateMatch(r.match);
                        } else {
                          setError(r.error);
                        }
                      });
                    }}
                    className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-50"
                  >
                    Vis tiek kurti naują kandidatą
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
                    className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
                  >
                    {linkPending ? "Jungiama…" : "Pridėti esamą klientą į projektą"}
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
                      ? "border-blue-500 bg-blue-50/70 shadow-[inset_0_0_0_1px_rgba(59,130,246,0.35)]"
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
                          csvDropActive ? "text-blue-600" : "text-zinc-400 transition-colors group-hover:text-zinc-500"
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
                    <li>
                      Esami klientai: <span className="font-semibold tabular-nums">{importResult.existingClient}</span>
                    </li>
                    <li>
                      Buvę klientai: <span className="font-semibold tabular-nums">{importResult.formerClient}</span>
                    </li>
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
                    className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
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
