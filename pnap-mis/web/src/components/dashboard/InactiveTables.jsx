import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { SkeletonRows } from '../Skeleton';

// Detailed dormancy reports — one table for organizational units,
// one for members. Both paginate server-side and reuse the existing
// `table.list` styling and `.badge` state colors, so they match the
// Audit Log / Finance Overview tables already in the product.

const UNIT_LEVELS = [
  { key: 'BASIC_UNIT', label: 'Basic Units' },
  { key: 'AREA', label: 'Areas' },
  { key: 'DISTRICT', label: 'Districts' },
  { key: 'PROVINCE', label: 'Provinces' },
];

function fmtDate(d) {
  return d ? new Date(d).toLocaleDateString() : 'Never';
}

// A dormancy figure only means something next to the window that
// produced it, so "never acted" stays explicit rather than becoming a
// misleadingly precise day count.
function fmtDays(n) {
  if (n == null) return <span className="muted">No activity on record</span>;
  return <span style={{ fontVariantNumeric: 'tabular-nums' }}>{n.toLocaleString()}</span>;
}

function Pager({ page, pages, total, onPage, busy }) {
  if (total === 0) return null;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: 10, marginTop: 10, flexWrap: 'wrap',
    }}>
      <span className="muted" style={{ fontSize: 12 }}>
        Page {page} of {pages} · {total.toLocaleString()} rows
      </span>
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          type="button" className="btn secondary sm"
          disabled={busy || page <= 1} onClick={() => onPage(page - 1)}
        >
          ← Prev
        </button>
        <button
          type="button" className="btn secondary sm"
          disabled={busy || page >= pages} onClick={() => onPage(page + 1)}
        >
          Next →
        </button>
      </div>
    </div>
  );
}

export function InactiveUnitsTable({ params }) {
  const [level, setLevel] = useState('BASIC_UNIT');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(true);

  // Any filter change invalidates the current page number — showing
  // page 4 of a freshly narrowed result set would look like an error.
  useEffect(() => { setPage(1); }, [params, level]);

  useEffect(() => {
    let alive = true;
    setBusy(true);
    api.get('/dashboard/inactive-units', { params: { ...params, level, page, limit: 10 } })
      .then((r) => { if (alive) setData(r.data.data); })
      .catch(() => { if (alive) setData(null); })
      .finally(() => { if (alive) setBusy(false); });
    return () => { alive = false; };
  }, [params, level, page]);

  const items = data?.items || [];
  const showingActive = params.orgStatus === 'ACTIVE';

  return (
    <div className="chart-card">
      <div className="chart-card-head">
        <div>
          <div className="chart-card-title">
            {showingActive ? 'Active units' : 'Dormant units'} — detail
          </div>
          <div className="chart-card-sub">
            {showingActive
              ? 'Units whose key office bearers have acted inside the window'
              : 'No key office bearer has acted inside the window. Longest silence first.'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {UNIT_LEVELS.map((l) => (
            <button
              key={l.key}
              type="button"
              className={`chip${level === l.key ? ' on' : ''}`}
              onClick={() => setLevel(l.key)}
            >
              {l.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table className="list">
          <thead>
            <tr>
              <th>Province</th>
              <th>District</th>
              <th>Area</th>
              <th>Basic Unit</th>
              <th>Responsible Officer</th>
              <th>Last Activity</th>
              <th style={{ textAlign: 'right' }}>Days Inactive</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {busy && !data && <SkeletonRows rows={5} cols={9} />}
            {!busy && items.length === 0 && (
              <tr>
                <td colSpan="9" className="muted">
                  {showingActive
                    ? 'No active units match these filters.'
                    : 'Nothing dormant here — every unit at this tier has recent activity.'}
                </td>
              </tr>
            )}
            {items.map((u) => (
              <tr key={u._id}>
                <td>{u.province || <span className="muted">—</span>}</td>
                <td>{u.district || <span className="muted">—</span>}</td>
                <td>{u.area || <span className="muted">—</span>}</td>
                <td>{u.basicUnit || <span className="muted">—</span>}</td>
                <td>
                  {u.officer ? (
                    <>
                      <Link to={`/members/${u.officer.memberId}`}>{u.officer.fullName}</Link>
                      <div className="muted" style={{ fontSize: 12 }}>
                        {u.officer.roleCode?.replace(/_/g, ' ')}
                      </div>
                    </>
                  ) : (
                    // Worth calling out in its own right: a unit with
                    // no cabinet cannot become active by any action.
                    <span className="muted">No cabinet appointed</span>
                  )}
                </td>
                <td style={{ fontSize: 13 }}>{fmtDate(u.lastActivityAt)}</td>
                <td style={{ textAlign: 'right' }}>{fmtDays(u.daysInactive)}</td>
                <td><span className={`badge ${u.status}`}>{u.status}</span></td>
                <td>
                  <Link className="btn ghost sm" to="/admin/manage-org">Manage</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pager
        page={data?.page || 1}
        pages={data?.pages || 1}
        total={data?.total || 0}
        onPage={setPage}
        busy={busy}
      />
    </div>
  );
}

export function InactiveMembersTable({ params }) {
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(true);

  useEffect(() => { setPage(1); }, [params]);

  useEffect(() => {
    let alive = true;
    setBusy(true);
    api.get('/dashboard/inactive-members', { params: { ...params, page, limit: 10 } })
      .then((r) => { if (alive) setData(r.data.data); })
      .catch(() => { if (alive) setData(null); })
      .finally(() => { if (alive) setBusy(false); });
    return () => { alive = false; };
  }, [params, page]);

  const items = data?.items || [];

  return (
    <div className="chart-card">
      <div className="chart-card-head">
        <div>
          <div className="chart-card-title">Dormant members — detail</div>
          <div className="chart-card-sub">
            No meaningful organizational activity inside the window
          </div>
        </div>
        <div className="chart-card-meta">{(data?.total || 0).toLocaleString()} members</div>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table className="list">
          <thead>
            <tr>
              <th>Member</th>
              <th>Province</th>
              <th>District</th>
              <th>Area</th>
              <th>Basic Unit</th>
              <th>Last Activity</th>
              <th style={{ textAlign: 'right' }}>Days Inactive</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {busy && !data && <SkeletonRows rows={5} cols={9} />}
            {!busy && items.length === 0 && (
              <tr>
                <td colSpan="9" className="muted">
                  No dormant members match these filters.
                </td>
              </tr>
            )}
            {items.map((m) => (
              <tr key={m._id}>
                <td>
                  <strong>{m.fullName}</strong>
                  <div className="muted" style={{ fontSize: 12 }}>{m.memberCode || '—'}</div>
                </td>
                <td>{m.province || <span className="muted">—</span>}</td>
                <td>{m.district || <span className="muted">—</span>}</td>
                <td>{m.area || <span className="muted">—</span>}</td>
                <td>{m.basicUnit || <span className="muted">—</span>}</td>
                <td style={{ fontSize: 13 }}>{fmtDate(m.lastActivityAt)}</td>
                <td style={{ textAlign: 'right' }}>{fmtDays(m.daysInactive)}</td>
                <td><span className={`badge ${m.status}`}>{m.status}</span></td>
                <td><Link className="btn ghost sm" to={`/members/${m._id}`}>View</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pager
        page={data?.page || 1}
        pages={data?.pages || 1}
        total={data?.total || 0}
        onPage={setPage}
        busy={busy}
      />
    </div>
  );
}
