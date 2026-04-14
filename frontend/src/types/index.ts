// ── API Types ────────────────────────────────────────────

export interface TranslationResponse {
  translated_text: string;
  source_lang: string;
  target_lang: string;
  examples: string[];
}

export interface DefinitionMeaning {
  part_of_speech: string;
  definitions: string[];
}

export interface DefinitionResponse {
  word: string;
  phonetic: string;
  meanings: DefinitionMeaning[];
  source: string;
}

export interface ImageResult {
  url: string;
  thumbnail: string;
  title: string;
}

export interface WRExample {
  source: string;
  target: string;
}

export interface WREntry {
  source_word: string;
  source_pos: string;
  context: string;
  target_word: string;
  target_pos: string;
  examples: WRExample[];
}

export interface WRCategory {
  title: string;
  entries: WREntry[];
}

export interface WordReferenceResponse {
  word: string;
  categories: WRCategory[];
}

export interface SearchResponse {
  translation: TranslationResponse | null;
  definition: DefinitionResponse | null;
  images: ImageResult[];
  wordreference: WordReferenceResponse | null;
  audio_url: string;
}

export interface EpubInfo {
  id: string;
  title: string;
  author: string;
  filename: string;
  cover_url: string;
  type: 'epub' | 'pdf';
}

export interface EpubLibraryResponse {
  books: EpubInfo[];
}

// ── Request Types ────────────────────────────────────────

export interface SearchRequest {
  text: string;
  source_lang: string;
  target_lang: string;
}
