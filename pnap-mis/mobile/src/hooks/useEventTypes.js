import { useEffect, useState } from 'react';
import { api, errorMessage } from '../api/client';
import { getCache, setCache } from '../services/offlineStorage';

export default function useEventTypes(entity, body) {
  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    if (!entity) {
      setTypes([]);
      return;
    }
    const cacheKey = `event_types_${entity}_${body || 'all'}`;
    setLoading(true);
    setError('');
    try {
      const params = { entity };
      if (body === 'EXECUTIVE' || body === 'COMMITTEE') params.body = body;
      const r = await api.get('/events/types', { params });
      const data = r.data?.data || [];
      setTypes(data);
      await setCache(cacheKey, data);
    } catch (e) {
      const cached = await getCache(cacheKey);
      if (cached && cached.length > 0) {
        setTypes(cached);
      } else {
        // Fallback to generic entity cache if specific body variant wasn't cached
        const generic = await getCache(`event_types_${entity}_all`);
        if (generic && generic.length > 0) {
          setTypes(generic);
        } else {
          setError(errorMessage(e));
        }
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [entity, body]);

  return { types, loading, error, refetch: load };
}
