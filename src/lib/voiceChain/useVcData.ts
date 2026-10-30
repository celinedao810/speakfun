"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { vcFetch } from './client';

/** Last answer per user + path, kept for the lifetime of the page. */
const cache = new Map<string, unknown>();

/** Forget cached answers whose path starts with one of `prefixes` (e.g. after sending a message). */
export function invalidateVc(prefixes: string[]) {
  for (const key of [...cache.keys()]) {
    const path = key.slice(key.indexOf('|') + 1);
    if (prefixes.some(p => path.startsWith(p))) cache.delete(key);
  }
}

/**
 * GET /api/voice-chain/{path}, shown from cache straight away when this tab was
 * opened before, and always refreshed in the background. `path = null` waits.
 */
export function useVcData<T>(path: string | null) {
  const { user } = useAuth();
  const key = user && path ? `${user.id}|${path}` : null;
  const [data, setData] = useState<T | null>(() => (key && cache.has(key) ? (cache.get(key) as T) : null));
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const keyRef = useRef(key);
  keyRef.current = key;

  const load = useCallback(async () => {
    if (!key || !path) return;
    setRefreshing(true);
    try {
      const fresh = await vcFetch<T>(path);
      cache.set(key, fresh);
      if (keyRef.current === key) { setData(fresh); setError(null); }
    } catch (err) {
      // Keep showing cached data if we have it; only surface the error otherwise
      if (keyRef.current === key && !cache.has(key)) setError(err instanceof Error ? err.message : 'Could not load');
    } finally {
      if (keyRef.current === key) setRefreshing(false);
    }
  }, [key, path]);

  useEffect(() => {
    if (!key) return;
    setData(cache.has(key) ? (cache.get(key) as T) : null);
    setError(null);
    void load();
  }, [key, load]);

  return { data, error, refreshing, reload: load };
}
