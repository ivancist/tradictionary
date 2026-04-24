import { useState, useRef, useCallback, useEffect } from 'react';
import { HiOutlineUpload, HiOutlineCog, HiOutlineTrash, HiOutlineBookOpen, HiOutlineArrowLeft, HiOutlinePlus, HiOutlineLink, HiOutlineX } from 'react-icons/hi';
import { useEpub } from './hooks/useEpub';
import EpubReader from './components/EpubReader';
import PdfReader from './components/PdfReader';
import SearchSidebar from './components/SearchSidebar';

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'it', label: 'Italian' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'ru', label: 'Russian' },
  { code: 'zh', label: 'Chinese' },
  { code: 'ja', label: 'Japanese' },
  { code: 'ko', label: 'Korean' },
  { code: 'ar', label: 'Arabic' },
  { code: 'nl', label: 'Dutch' },
  { code: 'pl', label: 'Polish' },
  { code: 'tr', label: 'Turkish' },
  { code: 'sv', label: 'Swedish' },
  { code: 'hi', label: 'Hindi' },
];

// ── Persist settings ──────────────────────────────────

const SETTINGS_KEY = 'tradictionary-settings';

interface SavedSettings {
  sourceLang: string;
  targetLang: string;
  showSettings: boolean;
  fontSize: number;
}

function loadSettings(): SavedSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { sourceLang: 'auto', targetLang: 'en', showSettings: false, fontSize: 16 };
}

function saveSettings(s: SavedSettings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {}
}

// ── App ───────────────────────────────────────────────

export default function App() {
  const { books, selectedBook, setSelectedBook, upload, remove, importFromUrl } = useEpub();
  const [selectedText, setSelectedText] = useState<{ text: string; ts: number } | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const saved = loadSettings();
  const [sourceLang, setSourceLang] = useState(saved.sourceLang);
  const [targetLang, setTargetLang] = useState(saved.targetLang);
  const [showSettings, setShowSettings] = useState(saved.showSettings);
  const [fontSize, setFontSize] = useState(saved.fontSize || 16);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // URL import state
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [urlValue, setUrlValue] = useState('');
  const [urlLoading, setUrlLoading] = useState(false);
  const [urlError, setUrlError] = useState('');

  // Resize logic for Sidebar
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem('tradictionary-sidebar-width');
    return saved ? parseInt(saved, 10) : 420;
  });
  const isResizing = useRef(false);
  const [isResizingState, setIsResizingState] = useState(false);

  const startResizing = useCallback(() => {
    isResizing.current = true;
    setIsResizingState(true);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  const stopResizing = useCallback(() => {
    if (isResizing.current) {
      isResizing.current = false;
      setIsResizingState(false);
      document.body.style.cursor = 'default';
      document.body.style.userSelect = '';
    }
  }, []);

  const resize = useCallback((e: MouseEvent) => {
    if (isResizing.current) {
      const newWidth = document.body.clientWidth - e.clientX;
      setSidebarWidth(Math.max(300, Math.min(newWidth, 1000))); // Min 300px, Max 1000px
    }
  }, []);

  useEffect(() => {
    window.addEventListener('mousemove', resize);
    window.addEventListener('mouseup', stopResizing);
    return () => {
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResizing);
    };
  }, [resize, stopResizing]);

  useEffect(() => {
    const t = setTimeout(() => {
      localStorage.setItem('tradictionary-sidebar-width', sidebarWidth.toString());
    }, 500);
    return () => clearTimeout(t);
  }, [sidebarWidth]);

  useEffect(() => {
    saveSettings({ sourceLang, targetLang, showSettings, fontSize });
  }, [sourceLang, targetLang, showSettings, fontSize]);

  const handleUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await upload(file);
      e.target.value = '';
    }
  }, [upload]);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      const name = file.name.toLowerCase();
      if (name.endsWith('.epub') || name.endsWith('.pdf')) {
        await upload(file);
      }
    }
  }, [upload]);

  const handleTextSelect = useCallback((text: string) => {
    setSelectedText({ text, ts: Date.now() });
  }, []);

  const handleUrlImport = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlValue.trim()) return;
    setUrlLoading(true);
    setUrlError('');
    try {
      await importFromUrl(urlValue.trim());
      setUrlValue('');
      setShowUrlInput(false);
    } catch (err: any) {
      setUrlError(err?.response?.data?.detail || err?.message || 'Failed to load PDF');
    } finally {
      setUrlLoading(false);
    }
  }, [urlValue, importFromUrl]);

  // Helper: get cover URL based on book type
  const getCoverUrl = (book: typeof books[0]) => {
    if (book.type === 'pdf') return `/api/pdf/${book.id}/cover`;
    return `/api/epub/${book.id}/cover`;
  };

  // ── RENDER ──────────────────────────────────────────
  return (
    <div
      className="h-screen flex flex-col bg-surface-950 text-gray-100"
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      {/* Hidden file input */}
      <input ref={fileInputRef} type="file" accept=".epub,.pdf" onChange={handleUpload} className="hidden" id="epub-upload" />

      {/* Drag overlay */}
      {dragOver && (
        <div className="fixed inset-0 z-50 bg-primary-500/10 border-2 border-dashed border-primary-500/50 flex items-center justify-center pointer-events-none">
          <div className="bg-surface-900/90 rounded-2xl px-12 py-8 text-center backdrop-blur-md">
            <HiOutlineUpload className="w-12 h-12 text-primary-400 mx-auto mb-3" />
            <p className="text-lg font-semibold text-white">Drop your file here</p>
            <p className="text-sm text-surface-200/50 mt-1">EPUB or PDF</p>
          </div>
        </div>
      )}

      {/* ── Header ───────────────────────────────── */}
      <header className="flex items-center justify-between px-6 py-3 bg-surface-900/80 backdrop-blur-md border-b border-surface-700/30 shrink-0">
        <div className="flex items-center gap-3">
          {selectedBook ? (
            <>
              <button
                onClick={() => setSelectedBook(null)}
                className="p-2 rounded-lg text-surface-200/60 hover:text-white hover:bg-surface-800/50 transition-all duration-200"
                title="Back to library"
              >
                <HiOutlineArrowLeft className="w-5 h-5" />
              </button>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-sm font-bold text-white leading-tight truncate max-w-[300px]">
                    {selectedBook.title}
                  </h1>
                  {selectedBook.type === 'pdf' && (
                    <span className="px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded bg-rose-500/20 text-rose-300 border border-rose-500/20">
                      PDF
                    </span>
                  )}
                </div>
                <p className="text-xs text-surface-200/40">{selectedBook.author}</p>
              </div>
            </>
          ) : (
            <>
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center shadow-lg shadow-primary-500/20">
                <HiOutlineBookOpen className="w-5 h-5 text-white" />
              </div>
              <h1 className="text-lg font-bold bg-gradient-to-r from-primary-300 to-primary-500 bg-clip-text text-transparent">
                Tradictionary
              </h1>
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowUrlInput(!showUrlInput)}
            className={`flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-all duration-200 border ${
              showUrlInput
                ? 'bg-primary-600/30 text-primary-300 border-primary-500/30'
                : 'bg-surface-800/50 text-surface-200/60 hover:text-surface-200/90 hover:bg-surface-800/80 border-surface-700/30'
            }`}
            title="Load PDF from URL"
          >
            <HiOutlineLink className="w-4 h-4" />
            <span className="hidden sm:inline">URL</span>
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-primary-600/20 text-primary-300 hover:bg-primary-600/30 hover:text-primary-200 transition-all duration-200 border border-primary-500/20"
          >
            <HiOutlineUpload className="w-4 h-4" />
            Upload
          </button>
          <button
            onClick={() => setShowSettings(!showSettings)}
            className={`p-2 rounded-lg transition-all duration-200 ${
              showSettings
                ? 'bg-primary-600/30 text-primary-300'
                : 'text-surface-200/50 hover:text-surface-200/80 hover:bg-surface-800/50'
            }`}
          >
            <HiOutlineCog className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* ── URL Import Bar ─────────────────────────── */}
      {showUrlInput && (
        <div className="px-6 py-3 bg-surface-900/60 border-b border-surface-700/20 shrink-0">
          <form onSubmit={handleUrlImport} className="flex items-center gap-3">
            <HiOutlineLink className="w-4 h-4 text-surface-200/40 shrink-0" />
            <input
              type="url"
              value={urlValue}
              onChange={(e) => { setUrlValue(e.target.value); setUrlError(''); }}
              placeholder="Paste a PDF URL here..."
              autoFocus
              className="flex-1 bg-surface-800 border border-surface-700/50 rounded-lg px-4 py-2 text-sm text-gray-200 placeholder-surface-200/30 focus:outline-none focus:ring-1 focus:ring-primary-500/50"
            />
            <button
              type="submit"
              disabled={urlLoading || !urlValue.trim()}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-primary-600 text-white hover:bg-primary-500 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {urlLoading ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Loading...
                </>
              ) : (
                'Import'
              )}
            </button>
            <button
              type="button"
              onClick={() => { setShowUrlInput(false); setUrlValue(''); setUrlError(''); }}
              className="p-2 rounded-lg text-surface-200/40 hover:text-surface-200/80 hover:bg-surface-800/50 transition-all duration-200"
            >
              <HiOutlineX className="w-4 h-4" />
            </button>
          </form>
          {urlError && (
            <p className="text-xs text-red-400 mt-2 ml-7">{urlError}</p>
          )}
        </div>
      )}

      {/* ── Settings ─────────────────────────────── */}
      {showSettings && (
        <div className="px-6 py-3 bg-surface-900/60 border-b border-surface-700/20 flex items-center gap-6 shrink-0">
          <div className="flex items-center gap-2">
            <label className="text-xs text-surface-200/50 uppercase tracking-wider">Source</label>
            <select value={sourceLang} onChange={(e) => setSourceLang(e.target.value)}
              className="bg-surface-800 border border-surface-700/50 rounded-lg px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-primary-500/50">
              <option value="auto">Auto-detect</option>
              {LANGUAGES.map(l => (<option key={l.code} value={l.code}>{l.label}</option>))}
            </select>
          </div>
          <span className="text-surface-200/30">→</span>
          <div className="flex items-center gap-2">
            <label className="text-xs text-surface-200/50 uppercase tracking-wider">Target</label>
            <select value={targetLang} onChange={(e) => setTargetLang(e.target.value)}
              className="bg-surface-800 border border-surface-700/50 rounded-lg px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-primary-500/50">
              {LANGUAGES.map(l => (<option key={l.code} value={l.code}>{l.label}</option>))}
            </select>
          </div>
          <div className="flex items-center gap-2 ml-6">
            <label className="text-xs text-surface-200/50 uppercase tracking-wider">Font</label>
            <input type="range" min={10} max={48} step={1} value={fontSize}
              onChange={(e) => setFontSize(Number(e.target.value))} className="w-24 accent-primary-500" />
            <span className="text-xs text-surface-200/60 w-8">{fontSize}px</span>
          </div>
          <span className="text-xs text-surface-200/30 ml-auto">Settings saved automatically</span>
        </div>
      )}

      {/* ── Main: Left content + Right sidebar ─── */}
      <div className="flex-1 flex overflow-hidden">

        {/* LEFT: Reader or Library grid */}
        <main className="flex-1 flex flex-col overflow-hidden min-w-0">
          {selectedBook ? (
            /* Reader with max aspect ratio */
            <div className="flex-1 flex flex-col p-4 overflow-hidden relative">
              {isResizingState && (
                <div className="absolute inset-0 z-50 cursor-col-resize" />
              )}
              <div className="flex-1 w-full max-w-[900px] mx-auto flex flex-col overflow-hidden">
                {selectedBook.type === 'pdf' ? (
                  <PdfReader bookId={selectedBook.id} onTextSelect={handleTextSelect} fontSize={fontSize} />
                ) : (
                  <EpubReader bookId={selectedBook.id} onTextSelect={handleTextSelect} fontSize={fontSize} />
                )}
              </div>
            </div>
          ) : (
            /* Library grid */
            <div className="flex-1 overflow-y-auto px-8 py-6">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
                {/* Add book card */}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="group aspect-[2/3] rounded-xl border-2 border-dashed border-surface-700/40 hover:border-primary-500/50 bg-surface-800/30 hover:bg-surface-800/60 flex flex-col items-center justify-center gap-3 transition-all duration-300"
                >
                  <div className="w-14 h-14 rounded-full bg-primary-500/10 group-hover:bg-primary-500/20 flex items-center justify-center transition-all duration-300">
                    <HiOutlinePlus className="w-7 h-7 text-primary-400/60 group-hover:text-primary-300 transition-colors" />
                  </div>
                  <span className="text-sm text-surface-200/40 group-hover:text-surface-200/70 transition-colors">Add Book</span>
                </button>

                {/* Book cards */}
                {books.map((book) => (
                  <div key={book.id} className="group relative">
                    <button
                      onClick={() => setSelectedBook(book)}
                      className="w-full aspect-[2/3] rounded-xl overflow-hidden bg-surface-800/50 border border-surface-700/30 hover:border-primary-500/40 shadow-lg hover:shadow-primary-500/10 transition-all duration-300 hover:scale-[1.03] flex flex-col"
                    >
                      <div className="flex-1 bg-gradient-to-br from-surface-700/50 to-surface-800/50 flex items-center justify-center overflow-hidden">
                        <img
                          src={getCoverUrl(book)}
                          alt={book.title}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                            (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                          }}
                        />
                        <div className="hidden flex-col items-center justify-center gap-2">
                          <HiOutlineBookOpen className="w-10 h-10 text-surface-200/20" />
                        </div>
                      </div>
                      <div className="px-3 py-2.5 bg-surface-900/80 border-t border-surface-700/20">
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-medium text-surface-200/80 truncate flex-1" title={book.title}>{book.title}</p>
                          {book.type === 'pdf' && (
                            <span className="px-1 py-0.5 text-[9px] font-bold uppercase rounded bg-rose-500/20 text-rose-300 shrink-0">
                              PDF
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-surface-200/40 truncate">{book.author}</p>
                      </div>
                    </button>
                    <button
                      onClick={() => remove(book.id)}
                      className="absolute top-2 right-2 p-1.5 rounded-lg bg-surface-900/70 text-surface-200/30 hover:text-red-400 hover:bg-surface-900/90 opacity-0 group-hover:opacity-100 transition-all duration-200 backdrop-blur-sm"
                      title="Remove book"
                    >
                      <HiOutlineTrash className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>

              {/* Empty state */}
              {books.length === 0 && (
                <div className="flex flex-col items-center justify-center py-24 text-center">
                  <div className="w-24 h-24 rounded-2xl bg-surface-800/50 flex items-center justify-center mb-6 border border-surface-700/20">
                    <HiOutlineBookOpen className="w-12 h-12 text-surface-200/20" />
                  </div>
                  <h2 className="text-xl font-semibold text-surface-200/60 mb-2">Your library is empty</h2>
                  <p className="text-sm text-surface-200/40 mb-6">Upload an EPUB or PDF, drag & drop, or import from a URL</p>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="flex items-center gap-2 px-6 py-3 rounded-xl bg-primary-600 text-white font-medium hover:bg-primary-500 transition-all duration-200 shadow-lg shadow-primary-600/20"
                    >
                      <HiOutlineUpload className="w-5 h-5" />
                      Upload File
                    </button>
                    <button
                      onClick={() => setShowUrlInput(true)}
                      className="flex items-center gap-2 px-6 py-3 rounded-xl bg-surface-800/80 text-surface-200/70 font-medium hover:bg-surface-800 hover:text-white transition-all duration-200 border border-surface-700/30"
                    >
                      <HiOutlineLink className="w-5 h-5" />
                      From URL
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </main>

        {/* RIGHT: Sidebar — Resizable */}
        <div
          className="w-1.5 cursor-col-resize hover:bg-primary-500/50 bg-surface-700/30 transition-colors shrink-0 z-10"
          onMouseDown={startResizing}
        />
        <aside 
          style={{ width: `${sidebarWidth}px` }}
          className="bg-surface-900/40 p-4 flex flex-col shrink-0 overflow-hidden"
        >
          <SearchSidebar
            selectedText={selectedText?.text}
            sourceLang={sourceLang}
            targetLang={targetLang}
            isWide={sidebarWidth > 670}
          />
        </aside>
      </div>
    </div>
  );
}
