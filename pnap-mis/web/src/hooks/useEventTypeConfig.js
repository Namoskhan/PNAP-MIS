import { useEffect, useState } from 'react';
import { api, errorMessage } from '../api/client';

// useEventTypeConfig — fetch the live EventTypeConfig for a given
// (entity, typeCode). Used by Meeting/Activity create forms in PR 4
// to render the dynamic fields portion of the form.
//
// Returns { config, loading, error, refetch }. The config payload
// already has `fields` populated (server populates active ones).
export default function useEventTypeConfig(entity, typeCode) {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    if (!entity || !typeCode) {
      setConfig(null);
      return;
    }
    setLoading(true); setError('');
    try {
      const r = await api.get('/admin/events/types', { params: { entity } });
      const all = r.data?.data || [];
      const match = all.find((t) => String(t.code).toUpperCase() === String(typeCode).toUpperCase());
      setConfig(match || null);
    } catch (e) { setError(errorMessage(e)); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [entity, typeCode]);

  return { config, loading, error, refetch: load };
}
