import { useCallback, useEffect, useRef, useState } from 'react';
import { api, errorMessage } from '../../api/client';

// Shared fetch hook for every analytics section.
//
// Each section owns its own request, which is what makes lazy loading
// real: a section that has never been opened never mounts this hook,
// so it never issues a call. When the scope or window changes, only
// the sections currently mounted refetch.
//
// `silent` refreshes keep the previous data on screen instead of
// flashing a skeleton over numbers the user is reading.
export default function useAnalytics(path, params, { enabled = true, poll = 0 } = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState('');

  // Serialize the params so the effect compares by value — a fresh
  // object literal from the parent would otherwise refetch on every
  // parent render.
  const key = JSON.stringify(params || {});

  // Guards against a slow earlier response overwriting a newer one
  // when the user changes scope faster than the network replies.
  const reqIdRef = useRef(0);

  const load = useCallback(async (silent = false) => {
    if (!enabled) return;
    const id = ++reqIdRef.current;
    if (!silent) setLoading(true);
    try {
      const r = await api.get(path, { params: JSON.parse(key) });
      if (id === reqIdRef.current) {
        setData(r.data.data);
        setError('');
      }
    } catch (e) {
      if (id === reqIdRef.current) setError(errorMessage(e));
    } finally {
      if (id === reqIdRef.current) setLoading(false);
    }
  }, [path, key, enabled]);

  useEffect(() => { load(false); }, [load]);

  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => {
    if (!poll || !enabled) return undefined;
    const tick = () => { if (document.visibilityState === 'visible') loadRef.current(true); };
    const t = setInterval(tick, poll);
    return () => clearInterval(t);
  }, [poll, enabled]);

  return { data, loading, error, reload: load };
}
