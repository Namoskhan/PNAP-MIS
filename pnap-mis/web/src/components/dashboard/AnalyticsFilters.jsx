import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/client';
import { useUnit } from '../../context/UnitContext';

// Filter bar for the executive dashboard.
const MEMBER_STATUSES = [
  'ACTIVE', 'PENDING_APPROVAL', 'INACTIVE', 'SUSPENDED', 'REJECTED', 'EXPELLED', 'DECEASED',
];

export default function AnalyticsFilters({ scope, filters, onScope, onFilters, busy, lockScope = false }) {
  const { t } = useTranslation();
  const { provinces = [] } = useUnit() || {};
  const [districts, setDistricts] = useState([]);
  const [areas, setAreas] = useState([]);
  const [units, setUnits] = useState([]);

  const presets = [
    { days: 30, label: t('reports.last30Days', 'Last 30 days') },
    { days: 60, label: t('reports.last60Days', 'Last 60 days') },
    { days: 90, label: t('reports.last90Days', 'Last 90 days') },
    { days: 180, label: t('reports.last6Months', 'Last 6 months') },
    { days: 365, label: t('reports.last12Months', 'Last 12 months') },
  ];

  useEffect(() => {
    if (!scope.provinceId) { setDistricts([]); return; }
    api.get('/org/districts', { params: { provinceId: scope.provinceId } })
      .then((r) => setDistricts(r.data.data || [])).catch(() => setDistricts([]));
  }, [scope.provinceId]);

  useEffect(() => {
    if (!scope.districtId) { setAreas([]); return; }
    api.get('/org/areas', { params: { districtId: scope.districtId } })
      .then((r) => setAreas(r.data.data || [])).catch(() => setAreas([]));
  }, [scope.districtId]);

  useEffect(() => {
    if (!scope.areaId) { setUnits([]); return; }
    api.get('/org/basic-units', { params: { areaId: scope.areaId } })
      .then((r) => setUnits(r.data.data || [])).catch(() => setUnits([]));
  }, [scope.areaId]);

  const isFiltered = !!(scope.provinceId || filters.memberStatus
    || filters.orgStatus || filters.days !== 30);

  return (
    <div className="chart-card" style={{ marginBottom: 10 }}>
      <div className="chart-card-head" style={{ marginBottom: 8 }}>
        <div>
          <div className="chart-card-title">{t('common.filter', 'Filters')}</div>
        </div>
        {isFiltered && (
          <button
            type="button"
            className="btn ghost"
            onClick={() => {
              if (!lockScope) onScope({ provinceId: '', districtId: '', areaId: '', basicUnitId: '' });
              onFilters({ days: 30, memberStatus: '', orgStatus: '' });
            }}
          >
            {t('common.reset', 'Reset')}
          </button>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <select
          value={filters.days}
          onChange={(e) => onFilters({ ...filters, days: Number(e.target.value) })}
          aria-label="Date range"
        >
          {presets.map((p) => <option key={p.days} value={p.days}>{p.label}</option>)}
        </select>

        {!lockScope && (
          <select
            value={scope.provinceId}
            onChange={(e) => onScope({
              provinceId: e.target.value, districtId: '', areaId: '', basicUnitId: '',
            })}
            aria-label="Province"
          >
            <option value="">{t('common.all', 'All')} {t('nav.provinces', 'Provinces')}</option>
            {provinces.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
          </select>
        )}

        {!lockScope && (
          <select
            value={scope.districtId}
            onChange={(e) => onScope({ ...scope, districtId: e.target.value, areaId: '', basicUnitId: '' })}
            disabled={!scope.provinceId}
            aria-label="District"
          >
            <option value="">{t('common.all', 'All')} {t('units.district', 'Districts')}</option>
            {districts.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
          </select>
        )}

        {!lockScope && (
          <select
            value={scope.areaId}
            onChange={(e) => onScope({ ...scope, areaId: e.target.value, basicUnitId: '' })}
            disabled={!scope.districtId}
            aria-label="Area"
          >
            <option value="">{t('common.all', 'All')} {t('units.area', 'Areas')}</option>
            {areas.map((a) => <option key={a._id} value={a._id}>{a.name}</option>)}
          </select>
        )}

        {!lockScope && (
          <select
            value={scope.basicUnitId}
            onChange={(e) => onScope({ ...scope, basicUnitId: e.target.value })}
            disabled={!scope.areaId}
            aria-label="Basic Unit"
          >
            <option value="">{t('common.all', 'All')} {t('units.basicUnit', 'Basic Units')}</option>
            {units.map((u) => <option key={u._id} value={u._id}>{u.name}</option>)}
          </select>
        )}

        <select
          value={filters.memberStatus}
          onChange={(e) => onFilters({ ...filters, memberStatus: e.target.value })}
          aria-label="Member status"
        >
          <option value="">{t('common.all', 'All')} {t('common.status', 'Statuses')}</option>
          {MEMBER_STATUSES.map((s) => (
            <option key={s} value={s}>{s.replace(/_/g, ' ').toLowerCase()}</option>
          ))}
        </select>

        <select
          value={filters.orgStatus}
          onChange={(e) => onFilters({ ...filters, orgStatus: e.target.value })}
          aria-label="Unit activity"
        >
          <option value="">{t('common.inactive', 'Inactive units')}</option>
          <option value="ACTIVE">{t('common.active', 'Active units')}</option>
        </select>

        {busy && <span className="muted" style={{ fontSize: 12 }}>{t('common.loading', 'Updating…')}</span>}
      </div>
    </div>
  );
}
