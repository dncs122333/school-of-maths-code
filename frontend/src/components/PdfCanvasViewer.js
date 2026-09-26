import React, { useCallback, useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf";
import pdfWorker from "pdfjs-dist/legacy/build/pdf.worker.entry";
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, RotateCw, AlertTriangle } from "lucide-react";
import { Button } from "./ui/button";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 2.5;
const ZOOM_STEP = 0.25;

/**
 * Renders a PDF page-by-page onto a canvas inside the app, instead of handing the
 * file to the browser's built-in PDF frame (which often paints blank in an embedded
 * dialog and exposes its own save/print controls that bypass the app).
 *
 * `data` is an ArrayBuffer of the already-watermarked bytes the server returned, so
 * what the reader sees on screen is exactly what a download produces.
 */
export default function PdfCanvasViewer({ data, onRetry }) {
  const canvasRef = useRef(null);
  const docRef = useRef(null);
  const renderTaskRef = useRef(null);
  const [numPages, setNumPages] = useState(0);
  const [pageNum, setPageNum] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [error, setError] = useState("");
  const [pageReady, setPageReady] = useState(false);

  // Load the document once per payload.
  useEffect(() => {
    let cancelled = false;
    setError("");
    setNumPages(0);
    setPageNum(1);
    setPageReady(false);

    if (!data) return undefined;
    // pdf.js takes ownership of (and detaches) the buffer it is given, so hand it a copy.
    const task = pdfjsLib.getDocument({ data: data.slice(0) });
    task.promise.then(
      (doc) => {
        if (cancelled) { doc.destroy(); return; }
        docRef.current = doc;
        setNumPages(doc.numPages);
      },
      (e) => {
        if (cancelled) return;
        console.error("PDF load failed", e);
        setError("This PDF could not be opened.");
      }
    );

    return () => {
      cancelled = true;
      try { task.destroy(); } catch (e) { /* already gone */ }
      if (docRef.current) { try { docRef.current.destroy(); } catch (e) { /* noop */ } docRef.current = null; }
    };
  }, [data]);

  // Draw the current page whenever it, the zoom, or the document changes.
  const renderPage = useCallback(async () => {
    const doc = docRef.current;
    const canvas = canvasRef.current;
    if (!doc || !canvas || !numPages) return;

    if (renderTaskRef.current) {
      try { renderTaskRef.current.cancel(); } catch (e) { /* noop */ }
    }
    try {
      const page = await doc.getPage(pageNum);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const viewport = page.getViewport({ scale: zoom * dpr });
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.width = `${viewport.width / dpr}px`;
      canvas.style.height = `${viewport.height / dpr}px`;
      const task = page.render({ canvasContext: canvas.getContext("2d"), viewport });
      renderTaskRef.current = task;
      await task.promise;
      renderTaskRef.current = null;
      setPageReady(true);
    } catch (e) {
      if (e && e.name === "RenderingCancelledException") return;
      console.error("PDF render failed", e);
      setError("This page could not be rendered.");
    }
  }, [pageNum, zoom, numPages]);

  useEffect(() => {
    setPageReady(false);
    renderPage();
  }, [renderPage]);

  if (error) {
    return (
      <div data-testid="pdf-viewer-error" className="py-20 text-center text-[#94A3B8]">
        <AlertTriangle className="h-10 w-10 mx-auto text-[#FBBF24]" />
        <p className="mt-3 font-600 text-white">{error}</p>
        <p className="mt-1 text-sm">The file may be damaged or in an unsupported format.</p>
        {onRetry && (
          <Button data-testid="pdf-viewer-retry" onClick={onRetry} variant="outline"
            className="mt-4 rounded-full border-[#1E293B] bg-transparent text-white hover:bg-white/5 font-600">
            <RotateCw className="h-4 w-4 mr-1" /> Try again
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col items-center gap-3">
      {/* sticky so paging and zoom stay reachable however long the page is */}
      <div className="sticky top-0 z-10 w-full flex items-center justify-center gap-2 flex-wrap rounded-full bg-[#0B0F19]/95 backdrop-blur-sm py-2">
        <Button data-testid="pdf-prev-page" onClick={() => setPageNum((p) => Math.max(1, p - 1))}
          disabled={pageNum <= 1} variant="outline" size="icon"
          className="rounded-full border-[#1E293B] bg-transparent text-white hover:bg-white/5 h-8 w-8">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span data-testid="pdf-page-indicator" className="text-xs font-mono text-[#94A3B8] min-w-[92px] text-center">
          {numPages ? `Page ${pageNum} of ${numPages}` : "Loading…"}
        </span>
        <Button data-testid="pdf-next-page" onClick={() => setPageNum((p) => Math.min(numPages, p + 1))}
          disabled={!numPages || pageNum >= numPages} variant="outline" size="icon"
          className="rounded-full border-[#1E293B] bg-transparent text-white hover:bg-white/5 h-8 w-8">
          <ChevronRight className="h-4 w-4" />
        </Button>

        <span className="w-px h-5 bg-[#1E293B] mx-1" />

        <Button data-testid="pdf-zoom-out" onClick={() => setZoom((z) => Math.max(ZOOM_MIN, z - ZOOM_STEP))}
          disabled={zoom <= ZOOM_MIN} variant="outline" size="icon"
          className="rounded-full border-[#1E293B] bg-transparent text-white hover:bg-white/5 h-8 w-8">
          <ZoomOut className="h-4 w-4" />
        </Button>
        <span data-testid="pdf-zoom-level" className="text-xs font-mono text-[#94A3B8] min-w-[44px] text-center">
          {Math.round(zoom * 100)}%
        </span>
        <Button data-testid="pdf-zoom-in" onClick={() => setZoom((z) => Math.min(ZOOM_MAX, z + ZOOM_STEP))}
          disabled={zoom >= ZOOM_MAX} variant="outline" size="icon"
          className="rounded-full border-[#1E293B] bg-transparent text-white hover:bg-white/5 h-8 w-8">
          <ZoomIn className="h-4 w-4" />
        </Button>
      </div>

      <div className="relative w-full flex justify-center">
        {/* Skeleton backing rather than a spinner, so a large page feels progressive */}
        {!pageReady && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-[min(100%,620px)] h-[70vh] rounded-xl bg-[#1E293B]/60 animate-pulse" />
          </div>
        )}
        <canvas
          ref={canvasRef}
          data-testid="pdf-page-canvas"
          className={`rounded-xl border border-[#1E293B] bg-white max-w-full transition-opacity duration-300 ${pageReady ? "opacity-100" : "opacity-0"}`}
        />
      </div>
    </div>
  );
}
