import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { flushSync } from 'react-dom';
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import 'react-pdf/dist/esm/Page/TextLayer.css';
import { getPdfUrl } from '../services/api';
import { HiOutlineChevronLeft, HiOutlineChevronRight, HiOutlineZoomIn, HiOutlineZoomOut, HiOutlineViewList, HiOutlineDocument } from 'react-icons/hi';

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface Props {
  bookId: string;
  onTextSelect?: (text: string) => void;
  suppressArrowKeys?: boolean;
}

const PAGES_KEY = 'tradictionary-pdf-pages';
const ZOOM_KEY = 'tradictionary-pdf-zoom';
const VIEW_MODE_KEY = 'tradictionary-pdf-viewmode';

function getSavedPage(bookId: string) {
  try {
    const raw = localStorage.getItem(PAGES_KEY);
    if (raw) return JSON.parse(raw)[bookId] || 1;
  } catch {}
  return 1;
}

function savePage(bookId: string, page: number) {
  try {
    const raw = localStorage.getItem(PAGES_KEY);
    const p = raw ? JSON.parse(raw) : {};
    p[bookId] = page;
    localStorage.setItem(PAGES_KEY, JSON.stringify(p));
  } catch {}
}

const MIN_ZOOM = 0.5, MAX_ZOOM = 2.0;
const ZOOM_STEPS = [0.5, 0.6, 0.75, 0.9, 1.0, 1.1, 1.25, 1.5, 1.75, 2.0];

function clampZoom(z: number) { return Math.max(MIN_ZOOM, Math.min(z, MAX_ZOOM)); }
function nextZoomUp(c: number) { return ZOOM_STEPS.find(z => z > c + 0.01) || MAX_ZOOM; }
function nextZoomDown(c: number) { return [...ZOOM_STEPS].reverse().find(z => z < c - 0.01) || MIN_ZOOM; }

// --- Virtualized Page Component ---
function VirtualPage({
  pageNumber,
  baseWidth,
  visualZoom,
  renderZoom,
  aspectRatio,
  onAspectRatioUpdate,
  isActive
}: {
  pageNumber: number;
  baseWidth: number;
  visualZoom: number;
  renderZoom: number;
  aspectRatio: number;
  onAspectRatioUpdate: (page: number, ratio: number) => void;
  isActive: boolean;
}) {
  const [isVisible, setIsVisible] = useState(false);
  const [completedScale, setCompletedScale] = useState(renderZoom);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isActive) return;
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(([ent]) => {
      setIsVisible(ent.isIntersecting); 
    }, { rootMargin: '100% 0px' });
    observer.observe(el);
    return () => observer.disconnect();
  }, [isActive]);

  if (!isActive) return null;

  const width = baseWidth * visualZoom;
  const height = width * aspectRatio;
  const isRendering = renderZoom !== completedScale;

  return (
    <div 
      ref={containerRef}
      className="mb-4 last:mb-0 relative pdf-page-container"
      style={{ width, height, margin: '0 auto 1rem auto' }}
    >
      {isVisible ? (
        <>
          {/* Old scaled page buffer to hide white flashes natively */}
          {isRendering && (
            <div style={{
              position: 'absolute', top: 0, left: 0,
              transform: `scale(${visualZoom / completedScale})`,
              transformOrigin: '0 0',
              zIndex: 1
            }}>
              <Page
                pageNumber={pageNumber}
                width={baseWidth}
                scale={completedScale}
                renderTextLayer={false}
                renderAnnotationLayer={false}
              />
            </div>
          )}

          {/* New crisp page rendering hidden until ready */}
          <div style={{
            position: 'absolute', top: 0, left: 0,
            transform: `scale(${visualZoom / renderZoom})`,
            transformOrigin: '0 0',
            zIndex: 2,
            opacity: isRendering ? 0 : 1
          }}>
            <Page
              pageNumber={pageNumber}
              width={baseWidth}
              scale={renderZoom}
              renderTextLayer={true}
              renderAnnotationLayer={true}
              onLoadSuccess={(page) => {
                if (page.originalWidth && page.originalHeight) {
                  const ratio = page.originalHeight / page.originalWidth;
                  onAspectRatioUpdate(pageNumber, ratio);
                }
              }}
              onRenderSuccess={() => setCompletedScale(renderZoom)}
            />
          </div>
        </>
      ) : (
        <div className="absolute inset-0 bg-surface-900/10 border border-surface-700/20 rounded-sm" />
      )}
    </div>
  );
}


export default React.memo(function PdfReader({ bookId, onTextSelect, suppressArrowKeys = false }: Props) {
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(() => getSavedPage(bookId));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [goToInput, setGoToInput] = useState('');
  
  const [containerWidth, setContainerWidth] = useState(0);
  const [zoom, setZoom] = useState(() => parseFloat(localStorage.getItem(ZOOM_KEY) || '1') || 1);
  const [renderZoom, setRenderZoom] = useState(zoom);
  const [viewMode, setViewMode] = useState<'single' | 'continuous'>(
    () => (localStorage.getItem(VIEW_MODE_KEY) as 'continuous' | 'single') || 'single'
  );
  const [aspectRatios, setAspectRatios] = useState<Record<number, number>>({});

  const containerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef(zoom); zoomRef.current = zoom;
  const onTextSelectRef = useRef(onTextSelect); onTextSelectRef.current = onTextSelect;

  const pdfUrl = getPdfUrl(bookId);

  useEffect(() => {
    const ob = new ResizeObserver(entries => setContainerWidth(entries[0].contentRect.width));
    if (containerRef.current) ob.observe(containerRef.current);
    return () => ob.disconnect();
  }, []);

  useEffect(() => {
    const handleSelection = () => {
      const text = window.getSelection()?.toString().trim();
      if (text && onTextSelectRef.current) {
        onTextSelectRef.current(text);
      }
    };
    
    document.addEventListener('mouseup', handleSelection);
    document.addEventListener('touchend', handleSelection);
    document.addEventListener('pointerup', handleSelection);
    
    return () => {
      document.removeEventListener('mouseup', handleSelection);
      document.removeEventListener('touchend', handleSelection);
      document.removeEventListener('pointerup', handleSelection);
    };
  }, []);

  useEffect(() => { setCurrentPage(getSavedPage(bookId)); setLoading(true); }, [bookId]);
  useEffect(() => { if (numPages > 0) savePage(bookId, currentPage); }, [currentPage, bookId, numPages]);
  useEffect(() => { localStorage.setItem(ZOOM_KEY, zoom.toString()); }, [zoom]);
  useEffect(() => { localStorage.setItem(VIEW_MODE_KEY, viewMode); }, [viewMode]);

  // Debounced renderZoom to avoid react-pdf turning white during pinches
  useEffect(() => {
    const t = setTimeout(() => setRenderZoom(zoom), 150);
    return () => clearTimeout(t);
  }, [zoom]);

  const goNext = useCallback(() => setCurrentPage(p => Math.min(p + 1, numPages)), [numPages]);
  const goPrev = useCallback(() => setCurrentPage(p => Math.max(p - 1, 1)), []);

  const handleAspectRatioUpdate = useCallback((page: number, ratio: number) => {
    setAspectRatios(prev => prev[page] === ratio ? prev : { ...prev, [page]: ratio });
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      if (!suppressArrowKeys && viewMode === 'single') {
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') goNext();
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') goPrev();
      }
      if (e.ctrlKey || e.metaKey) {
        if (e.key === '=') { e.preventDefault(); setZoom(z => nextZoomUp(z)); }
        if (e.key === '-') { e.preventDefault(); setZoom(z => nextZoomDown(z)); }
        if (e.key === '0') { e.preventDefault(); setZoom(1); }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goNext, goPrev, viewMode, suppressArrowKeys]);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;

    function zoomAroundPoint(clientX: number, clientY: number, factor: number) {
      const oldZoom = zoomRef.current;
      const newZoom = clampZoom(oldZoom * factor);
      if (newZoom === oldZoom) return;

      const exactFactor = newZoom / oldZoom;
      const contentEl = document.getElementById('pdf-render-content');
      if (!contentEl) return;
      const rect = contentEl.getBoundingClientRect();

      const cursorXRel = clientX - rect.left;
      const cursorYRel = clientY - rect.top;

      const expectedX = cursorXRel * exactFactor;
      const expectedY = cursorYRel * exactFactor;

      flushSync(() => {
        setZoom(newZoom);
      });

      if (!el || !contentEl) return;
      const newRect = contentEl.getBoundingClientRect();
      const targetScreenLeft = clientX - expectedX;
      const targetScreenTop = clientY - expectedY;

      const deltaX = newRect.left - targetScreenLeft;
      const deltaY = newRect.top - targetScreenTop;

      el.scrollLeft += deltaX;
      el.scrollTop += deltaY;
    }

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        zoomAroundPoint(e.clientX, e.clientY, 1 - e.deltaY * 0.005);
      }
    };

    let lastDist = 0;
    const getTouchDist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const getTouchCenter = (t: TouchList) => [(t[0].clientX + t[1].clientX)/2, (t[0].clientY + t[1].clientY)/2];

    let pinchCenterX = 0, pinchCenterY = 0;

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        lastDist = getTouchDist(e.touches);
        [pinchCenterX, pinchCenterY] = getTouchCenter(e.touches);
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && lastDist > 0) {
        e.preventDefault();
        const dist = getTouchDist(e.touches);
        [pinchCenterX, pinchCenterY] = getTouchCenter(e.touches);
        zoomAroundPoint(pinchCenterX, pinchCenterY, dist / lastDist);
        lastDist = dist;
      }
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    el.addEventListener('touchstart', handleTouchStart, { passive: false });
    el.addEventListener('touchmove', handleTouchMove, { passive: false });
    return () => {
      el.removeEventListener('wheel', handleWheel);
      el.removeEventListener('touchstart', handleTouchStart);
      el.removeEventListener('touchmove', handleTouchMove);
    };
  }, []);

  // Update current page during scroll in continuous mode
  useEffect(() => {
    if (viewMode !== 'continuous' || loading) return;
    const el = scrollContainerRef.current;
    if (!el) return;

    const handleScroll = () => {
      const pages = el.querySelectorAll('.pdf-page-container');
      const viewportMid = el.scrollTop + el.clientHeight / 2;
      let best = 1, minD = Infinity;

      pages.forEach((p, i) => {
        const top = (p as HTMLElement).offsetTop;
        const mid = top + (p as HTMLElement).offsetHeight / 2;
        const d = Math.abs(mid - viewportMid);
        if (d < minD) { minD = d; best = i + 1; }
      });
      if (best !== currentPage) setCurrentPage(best);
    };

    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, [viewMode, loading, currentPage]);

  const baseWidth = containerWidth > 0 ? containerWidth - 32 : 0;
  const layoutWidth = baseWidth * zoom;

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 relative" ref={containerRef}>
        {loading && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-surface-800 rounded-xl">
            <div className="w-8 h-8 border-2 border-primary-500/30 border-t-primary-500 rounded-full animate-spin" />
            <p className="text-xs text-surface-200/50">Loading PDF...</p>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-surface-800 rounded-xl text-red-400">
            {error}
          </div>
        )}

        <div 
          ref={scrollContainerRef} 
          className="absolute inset-0 bg-surface-800 rounded-xl overflow-auto border border-surface-700/30 scrollbar-thin" 
          style={{ touchAction: 'pan-x pan-y', overflowAnchor: 'none' }}
        >
          <div 
            id="pdf-render-content"
            className="py-4"
            // Pad left explicitly centers it without interfering with absolute coords
            style={{ 
              width: 'max-content',
              minWidth: '100%',
              paddingLeft: Math.max(0, (containerWidth - layoutWidth) / 2) 
            }}
          >
            <Document
              file={pdfUrl}
              onLoadSuccess={({ numPages }) => { setNumPages(numPages); setLoading(false); }}
              onLoadError={(err) => { setError(err.message); setLoading(false); }}
              loading=""
            >
              {Array.from({ length: numPages }, (_, i) => {
                const p = i + 1;
                const ratio = aspectRatios[p] || aspectRatios[1] || 1.414;
                const active = viewMode === 'continuous' || p === currentPage;
                return (
                  <VirtualPage
                    key={p}
                    pageNumber={p}
                    isActive={active}
                    baseWidth={baseWidth}
                    visualZoom={zoom}
                    renderZoom={renderZoom}
                    aspectRatio={ratio}
                    onAspectRatioUpdate={handleAspectRatioUpdate}
                  />
                );
              })}
            </Document>
          </div>
        </div>
      </div>

      {!loading && numPages > 0 && (
        <div className="flex items-center justify-between mt-3 px-2 shrink-0">
          <div className="flex items-center gap-1.5">
            <button onClick={() => setZoom(z => nextZoomDown(z))} disabled={zoom <= MIN_ZOOM} className="p-2 rounded-lg bg-surface-700/60 hover:bg-surface-700 hover:text-white disabled:opacity-30">
              <HiOutlineZoomOut className="w-4 h-4" />
            </button>
            <button onClick={() => setZoom(1.0)} className="px-2 py-1 text-xs font-medium rounded-lg bg-surface-700/60 hover:bg-surface-700 w-12 text-center text-surface-200">
              {Math.round(zoom * 100)}%
            </button>
            <button onClick={() => setZoom(z => nextZoomUp(z))} disabled={zoom >= MAX_ZOOM} className="p-2 rounded-lg bg-surface-700/60 hover:bg-surface-700 hover:text-white disabled:opacity-30">
              <HiOutlineZoomIn className="w-4 h-4" />
            </button>
            <div className="w-px h-5 bg-surface-700/40 mx-1" />
            <button onClick={() => setViewMode(m => m === 'single' ? 'continuous' : 'single')} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border ${viewMode === 'continuous' ? 'bg-primary-500/20 text-primary-400 border-primary-500/30' : 'bg-surface-700/60 text-surface-200/70 border-transparent hover:bg-surface-700'}`}>
              {viewMode === 'continuous' ? <><HiOutlineViewList className="w-4 h-4" /><span className="hidden sm:inline">Scroll</span></> : <><HiOutlineDocument className="w-4 h-4" /><span className="hidden sm:inline">Page</span></>}
            </button>
          </div>
          <div className="flex items-center gap-2">
            {viewMode === 'single' && (
              <button onClick={goPrev} disabled={currentPage <= 1} className="p-2 rounded-lg bg-surface-700/60 text-white disabled:opacity-30">
                <HiOutlineChevronLeft className="w-4 h-4" />
              </button>
            )}
            <span className="text-sm font-medium text-surface-200/70 min-w-[80px] text-center">{currentPage} / {numPages}</span>
            {viewMode === 'single' && (
              <button onClick={goNext} disabled={currentPage >= numPages} className="p-2 rounded-lg bg-surface-700/60 text-white disabled:opacity-30">
                <HiOutlineChevronRight className="w-4 h-4" />
              </button>
            )}
          </div>
          <form onSubmit={(e) => { e.preventDefault(); const p = parseInt(goToInput); if(p >= 1 && p <= numPages) { setCurrentPage(p); setGoToInput(''); } }} className="flex items-center gap-1.5">
            <input type="number" value={goToInput} onChange={e => setGoToInput(e.target.value)} placeholder="#" className="w-14 text-center px-2 py-1 text-xs bg-surface-800/80 border border-surface-700/50 rounded-lg" />
            <button type="submit" className="px-2 py-1 text-xs font-medium rounded-lg bg-primary-600/20 text-primary-300">Go</button>
          </form>
        </div>
      )}
    </div>
  );
});
