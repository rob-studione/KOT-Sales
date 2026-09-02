"use client";

import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  publishTemplateAction,
  saveTemplateDraftAction,
} from "@/lib/crm/commercialProposalActions";
import type { CpTemplateContent } from "@/lib/commercialProposal/content";
import {
  blocksForPage,
  findTemplateBlock,
  getTemplateString,
  highlightBoxesForBlock,
  setTemplateString,
} from "@/lib/commercialProposal/templateBlocks";
import { TEMPLATE_EDITOR_PAGES, type TemplatePageId } from "@/lib/commercialProposal/templatePages";
import { CompanyHistoryAdminClient } from "@/components/crm/commercial-proposal/CompanyHistoryAdminClient";
import { DynamicFieldsMenu } from "@/components/crm/commercial-proposal/template-editor/DynamicFieldsMenu";
import { TemplatePdfPane } from "@/components/crm/commercial-proposal/template-editor/TemplatePdfPane";
import { TEMPLATE_STUDIO_WORKSPACE_CLASS } from "@/components/crm/commercial-proposal/studio/layoutClasses";
import type { CpCompanyHistoryEntry } from "@/lib/commercialProposal/types";

function fieldHint(hint?: string): string | undefined {
  if (!hint) return undefined;
  if (hint === "Dinaminis: vadybininkas") return "Užpildoma automatiškai: vadybininkas";
  if (hint === "Dinaminis: gavėjas") return "Užpildoma automatiškai: gavėjas";
  return hint;
}

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
        "block rounded-[10px] px-2.5 py-2.5",
        selected ? "border border-[#7C4A57]/20 bg-[#FBF6F7]" : "border border-transparent",
      ].join(" ")}
      onFocus={onSelect}
      onClick={onSelect}
    >
      <span className="text-[13px] font-medium text-[#5C5D64]">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-[12px] text-[#6F7077]">{hint}</span> : null}
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
  const cls =
    "mt-1.5 w-full rounded-[8px] border border-[#E8E8EB] bg-white px-3 text-[13px] text-[#17171B]";
  if (multiline) {
    return <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={4} className={`${cls} min-h-[88px] py-2`} />;
  }
  return <input value={value} onChange={(e) => onChange(e.target.value)} className={`${cls} h-10`} />;
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
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [desktopInspector, setDesktopInspector] = useState(true);
  const [pending, start] = useTransition();
  const previewTimer = useRef<number | null>(null);
  const previewSeq = useRef(0);
  const contentRef = useRef(content);
  contentRef.current = content;

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

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const sync = () => {
      setDesktopInspector(mq.matches);
      if (mq.matches) setInspectorOpen(false);
    };
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  async function handleHistoryChanged() {
    if (previewTimer.current) window.clearTimeout(previewTimer.current);
    await refreshPreview(contentRef.current);
  }

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

  const inspector = (
    <section className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-[16px] border border-[#E8E8EB] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
      <header className="shrink-0 border-b border-[#E8E8EB] px-4 py-3">
        <h2 className="text-[15px] font-semibold text-[#17171B]">
          {currentPage ? `${currentPage.number}. ${currentPage.label}` : "Turinys"}
        </h2>
      </header>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-3 py-3">
        {pageBlocks.map((block) => {
          if (block.kind === "history_entries") {
            return (
              <div
                key={block.id}
                className={
                  selectedBlockId === block.id
                    ? "rounded-[10px] border border-[#7C4A57]/20 bg-[#FBF6F7] px-2.5 py-2.5"
                    : "rounded-[10px] border border-transparent px-2.5 py-2.5"
                }
                onClick={() => setSelectedBlockId(block.id)}
              >
                <CompanyHistoryAdminClient initial={history} embedded onChanged={handleHistoryChanged} />
              </div>
            );
          }
          return (
            <Field
              key={block.id}
              label={block.label}
              hint={fieldHint(block.hint)}
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
  );

  return (
    <div data-template-studio="studio" className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h1 className="text-[22px] font-semibold tracking-tight text-[#17171B]">Šablonas</h1>
          <span className="inline-flex h-6 items-center rounded-full border border-[#E8E8EB] bg-white px-2 text-[12px] font-medium text-[#6F7077]">
            {statusLabel}
          </span>
          {draftDirty ? <span className="text-[12px] text-[#6F7077]">neišsaugota</span> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="h-10 rounded-[10px] px-3 text-sm font-medium text-[#5C5D64] hover:bg-white hover:text-[#17171B] lg:hidden"
            onClick={() => setInspectorOpen(true)}
          >
            Laukai
          </button>
          <button
            type="button"
            disabled={pending || previewing}
            className="h-10 rounded-[10px] px-3 text-sm font-medium text-[#5C5D64] hover:bg-white hover:text-[#17171B] disabled:opacity-50"
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
            className="h-10 rounded-[10px] border border-[#E8E8EB] bg-white px-4 text-sm font-medium text-[#17171B] hover:bg-[#F7F7F8] disabled:opacity-50"
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
            className="h-10 rounded-[10px] bg-[#7C4A57] px-4 text-sm font-medium text-white hover:bg-[#693948] disabled:opacity-50"
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
      {message ? <p className="shrink-0 pt-2 text-sm text-[#17171B]">{message}</p> : null}
      {warnings.length ? (
        <div className="mt-2 shrink-0 rounded-[10px] border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {warnings.join(" ")}
        </div>
      ) : null}

      <div className={TEMPLATE_STUDIO_WORKSPACE_CLASS}>
        <div className="flex h-full min-h-0 min-w-0 flex-col">
          <TemplatePdfPane
            pdfBytes={pdfBytes}
            loading={previewing && !pdfBytes}
            previewing={previewing}
            pageId={pageId}
            highlight={highlight}
            onSelectPage={selectPage}
            toolbarEnd={<DynamicFieldsMenu />}
          />
        </div>
        {desktopInspector ? (
          <div className="hidden h-full min-h-0 min-w-0 lg:flex lg:flex-col">{inspector}</div>
        ) : null}
      </div>

      {inspectorOpen
        ? createPortal(
            <div className="fixed inset-0 z-50 lg:hidden">
              <button
                type="button"
                aria-label="Uždaryti laukus"
                className="absolute inset-0 bg-[#17171B]/30"
                onClick={() => setInspectorOpen(false)}
              />
              <div className="absolute inset-y-0 right-0 flex w-[min(100vw-24px,400px)] flex-col p-3">
                {inspector}
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
