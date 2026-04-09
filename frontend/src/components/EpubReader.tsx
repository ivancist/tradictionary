import { useEffect, useRef, useState } from 'react';
import ePub from 'epubjs';
import type Book from 'epubjs/types/book';
import type Rendition from 'epubjs/types/rendition';
import { getEpubUrl } from '../services/api';
import { HiOutlineChevronLeft, HiOutlineChevronRight, HiOutlinePencil, HiOutlineTrash } from 'react-icons/hi';

interface Props {
  bookId: string;
  onTextSelect?: (text: string) => void;
  fontSize?: number;
}

// ── LocalStorage: save/load page number ────────────────

const PAGES_KEY = 'tradictionary-pages';
const HIGHLIGHTS_KEY = 'tradictionary-highlights';

interface Highlight {
  id: string;
  cfi: string;
  text: string;
}

function getHighlights(bookId: string): Highlight[] {
  try {
    const raw = localStorage.getItem(HIGHLIGHTS_KEY);
    if (raw) {
      const all = JSON.parse(raw);
      return Array.isArray(all[bookId]) ? all[bookId] : [];
    }
  } catch { }
  return [];
}

function saveHighlight(bookId: string, h: Highlight) {
  try {
    const raw = localStorage.getItem(HIGHLIGHTS_KEY);
    const all = raw ? JSON.parse(raw) : {};
    if (!Array.isArray(all[bookId])) all[bookId] = [];

    // Check if a highlight for this text or cfi already exists to avoid duplicates
    const isDuplicate = all[bookId].some((existing: Highlight) =>
      existing.cfi === h.cfi || existing.text === h.text
    );
    if (!isDuplicate) {
      all[bookId].push(h);
      localStorage.setItem(HIGHLIGHTS_KEY, JSON.stringify(all));
    }
  } catch { }
}

function removeHighlightStore(bookId: string, cfi: string) {
  try {
    const raw = localStorage.getItem(HIGHLIGHTS_KEY);
    if (!raw) return;
    const all = JSON.parse(raw);
    if (Array.isArray(all[bookId])) {
      all[bookId] = all[bookId].filter((h: Highlight) => h.cfi !== cfi);
      localStorage.setItem(HIGHLIGHTS_KEY, JSON.stringify(all));
    }
  } catch { }
}

function getSavedPage(bookId: string): number {
  try {
    const raw = localStorage.getItem(PAGES_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      return typeof p[bookId] === 'number' ? p[bookId] : 0;
    }
  } catch { }
  return 0;
}

function savePage(bookId: string, page: number) {
  try {
    const raw = localStorage.getItem(PAGES_KEY);
    const p = raw ? JSON.parse(raw) : {};
    p[bookId] = page;
    localStorage.setItem(PAGES_KEY, JSON.stringify(p));
  } catch { }
}

// ── Shared page<->percentage conversion ────────────────

function pageToPercentage(page: number, total: number): number {
  return (page - 1) / total;
}

function percentageToPage(pct: number, total: number): number {
  return Math.max(1, Math.floor(pct * total) + 1);
}

// ── Component ──────────────────────────────────────────

export default function EpubReader({ bookId, onTextSelect, fontSize = 16 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const bookRef = useRef<Book | null>(null);
  const renditionRef = useRef<Rendition | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [currentChapter, setCurrentChapter] = useState('');
  const [goToInput, setGoToInput] = useState('');
  const [isHighlighterOn, setIsHighlighterOn] = useState(false);
  const [isEraserOn, setIsEraserOn] = useState(false);

  // Stable refs
  const onTextSelectRef = useRef(onTextSelect);
  onTextSelectRef.current = onTextSelect;
  const isHighlighterOnRef = useRef(isHighlighterOn);
  isHighlighterOnRef.current = isHighlighterOn;
  const isEraserOnRef = useRef(isEraserOn);
  isEraserOnRef.current = isEraserOn;
  const selectionPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSelectedRef = useRef('');
  const readyToSaveRef = useRef(false);

  // ── Navigate to page (shared logic) ──────────────────
  function navigateToPage(page: number, book: Book, rendition: Rendition) {
    const total = (book.locations as any).length();
    const clamped = Math.max(1, Math.min(page, total));
    const pct = pageToPercentage(clamped, total);
    const cfi = book.locations.cfiFromPercentage(pct);
    rendition.display(cfi);
  }

  // ── Load book ────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;
    readyToSaveRef.current = false;

    async function loadBook() {
      setLoading(true);
      setError(null);

      try {
        const url = getEpubUrl(bookId);
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Failed to load EPUB: ${response.status}`);
        const arrayBuffer = await response.arrayBuffer();
        if (cancelled || !containerRef.current) return;

        const book = ePub(arrayBuffer as any);
        bookRef.current = book;

        const rendition = book.renderTo(containerRef.current, {
          width: '100%',
          height: '100%',
          spread: 'none',
          flow: 'paginated',
        });
        renditionRef.current = rendition;
        applyTheme(rendition, fontSize);

        await book.ready;
        await book.locations.generate(1024);
        const total = (book.locations as any).length();
        setTotalPages(total);

        // ── Track page changes ──────────────────────
        rendition.on('relocated', (location: any) => {
          if (cancelled) return;
          if (location?.start?.cfi && book.locations) {
            const pct = book.locations.percentageFromCfi(location.start.cfi);
            const page = percentageToPage(pct, total);
            setCurrentPage(page);
            if (readyToSaveRef.current) {
              savePage(bookId, page);
            }
          }
          if (location?.start?.href && book.navigation) {
            const chapter = findChapter(book.navigation.toc, location.start.href);
            if (chapter) setCurrentChapter(chapter);
          }
        });

        // ── Poll iframe selection & Event Attachment ───────────────────
        if (selectionPollRef.current) clearInterval(selectionPollRef.current);
        selectionPollRef.current = setInterval(() => {
          try {
            const iframes = containerRef.current?.querySelectorAll('iframe');
            if (!iframes) return;
            for (const iframe of iframes) {
              const iframeWin = iframe.contentWindow;
              if (!iframeWin) continue;

              // 1. Check for text selection
              const sel = iframeWin.getSelection();
              const text = sel?.toString().trim();
              if (text && text.length > 0 && text !== lastSelectedRef.current) {
                lastSelectedRef.current = text;
                if (onTextSelectRef.current && !isHighlighterOnRef.current && !isEraserOnRef.current) {
                  onTextSelectRef.current(text);
                }
              }

              // 2. Attach Highlighting listeners reliably to any newly loaded iframe
              if (iframe.dataset.hasHighlighterListener !== 'true') {
                iframe.dataset.hasHighlighterListener = 'true';

                const handleSelectionEnd = () => {
                  if (!isHighlighterOnRef.current) return;
                  setTimeout(() => {
                    const currentSel = iframeWin.getSelection();
                    const currentText = currentSel?.toString().trim();
                    if (currentText && currentText.length > 0 && currentSel && currentSel.rangeCount > 0) {
                      const range = currentSel.getRangeAt(0);
                      try {
                        const contents = renditionRef.current?.getContents()[0];
                        if (contents) {
                          const cfiRange = contents.cfiFromRange(range);
                          if (cfiRange) {
                            renditionRef.current?.annotations.highlight(cfiRange, {}, (e: any) => {
                              if (isEraserOnRef.current) {
                                renditionRef.current?.annotations.remove(cfiRange, 'highlight');
                                removeHighlightStore(bookId, cfiRange);
                              } else if (onTextSelectRef.current && currentText && !isHighlighterOnRef.current) {
                                onTextSelectRef.current(currentText);
                              }
                            });
                            saveHighlight(bookId, { id: Date.now().toString(), cfi: cfiRange, text: currentText });
                            currentSel.removeAllRanges();
                          }
                        }
                      } catch (e) { }
                    }
                  }, 50);
                };

                iframeWin.addEventListener('mouseup', handleSelectionEnd);
                iframeWin.addEventListener('touchend', handleSelectionEnd);
              }
            }
          } catch { }
        }, 300);

        // Load existing highlights
        const existingHighlights = getHighlights(bookId);
        existingHighlights.forEach(h => {
          rendition.annotations.highlight(h.cfi, {}, (e: any) => {
            if (isEraserOnRef.current) {
              rendition.annotations.remove(h.cfi, 'highlight');
              removeHighlightStore(bookId, h.cfi);
            } else if (onTextSelectRef.current && h.text && !isHighlighterOnRef.current) {
              onTextSelectRef.current(h.text);
            }
          });
        });

        // Go directly to saved page (no delays)
        const savedPageNum = getSavedPage(bookId);
        if (savedPageNum > 1 && total > 0) {
          const pct = pageToPercentage(savedPageNum, total);
          const cfi = book.locations.cfiFromPercentage(pct);
          await rendition.display(cfi);
        } else {
          await rendition.display();
        }
        setLoading(false);

        // Enable saving after a brief settle
        setTimeout(() => { readyToSaveRef.current = true; }, 1000);

      } catch (err: any) {
        if (!cancelled) {
          setError(err.message || 'Failed to load EPUB');
          setLoading(false);
        }
      }
    }

    loadBook();

    return () => {
      cancelled = true;
      readyToSaveRef.current = false;
      if (selectionPollRef.current) clearInterval(selectionPollRef.current);
      if (renditionRef.current) renditionRef.current.destroy();
      if (bookRef.current) bookRef.current.destroy();
    };
  }, [bookId]);

  // ── Font size update without reload ──────────────────
  useEffect(() => {
    const rendition = renditionRef.current;
    if (rendition && !loading) {
      applyTheme(rendition, fontSize);
    }
  }, [fontSize, loading]);

  // ── Resize stability: keep current page on resize ───
  const currentPageRef = useRef(0);
  currentPageRef.current = currentPage;

  useEffect(() => {
    const rendition = renditionRef.current;
    const book = bookRef.current;
    if (!rendition || !book || loading) return;

    let resizeTimer: ReturnType<typeof setTimeout>;

    const handleResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        const page = currentPageRef.current;
        if (page > 0 && book.locations) {
          navigateToPage(page, book, rendition);
        }
      }, 200);
    };

    rendition.on('resized', handleResize);

    return () => {
      clearTimeout(resizeTimer);
      rendition.off('resized', handleResize);
    };
  }, [loading]);

  const goNext = () => renditionRef.current?.next();
  const goPrev = () => renditionRef.current?.prev();

  const goToPage = (page: number) => {
    const book = bookRef.current;
    const rendition = renditionRef.current;
    if (!book || !rendition || !book.locations) return;
    navigateToPage(page, book, rendition);
  };

  const handleGoTo = (e: React.FormEvent) => {
    e.preventDefault();
    const page = parseInt(goToInput, 10);
    if (!isNaN(page)) {
      goToPage(page);
      setGoToInput('');
    }
  };

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-red-400 text-sm">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 relative">
        {loading && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-surface-800 rounded-xl">
            <div className="w-8 h-8 border-2 border-primary-500/30 border-t-primary-500 rounded-full animate-spin" />
            <p className="text-xs text-surface-200/50">Loading book...</p>
          </div>
        )}

        <div
          ref={containerRef}
          className="absolute inset-0 bg-surface-800 rounded-xl overflow-hidden border border-surface-700/30"
        />
      </div>

      {!loading && (
        <div className="flex items-center justify-between mt-3 px-2">
          <div className="flex-1 min-w-0 mr-3 hidden sm:block">
            {currentChapter && (
              <p className="text-xs text-surface-200/40 truncate" title={currentChapter}>
                {currentChapter}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2 mr-auto pr-6">
            <button
              onClick={() => {
                setIsHighlighterOn(!isHighlighterOn);
                if (!isHighlighterOn) setIsEraserOn(false);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 border ${isHighlighterOn
                ? 'bg-primary-500/20 text-primary-400 border-primary-500/30'
                : 'bg-surface-700/60 text-surface-200/80 border-transparent hover:bg-surface-700 hover:text-white'
                }`}
              title="Highlighter: Click and drag text to highlight"
            >
              <HiOutlinePencil className="w-4 h-4" /> <span className="hidden sm:inline">Highlight</span>
            </button>
            <button
              onClick={() => {
                setIsEraserOn(!isEraserOn);
                if (!isEraserOn) setIsHighlighterOn(false);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 border ${isEraserOn
                ? 'bg-rose-500/20 text-rose-400 border-rose-500/30'
                : 'bg-surface-700/60 text-surface-200/80 border-transparent hover:bg-surface-700 hover:text-white'
                }`}
              title="Eraser: Click on an existing highlight to remove it"
            >
              <HiOutlineTrash className="w-4 h-4" /> <span className="hidden sm:inline">Erase</span>
            </button>
          </div>

          <div className="flex items-center gap-2 shrink-0 mr-3">
            <button onClick={goPrev} className="p-2 rounded-lg bg-surface-700/60 text-surface-200/80 hover:bg-surface-700 hover:text-white transition-all duration-200" title="Previous page">
              <HiOutlineChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm font-medium text-surface-200/70 min-w-[80px] text-center">
              {currentPage} / {totalPages}
            </span>
            <button onClick={goNext} className="p-2 rounded-lg bg-surface-700/60 text-surface-200/80 hover:bg-surface-700 hover:text-white transition-all duration-200" title="Next page">
              <HiOutlineChevronRight className="w-4 h-4" />
            </button>
          </div>

          <form onSubmit={handleGoTo} className="flex items-center gap-1.5 ml-auto shrink-0">
            <label className="text-xs text-surface-200/40">Go to</label>
            <input
              type="number"
              min={1}
              max={totalPages}
              value={goToInput}
              onChange={(e) => setGoToInput(e.target.value)}
              placeholder="#"
              className="w-14 text-center px-2 py-1 text-xs bg-surface-800/80 border border-surface-700/50 rounded-lg text-gray-200 focus:outline-none focus:ring-1 focus:ring-primary-500/50"
            />
            <button type="submit" className="px-2 py-1 text-xs font-medium rounded-lg bg-primary-600/20 text-primary-300 hover:bg-primary-600/30 transition-all duration-200">
              Go
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────

function applyTheme(rendition: Rendition, fontSize: number) {
  rendition.themes.default({
    'body': {
      'font-family': "'Merriweather', Georgia, serif !important",
      'line-height': '1.8 !important',
      'color': '#e2e8f0 !important',
      'background-color': '#0f172a !important',
      'padding': '20px 40px !important',
      'font-size': `${fontSize}px !important`,
    },
    'p': { 'margin-bottom': '0.8em !important' },
    'a': { 'color': '#818cf8 !important' },
    '::selection': { 'background': 'rgba(99, 102, 241, 0.4) !important' },
    '.epubjs-hl': { 'fill': 'rgba(234, 179, 8, 0.4)', 'fill-opacity': '0.4', 'mix-blend-mode': 'multiply' }
  });
}

function findChapter(toc: any[], href: string): string | null {
  for (const item of toc) {
    if (href.includes(item.href?.split('#')[0])) {
      return item.label?.trim() || null;
    }
    if (item.subitems?.length) {
      const found = findChapter(item.subitems, href);
      if (found) return found;
    }
  }
  return null;
}
