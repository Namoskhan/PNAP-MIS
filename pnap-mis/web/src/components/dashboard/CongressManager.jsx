import { useCallback, useEffect, useState } from 'react';
import { api, errorMessage } from '../../api/client';
import { TrashIcon } from '../icons';

// Compact manager for the National Congress calendar.
//
// Lives inside the Meetings section rather than behind its own admin
// route, so the existing route table and sidebar stay untouched. It is
// only shown when Congress-to-Congress reporting is selected, which is
// the one moment the dates matter.
//
// Only the Congress EVENTS are edited here. Periods are derived
// server-side by walking them in date order, so there is no way for
// two rows to disagree about where a period begins.

function toDateInput(iso) {
  return iso ? new Date(iso).toISOString().slice(0, 10) : '';
}

export default function CongressManager({ onChanged }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState({ label: '', heldOn: '' });
  const [editing, setEditing] = useState(null); // { _id, label, heldOn }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get('/central/congresses');
      setItems(r.data.data || []);
      setErr('');
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Every mutation refreshes the list AND tells the parent to refetch
  // its analytics — the period boundaries it is charting just moved.
  async function mutate(fn) {
    setBusy(true);
    setErr('');
    try {
      await fn();
      await load();
      if (onChanged) onChanged();
      return true;
    } catch (e) {
      setErr(errorMessage(e));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function add(e) {
    e.preventDefault();
    if (!draft.label.trim() || !draft.heldOn) return;
    const okDone = await mutate(() => api.post('/central/congresses', draft));
    if (okDone) setDraft({ label: '', heldOn: '' });
  }

  async function saveEdit() {
    const okDone = await mutate(() => api.patch(`/central/congresses/${editing._id}`, {
      label: editing.label,
      heldOn: editing.heldOn,
    }));
    if (okDone) setEditing(null);
  }

  return (
    <div style={{
      marginTop: 10, padding: 12,
      border: '1px dashed var(--border-strong)', borderRadius: 'var(--radius)',
    }}>
      <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 2 }}>Congress calendar</div>
      <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
        Each Congress is a period boundary. A period runs from one Congress to the
        next; the most recent opens a period that is still running.
      </div>

      {err && <div className="alert error" style={{ marginBottom: 10 }}>{err}</div>}

      {loading ? (
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>Loading…</p>
      ) : items.length === 0 ? (
        <p className="muted" style={{ margin: '0 0 10px', fontSize: 13 }}>
          No Congresses recorded yet. Add at least two to get a closed reporting period.
        </p>
      ) : (
        <div style={{ overflowX: 'auto', marginBottom: 10 }}>
          <table className="list">
            <thead>
              <tr>
                <th>Congress</th>
                <th>Held on</th>
                <th style={{ width: 150 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((c) => (
                <tr key={c._id}>
                  <td>
                    {editing?._id === c._id ? (
                      <input
                        value={editing.label}
                        onChange={(e) => setEditing({ ...editing, label: e.target.value })}
                        style={{ width: '100%' }}
                      />
                    ) : <strong>{c.label}</strong>}
                  </td>
                  <td>
                    {editing?._id === c._id ? (
                      <input
                        type="date"
                        value={editing.heldOn}
                        onChange={(e) => setEditing({ ...editing, heldOn: e.target.value })}
                      />
                    ) : new Date(c.heldOn).toLocaleDateString()}
                  </td>
                  <td>
                    {editing?._id === c._id ? (
                      <>
                        <button type="button" className="btn sm" disabled={busy} onClick={saveEdit}>Save</button>
                        <button type="button" className="btn ghost sm" onClick={() => setEditing(null)}>Cancel</button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button" className="btn secondary sm" disabled={busy}
                          onClick={() => setEditing({ _id: c._id, label: c.label, heldOn: toDateInput(c.heldOn) })}
                        >
                          Edit
                        </button>
                        <button
                          type="button" className="btn ghost sm" disabled={busy}
                          title="Remove from the calendar"
                          onClick={() => mutate(() => api.delete(`/central/congresses/${c._id}`))}
                        >
                          <TrashIcon size={13} />
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <form onSubmit={add} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          placeholder="e.g. 14th National Congress"
          value={draft.label}
          onChange={(e) => setDraft({ ...draft, label: e.target.value })}
          style={{ minWidth: 220 }}
        />
        <input
          type="date"
          value={draft.heldOn}
          max={new Date().toISOString().slice(0, 10)}
          onChange={(e) => setDraft({ ...draft, heldOn: e.target.value })}
        />
        <button type="submit" className="btn sm" disabled={busy || !draft.label.trim() || !draft.heldOn}>
          Add Congress
        </button>
      </form>
    </div>
  );
}
