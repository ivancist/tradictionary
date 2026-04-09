import axios from 'axios';
import type { SearchRequest, SearchResponse, EpubLibraryResponse, EpubInfo } from '../types';

const api = axios.create({
  baseURL: '/api',
  timeout: 120000, // LLM calls can be slow
});

export async function unifiedSearch(req: SearchRequest): Promise<SearchResponse> {
  const { data } = await api.post<SearchResponse>('/search', req);
  return data;
}

export async function uploadEpub(file: File): Promise<EpubInfo> {
  const form = new FormData();
  form.append('file', file);
  const { data } = await api.post<EpubInfo>('/epub/upload', form);
  return data;
}

export async function getLibrary(): Promise<EpubLibraryResponse> {
  const { data } = await api.get<EpubLibraryResponse>('/epub/library');
  return data;
}

export async function deleteBook(bookId: string): Promise<void> {
  await api.delete(`/epub/${bookId}`);
}

export function getEpubUrl(bookId: string): string {
  return `/api/epub/${bookId}`;
}

export function getTtsUrl(text: string, lang: string): string {
  return `/api/tts?text=${encodeURIComponent(text)}&lang=${encodeURIComponent(lang)}`;
}

export default api;
