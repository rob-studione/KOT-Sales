"use client";

import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import {
  publishTemplateAction,
  saveTemplateDraftAction,
} from "@/lib/crm/commercialProposalActions";
import { CP_TEMPLATE_VARIABLES, type CpTemplateContent } from "@/lib/commercialProposal/content";
import {
  blocksForPage,
  findTemplateBlock,
  getTemplateString,
  highlightBoxesForBlock,
  setTemplateString,
} from "@/lib/commercialProposal/templateBlocks";
import { TEMPLATE_EDITOR_PAGES, type TemplatePageId } from "@/lib/commercialProposal/templatePages";
import { CompanyHistoryAdminClient } from "@/components/crm/commercial-proposal/CompanyHistoryAdminClient";
import { TemplatePdfPane } from "@/components/crm/commercial-proposal/template-editor/TemplatePdfPane";
import type { CpCompanyHistoryEntry } from "@/lib/commercialProposal/types";

function Field({
  label,
  hint,
  selected,
  onSelect,
  children,
}: {
  label: string;
  hint?: string;
  selected?: boolean;
  onSelect?: () => void;
  children: ReactNode;
}) {
  return (
    <label
      className={[
        "block rounded-lg border p-3 text-sm",
        selected ? "border-[#7C4A57] bg-[#7C4A57]/5" : "border-zinc-200 bg-white",
      ].join(" ")}
      onFocus={onSelect}
      onClick={onSelect}
    >
      <span className="text-xs font-medium text-zinc-600">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-[11px] text-zinc-500">{hint}</span> : null}
    </label>
  );
}

function TextInput({
  value,
  onChange,
  multiline,
}: {
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
}) {
  const cls = "mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm";
  if (multiline) {
    return <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={4} className={cls} />;
  }
  return <input value={value} onChange={(e) => onChange(e.target.value)} className={`${cls} h-9 py-0`} />;
}

export function TemplateEditorClient({
  initial,
  published,
  history,
}: {
  initial: CpTemplateContent;
  published: CpTemplateContent;
  history: CpCompanyHistoryEntry[];
}) {
  const [content, setContent] = useState(initial);
  const [savedDraft, setSavedDraft] = useState(initial);
  const [publishedContent, setPublishedContent] = useState(published);
  const [pageId, setPageId] = useState<TemplatePageId>("cover");
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>("cover.title");
  const [message, setMessage] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [pending, start] = useTransition();
  const previewTimer = useRef<number | null>(null);
  const previewSeq = useRef(0);

  const pageBlocks = useMemo(() => blocksForPage(content, pageId), [content, pageId]);
  const selectedBlock = useMemo(
    () => findTemplateBlock(content, selectedBlockId),
    [content, selectedBlockId]
  );
  const highlight = useMemo(
    () => highlightBoxesForBlock(selectedBlock?.pageId === pageId ? selectedBlock : null),
    [pageId, selectedBlock]
  );
  const draftDirty = useMemo(() => JSON.stringify(content) !== JSON.stringify(savedDraft), [content, savedDraft]);
  const unpublished = useMemo(
    () => JSON.stringify(content) !== JSON.stringify(publishedContent),
    [content, publishedContent]
  );
  const statusLabel = unpublished || draftDirty ? "Juodraštis" : "Publikuota versija";

  async function refreshPreview(next: CpTemplateContent) {
    const seq = ++previewSeq.current;
    setPreviewing(true);
    setMessage(null);
    try {
      const res = await fetch("/api/crm/commercial-proposals/template-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: next }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        if (seq === previewSeq.current) setMessage(body?.error ?? "Nepavyko paruošti peržiūros.");
        return;
      }
      const raw = res.headers.get("X-CP-Warnings");
      if (raw) {
        try {
          const parsed = JSON.parse(decodeURIComponent(raw)) as Array<{ message: string }>;
          if (seq === previewSeq.current) setWarnings(parsed.map((w) => w.message));
        } catch {
          if (seq === previewSeq.current) setWarnings([]);
        }
      } else if (seq === previewSeq.current) setWarnings([]);
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (seq === previewSeq.current) setPdfBytes(bytes);
    } finally {
      if (seq === previewSeq.current) setPreviewing(false);
    }
  }

  useEffect(() => {
    void refreshPreview(content);
    return () => {
      if (previewTimer.current) window.clearTimeout(previewTimer.current);
    };
    // Initial preview only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function schedulePreview(next: CpTemplateContent) {
    if (previewTimer.current) window.clearTimeout(previewTimer.current);
    previewTimer.current = window.setTimeout(() => {
      void refreshPreview(next);
    }, 700);
  }

  function updateBlock(path: Array<string | number>, value: string) {
    const next = setTemplateString(content, path, value);
    setContent(next);
    schedulePreview(next);
  }

  function selectPage(nextPage: TemplatePageId) {
    setPageId(nextPage);
    const first = blocksForPage(content, nextPage)[0];
    setSelectedBlockId(first?.id ?? null);
  }

  const currentPage = TEMPLATE_EDITOR_PAGES.find((p) => p.id === pageId);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Šablonas</h1>
          <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-700">
            {statusLabel}
          </span>
          {draftDirty ? <span className="text-xs text-zinc-500">neišsaugota</span> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pending || previewing}
            className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
            onClick={() => {
              if (previewTimer.current) window.clearTimeout(previewTimer.current);
              void refreshPreview(content);
            }}
          >
            Peržiūrėti PDF
          </button>
          <button
            type="button"
            disabled={pending}
            className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
            onClick={() => {
              start(async () => {
                const res = await saveTemplateDraftAction(content);
                if (res.ok) setSavedDraft(content);
                setMessage(res.ok ? "Juodraštis išsaugotas." : res.error);
              });
            }}
          >
            Išsaugoti juodraštį
          </button>
          <button
            type="button"
            disabled={pending}
            className="rounded-lg bg-[#7C4A57] px-4 py-2 text-sm font-medium text-white hover:bg-[#693948] disabled:opacity-50"
            onClick={() => {
              start(async () => {
                const res = await publishTemplateAction(content);
                if (res.ok) {
                  setSavedDraft(content);
                  setPublishedContent(content);
                }
                setMessage(res.ok ? "Šablonas publikuotas. Nauji pasiūlymai naudos šį turinį." : res.error);
              });
            }}
          >
            Publikuoti
          </button>
        </div>
      </div>
      {message ? <p className="text-sm text-zinc-700">{message}</p> : null}
      {warnings.length ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {warnings.join(" ")}
        </div>
      ) : null}

      <details className="rounded-xl border border-zinc-200 bg-white shadow-sm">
        <summary className="cursor-pointer list-none px-4 py-2.5 text-sm font-medium text-zinc-700 marker:content-none [&::-webkit-details-marker]:hidden [&::after]:float-right [&::after]:text-zinc-400 [&::after]:content-['▾']">
          Galimi dinaminiai laukai
        </summary>
        <ul className="space-y-1.5 border-t border-zinc-100 px-4 py-3 text-sm text-zinc-600">
          {CP_TEMPLATE_VARIABLES.map((v) => (
            <li key={v.key}>
              <code className="rounded bg-zinc-100 px-1.5 py-0.5 text-[12px] text-zinc-800">{`{{${v.key}}}`}</code>
              <span className="text-zinc-500"> — {v.label}</span>
            </li>
          ))}
        </ul>
      </details>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.65fr)_minmax(280px,1fr)]">
        <section className="min-w-0 rounded-xl border border-zinc-200 bg-white p-3 shadow-sm lg:sticky lg:top-4">
          <TemplatePdfPane
            pdfBytes={pdfBytes}
            loading={previewing && !pdfBytes}
            previewing={previewing}
            pageId={pageId}
            highlight={highlight}
            onSelectPage={selectPage}
          />
        </section>

        <section className="min-w-0 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto">
          <h2 className="text-sm font-semibold text-zinc-900">
            {currentPage ? `${currentPage.number}. ${currentPage.label}` : "Turinys"}
          </h2>
          <div className="mt-4 grid gap-3">
            {pageBlocks.map((block) => {
              if (block.kind === "history_entries") {
                return (
                  <div
                    key={block.id}
                    className={selectedBlockId === block.id ? "rounded-lg ring-2 ring-[#7C4A57]/30" : ""}
                    onClick={() => setSelectedBlockId(block.id)}
                  >
                    <CompanyHistoryAdminClient initial={history} />
                  </div>
                );
              }
              return (
                <Field
                  key={block.id}
                  label={block.label}
                  hint={block.hint}
                  selected={selectedBlockId === block.id}
                  onSelect={() => setSelectedBlockId(block.id)}
                >
                  <TextInput
                    value={getTemplateString(content, block.path)}
                    multiline={block.multiline}
                    onChange={(v) => updateBlock(block.path, v)}
                  />
                </Field>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
