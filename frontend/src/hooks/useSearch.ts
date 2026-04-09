import { useState, useCallback } from 'react';
import type { SearchResponse, SearchRequest } from '../types';
import { unifiedSearch } from '../services/api';

export function useSearch() {
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = useCallback(async (req: SearchRequest) => {
    setLoading(true);
    setError(null);
    try {
      const data = await unifiedSearch(req);
      setResult(data);
    } catch (err: any) {
      const msg = err?.response?.data?.detail || err?.message || 'Search failed';
      setError(msg);
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const clear = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  return { result, loading, error, search, clear };
}
