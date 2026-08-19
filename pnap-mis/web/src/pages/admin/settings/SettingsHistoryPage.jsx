import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listVersions, restoreVersion } from '../../../api/branding';
import { errorMessage } from '../../../api/client';
import { useAuth } from '../../../context/AuthContext';
import { useBranding } from '../../../context/BrandingContext';
import { hasPermission } from '../../../utils/permissions';
import { useToast } from '../../../components/Toast';
import { ClockIcon } from '../../../components/icons';

import dialog from '../../../components/dialog';
// Settings History — append-only timeline of every branding change.
// Each row is a SettingsVersion document with a precomputed diff
// captured at save time. Restoring inserts a new row pointing at an
// old snapshot (history is never mutated).
//
// The diff payload is shown inline when expanded — admins see exactly
// what changed without re-deriving from the snapshot.

const KIND_BADGES = {
  UPDATE:  { label: 'edit',    color: 'var(--info-strong)' },
  RESET:   { label: 'reset',   color: 'var(--primary)' },
  IMPORT:  { label: 'import',  color: 'var(--success)' },
  RESTORE: { label: 'rollback', color: 'var(--danger)' },
};

export default function SettingsHistoryPage() {
  const { user } = useAuth();
  const branding = useBranding();
  const toast = useToast?.() || { success: () => {}, error: () => {} };
  const canWrite = hasPermission(user, 'MANAGE_SYSTEM_BRANDING');

  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(true);
  const [err, setErr] = useState('');
  const [expanded, setExpanded] = useState(null); // versionNumber

  async function load() {
    setBusy(true); setErr('');
    try {
      const list = await listVersions({ limit: 50 });
      setItems(list);
    } catch (e) { setErr(errorMessage(e)); }
    finally { setBusy(false); }
  }
  useEffect(() => { load(); }, []);

  async function doRestore(v) {
    const confirmText = `Restore branding to version v${v.versionNumber}?\n\n` +
      `This creates a NEW version (history is preserved). The current theme + identity will be replaced ` +
      `with the snapshot from this point in time.`;
    if (!await dialog.confirm(confirmText)) return;
    try {
      await restoreVersion(v.versionNumber, { changeNote: `Manual rollback to v${v.versionNumber}` });
      toast.success?.(`Restored from v${v.versionNumber}.`);
      branding.refresh?.();
      load();
    } catch (e) { toast.error?.(errorMessage(e)); }
  }

  return (
    <div>
      <div className="rm-hero">
        <div className="rm-hero-content">
          <div className="rm-hero-icon" aria-hidden="true"><ClockIcon size={22} /></div>
          <div style={{ flex: 1 }}>
            <h2 className="rm-hero-title">Settings History</h2>
            <div className="rm-hero-sub">
              Append-only timeline of every branding change. Click any row to inspect the diff;
              click <strong>Restore</strong> to roll back. Restoring creates a new version — history is never lost.
            </div>
          </div>
          <div className="rm-hero-actions">
            <Link to="/admin/settings" className="rm-hero-btn outline" style={{ textDecoration: 'none' }}>← Back</Link>
            <button className="rm-hero-btn outline" onClick={load} disabled={busy}>⟳ Refresh</button>
          </div>
        </div>
      </div>

      {err && <div className="alert error">{err}</div>}
      {busy && (
        <div className="rm-loading">
          <span className="scope-spinner" aria-hidden="true" />
          <span className="muted">Loading…</span>
        </div>
      )}

      {!busy && items.length === 0 && (
        <div className="rm-card">
          <div className="rm-empty">No branding changes yet.</div>
        </div>
      )}

      {!busy && items.map((v) => {
        const isOpen = expanded === v.versionNumber;
        const kind = KIND_BADGES[v.kind] || KIND_BADGES.UPDATE;
        const diffCount = (v.diff || []).length;
        return (
          <div key={v.versionNumber} className="rm-card" style={{ marginBottom: 10 }}>
            <button
              type="button"
              onClick={() => setExpanded(isOpen ? null : v.versionNumber)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 14px',
                background: 'transparent', border: 'none', cursor: 'pointer',
                textAlign: 'left', font: 'inherit',
              }}
            >
              <span style={{
                fontFamily: 'monospace', fontSize: 13, fontWeight: 700,
                minWidth: 50,
              }}>v{v.versionNumber}</span>

              <span style={{
                display: 'inline-block',
                padding: '2px 8px',
                borderRadius: 999,
                fontSize: 11, fontWeight: 600,
                background: `${kind.color}1a`,
                color: kind.color,
              }}>
                {kind.label}
                {v.kind === 'RESTORE' && v.restoredFrom && ` ← v${v.restoredFrom}`}
              </span>

              <span style={{ flex: 1, fontSize: 13 }}>
                {v.changeNote || <span className="muted">no note</span>}
              </span>

              <span className="muted" style={{ fontSize: 12 }}>
                {diffCount} change{diffCount === 1 ? '' : 's'}
              </span>

              <span className="muted" style={{ fontSize: 12, minWidth: 140, textAlign: 'right' }}>
                {v.changedAt ? new Date(v.changedAt).toLocaleString() : '—'}
              </span>

              <span aria-hidden="true" style={{
                display: 'inline-block',
                transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)',
                transition: 'transform .12s ease',
              }}>▸</span>
            </button>

            {isOpen && (
              <div className="rm-card-body" style={{ borderTop: '1px solid var(--border)' }}>
                {/* Diff table */}
                {diffCount === 0 ? (
                  <p className="muted" style={{ fontSize: 13, margin: 0 }}>
                    No leaf-level changes captured (likely a snapshot reset / import).
                  </p>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, fontSize: 12, fontFamily: 'monospace' }}>
                    <div style={{ fontWeight: 700, color: 'var(--muted)' }}>Path</div>
                    <div style={{ fontWeight: 700, color: 'var(--muted)' }}>Before</div>
                    <div style={{ fontWeight: 700, color: 'var(--muted)' }}>After</div>
                    {(v.diff || []).slice(0, 30).map((d, i) => (
                      <DiffRow key={i} d={d} />
                    ))}
                    {diffCount > 30 && (
                      <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: 8 }} className="muted">
                        … and {diffCount - 30} more
                      </div>
                    )}
                  </div>
                )}

                {canWrite && v.versionNumber > 0 && (
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
                    <button
                      type="button"
                      className="rm-action perms"
                      onClick={() => doRestore(v)}
                    >↺ Restore this version</button>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Compact one-line representation of a diff entry. Long values get
// truncated; objects get JSON.stringified.
function DiffRow({ d }) {
  const fmt = (v) => {
    if (v === undefined) return <span className="muted">(unset)</span>;
    if (v === null) return <span className="muted">null</span>;
    if (typeof v === 'object') {
      const s = JSON.stringify(v);
      return s.length > 80 ? s.slice(0, 80) + '…' : s;
    }
    return String(v);
  };
  return (
    <>
      <div style={{ wordBreak: 'break-all' }}>{d.path}</div>
      <div style={{ wordBreak: 'break-all' }}>{fmt(d.before)}</div>
      <div style={{ wordBreak: 'break-all' }}>{fmt(d.after)}</div>
    </>
  );
}
