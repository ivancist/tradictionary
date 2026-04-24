import { useState, useRef, useEffect } from 'react';
import { HiOutlineSearch, HiOutlineX } from 'react-icons/hi';
import { useSearch } from '../hooks/useSearch';
import TranslationCard from './TranslationCard';
import DefinitionCard from './DefinitionCard';
import WordReferenceCard from './WordReferenceCard';
import ImageGrid from './ImageGrid';
import AudioPlayer from './AudioPlayer';

interface Props {
  selectedText?: string;
  sourceLang: string;
  targetLang: string;
  isWide?: boolean;
}

const Skeleton = ({ h }: { h: string }) => (
  <div className={`w-full bg-surface-800/40 border border-surface-700/30 rounded-xl animate-pulse-soft ${h}`} />
);

export default function SearchSidebar({ selectedText, sourceLang, targetLang, isWide = false }: Props) {
  const [query, setQuery] = useState('');
  const [displayWord, setDisplayWord] = useState('');
  const { result, error, search, clear } = useSearch();
  const inputRef = useRef<HTMLInputElement>(null);

  // When selectedText changes, auto-populate and search
  useEffect(() => {
    if (selectedText && selectedText.trim()) {
      const text = selectedText.trim();
      setQuery(text);
      setDisplayWord(text);
      search({ text, source_lang: sourceLang, target_lang: targetLang });
    }
  }, [selectedText, sourceLang, targetLang, search]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;
    setDisplayWord(trimmed);
    search({ text: trimmed, source_lang: sourceLang, target_lang: targetLang });
  };

  const handleClear = () => {
    setQuery('');
    setDisplayWord('');
    clear();
    inputRef.current?.focus();
  };

  return (
    <div className="flex flex-col h-full">
      {/* Search input */}
      <form onSubmit={handleSubmit} className="mb-4 shrink-0">
        <div className="relative">
          <HiOutlineSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-surface-200/40" />
          <input
            ref={inputRef}
            id="search-input"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search a word or phrase..."
            className="w-full pl-11 pr-10 py-3 bg-surface-800/80 border border-surface-700/50 rounded-xl text-gray-100 placeholder-surface-200/30 focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500/50 transition-all duration-200"
          />
          {query && (
            <button
              type="button"
              onClick={handleClear}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-200/40 hover:text-surface-200/70 transition-colors"
            >
              <HiOutlineX className="w-5 h-5" />
            </button>
          )}
        </div>
      </form>

      {/* Results */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-1 scrollbar-thin">
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-sm text-red-300 shrink-0">
            {error}
          </div>
        )}

        {result ? (
          <>
            {displayWord && (
              <div className="pb-3 mb-1 border-b border-surface-700/30 shrink-0">
                <h2 className="text-2xl font-bold text-white tracking-tight leading-tight truncate" title={displayWord}>
                  {displayWord}
                </h2>
              </div>
            )}

            {isWide ? (
              <div className="flex gap-4 items-start w-full">
                {/* Left Column */}
                <div className="flex-1 flex flex-col gap-4 min-w-0">
                  {result.audio_url ? (
                    <AudioPlayer audioUrl={result.audio_url} label={displayWord || query} />
                  ) : (
                    <Skeleton h="h-14" />
                  )}
                  
                  {result.wordCount <= 4 && (
                    result.wordreference ? (
                      <WordReferenceCard data={result.wordreference} isWide={isWide} hasAudio={!!result.audio_url} />
                    ) : (
                      <Skeleton h="h-64" />
                    )
                  )}
                </div>
                {/* Right Column */}
                <div className="flex-1 flex flex-col gap-4 min-w-0">
                  {result.translation ? (
                    <TranslationCard data={result.translation} />
                  ) : (
                    <Skeleton h="h-32" />
                  )}
                  
                  {result.wordCount <= 4 && (
                    result.definition ? (
                      <DefinitionCard data={result.definition} />
                    ) : (
                      <Skeleton h="h-40" />
                    )
                  )}
                  
                  {result.wordCount <= 4 && (
                    result.images ? (
                      result.images.length > 0 && <ImageGrid images={result.images} />
                    ) : (
                      <Skeleton h="h-40" />
                    )
                  )}
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-4 w-full">
                {result.audio_url ? (
                  <AudioPlayer audioUrl={result.audio_url} label={displayWord || query} />
                ) : (
                  <Skeleton h="h-14" />
                )}
                
                {result.translation ? (
                  <TranslationCard data={result.translation} />
                ) : (
                  <Skeleton h="h-32" />
                )}
                
                {result.wordCount <= 4 && (
                  result.definition ? (
                    <DefinitionCard data={result.definition} />
                  ) : (
                    <Skeleton h="h-40" />
                  )
                )}
                
                {result.wordCount <= 4 && (
                  result.wordreference ? (
                    <WordReferenceCard data={result.wordreference} hasAudio={!!result.audio_url} />
                  ) : (
                    <Skeleton h="h-64" />
                  )
                )}
                
                {result.wordCount <= 4 && (
                  result.images ? (
                    result.images.length > 0 && <ImageGrid images={result.images} />
                  ) : (
                    <Skeleton h="h-40" />
                  )
                )}
              </div>
            )}
          </>
        ) : !error && (
          <div className="flex flex-col items-center justify-center py-16 text-center h-full">
            <div className="w-16 h-16 rounded-full bg-primary-500/10 flex items-center justify-center mb-4">
              <HiOutlineSearch className="w-8 h-8 text-primary-500/40" />
            </div>
            <p className="text-surface-200/50 text-sm">
              Search for a word, or select text in the reader
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
