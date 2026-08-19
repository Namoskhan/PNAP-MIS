import { useEffect, useState } from 'react';
import { api } from '../../api/client';

// Filter bar for the executive dashboard.
//
// The four territorial selects are a SECOND VIEW of the same scope the
// breadcrumb and the drill-down cards drive — not a competing filter.
// Picking "KPK" here is identical to clicking the KPK card, and both
// land in the same state. Two independent scope mechanisms would be a
// reliable way to confuse everyone, including the person maintaining
// this file.
//
// Deliberately a plain toolbar of native selects, matching the Audit
// Log and Member List pages rather than introducing a new control
// style just for this screen.

const PRESETS = [
  { days: 30, label: 'Last 30 days' },
  { days: 60, label: 'Last 60 days' },
  { days: 90, label: 'Last 90 days' },
  { days: 180, label: 'Last 6 months' },
  { days: 365, label: 'Last 12 months' },
];

const MEMBER_STATUSES = [
  'ACTIVE', 'PENDING_APPROVAL', 'INACTIVE', 'SUSPENDED', 'REJECTED', 'EXPELLED', 'DECEASED',
];

export default function AnalyticsFilters({ scope, filters, onScope, onFilters, busy, lockScope = false }) {
  const [provinces, setProvinces] = useState([]);
  const [districts, setDistricts] = useState([]);
  const [areas, setAreas] = useState([]);
  const [units, setUnits] = useState([]);

  useEffect(() => {
    api.get('/org/provinces').then((r) => setProvinces(r.data.data || [])).catch(() => {});
  }, []);

  // Each level's option list follows the level above it. An empty
  // parent clears the list rather than leaving stale options that
  // would describe an impossible scope.
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
          <div className="chart-card-title">Filters</div>
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
            Reset
          </button>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {!lockScope && <select
          value={filters.days}
          onChange={(e) => onFilters({ ...filters, days: Number(e.target.value) })}
          aria-label="Date range"
        >
          {PRESETS.map((p) => <option key={p.days} value={p.days}>{p.label}</option>)}
        </select>}

        {/* Narrowing a level clears everything beneath it, so the scope
            can never describe an area that isn't in the chosen district. */}
        {!lockScope && <select
          value={scope.provinceId}
          onChange={(e) => onScope({
            provinceId: e.target.value, districtId: '', areaId: '', basicUnitId: '',
          })}
          aria-label="Province"
        >
          <option value="">All provinces</option>
          {provinces.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
        </select>}

        {!lockScope && <select
          value={scope.districtId}
          onChange={(e) => onScope({ ...scope, districtId: e.target.value, areaId: '', basicUnitId: '' })}
          disabled={!scope.provinceId}
          aria-label="District"
        >
          <option value="">All districts</option>
          {districts.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
        </select>}

        {!lockScope && <select
          value={scope.areaId}
          onChange={(e) => onScope({ ...scope, areaId: e.target.value, basicUnitId: '' })}
          disabled={!scope.districtId}
          aria-label="Area"
        >
          <option value="">All areas</option>
          {areas.map((a) => <option key={a._id} value={a._id}>{a.name}</option>)}
        </select>}

        <select
          value={scope.basicUnitId}
          onChange={(e) => onScope({ ...scope, basicUnitId: e.target.value })}
          disabled={!scope.areaId}
          aria-label="Basic Unit"
        >
          <option value="">All basic units</option>
          {units.map((u) => <option key={u._id} value={u._id}>{u.name}</option>)}
        </select>

        <select
          value={filters.memberStatus}
          onChange={(e) => onFilters({ ...filters, memberStatus: e.target.value })}
          aria-label="Member status"
        >
          <option value="">Any member status</option>
          {MEMBER_STATUSES.map((s) => (
            <option key={s} value={s}>{s.replace(/_/g, ' ').toLowerCase()}</option>
          ))}
        </select>

        <select
          value={filters.orgStatus}
          onChange={(e) => onFilters({ ...filters, orgStatus: e.target.value })}
          aria-label="Organization status"
        >
          <option value="">Dormant units</option>
          <option value="ACTIVE">Active units</option>
        </select>

        {busy && <span className="muted" style={{ fontSize: 12 }}>Updating…</span>}
      </div>
    </div>
  );
}
