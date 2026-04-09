import { useState, useEffect, useCallback } from 'react';
import type { EpubInfo } from '../types';
import { getLibrary, uploadEpub, deleteBook } from '../services/api';

export function useEpub() {
  const [books, setBooks] = useState<EpubInfo[]>([]);
  const [selectedBook, setSelectedBook] = useState<EpubInfo | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const { books: list } = await getLibrary();
      setBooks(list);
    } catch {
      // Library might not exist yet
      setBooks([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const upload = useCallback(async (file: File) => {
    setLoading(true);
    try {
      const info = await uploadEpub(file);
      setBooks(prev => [...prev, info]);
      setSelectedBook(info);
      return info;
    } finally {
      setLoading(false);
    }
  }, []);

  const remove = useCallback(async (bookId: string) => {
    await deleteBook(bookId);
    setBooks(prev => prev.filter(b => b.id !== bookId));
    if (selectedBook?.id === bookId) {
      setSelectedBook(null);
    }
  }, [selectedBook]);

  return { books, selectedBook, setSelectedBook, loading, upload, remove, refresh };
}
