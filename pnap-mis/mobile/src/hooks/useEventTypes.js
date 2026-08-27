import { useEffect, useState } from 'react';
import { api, errorMessage } from '../api/client';

export default function useEventTypes(entity, body) {
  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    if (!entity) {
      setTypes([]);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const params = { entity };
      if (body === 'EXECUTIVE' || body === 'COMMITTEE') params.body = body;
      const r = await api.get('/events/types', { params });
      setTypes(r.data?.data || []);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [entity, body]);

  return { types, loading, error, refetch: load };
}
