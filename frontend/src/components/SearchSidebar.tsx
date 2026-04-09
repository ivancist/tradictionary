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

export default function SearchSidebar({ selectedText, sourceLang, targetLang, isWide = false }: Props) {
  const [query, setQuery] = useState('');
  const [displayWord, setDisplayWord] = useState('');
  const { result, loading, error, search, clear } = useSearch();
  const inputRef = useRef<HTMLInputElement>(null);

  // When selectedText changes, auto-populate and search
  useEffect(() => {
    if (selectedText && selectedText.trim()) {
      const text = selectedText.trim();
      setQuery(text);
      setDisplayWord(text);
      search({ text, source_lang: sourceLang, target_lang: targetLang });
    }
  }, [selectedText]);

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
      <form onSubmit={handleSubmit} className="mb-4">
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
        {/* Loading state */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-12 animate-pulse-soft">
            <div className="w-10 h-10 border-3 border-primary-500/30 border-t-primary-500 rounded-full animate-spin mb-4" />
            <p className="text-sm text-surface-200/50">Searching...</p>
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-sm text-red-300">
            {error}
          </div>
        )}

        {/* Results with word header */}
        {!loading && result && (
          <>
            {/* Selected word header */}
            {displayWord && (
              <div className="pb-3 mb-1 border-b border-surface-700/30">
                <h2 className="text-2xl font-bold text-white tracking-tight leading-tight">
                  {displayWord}
                </h2>
              </div>
            )}

            {isWide ? (
              <div className="flex gap-4 items-start w-full">
                {/* Left Column */}
                <div className="flex-1 flex flex-col gap-4 min-w-0">
                  {result.audio_url && (
                    <AudioPlayer audioUrl={result.audio_url} label={displayWord || query} />
                  )}
                  {result.wordreference && (
                    <WordReferenceCard data={result.wordreference} isWide={isWide} hasAudio={!!result.audio_url} />
                  )}
                </div>
                {/* Right Column */}
                <div className="flex-1 flex flex-col gap-4 min-w-0">
                  {result.translation && (
                    <TranslationCard data={result.translation} />
                  )}
                  {result.definition && (
                    <DefinitionCard data={result.definition} />
                  )}
                  {result.images.length > 0 && (
                    <ImageGrid images={result.images} />
                  )}
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-4 w-full">
                {result.audio_url && (
                  <AudioPlayer audioUrl={result.audio_url} label={displayWord || query} />
                )}
                {result.translation && (
                  <TranslationCard data={result.translation} />
                )}
                {result.definition && (
                  <DefinitionCard data={result.definition} />
                )}
                {result.wordreference && (
                  <WordReferenceCard data={result.wordreference} hasAudio={!!result.audio_url} />
                )}
                {result.images.length > 0 && (
                  <ImageGrid images={result.images} />
                )}
              </div>
            )}
          </>
        )}

        {/* Empty state */}
        {!loading && !result && !error && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
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
