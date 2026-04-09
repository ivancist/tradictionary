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

export interface SearchResponse {
  translation: TranslationResponse | null;
  definition: DefinitionResponse | null;
  images: ImageResult[];
  audio_url: string;
}

export interface EpubInfo {
  id: string;
  title: string;
  author: string;
  filename: string;
  cover_url: string;
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
