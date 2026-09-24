import { useCallback, useEffect, useRef, useState } from 'react';
import { api, errorMessage, isNetworkError } from '../api/client';
import { getCache, setCache } from '../services/offlineStorage';

/**
 * Shared fetch hook for analytics sections in mobile dashboard.
 * Supports silent updates, parameter change tracking, polling, and offline caching.
 */
export default function useAnalytics(path, params, { enabled = true, poll = 0 } = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState('');

  const key = JSON.stringify(params || {});
  const cacheKey = `analytics_${path.replace(/[^a-zA-Z0-9_-]/g, '_')}_${key}`;
  const reqIdRef = useRef(0);

  // Load from cache on first render or param change
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    getCache(cacheKey).then((cached) => {
      if (active && cached) {
        setData(cached);
        setLoading(false);
      }
    }).catch(() => {});
    return () => { active = false; };
  }, [cacheKey, enabled]);

  const load = useCallback(async (silent = false) => {
    if (!enabled) return;
    const id = ++reqIdRef.current;
    if (!silent && !data) setLoading(true);
    try {
      const r = await api.get(path, { params: JSON.parse(key) });
      if (id === reqIdRef.current) {
        const fetchedData = r.data?.data;
        setData(fetchedData);
        setError('');
        if (fetchedData) {
          setCache(cacheKey, fetchedData).catch(() => {});
        }
      }
    } catch (e) {
      if (id === reqIdRef.current) {
        if (!isNetworkError(e) || !data) {
          setError(errorMessage(e));
        }
      }
    } finally {
      if (id === reqIdRef.current) setLoading(false);
    }
  }, [path, key, enabled, cacheKey, data]);

  useEffect(() => {
    load(false);
  }, [load]);

  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    if (!poll || !enabled) return undefined;
    const t = setInterval(() => {
      loadRef.current(true);
    }, poll);
    return () => clearInterval(t);
  }, [poll, enabled]);

  return { data, loading, error, reload: load };
}
