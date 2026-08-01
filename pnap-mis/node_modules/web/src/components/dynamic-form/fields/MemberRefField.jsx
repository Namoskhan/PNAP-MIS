import { useEffect, useMemo, useState } from 'react';
import { api } from '../../../api/client';
import { FieldShell } from '../FieldShell';

// MemberRefField — searchable member picker. Replaces the PR 3
// placeholder (raw-ObjectId input) with a real combobox.
//
// Multiple instances on a page share a single fetch via the
// module-level cache below — so a meeting form with several
// MEMBER_REF fields makes one network round-trip, not N.

let _cache = null;
let _inflight = null;

async function loadMembers() {
  if (_cache) return _cache;
  if (_inflight) return _inflight;
  _inflight = api.get('/members', { params: { status: 'ACTIVE', limit: 500 } })
    .then((r) => {
      _cache = r.data?.data || [];
      return _cache;
    })
    .catch(() => { _inflight = null; return []; });
  return _inflight;
}

export default function MemberRefField({ field, value, error, onChange, disabled }) {
  const [members, setMembers] = useState(_cache || []);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');

  useEffect(() => {
    let cancelled = false;
    if (!_cache) {
      loadMembers().then((list) => { if (!cancelled) setMembers(list); });
    }
    return () => { cancelled = true; };
  }, []);

  const selected = useMemo(() => {
    if (!value) return null;
    return members.find((m) => String(m._id) === String(value)) || null;
  }, [members, value]);

  const filtered = useMemo(() => {
    if (!q) return members.slice(0, 30);
    const needle = q.toLowerCase();
    return members
      .filter((m) =>
        (m.fullName || '').toLowerCase().includes(needle) ||
        (m.memberId || '').toLowerCase().includes(needle) ||
        (m.cnic || '').toLowerCase().includes(needle))
      .slice(0, 30);
  }, [members, q]);

  return (
    <FieldShell field={field} error={error}>
      <div style={{ position: 'relative' }}>
        <button
          type="button"
          onClick={() => !disabled && setOpen((v) => !v)}
          disabled={disabled}
          style={{
            width: '100%',
            textAlign: 'left',
            padding: '8px 10px',
            border: '1px solid var(--border)',
            borderRadius: 8,
            background: 'white',
            cursor: disabled ? 'not-allowed' : 'pointer',
            font: 'inherit',
          }}
        >
          {selected
            ? <span>{selected.fullName} <span className="muted">· {selected.memberId || selected.cnic || ''}</span></span>
            : <span className="muted">— Select a member —</span>}
          <span style={{ float: 'right' }} aria-hidden="true">▾</span>
        </button>
        {open && (
          <div
            style={{
              position: 'absolute',
              top: 'calc(100% + 4px)',
              left: 0,
              right: 0,
              maxHeight: 280,
              overflowY: 'auto',
              background: 'white',
              border: '1px solid var(--border)',
              borderRadius: 8,
              boxShadow: '0 8px 16px rgba(15, 23, 42, 0.08)',
              zIndex: 20,
            }}
          >
            <div style={{ padding: 8, borderBottom: '1px solid var(--border)' }}>
              <input
                autoFocus
                placeholder="Search by name, member ID, CNIC…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                style={{ width: '100%' }}
              />
            </div>
            {filtered.length === 0 && (
              <div className="muted" style={{ padding: 12, fontSize: 13 }}>
                {members.length === 0 ? 'Loading members…' : 'No members match.'}
              </div>
            )}
            {value && (
              <button
                type="button"
                style={{
                  width: '100%', textAlign: 'left', padding: '8px 12px',
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  borderBottom: '1px solid var(--border)',
                  font: 'inherit', color: 'var(--danger)', fontSize: 13,
                }}
                onClick={() => { onChange(undefined); setOpen(false); setQ(''); }}
              >× Clear selection</button>
            )}
            {filtered.map((m) => (
              <button
                key={m._id}
                type="button"
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: '8px 12px', background: 'transparent',
                  border: 'none', cursor: 'pointer', font: 'inherit',
                }}
                onClick={() => { onChange(String(m._id)); setOpen(false); setQ(''); }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(30, 64, 175, 0.06)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                <div style={{ fontSize: 14 }}>{m.fullName}</div>
                <div className="muted" style={{ fontSize: 12 }}>
                  {m.memberId || ''}{m.memberId && m.cnic ? ' · ' : ''}{m.cnic || ''}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </FieldShell>
  );
}
