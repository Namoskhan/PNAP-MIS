import { useEffect, useState } from 'react';
import { api, errorMessage } from '../api/client';

// useEventSnapshot — fetch a frozen EventConfigSnapshot by its id.
// Use this when rendering an EXISTING Meeting/Activity record that
// has a configSnapshotId — DynamicForm renders against the snapshot
// (not the live config) so historical data shows the labels and
// validation that were in effect when it was recorded.
//
// PR 1 didn't expose a public snapshot lookup endpoint (admin-only
// snapshot preview exists but takes a typeId, not a snapshotId);
// this hook calls the type's preview endpoint as a stand-in until
// PR 4 wires `/api/events/snapshots/:id`. For now most callers will
// pass the live config via `useEventTypeConfig` instead.
export default function useEventSnapshot(snapshotId) {
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancel = false;
    if (!snapshotId) { setSnapshot(null); return; }
    setLoading(true); setError('');
    // Placeholder: PR 4 will expose /api/events/snapshots/:id and
    // this hook will hit that endpoint directly. For now we surface
    // a clear "not implemented" error so callers fall back to
    // useEventTypeConfig.
    setError('Snapshot lookup endpoint lands in PR 4. Use useEventTypeConfig for now.');
    setLoading(false);
    return () => { cancel = true; void cancel; };
  }, [snapshotId]);

  return { snapshot, loading, error };
}
