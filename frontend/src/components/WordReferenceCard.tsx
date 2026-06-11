import { useState, useMemo, useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import type { WordReferenceResponse, WREntry } from '../types';
import { HiOutlineBookmarkAlt, HiOutlineChevronLeft, HiOutlineChevronRight } from 'react-icons/hi';

export interface WordReferenceCardHandle {
  navigate: (dir: 'prev' | 'next') => void;
}

interface Props {
  data: WordReferenceResponse;
  isWide?: boolean;
  hasAudio?: boolean;
}

const WordReferenceCard = forwardRef<WordReferenceCardHandle, Props>(function WordReferenceCard(
  { data, isWide = false, hasAudio = false }, ref
) {
  const [availableHeight, setAvailableHeight] = useState(600);
  const [history, setHistory] = useState<number[]>([0]);

  // Dynamically calculate available viewport height
  useEffect(() => {
    const updateSize = () => {
      // Offset calculation for elements competing vertically with the list:
      // Navbar (65), Sidebar Pad (32), Search Bar (61), WR Card Frame (86) + extra bottom buffer (30)
      const baseOffset = 274;
      const offset = baseOffset + (hasAudio ? 64 : 0);
      
      const h = window.innerHeight - offset;
      setAvailableHeight(Math.max(200, h));
    };

    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, [hasAudio]);

  // Flatten the entries
  const flatEntries = useMemo(() => {
    const list: { categoryTitle: string; entry: WREntry }[] = [];
    data.categories.forEach((cat) => {
      cat.entries.forEach((entry) => {
        list.push({ categoryTitle: cat.title, entry });
      });
    });
    return list;
  }, [data]);

  // Reset pagination on new search
  useEffect(() => {
    setHistory([0]);
  }, [flatEntries]);

  const startIndex = history[history.length - 1] || 0;

  // Mathematically calculate how many items fit exactly without overflowing
  const { visibleEntries, nextIndex } = useMemo(() => {
    let sumStrut = 0;
    let endIdx = startIndex;
    let currentCategory = "";

    for (let i = startIndex; i < flatEntries.length; i++) {
      const item = flatEntries[i];
      const isNewCat = item.categoryTitle !== currentCategory;
      
      // Advanced Prediction Algorithm for element DOM height with text wrap detection
      // Base space: p-3 (24px) + space-y-3 (12px) + borders/safety (15px) = 51px
      let elementHeight = 51; 

      // 1. Appraise Source text line wrapping (~40 chars per line in a 300px bound)
      const sourceStrLength = item.entry.source_word.length + (item.entry.source_pos?.length || 0) + (item.entry.context?.length || 0);
      const sourceLines = Math.max(1, Math.ceil(sourceStrLength / 40));
      elementHeight += sourceLines * 24;

      // 2. Appraise Target text line wrapping
      const targetStrLength = item.entry.target_word.length + (item.entry.target_pos?.length || 0);
      const targetLines = Math.max(1, Math.ceil(targetStrLength / 45));
      elementHeight += targetLines * 20;

      // Internal layout gaps and margins
      elementHeight += 10; 

      // 3. Appraise Examples text wrapping (text-xs = ~55 chars per line)
      if (item.entry.examples.length > 0) {
        elementHeight += 12; // top margin for examples block
        item.entry.examples.forEach(ex => {
          const sLines = Math.max(1, Math.ceil(ex.source.length / 55));
          const tLines = Math.max(1, Math.ceil(ex.target.length / 55));
          elementHeight += (sLines * 16) + (tLines * 16) + 4; // 16px per line + internal gap
        });
      }
      
      // 4. Cater for Category Section Headers
      if (isNewCat && i !== startIndex) elementHeight += 44; 
      else if (isNewCat && i === startIndex) elementHeight += 28;

      // Stop accumulating if it exceeds our precise container (unless it's the very first item)
      if (i > startIndex && sumStrut + elementHeight > availableHeight) {
        break;
      }

      sumStrut += elementHeight;
      currentCategory = item.categoryTitle;
      endIdx = i + 1;
    }

    return {
      visibleEntries: flatEntries.slice(startIndex, endIdx),
      nextIndex: endIdx
    };
  }, [flatEntries, startIndex, availableHeight]);

  // Regroup current page entries by category title
  const grouped = visibleEntries.reduce((acc, item) => {
    if (!acc[item.categoryTitle]) acc[item.categoryTitle] = [];
    acc[item.categoryTitle].push(item.entry);
    return acc;
  }, {} as Record<string, WREntry[]>);

  if (!flatEntries.length) return null;

  const hasNext = nextIndex < flatEntries.length;
  const hasPrev = history.length > 1;

  const handleNext = () => { if (hasNext) setHistory(p => [...p, nextIndex]); };
  const handlePrev = () => { if (hasPrev) setHistory(p => p.slice(0, -1)); };

  // Expose navigate() to the parent via ref
  useImperativeHandle(ref, () => ({
    navigate: (dir) => { if (dir === 'next') handleNext(); else handlePrev(); },
  }), [hasNext, hasPrev, nextIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="bg-surface-800/60 backdrop-blur-sm rounded-xl border border-surface-700/50 p-4 sm:p-5 animate-fade-in relative shadow-lg">
      <div className="flex items-center justify-between mb-4 gap-2">
        {/* Title & Count */}
        <div className="flex items-start gap-2 min-w-0">
          <HiOutlineBookmarkAlt className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
          <div className="flex flex-col min-w-0">
            <h3 className="text-sm font-semibold text-indigo-300 uppercase tracking-wider truncate">WordReference</h3>
            <span className="text-[11px] text-surface-200/50 italic mt-0.5">
              {flatEntries.length} risultati
            </span>
          </div>
        </div>

        {/* Pagination in header */}
        {(hasPrev || hasNext || startIndex > 0) && (
          <div className="flex items-center gap-1 bg-surface-700/30 rounded-lg p-0.5 border border-surface-700/50 shrink-0">
            <button
              onClick={handlePrev}
              disabled={!hasPrev}
              className="p-1 rounded-md text-surface-200/60 hover:text-indigo-300 hover:bg-surface-700/50 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              <HiOutlineChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-[10px] uppercase font-bold text-surface-200/40 min-w-[50px] text-center tracking-wider shrink-0">
              {startIndex + 1}-{Math.min(startIndex + visibleEntries.length, flatEntries.length)} / {flatEntries.length}
            </span>
            <button
              onClick={handleNext}
              disabled={!hasNext}
              className="p-1 rounded-md text-surface-200/60 hover:text-indigo-300 hover:bg-surface-700/50 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              <HiOutlineChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      <div className="space-y-4">
        {Object.entries(grouped).map(([categoryTitle, entries], idx) => (
          <div key={`${categoryTitle}-${idx}`} className="space-y-2">
            <h4 className="text-xs font-bold text-surface-200/50 uppercase tracking-wide border-b border-surface-700/50 pb-1 mb-2">
              {categoryTitle}
            </h4>
            
            <div className="space-y-3">
              {entries.map((entry, eIdx) => (
                <div key={eIdx} className="bg-surface-800/40 p-3 rounded-lg border border-surface-700/30 shadow-sm transition-colors hover:border-indigo-500/20">
                  <div className="flex flex-col gap-1 mb-1.5">
                    {/* Source Word */}
                    <div className="flex items-baseline gap-1.5 flex-wrap">
                      <span className="text-[15px] font-bold text-white">{entry.source_word}</span>
                      {entry.source_pos && (
                        <span className="text-xs font-mono text-indigo-300/80">{entry.source_pos}</span>
                      )}
                      {entry.context && (
                        <span className="text-xs italic text-surface-200/50">({entry.context})</span>
                      )}
                    </div>
                    {/* Target Word */}
                    <div className="flex items-baseline gap-1.5 flex-wrap mt-0.5">
                      <span className="text-[14px] font-medium text-emerald-300">{entry.target_word}</span>
                      {entry.target_pos && (
                        <span className="text-[11px] font-mono text-emerald-300/60">{entry.target_pos}</span>
                      )}
                    </div>
                  </div>

                  {/* Examples */}
                  {entry.examples.length > 0 && (
                    <div className="mt-2 space-y-1.5 pl-3 border-l-2 border-surface-700/50">
                      {entry.examples.map((ex, xIdx) => (
                        <div key={xIdx} className="flex flex-col text-xs space-y-0.5">
                          <span className="text-surface-200/80">{ex.source}</span>
                          <span className="text-surface-200/50 italic">{ex.target}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});

export default WordReferenceCard;
