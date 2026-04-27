import { useState, useCallback, useRef } from 'react';
import type { SearchRequest, TranslationResponse, DefinitionResponse, WordReferenceResponse, ImageResult } from '../types';
import { searchTranslation, searchDefinition, searchImages, searchWordReference, getTtsUrl } from '../services/api';

export interface PartialResults {
  translation?: TranslationResponse;
  definitionSrc?: DefinitionResponse;
  definitionTgt?: DefinitionResponse;
  wordreference?: WordReferenceResponse;
  images?: ImageResult[];
  imagesSrc?: ImageResult[];
  imagesTgt?: ImageResult[];
  imagesMain?: ImageResult[];
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
        const baseState = { ...(prev || { wordCount }), ...partial };
        
        // Desired Order: [Source Definitions, Target Definitions, Main/Wikimedia Search]
        const src = baseState.imagesSrc || [];
        const tgt = baseState.imagesTgt || [];
        const main = baseState.imagesMain || [];
        
        const merged: ImageResult[] = [];
        const urls = new Set<string>();
        
        const addImages = (list: ImageResult[]) => {
          for (const img of list) {
            if (!urls.has(img.url)) {
              merged.push(img);
              urls.add(img.url);
            }
          }
        };
        
        addImages(src);
        addImages(tgt);
        addImages(main);
        
        return { ...baseState, images: merged.slice(0, 6) };
      });
    };

    // Immediate audio fetch
    const ttsLang = req.source_lang !== 'auto' ? req.source_lang : req.target_lang;
    update({ audio_url: getTtsUrl(req.text, ttsLang) });
    
    if (wordCount <= 4) {
      // Parallel non-blocking sources
      if (req.source_lang !== 'auto') {
        searchDefinition({ word: req.text, lang: req.source_lang })
          .then(d => update({ definitionSrc: d, imagesSrc: d.images }))
          .catch(e => console.error("Definition (src) fail", e));
      }
        
      searchImages(req.text)
        .then(i => update({ imagesMain: i }))
        .catch(e => console.error("Images fail", e));

      // Sequential: WR -> Translation -> Target Definition
      searchWordReference(req)
        .then(w => {
           update({ wordreference: w });
           
           let wr_context = "";
           let topTargetWord = "";
           
           if (w.categories && w.categories.length > 0) {
              const entries = w.categories.flatMap(c => c.entries).slice(0, 10); // Look deeper
              const allWrTargetWords = entries.map(e => e.target_word).filter(Boolean);
              
              const wordsToTry: string[] = [];
              // Add all words from WR first
              allWrTargetWords.forEach(w => {
                wordsToTry.push(...w.split(','));
              });
              
              searchTranslation({ text: req.text, source_lang: req.source_lang, target_lang: req.target_lang, wr_context: wr_context || undefined })
                .then(t => {
                  update({ translation: t });
                  
                  // Add Google translation as fallback at the end
                  if (t.translated_text) wordsToTry.push(...t.translated_text.split(','));
                  
                  // Filter and clean wordsToTry
                  const uniqueCandidates = Array.from(new Set(
                    wordsToTry
                      .map(w => w.trim().replace(/[⇒⇐]/g, ''))
                      .filter(w => w && w !== '-' && w.length > 1)
                  ));

                  // If source lang was auto, fetch definition if we haven't
                  if (req.source_lang === 'auto' && t.source_lang) {
                     searchDefinition({ word: req.text, lang: t.source_lang })
                       .then(d => update({ definitionSrc: d, imagesSrc: d.images }))
                       .catch();
                  }

                  // Try candidates until one works
                  const tryNextDefinition = (index: number) => {
                    if (index >= uniqueCandidates.length) return;
                    
                    const cleanWord = uniqueCandidates[index]
                      .replace(/^(il|lo|la|i|gli|le|una|uno|un|to|el|los|las|a|an)\s+/i, '');
                    
                    searchDefinition({ word: cleanWord, lang: req.target_lang })
                      .then(d => {
                        if (d && d.meanings && d.meanings.length > 0) {
                          update({ definitionTgt: d, imagesTgt: d.images });
                        } else {
                          tryNextDefinition(index + 1);
                        }
                      })
                      .catch(() => tryNextDefinition(index + 1));
                  };
                  
                  tryNextDefinition(0);
                })
                .catch();
           } else {
              // No WR results, just use translator
              searchTranslation({ text: req.text, source_lang: req.source_lang, target_lang: req.target_lang })
                .then(t => {
                   update({ translation: t });
                   if (req.source_lang === 'auto' && t.source_lang) {
                      searchDefinition({ word: req.text, lang: t.source_lang })
                        .then(d => update({ definitionSrc: d, imagesSrc: d.images }))
                        .catch();
                   }
                   if (t.translated_text) {
                      const wordsToTry = t.translated_text.split(',').map(w => w.trim().replace(/[⇒⇐]/g, '')).filter(w => w && w !== '-' && w.length > 1);
                      const tryNext = (idx: number) => {
                        if (idx >= wordsToTry.length) return;
                        const clean = wordsToTry[idx].replace(/^(il|lo|la|i|gli|le|una|uno|un|to|el|los|las|a|an)\s+/i, '');
                        searchDefinition({ word: clean, lang: req.target_lang })
                          .then(d => {
                            if (d && d.meanings && d.meanings.length > 0) {
                              update({ definitionTgt: d, imagesTgt: d.images });
                            } else {
                              tryNext(idx + 1);
                            }
                          })
                          .catch(() => tryNext(idx + 1));
                      };
                      tryNext(0);
                   }
                })
                .catch();
           }
        })
        .catch(e => {
           console.error("WordReference fail", e);
           // Fallback if WR throws network error
           searchTranslation({ text: req.text, source_lang: req.source_lang, target_lang: req.target_lang })
             .then(t => {
               update({ translation: t });
               
               if (req.source_lang === 'auto' && t.source_lang) {
                  searchDefinition({ word: req.text, lang: t.source_lang })
                    .then(d => update({ definitionSrc: d, imagesSrc: d.images }))
                    .catch();
               }

               if (t.translated_text) {
                 const wordsToTry = t.translated_text.split(',');
                 const tryNext = (idx: number) => {
                   if (idx >= wordsToTry.length) return;
                   const clean = wordsToTry[idx].trim().replace(/[⇒⇐]/g, '').replace(/^(il|lo|la|i|gli|le|una|uno|un|to|el|los|las|a|an)\s+/i, '');
                   searchDefinition({ word: clean, lang: req.target_lang })
                    .then(d => {
                      if (d && d.meanings && d.meanings.length > 0) {
                        update({ definitionTgt: d, imagesTgt: d.images });
                      } else {
                        tryNext(idx + 1);
                      }
                    })
                    .catch(() => tryNext(idx + 1));
                 };
                 tryNext(0);
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
