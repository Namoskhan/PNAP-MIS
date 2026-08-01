import { useEffect, useState } from 'react';
import { api, errorMessage } from '../api/client';

// useEventTypes — fetch the active list of EventTypeConfig rows from
// the public /api/events/types endpoint, optionally filtered by body.
// Used by Meeting/Activity create + edit dialogs to populate the type
// picker AND to source the resolved field set (each row carries
// `fields[]` already populated server-side).
//
// Returns:
//   { types, loading, error, refetch }
//
// Note: each `type` row already has `fields[]` populated with the
// active FieldDefinition documents — DynamicForm can render against
// it directly without a second round trip.
export default function useEventTypes(entity, body) {
  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    if (!entity) { setTypes([]); return; }
    setLoading(true); setError('');
    try {
      const params = { entity };
      if (body === 'EXECUTIVE' || body === 'COMMITTEE') params.body = body;
      const r = await api.get('/events/types', { params });
      setTypes(r.data?.data || []);
    } catch (e) { setError(errorMessage(e)); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [entity, body]);
  return { types, loading, error, refetch: load };
}
