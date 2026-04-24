import { useState, useEffect, useCallback } from 'react';
import type { EpubInfo } from '../types';
import { getLibrary, uploadEpub, deleteBook, uploadPdf, loadPdfFromUrl, deletePdf } from '../services/api';

export function useEpub() {
  const [books, setBooks] = useState<EpubInfo[]>([]);
  const [selectedBook, setSelectedBook] = useState<EpubInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [initialized, setInitialized] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const { books: list } = await getLibrary();
      setBooks(list);
      
      const savedId = localStorage.getItem('tradictionary-selected-book');
      if (savedId) {
        const book = list.find(b => b.id === savedId);
        if (book) setSelectedBook(book);
      }
    } catch {
      // Library might not exist yet
      setBooks([]);
    } finally {
      setLoading(false);
      setInitialized(true);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!initialized) return;
    if (selectedBook) {
      localStorage.setItem('tradictionary-selected-book', selectedBook.id);
    } else {
      localStorage.removeItem('tradictionary-selected-book');
    }
  }, [selectedBook, initialized]);

  const upload = useCallback(async (file: File) => {
    setLoading(true);
    try {
      const ext = file.name.toLowerCase().split('.').pop();
      let info: EpubInfo;

      if (ext === 'pdf') {
        info = await uploadPdf(file);
      } else {
        info = await uploadEpub(file);
      }

      setBooks(prev => [...prev, info]);
      setSelectedBook(info);
      return info;
    } finally {
      setLoading(false);
    }
  }, []);

  const importFromUrl = useCallback(async (url: string) => {
    setLoading(true);
    try {
      const info = await loadPdfFromUrl(url);
      setBooks(prev => [...prev, info]);
      setSelectedBook(info);
      return info;
    } finally {
      setLoading(false);
    }
  }, []);

  const remove = useCallback(async (bookId: string) => {
    const book = books.find(b => b.id === bookId);
    if (book?.type === 'pdf') {
      await deletePdf(bookId);
    } else {
      await deleteBook(bookId);
    }
    setBooks(prev => prev.filter(b => b.id !== bookId));
    if (selectedBook?.id === bookId) {
      setSelectedBook(null);
    }
  }, [selectedBook, books]);

  return { books, selectedBook, setSelectedBook, loading, upload, remove, refresh, importFromUrl };
}
