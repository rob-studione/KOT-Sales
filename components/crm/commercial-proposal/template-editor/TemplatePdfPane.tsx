"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { TemplateLayoutRef } from "@/lib/commercialProposal/templateBlocks";
import { TEMPLATE_PAGE_SIZE } from "@/lib/commercialProposal/templateBlocks";
import {
  editorPageForPdfIndex,
  labelForPdfIndex,
  pdfIndexForEditorPage,
  type TemplatePageId,
} from "@/lib/commercialProposal/templatePages";

type PdfjsModule = typeof import("pdfjs-dist");
type PdfDocument = Awaited<ReturnType<PdfjsModule["getDocument"]>["promise"]>;
type RenderTask = { cancel: () => void; promise: Promise<unknown> };

let renderChain: Promise<void> = Promise.resolve();

function enqueueRender(work: () => Promise<void>): Promise<void> {
  const next = renderChain.then(work, work);
  renderChain = next.then(
    () => undefined,
    () => undefined
  );
  return next;
}

function isRenderCancelled(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "name" in error &&
      (error as { name?: string }).name === "RenderingCancelledException"
  );
}

const STAGE_PAD = 16;
const THUMB_W = 56;
const PAGE_ASPECT = TEMPLATE_PAGE_SIZE.width / TEMPLATE_PAGE_SIZE.height;

let pdfjsPromise: Promise<PdfjsModule> | null = null;

function loadPdfjs(): Promise<PdfjsModule> {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist").then((pdfjs) => {
      if (!pdfjs.GlobalWorkerOptions.workerSrc) {
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      }
      return pdfjs;
    });
  }
  return pdfjsPromise;
}

function fitScale(stageW: number, stageH: number): number {
  const availW = Math.max(80, stageW - STAGE_PAD * 2);
  const availH = Math.max(80, stageH - STAGE_PAD * 2);
  return Math.min(availW / TEMPLATE_PAGE_SIZE.width, availH / TEMPLATE_PAGE_SIZE.height);
}

function HighlightOverlay({ boxes }: { boxes: TemplateLayoutRef[] }) {
  if (!boxes.length) return null;
  return (
    <div className="pointer-events-none absolute inset-0">
      {boxes.map((box, i) => (
        <div
          key={`${box.x}-${box.yTop}-${i}`}
          className="absolute rounded-sm border border-[#7C4A57] bg-[#7C4A57]/10"
          style={{
            left: `${(box.x / TEMPLATE_PAGE_SIZE.width) * 100}%`,
            top: `${(box.yTop / TEMPLATE_PAGE_SIZE.height) * 100}%`,
            width: `${(box.width / TEMPLATE_PAGE_SIZE.width) * 100}%`,
            height: `${(box.height / TEMPLATE_PAGE_SIZE.height) * 100}%`,
          }}
        />
      ))}
    </div>
  );
}

function PdfCanvas({
  pdf,
  pageNumber,
  width,
  className,
}: {
  pdf: PdfDocument;
  pageNumber: number;
  width: number;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    const live: { task: RenderTask | null } = { task: null };
    const canvas = canvasRef.current;
    if (!canvas || width <= 0) return;

    void enqueueRender(async () => {
      if (cancelled) return;
      const page = await pdf.getPage(pageNumber);
      if (cancelled) return;
      const rotation = page.rotate;
      const unscaled = page.getViewport({ scale: 1, rotation });
      const scale = width / unscaled.width;
      const viewport = page.getViewport({ scale, rotation });
      const context = canvas.getContext("2d", { alpha: false });
      if (!context || cancelled) return;
      context.setTransform(1, 0, 0, 1, 0, 0);
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      live.task = page.render({ canvas, viewport }) as RenderTask;
      try {
        await live.task.promise;
      } catch (error) {
        if (!isRenderCancelled(error)) throw error;
      }
    }).catch(() => undefined);

    return () => {
      cancelled = true;
      try {
        live.task?.cancel();
      } catch {
        /* already finished */
      }
    };
  }, [pdf, pageNumber, width]);

  return <canvas ref={canvasRef} className={className} />;
}

export function TemplatePdfPane({
  pdfBytes,
  loading,
  previewing = false,
  pageId,
  highlight,
  onSelectPage,
  toolbarEnd,
}: {
  pdfBytes: Uint8Array | null;
  loading: boolean;
  previewing?: boolean;
  pageId: TemplatePageId;
  highlight: TemplateLayoutRef[];
  onSelectPage: (pageId: TemplatePageId) => void;
  toolbarEnd?: ReactNode;
}) {
  const [pdf, setPdf] = useState<PdfDocument | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stageSize, setStageSize] = useState({ w: 0, h: 0 });
  const stageRef = useRef<HTMLDivElement | null>(null);
  const filmstripRef = useRef<HTMLDivElement | null>(null);
  const activeThumbRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const update = () => setStageSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!pdfBytes) {
      setPdf(null);
      return;
    }
    let cancelled = false;
    let loadingTask: ReturnType<PdfjsModule["getDocument"]> | null = null;
    (async () => {
      try {
        const pdfjs = await loadPdfjs();
        loadingTask = pdfjs.getDocument({ data: pdfBytes.slice() });
        const doc = await loadingTask.promise;
        if (cancelled) {
          void loadingTask.destroy();
          return;
        }
        setPdf(doc);
        setError(null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Nepavyko parodyti PDF.");
      }
    })();
    return () => {
      cancelled = true;
      void loadingTask?.destroy();
    };
  }, [pdfBytes]);

  const pageCount = pdf?.numPages ?? 0;
  const totalPages = pageCount || TEMPLATE_SKELETON.length;
  const selectedIndex = useMemo(() => pdfIndexForEditorPage(pageId, totalPages), [pageId, totalPages]);
  const displayScale = stageSize.w > 0 && stageSize.h > 0 ? fitScale(stageSize.w, stageSize.h) : 0;
  const pageWidth = displayScale > 0 ? Math.max(80, Math.floor(TEMPLATE_PAGE_SIZE.width * displayScale)) : 0;
  const currentPage = selectedIndex + 1;
  const canPrev = currentPage > 1;
  const canNext = currentPage < totalPages;

  useEffect(() => {
    const thumb = activeThumbRef.current;
    const film = filmstripRef.current;
    if (!thumb || !film) return;
    const filmRect = film.getBoundingClientRect();
    const thumbRect = thumb.getBoundingClientRect();
    if (thumbRect.left < filmRect.left || thumbRect.right > filmRect.right) {
      thumb.scrollIntoView({ inline: "nearest", block: "nearest" });
    }
  }, [selectedIndex]);

  function goToPdfIndex(index: number) {
    const next = Math.min(Math.max(0, index), totalPages - 1);
    onSelectPage(editorPageForPdfIndex(next, totalPages));
  }

  return (
    <section className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-[16px] border border-[#E8E8EB] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
      <div className="flex h-11 shrink-0 items-center gap-2 overflow-hidden border-b border-[#E8E8EB] px-2.5">
        <div className="flex shrink-0 flex-nowrap items-center gap-3 text-[13px] text-[#5C5D64]">
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] hover:bg-[#F7F7F8] disabled:cursor-not-allowed disabled:opacity-35"
            disabled={!canPrev}
            aria-label="Ankstesnis puslapis"
            onClick={() => goToPdfIndex(selectedIndex - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[3.25rem] text-center tabular-nums" aria-live="polite">
            {currentPage} / {totalPages}
          </span>
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] hover:bg-[#F7F7F8] disabled:cursor-not-allowed disabled:opacity-35"
            disabled={!canNext}
            aria-label="Kitas puslapis"
            onClick={() => goToPdfIndex(selectedIndex + 1)}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <div className="ml-auto shrink-0">{toolbarEnd}</div>
      </div>

      <div ref={filmstripRef} className="shrink-0 overflow-x-auto border-b border-[#E8E8EB] px-2.5 py-1">
        <div className="flex gap-2">
          {pdf
            ? Array.from({ length: pageCount }, (_, i) => {
                const active = i === selectedIndex;
                const label = labelForPdfIndex(i, pageCount);
                const title = `${i + 1}. ${label}`;
                return (
                  <button
                    key={i}
                    ref={active ? activeThumbRef : undefined}
                    type="button"
                    title={title}
                    onClick={() => onSelectPage(editorPageForPdfIndex(i, pageCount))}
                    className={[
                      "w-[68px] shrink-0 overflow-hidden rounded-[6px] border text-left",
                      active
                        ? "border-[#7C4A57] bg-[#FBF6F7]"
                        : "border-[#E8E8EB] bg-white hover:border-[#D4D4D8]",
                    ].join(" ")}
                  >
                    <PdfCanvas
                      pdf={pdf}
                      pageNumber={i + 1}
                      width={THUMB_W}
                      className="mx-auto block h-auto w-[56px] border-b border-[#E8E8EB]"
                    />
                    <div className="truncate px-1 py-0.5 text-[10px] leading-4 text-[#5C5D64]">
                      {title}
                    </div>
                  </button>
                );
              })
            : TEMPLATE_SKELETON.map((label, i) => (
                <div
                  key={label}
                  className="w-[68px] shrink-0 overflow-hidden rounded-[6px] border border-[#E8E8EB] bg-[#F7F7F8]"
                  title={`${i + 1}. ${label}`}
                >
                  <div className="mx-auto w-[56px] bg-[#EDEDEF]" style={{ aspectRatio: PAGE_ASPECT }} />
                  <div className="truncate px-1 py-0.5 text-[10px] leading-4 text-[#A1A1A6]">
                    {i + 1}. {label}
                  </div>
                </div>
              ))}
        </div>
      </div>

      <div ref={stageRef} className="relative min-h-0 flex-1 overflow-auto bg-[#EDEDEF]">
        {previewing && pdfBytes ? (
          <div className="absolute right-3 top-3 z-10 rounded-md bg-white/90 px-2 py-1 text-[11px] text-[#6F7077] shadow-sm">
            Atnaujinama…
          </div>
        ) : null}
        {loading ? (
          <div className="flex h-full items-center justify-center text-sm text-[#6F7077]">Ruošiama peržiūra…</div>
        ) : error ? (
          <div className="flex h-full items-center justify-center px-4 text-center text-sm text-red-700">{error}</div>
        ) : pdf && pageWidth > 0 ? (
          <div
            className="flex min-h-full min-w-full p-4"
            style={{ alignItems: "flex-start", justifyContent: "safe center" }}
          >
            <div
              className="relative shrink-0 overflow-hidden border border-[#E8E8EB] bg-white shadow-[0_8px_24px_rgba(0,0,0,0.08)]"
              style={{ width: pageWidth }}
            >
              <PdfCanvas
                pdf={pdf}
                pageNumber={selectedIndex + 1}
                width={pageWidth}
                className="block h-auto w-full"
              />
              <HighlightOverlay boxes={highlight} />
            </div>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-[#6F7077]">
            Peržiūra dar neparuošta.
          </div>
        )}
      </div>
    </section>
  );
}

const TEMPLATE_SKELETON = [
  "Viršelis",
  "Įžanga",
  "Istorija",
  "Technologijos",
  "Vertimas",
  "Vertimas+",
  "AI",
  "AI+",
  "Papildomos",
  "Išskirtinumas",
  "Kokybė",
];
