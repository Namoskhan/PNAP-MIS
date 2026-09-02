import { useCallback, useEffect, useRef, useState } from 'react';
import { api, errorMessage } from '../api/client';

/**
 * Shared fetch hook for analytics sections in mobile dashboard.
 * Supports silent updates, parameter change tracking, and polling.
 */
export default function useAnalytics(path, params, { enabled = true, poll = 0 } = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState('');

  const key = JSON.stringify(params || {});
  const reqIdRef = useRef(0);

  const load = useCallback(async (silent = false) => {
    if (!enabled) return;
    const id = ++reqIdRef.current;
    if (!silent) setLoading(true);
    try {
      const r = await api.get(path, { params: JSON.parse(key) });
      if (id === reqIdRef.current) {
        setData(r.data?.data);
        setError('');
      }
    } catch (e) {
      if (id === reqIdRef.current) setError(errorMessage(e));
    } finally {
      if (id === reqIdRef.current) setLoading(false);
    }
  }, [path, key, enabled]);

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
