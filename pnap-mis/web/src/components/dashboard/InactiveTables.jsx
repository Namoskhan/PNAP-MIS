import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/client';
import { SkeletonRows } from '../Skeleton';

function fmtDate(d, t) {
  return d ? new Date(d).toLocaleDateString() : (t ? t('dashboard.never', 'Never') : 'Never');
}

function fmtDays(n, t) {
  if (n == null) return <span className="muted">{t ? t('dashboard.noActivityRecorded', 'No activity recorded') : 'No activity recorded'}</span>;
  return <span style={{ fontVariantNumeric: 'tabular-nums' }}>{n.toLocaleString()}</span>;
}

function Pager({ page, pages, total, onPage, busy }) {
  const { t } = useTranslation();
  if (total === 0) return null;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: 10, marginTop: 10, flexWrap: 'wrap',
    }}>
      <span className="muted" style={{ fontSize: 12 }}>
        {t('dashboard.pageOfRows', 'Page {{page}} of {{pages}} · {{total}} rows', { page, pages, total: total.toLocaleString() })}
      </span>
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          type="button" className="btn secondary sm"
          disabled={busy || page <= 1} onClick={() => onPage(page - 1)}
        >
          ← {t('common.previous', 'Previous')}
        </button>
        <button
          type="button" className="btn secondary sm"
          disabled={busy || page >= pages} onClick={() => onPage(page + 1)}
        >
          {t('common.next', 'Next')} →
        </button>
      </div>
    </div>
  );
}

export function InactiveUnitsTable({ params }) {
  const { t } = useTranslation();
  const [level, setLevel] = useState('BASIC_UNIT');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(true);

  const unitLevels = [
    { key: 'BASIC_UNIT', label: t('units.basicUnits', 'Basic Units') },
    { key: 'AREA', label: t('units.areas', 'Areas') },
    { key: 'DISTRICT', label: t('units.districts', 'Districts') },
    { key: 'PROVINCE', label: t('units.provinces', 'Provinces') },
  ];

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
            {showingActive ? t('dashboard.activeUnitsDetail', 'Active units — detail') : t('dashboard.inactiveUnitsDetail', 'Inactive units — detail')}
          </div>
          <div className="chart-card-sub">
            {showingActive
              ? t('dashboard.activeUnitsSub', 'Units where key officers took part during the selected dates')
              : t('dashboard.inactiveUnitsSub', 'No key officer took part during the selected dates. Units inactive the longest appear first.')}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {unitLevels.map((l) => (
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

      <div className="table-responsive">
        <table className="list">
          <thead>
            <tr>
              <th>{t('units.province', 'Province')}</th>
              <th>{t('units.district', 'District')}</th>
              <th>{t('units.area', 'Area')}</th>
              <th>{t('units.basicUnit', 'Basic Unit')}</th>
              <th>{t('dashboard.officerInCharge', 'Officer in charge')}</th>
              <th>{t('dashboard.lastActive', 'Last Activity')}</th>
              <th style={{ textAlign: 'right' }}>{t('dashboard.daysInactive', 'Days without activity')}</th>
              <th>{t('common.status', 'Status')}</th>
              <th>{t('common.actions', 'Actions')}</th>
            </tr>
          </thead>
          <tbody>
            {busy && !data && <SkeletonRows rows={5} cols={9} />}
            {!busy && items.length === 0 && (
              <tr>
                <td colSpan="9" className="muted">
                  {showingActive
                    ? t('dashboard.noActiveUnitsMatch', 'No active units match these filters.')
                    : t('dashboard.noUnitsFoundSelection', 'No inactive units found for this selection.')}
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
                    <span className="muted">{t('dashboard.noCabinetAppointed', 'No cabinet appointed')}</span>
                  )}
                </td>
                <td style={{ fontSize: 13 }}>{fmtDate(u.lastActivityAt, t)}</td>
                <td style={{ textAlign: 'right' }}>{fmtDays(u.daysInactive, t)}</td>
                <td>
                  <span className={`badge ${u.status}`}>
                    {u.status === 'DORMANT' ? t('common.inactive', 'Inactive') : u.status?.replace(/_/g, ' ').toLowerCase()}
                  </span>
                </td>
                <td>
                  <Link className="btn ghost sm" to="/admin/manage-org">{t('common.manage', 'Manage')}</Link>
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
  const { t } = useTranslation();
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
          <div className="chart-card-title">{t('dashboard.inactiveMembersDetail', 'Inactive members — details')}</div>
          <div className="chart-card-sub">
            {t('dashboard.inactiveMembersSub', 'No party activity recorded during the selected dates')}
          </div>
        </div>
        <div className="chart-card-meta">{(data?.total || 0).toLocaleString()} {t('dashboard.totalMembers', 'members')}</div>
      </div>

      <div className="table-responsive">
        <table className="list">
          <thead>
            <tr>
              <th>{t('dashboard.member', 'Member')}</th>
              <th>{t('units.province', 'Province')}</th>
              <th>{t('units.district', 'District')}</th>
              <th>{t('units.area', 'Area')}</th>
              <th>{t('units.basicUnit', 'Basic Unit')}</th>
              <th>{t('dashboard.lastActive', 'Last Activity')}</th>
              <th style={{ textAlign: 'right' }}>{t('dashboard.daysInactive', 'Days without activity')}</th>
              <th>{t('common.status', 'Status')}</th>
              <th>{t('common.actions', 'Actions')}</th>
            </tr>
          </thead>
          <tbody>
            {busy && !data && <SkeletonRows rows={5} cols={9} />}
            {!busy && items.length === 0 && (
              <tr>
                <td colSpan="9" className="muted">
                  {t('dashboard.noInactiveMembersFound', 'No inactive members found for this selection.')}
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
                <td style={{ fontSize: 13 }}>{fmtDate(m.lastActivityAt, t)}</td>
                <td style={{ textAlign: 'right' }}>{fmtDays(m.daysInactive, t)}</td>
                <td>
                  <span className={`badge ${m.status}`}>
                    {m.status === 'DORMANT' ? t('common.inactive', 'Inactive') : m.status?.replace(/_/g, ' ').toLowerCase()}
                  </span>
                </td>
                <td><Link className="btn ghost sm" to={`/members/${m._id}`}>{t('common.view', 'View')}</Link></td>
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
