"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Maximize2 } from "lucide-react";
import { STUDIO_CARD } from "@/components/crm/commercial-proposal/studio/shared";

type PdfjsModule = typeof import("pdfjs-dist");
type PdfDocument = Awaited<ReturnType<PdfjsModule["getDocument"]>["promise"]>;
type RenderTask = { cancel: () => void; promise: Promise<unknown> };

const PAGE_ASPECT = 612 / 792;
const STAGE_PAD = 16;
const FIT_SLACK = 16;

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

function isRenderCancelled(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "name" in error &&
      (error as { name?: string }).name === "RenderingCancelledException"
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

    (async () => {
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
    })().catch(() => undefined);

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

export function ProposalPdfPreviewPane({
  pdfBytes,
  loading,
  refreshing,
  onFullscreen,
}: {
  pdfBytes: Uint8Array | null;
  loading: boolean;
  refreshing: boolean;
  onFullscreen: () => void;
}) {
  const [pdf, setPdf] = useState<PdfDocument | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [previewWidth, setPreviewWidth] = useState(0);
  const paneRef = useRef<HTMLElement | null>(null);
  const chromeRef = useRef<HTMLDivElement | null>(null);
  const footerRef = useRef<HTMLDivElement | null>(null);
  const pdfRef = useRef<PdfDocument | null>(null);
  const pageCount = pdf?.numPages ?? 0;

  useEffect(() => {
    const el = paneRef.current;
    if (!el) return;
    const column = el.parentElement;
    let timer = 0;
    const update = (immediate = false) => {
      const maxW = Math.max(140, Math.floor(el.clientWidth - STAGE_PAD * 2 - 8));
      const budgetH = column?.clientHeight ?? 0;
      const styles = window.getComputedStyle(el);
      const padY = (Number.parseFloat(styles.paddingTop) || 0) + (Number.parseFloat(styles.paddingBottom) || 0);
      const chromeH =
        (chromeRef.current?.offsetHeight ?? 52) + (footerRef.current?.offsetHeight ?? 108) + padY + FIT_SLACK;
      const maxH = Math.max(120, Math.floor(budgetH - chromeH - STAGE_PAD * 2));
      const widthFromHeight = Math.floor(maxH * PAGE_ASPECT);
      const next = Math.max(140, Math.min(maxW, widthFromHeight));
      const apply = () => setPreviewWidth((prev) => (prev === next ? prev : next));
      if (immediate) {
        apply();
        return;
      }
      window.clearTimeout(timer);
      timer = window.setTimeout(apply, 80);
    };
    update(true);
    const observer = new ResizeObserver(() => update(false));
    if (column) observer.observe(column);
    observer.observe(el);
    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
    };
  }, [pageCount]);

  useEffect(() => {
    if (!pdfBytes) {
      pdfRef.current = null;
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
          void (doc as unknown as { destroy?: () => Promise<void> }).destroy?.();
          return;
        }
        const previous = pdfRef.current;
        pdfRef.current = doc;
        setPdf(doc);
        setError(null);
        setPage((p) => Math.min(Math.max(1, p), doc.numPages));
        if (previous && previous !== doc) {
          void (previous as unknown as { destroy?: () => Promise<void> }).destroy?.();
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Nepavyko parodyti PDF.");
      }
    })();
    return () => {
      cancelled = true;
      void loadingTask?.destroy();
    };
  }, [pdfBytes]);

  const safePage = Math.min(Math.max(1, page), Math.max(1, pageCount));

  return (
    <aside ref={paneRef} className={`${STUDIO_CARD} flex h-fit max-h-full w-full flex-col self-start overflow-hidden p-2.5 pb-4`}>
      <div ref={chromeRef} className="flex shrink-0 items-start justify-between gap-2 px-0.5">
        <div>
          <h2 className="text-[15px] font-semibold text-[#17171B]">Pasiūlymo peržiūra</h2>
          <p className="mt-0.5 text-[12px] text-[#5C5D64]">
            {refreshing ? "Atnaujinama…" : "Peržiūrėkite būsimo PDF rezultatą"}
          </p>
        </div>
        <button
          type="button"
          className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] text-[#5C5D64] hover:bg-zinc-50"
          title="Išplėsti peržiūrą"
          aria-label="Išplėsti peržiūrą"
          onClick={onFullscreen}
        >
          <Maximize2 className="h-4 w-4" />
        </button>
      </div>

      <div
        className="relative mt-2 shrink-0 self-center rounded-[12px] bg-[#F7F7F8]"
        style={{ padding: STAGE_PAD, width: previewWidth > 0 ? previewWidth + STAGE_PAD * 2 : "100%" }}
      >
        {refreshing && pdf ? (
          <div className="absolute right-2 top-2 z-10 rounded-md bg-white px-2 py-1 text-[11px] text-[#6F7077] shadow-sm">
            Atnaujinama…
          </div>
        ) : null}
        {loading && !pdf ? (
          <div className="flex aspect-[612/792] w-full items-center justify-center text-sm text-[#6F7077]">
            Ruošiama peržiūra…
          </div>
        ) : error ? (
          <div className="flex aspect-[612/792] w-full items-center justify-center px-3 text-center text-sm text-red-700">
            {error}
          </div>
        ) : pdf && previewWidth > 0 ? (
          <div className="overflow-hidden rounded-sm border border-[#E8E8EB] bg-white shadow-[0_2px_8px_rgba(23,23,27,0.06)]">
            <PdfCanvas pdf={pdf} pageNumber={safePage} width={previewWidth} className="block h-auto w-full" />
          </div>
        ) : (
          <div className="flex aspect-[612/792] w-full items-center justify-center text-sm text-[#6F7077]">
            Peržiūra dar neparuošta.
          </div>
        )}
      </div>

      <div ref={footerRef} className="shrink-0">
      {pageCount > 0 ? (
        <div className="mt-2 flex items-center justify-center gap-3 text-[13px] text-[#5C5D64]">
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-35"
            disabled={safePage <= 1}
            aria-label="Ankstesnis puslapis"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="tabular-nums">
            {safePage} / {pageCount}
          </span>
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-35"
            aria-label="Kitas puslapis"
            onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
            disabled={safePage >= pageCount}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      ) : null}

      {pdf && pageCount > 0 ? (
        <div data-pdf-thumbs className="mt-1.5 flex shrink-0 gap-2 overflow-x-auto pb-1">
          {Array.from({ length: pageCount }, (_, i) => {
            const active = i + 1 === safePage;
            return (
              <button
                key={i}
                type="button"
                onClick={() => setPage(i + 1)}
                className={[
                  "relative w-[60px] shrink-0 overflow-hidden rounded-md border-2 bg-white",
                  active ? "border-[#7C4A57]" : "border-[#E8E8EB] hover:border-zinc-300",
                ].join(" ")}
                aria-label={`Puslapis ${i + 1}`}
                aria-current={active ? "page" : undefined}
              >
                <PdfCanvas pdf={pdf} pageNumber={i + 1} width={60} className="block h-auto w-[60px]" />
                <span
                  className={[
                    "absolute right-0.5 top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-sm px-0.5 text-[9px] font-semibold",
                    active ? "bg-[#7C4A57] text-white" : "bg-white/90 text-[#5C5D64]",
                  ].join(" ")}
                >
                  {i + 1}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
      </div>
    </aside>
  );
}
