import { useState, useCallback, useRef } from 'react';
import type { SearchRequest, TranslationResponse, DefinitionResponse, WordReferenceResponse, ImageResult } from '../types';
import { searchTranslation, searchDefinition, searchImages, searchWordReference, getTtsUrl } from '../services/api';

export interface PartialResults {
  translation?: TranslationResponse;
  definitionSrc?: DefinitionResponse;
  definitionTgt?: DefinitionResponse;
  wordreference?: WordReferenceResponse;
  images?: ImageResult[];
  audio_url?: string;
  wordCount: number;
}

export function useSearch() {
  const [result, setResult] = useState<PartialResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const searchIdRef = useRef(0);
  const lastQueryRef = useRef('');

  // Debouncing logic between fast repeated searches, but NO debounce for the first one.
  const lastFireTimeRef = useRef(0);
  const debounceTimerRef = useRef<any>(null);

  const _doSearch = useCallback(async (req: SearchRequest, id: number) => {
    setLoading(true);
    setError(null);
    
    const wordCount = req.text.trim().split(/\s+/).length;
    // Set initial result
    setResult({ wordCount });
    
    // We update results progressively by doing functionally pure updates
    const update = (partial: Partial<PartialResults>) => {
      setResult(prev => {
        if (searchIdRef.current !== id) return prev;
        return { ...(prev || { wordCount }), ...partial };
      });
    };

    // Immediate audio fetch
    const ttsLang = req.source_lang !== 'auto' ? req.source_lang : req.target_lang;
    update({ audio_url: getTtsUrl(req.text, ttsLang) });
    
    if (wordCount <= 4) {
      const actualSourceLang = req.source_lang === 'auto' ? 'en' : req.source_lang;

      // Parallel non-blocking sources
      searchDefinition({ word: req.text, lang: actualSourceLang })
        .then(d => update({ definitionSrc: d }))
        .catch(e => console.error("Definition (src) fail", e));
        
      searchImages(req.text)
        .then(i => update({ images: i }))
        .catch(e => console.error("Images fail", e));

      // Sequential: WR -> Translation -> Target Definition
      searchWordReference(req)
        .then(w => {
           update({ wordreference: w });
           
           let wr_context = "";
           let topTargetWord = "";
           
           if (w.categories && w.categories.length > 0) {
              const entries = w.categories.flatMap(c => c.entries).slice(0, 4);
              if (entries.length > 0) {
                 topTargetWord = entries[0].target_word;
                 wr_context = entries.map((e, i) => {
                   const posTag = e.source_pos
                     ? `(${e.source_pos}${e.context ? ` - ${e.context}` : ''})`
                     : e.context ? `(${e.context})` : '';
                   return `${i + 1}. ${posTag} ${e.source_word} -> ${e.target_word}`;
                 }).join('\n');
              }
           }
           
           searchTranslation({ text: req.text, source_lang: req.source_lang, target_lang: req.target_lang, wr_context: wr_context || undefined })
             .then(t => {
               update({ translation: t });
               
               const wordForDef = topTargetWord || t.translated_text;
               if (wordForDef) {
                 const cleanWord = wordForDef.split(',')[0].trim().replace(/^(il|lo|la|i|gli|le|una|uno|un|to|el|los|las)\s+/i, '');
                 searchDefinition({ word: cleanWord, lang: req.target_lang })
                   .then(d => update({ definitionTgt: d }))
                   .catch();
               }
             })
             .catch();
        })
        .catch(e => {
           console.error("WordReference fail", e);
           // Fallback if WR throws network error
           searchTranslation({ text: req.text, source_lang: req.source_lang, target_lang: req.target_lang })
             .then(t => {
               update({ translation: t });
               if (t.translated_text) {
                 searchDefinition({ word: t.translated_text, lang: req.target_lang })
                   .then(d => update({ definitionTgt: d }))
                   .catch();
               }
             })
             .catch();
        });
    } else {
       // Long texts bypass WR entirely
       searchTranslation({ text: req.text, source_lang: req.source_lang, target_lang: req.target_lang })
         .then(t => update({ translation: t }))
         .catch(e => console.error("Translation fail", e));
    }
    
    setTimeout(() => {
        if (searchIdRef.current === id) setLoading(false);
    }, 100);
  }, []);

  const search = useCallback((req: SearchRequest) => {
    const text = req.text.trim();
    if (!text) return;
    
    // Prevent exactly same query repetition
    if (lastQueryRef.current === text) return;
    lastQueryRef.current = text;

    const now = Date.now();
    const timeSinceLastFire = now - lastFireTimeRef.current;
    
    const id = ++searchIdRef.current;
    
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    
    // If it's been more than 400ms since last search, search immediately
    if (timeSinceLastFire > 400) {
      lastFireTimeRef.current = now;
      _doSearch({ ...req, text }, id);
    } else {
      // Debounce if multiple requests are coming fast
      debounceTimerRef.current = setTimeout(() => {
        lastFireTimeRef.current = Date.now();
        _doSearch({ ...req, text }, id);
      }, 400);
    }
  }, [_doSearch]);

  const clear = useCallback(() => {
    setResult(null);
    setError(null);
    lastQueryRef.current = '';
    searchIdRef.current++;
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
  }, []);

  return { result, loading, error, search, clear };
}
