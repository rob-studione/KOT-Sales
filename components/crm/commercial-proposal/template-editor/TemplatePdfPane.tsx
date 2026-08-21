"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

function HighlightOverlay({ boxes }: { boxes: TemplateLayoutRef[] }) {
  if (!boxes.length) return null;
  return (
    <div className="pointer-events-none absolute inset-0">
      {boxes.map((box, i) => (
        <div
          key={`${box.x}-${box.yTop}-${i}`}
          className="absolute rounded-sm border-2 border-[#7C4A57] bg-[#7C4A57]/15"
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
    const canvas = canvasRef.current;
    if (!canvas || width <= 0) return;
    (async () => {
      const page = await pdf.getPage(pageNumber);
      if (cancelled) return;
      const unscaled = page.getViewport({ scale: 1 });
      const scale = width / unscaled.width;
      const viewport = page.getViewport({ scale });
      const context = canvas.getContext("2d");
      if (!context) return;
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      await page.render({ canvas, canvasContext: context, viewport }).promise;
    })().catch(() => undefined);
    return () => {
      cancelled = true;
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
}: {
  pdfBytes: Uint8Array | null;
  loading: boolean;
  previewing?: boolean;
  pageId: TemplatePageId;
  highlight: TemplateLayoutRef[];
  onSelectPage: (pageId: TemplatePageId) => void;
}) {
  const [pdf, setPdf] = useState<PdfDocument | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewWidth, setPreviewWidth] = useState(520);
  const frameRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const update = () => setPreviewWidth(Math.max(280, Math.floor(el.clientWidth)));
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
  const selectedIndex = useMemo(() => pdfIndexForEditorPage(pageId, pageCount || 11), [pageId, pageCount]);

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {pdf
          ? Array.from({ length: pageCount }, (_, i) => {
              const active = i === selectedIndex;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => onSelectPage(editorPageForPdfIndex(i, pageCount))}
                  className={[
                    "shrink-0 overflow-hidden rounded-md border bg-white text-left",
                    active ? "border-[#7C4A57] ring-2 ring-[#7C4A57]/30" : "border-zinc-200 hover:border-zinc-300",
                  ].join(" ")}
                >
                  <PdfCanvas pdf={pdf} pageNumber={i + 1} width={58} className="block h-auto w-[58px]" />
                  <div className="max-w-[58px] px-1 py-0.5 text-[10px] leading-tight text-zinc-600">
                    {i + 1}. {labelForPdfIndex(i, pageCount)}
                  </div>
                </button>
              );
            })
          : TEMPLATE_SKELETON.map((label, i) => (
              <div key={label} className="h-[96px] w-[58px] shrink-0 rounded-md border border-zinc-200 bg-zinc-50 text-[10px] text-zinc-400">
                <div className="px-1 py-1">
                  {i + 1}. {label}
                </div>
              </div>
            ))}
      </div>

      <div ref={frameRef} className="relative overflow-hidden rounded-xl border border-zinc-200 bg-zinc-100">
        {previewing && pdfBytes ? (
          <div className="absolute right-2 top-2 z-10 rounded-md bg-white/90 px-2 py-1 text-[11px] text-zinc-600 shadow-sm">
            Atnaujinama…
          </div>
        ) : null}
        {loading ? (
          <div className="flex aspect-[612/792] items-center justify-center text-sm text-zinc-500">Ruošiama peržiūra…</div>
        ) : error ? (
          <div className="flex aspect-[612/792] items-center justify-center px-4 text-center text-sm text-red-700">{error}</div>
        ) : pdf ? (
          <div className="relative">
            <PdfCanvas pdf={pdf} pageNumber={selectedIndex + 1} width={previewWidth} className="block h-auto w-full" />
            <HighlightOverlay boxes={highlight} />
          </div>
        ) : (
          <div className="flex aspect-[612/792] items-center justify-center text-sm text-zinc-500">
            Peržiūra dar neparuošta.
          </div>
        )}
      </div>
    </div>
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
