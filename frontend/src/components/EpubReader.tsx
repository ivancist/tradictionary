import React, { useEffect, useRef, useState } from 'react';
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
const CHECKPOINT_KEY = 'tradictionary-reading-checkpoint';

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

// Exact screen-start CFI saved on every page turn. Recorded against the
// settled layout, it reproduces the exact screen on reload — unlike the
// page-number → percentage → CFI conversion, which lands mid-screen.
const PAGE_CFI_KEY = 'tradictionary-page-cfi';

function savePageCfiLS(bookId: string, cfi: string) {
  try {
    const raw = localStorage.getItem(PAGE_CFI_KEY);
    const data = raw ? JSON.parse(raw) : {};
    data[bookId] = cfi;
    localStorage.setItem(PAGE_CFI_KEY, JSON.stringify(data));
  } catch { }
}

function loadPageCfiLS(bookId: string): string | null {
  try {
    const raw = localStorage.getItem(PAGE_CFI_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return typeof data[bookId] === 'string' ? data[bookId] : null;
  } catch { return null; }
}

// Locations (1024-char blocks) depend only on the book's content, never on
// layout, so they can be cached forever. Generating them parses the whole
// book and takes seconds — loading the cache is instant. One key per book
// to avoid rewriting a single giant blob.
const LOCATIONS_KEY_PREFIX = 'tradictionary-locations:';

function saveLocationsLS(bookId: string, json: string) {
  try { localStorage.setItem(LOCATIONS_KEY_PREFIX + bookId, json); } catch { }
}

function loadLocationsLS(bookId: string): string | null {
  try { return localStorage.getItem(LOCATIONS_KEY_PREFIX + bookId); } catch { return null; }
}

// ── Shared page<->percentage conversion ────────────────

function pageToPercentage(page: number, total: number): number {
  return (page - 1) / total;
}

function percentageToPage(pct: number, total: number): number {
  return Math.max(1, Math.floor(pct * total) + 1);
}

// ── Component ──────────────────────────────────────────

export default React.memo(function EpubReader({ bookId, onTextSelect, fontSize = 16 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const bookRef = useRef<Book | null>(null);
  const renditionRef = useRef<Rendition | null>(null);
  const [loading, setLoading] = useState(true);
  const [navigating, setNavigating] = useState(false);
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

  // ── Navigate to page (shared logic) ──────────────────
  function navigateToPage(page: number, book: Book, rendition: Rendition) {
    const total = (book.locations as any).length();
    if (!total) return; // locations still generating (first open of this book)
    const clamped = Math.max(1, Math.min(page, total));
    const pct = pageToPercentage(clamped, total);
    const cfi = book.locations.cfiFromPercentage(pct);
    rendition.display(cfi);
  }

  // ── Load book ────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;
    let allowSavePage = false;

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
          allowScriptedContent: true,
        });
        renditionRef.current = rendition;
        applyTheme(rendition, fontSize);
        registerReadingCursorHook(rendition, bookId);

        await book.ready;

        // Load cached locations if we have them; otherwise they are generated
        // in the background after the book is already on screen.
        let totalLocs = 0;
        let lastCfi: string | null = null;
        let landedPage = 0; // footer page, updated by 'relocated'
        let anchorCfi: string | null = null; // reading position the settle-hold protects
        let anchorDisplayPending = false; // next relocated comes from our own re-anchor
        const cachedLocs = loadLocationsLS(bookId);
        if (cachedLocs) {
          try {
            (book.locations as any).load(cachedLocs);
            totalLocs = (book.locations as any).length();
          } catch { totalLocs = 0; }
        }
        setTotalPages(totalLocs);

        // ── Track page changes ──────────────────────
        rendition.on('relocated', (location: any) => {
          if (cancelled) return;
          if (location?.start?.cfi) {
            lastCfi = location.start.cfi;
            if (anchorDisplayPending) {
              // Caused by our own re-anchor display — keep the original anchor.
              anchorDisplayPending = false;
            } else {
              anchorCfi = location.start.cfi;
            }
            if (allowSavePage) savePageCfiLS(bookId, location.start.cfi);
            if (totalLocs > 0 && book.locations) {
              const pct = book.locations.percentageFromCfi(location.start.cfi);
              const page = percentageToPage(pct, totalLocs);
              landedPage = page;
              setCurrentPage(page);
              if (allowSavePage) savePage(bookId, page);
            }
          }
          if (location?.start?.href && book.navigation) {
            const chapter = findChapter(book.navigation.toc, location.start.href);
            if (chapter) setCurrentChapter(chapter);
          }
        });

        // ── Poll iframe Event Attachment ───────────────────
        if (selectionPollRef.current) clearInterval(selectionPollRef.current);
        selectionPollRef.current = setInterval(() => {
          try {
            const iframes = containerRef.current?.querySelectorAll('iframe');
            if (!iframes) return;
            for (const iframe of iframes) {
              const iframeWin = iframe.contentWindow;
              if (!iframeWin) continue;

              // Attach Highlighting & Selection listeners reliably to any newly loaded iframe
              if (iframe.dataset.hasHighlighterListener !== 'true') {
                iframe.dataset.hasHighlighterListener = 'true';

                const handleSelectionEnd = () => {
                  setTimeout(() => {
                    const currentSel = iframeWin.getSelection();
                    const currentText = currentSel?.toString().trim();

                    if (!isHighlighterOnRef.current) {
                      if (currentText && currentText.length > 0 && currentText !== lastSelectedRef.current) {
                        lastSelectedRef.current = currentText;
                        if (onTextSelectRef.current && !isEraserOnRef.current) {
                          onTextSelectRef.current(currentText);
                        }
                      }
                      return;
                    }

                    if (currentText && currentText.length > 0 && currentSel && currentSel.rangeCount > 0) {
                      const range = currentSel.getRangeAt(0);
                      try {
                        const contents = (renditionRef.current?.getContents() as any)?.[0];
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

                const handleIframeKeyDown = (e: KeyboardEvent) => {
                  const target = e.target as HTMLElement;
                  const tag = target?.tagName?.toLowerCase();
                  const isInput = tag === 'input' || tag === 'textarea';

                  if (target?.isContentEditable) return;
                  if (isInput) {
                    const val = (target as HTMLInputElement).value;
                    if (val !== '') return;
                  }

                  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); renditionRef.current?.next(); }
                  else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); renditionRef.current?.prev(); }
                };

                iframeWin.addEventListener('mouseup', handleSelectionEnd);
                iframeWin.addEventListener('touchend', handleSelectionEnd);
                iframeWin.addEventListener('pointerup', handleSelectionEnd);
                iframeWin.addEventListener('keydown', handleIframeKeyDown);
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

        // ── Restore last position (simplest possible way) ──
        // Initial render to get the book on screen and the layout measured,
        // then jump to the saved page with the exact same function the manual
        // "Go to" navigator uses — all behind the loading screen.
        const waitRelocated = () => new Promise<void>((resolve) => {
          let done = false;
          const finish = () => {
            if (done) return;
            done = true;
            (rendition as any).off('relocated', finish);
            resolve();
          };
          (rendition as any).on('relocated', finish);
          setTimeout(finish, 500);
        });

        const settledInitial = waitRelocated();
        await rendition.display();
        await settledInitial;
        if (cancelled) return;

        const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
        const savedCfi = loadPageCfiLS(bookId);
        const targetPage = getSavedPage(bookId);

        if (savedCfi || targetPage > 1) {
          if (totalLocs === 0) {
            // Locations are required to navigate/verify by page number. One-
            // time cost per book — cached for every later open.
            await book.locations.generate(1024);
            if (cancelled) return;
            saveLocationsLS(bookId, (book.locations as any).save());
            totalLocs = (book.locations as any).length();
            setTotalPages(totalLocs);
          }

          // Where we want to land. The page number of a CFI is layout-
          // independent (derived from 1024-char location blocks), so the
          // saved CFI's page equals the saved page number across sessions.
          const wantPage = savedCfi
            ? percentageToPage(book.locations.percentageFromCfi(savedCfi), totalLocs)
            : targetPage;

          // Issue the jump (exact CFI when we have one, else by page number).
          const goToTarget = async () => {
            const settled = waitRelocated();
            if (savedCfi) {
              anchorCfi = savedCfi;
              anchorDisplayPending = true;
              await rendition.display(savedCfi);
            } else {
              navigateToPage(targetPage, book, rendition);
            }
            await settled;
          };

          // Hold the loading screen until we've actually landed on wantPage
          // and it stays there. The reader keeps its final size during
          // loading (the footer's space is reserved), so revealing never
          // re-paginates — but a section's first render can still settle for
          // a moment and shift the page with no event from epubjs. Poll the
          // real position; re-issue the jump whenever it's off target; reveal
          // only after it reads correct several checks in a row.
          await goToTarget();
          let stable = 0;
          for (let i = 0; i < 30 && !cancelled && stable < 3; i++) {
            await sleep(120);
            let curPage = 0;
            try {
              const curCfi = (rendition as any).currentLocation()?.start?.cfi;
              if (curCfi) curPage = percentageToPage(book.locations.percentageFromCfi(curCfi), totalLocs);
            } catch { }
            if (curPage === wantPage) {
              stable++;
            } else {
              stable = 0;
              await goToTarget();
            }
          }
        }
        if (cancelled) return;
        allowSavePage = true;
        setLoading(false);

        // First open of this book: build locations in the background now that
        // the book is visible, cache them, and backfill the footer numbers.
        if (totalLocs === 0) {
          try {
            await book.locations.generate(1024);
            if (cancelled) return;
            saveLocationsLS(bookId, (book.locations as any).save());
            totalLocs = (book.locations as any).length();
            setTotalPages(totalLocs);
            if (lastCfi) {
              const page = percentageToPage(book.locations.percentageFromCfi(lastCfi), totalLocs);
              setCurrentPage(page);
              savePage(bookId, page);
            }
          } catch { /* locations are a nicety; the book is already visible */ }
        }


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
      if (selectionPollRef.current) clearInterval(selectionPollRef.current);
      if (renditionRef.current) renditionRef.current.destroy();
      if (bookRef.current) bookRef.current.destroy();
    };
  }, [bookId]);

  // ── Font size update without reload ──────────────────
  // Depends on fontSize only: re-applying the theme reflows the iframe's
  // columns and silently shifts the position (no relocated fires). Reacting
  // to `loading` made that happen right after every restore — the theme is
  // already applied in loadBook before the first render.
  useEffect(() => {
    const rendition = renditionRef.current;
    if (rendition && !loading) {
      applyTheme(rendition, fontSize);
    }
  }, [fontSize]);

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

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const tag = target?.tagName?.toLowerCase();
      const isInput = tag === 'input' || tag === 'textarea';

      if (target?.isContentEditable) return;
      if (isInput) {
        const val = (target as HTMLInputElement).value;
        if (val !== '') return;
      }

      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); goNext(); }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); goPrev(); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const goToPage = async (page: number) => {
    const book = bookRef.current;
    const rendition = renditionRef.current;
    if (!book || !rendition || !book.locations) return;

    const total = (book.locations as any).length();
    if (!total) return;
    const clamped = Math.max(1, Math.min(page, total));

    // If the target is close to the current page, a simple display is enough.
    // For distant jumps epubjs may need to load new spine sections which can
    // take multiple attempts. Show a loading overlay and use the same settle-
    // loop the initial-load code uses.
    const distance = Math.abs(clamped - currentPage);
    if (distance <= 3) {
      navigateToPage(clamped, book, rendition);
      return;
    }

    setNavigating(true);

    const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
    const waitRelocated = () => new Promise<void>((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        (rendition as any).off('relocated', finish);
        resolve();
      };
      (rendition as any).on('relocated', finish);
      setTimeout(finish, 500);
    });

    const pct = pageToPercentage(clamped, total);
    const cfi = book.locations.cfiFromPercentage(pct);

    const doJump = async () => {
      const settled = waitRelocated();
      await rendition.display(cfi);
      await settled;
    };

    try {
      await doJump();
      let stable = 0;
      for (let i = 0; i < 30 && stable < 3; i++) {
        await sleep(120);
        let curPage = 0;
        try {
          const curCfi = (rendition as any).currentLocation()?.start?.cfi;
          if (curCfi) curPage = percentageToPage(book.locations.percentageFromCfi(curCfi), total);
        } catch { }
        if (curPage === clamped) {
          stable++;
        } else {
          stable = 0;
          await doJump();
        }
      }
    } finally {
      setNavigating(false);
    }
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
        {(loading || navigating) && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-surface-800 rounded-xl">
            <div className="w-8 h-8 border-2 border-primary-500/30 border-t-primary-500 rounded-full animate-spin" />
            <p className="text-xs text-surface-200/50">{navigating ? 'Navigating…' : 'Loading book...'}</p>
          </div>
        )}

        <div
          ref={containerRef}
          className="absolute inset-0 bg-surface-800 rounded-xl overflow-hidden border border-surface-700/30"
        />
      </div>

      {/* Always rendered so its height is reserved during loading: mounting it
          only on reveal would shrink the reader and force epubjs to
          re-paginate, shifting the restored page (visible flicker). */}
      <div className={`flex items-center justify-between mt-3 px-2 ${loading || navigating ? 'invisible' : ''}`}>
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
    </div>
  );
});

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
    '::selection': { 'background': 'transparent !important', 'color': 'rgb(255,240,180) !important' },
    '.epubjs-hl': { 'fill': 'rgba(234, 179, 8, 0.4)', 'fill-opacity': '0.4', 'mix-blend-mode': 'multiply' }
  });
}

function getCheckpointOffset(doc: Document, range: Range): number {
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  let count = 0;
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    if (node === range.endContainer) return count + range.endOffset;
    count += node.length;
  }
  return count;
}

function buildRangeFromOffset(doc: Document, offset: number): Range | null {
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  let remaining = offset;
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    if (remaining <= node.length) {
      try {
        const r = doc.createRange();
        r.setStart(doc.body, 0);
        r.setEnd(node, remaining);
        return r;
      } catch { return null; }
    }
    remaining -= node.length;
  }
  return null;
}

// Per-chapter character offset of the checkpoint, used to restore the visual highlight.
function saveCheckpointLS(bookId: string, spineKey: string, offset: number) {
  try {
    const raw = localStorage.getItem(CHECKPOINT_KEY);
    const data = raw ? JSON.parse(raw) : {};
    if (!data[bookId]) data[bookId] = {};
    data[bookId][spineKey] = offset;
    localStorage.setItem(CHECKPOINT_KEY, JSON.stringify(data));
  } catch {}
}

function loadCheckpointLS(bookId: string, spineKey: string): number | null {
  try {
    const raw = localStorage.getItem(CHECKPOINT_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    const val = data?.[bookId]?.[spineKey];
    return typeof val === 'number' ? val : null;
  } catch { return null; }
}

function registerReadingCursorHook(rendition: Rendition, bookId: string) {
  (rendition as any).hooks.content.register((contents: any) => {
    const doc = contents.document as Document;
    if (!doc?.head) return;

    const win = doc.defaultView as any;
    if (!win || typeof win.Highlight === 'undefined' || !win.CSS?.highlights) return;

    const spineKey: string = contents.cfiBase ?? 'default';

    const saveCheckpoint = (r: Range) => {
      saveCheckpointLS(bookId, spineKey, getCheckpointOffset(doc, r));
    };

    const baseStyle = doc.createElement('style');
    baseStyle.textContent = 'body { color: rgba(226,232,240,0.28) !important; }';
    doc.head.appendChild(baseStyle);

    const hlStyle = doc.createElement('style');
    hlStyle.textContent = '::highlight(epub-read) { color: #e2e8f0 !important; }';
    doc.head.appendChild(hlStyle);

    const setReadColor = (c: string) => {
      hlStyle.textContent = `::highlight(epub-read) { color: ${c} !important; }`;
    };

    const readHighlight = new win.Highlight();
    win.CSS.highlights.set('epub-read', readHighlight);

    let rafId: number | null = null;
    let paused = true;
    let checkpoint: Range | null = null;
    let lastActiveRange: Range | null = null;
    let resumeTimer: number | null = null;
    let mouseDownHadSelection = false;

    const getCaret = (x: number, y: number): Range | null =>
      (doc as any).caretRangeFromPoint?.(x, y) ?? null;

    // Snap the caret to the end of the word it lands on
    const buildRange = (caret: Range): Range | null => {
      if (!doc.body) return null;
      try {
        let endNode: Node = caret.startContainer;
        let endOffset: number = caret.startOffset;
        if (endNode.nodeType === Node.TEXT_NODE) {
          const txt = (endNode as Text).data;
          while (endOffset < txt.length && /\S/.test(txt[endOffset])) endOffset++;
        }
        const r = doc.createRange();
        r.setStart(doc.body, 0);
        r.setEnd(endNode, endOffset);
        return r;
      } catch { return null; }
    };

    const applyRange = (r: Range) => {
      readHighlight.clear();
      try { readHighlight.add(r); } catch {}
    };

    // Restore saved checkpoint on load
    const savedOffset = loadCheckpointLS(bookId, spineKey);
    if (savedOffset !== null) {
      win.requestAnimationFrame(() => {
        const r = buildRangeFromOffset(doc, savedOffset);
        if (r) { checkpoint = r; applyRange(r); }
      });
    }

    // ── Selection change: immediate visual feedback ───────
    const onSelectionChange = () => {
      const sel = win.getSelection?.();
      const hasSelection = !!(sel && sel.toString().trim().length > 0);

      if (hasSelection) {
        // Dim the read-text highlight to a midpoint — don't clear it
        setReadColor('rgba(226,232,240,0.62)');
        if (!paused) {
          paused = true;
          checkpoint = lastActiveRange;
          if (rafId !== null) { win.cancelAnimationFrame(rafId); rafId = null; }
          if (checkpoint) {
            saveCheckpoint(checkpoint);
          }
        }
      } else {
        setReadColor('#e2e8f0');
        if (paused && checkpoint) applyRange(checkpoint);
      }
    };

    // ── Click: save checkpoint or resume ─────────────────
    const onMouseDown = () => {
      const sel = win.getSelection?.();
      mouseDownHadSelection = !!(sel && sel.toString().trim().length > 0);
    };

    const onClick = (e: MouseEvent) => {
      const sel = win.getSelection?.();
      if (sel && sel.toString().trim().length > 0) return;
      if (mouseDownHadSelection) { mouseDownHadSelection = false; return; }

      if (paused) {
        if (resumeTimer !== null) { win.clearTimeout(resumeTimer); resumeTimer = null; return; }
        resumeTimer = win.setTimeout(() => {
          resumeTimer = null;
          paused = false;
          checkpoint = null;
          setReadColor('#e2e8f0');
          readHighlight.clear();
        }, 250);
      } else {
        if (rafId !== null) { win.cancelAnimationFrame(rafId); rafId = null; }
        const caret = getCaret(e.clientX, e.clientY);
        if (!caret) return;
        const r = buildRange(caret);
        if (r) {
          paused = true;
          checkpoint = r;
          applyRange(r);
          saveCheckpoint(r);
        }
      }
    };

    const onDblClick = () => {
      if (resumeTimer !== null) { win.clearTimeout(resumeTimer); resumeTimer = null; }
    };

    // ── Mouse move: active reading ────────────────────────
    const onMove = (e: MouseEvent) => {
      if (paused) return; // selectionchange handles checkpoint restore

      if (rafId !== null) win.cancelAnimationFrame(rafId);
      rafId = win.requestAnimationFrame(() => {
        rafId = null;
        const caret = getCaret(e.clientX, e.clientY);
        if (!caret) return;
        const r = buildRange(caret);
        if (r) { lastActiveRange = r; applyRange(r); }
      });
    };

    const onLeave = () => {
      if (paused) return;
      if (rafId !== null) { win.cancelAnimationFrame(rafId); rafId = null; }
      readHighlight.clear();
      lastActiveRange = null;
    };

    doc.addEventListener('selectionchange', onSelectionChange);
    doc.addEventListener('mousedown', onMouseDown);
    doc.addEventListener('click', onClick);
    doc.addEventListener('dblclick', onDblClick);
    doc.addEventListener('mousemove', onMove);
    doc.addEventListener('mouseleave', onLeave);
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
