import { useEffect, useMemo, useState } from 'react';
import { api, errorMessage } from '../../api/client';
import { FileTextIcon, WalletIcon } from '../icons';

// Province / District / Area / Basic Unit reports.
//
// These are the SAME reports an Area, District or Province Admin
// downloads from their unit Reports page — /exports/unit/meetings and
// /exports/unit/finance. The difference is reach: a District Admin is
// pinned to their own district by UnitContext, whereas Super Admin
// walks the hierarchy here and reports on any unit at any tier.
//
// The picker CASCADES: pick a province, and the district list narrows
// to that province; pick a district and the area list narrows to it.
// A flat "every area in the country" dropdown is unusable once an org
// has more than a handful.
//
// Choosing a deeper level does not throw away the shallower one — the
// chain stays selected and the "Reporting on" chips let you generate
// the report at ANY level of it without clearing your way back up.
//
// Nothing new is generated server-side; this is a picker over existing
// export endpoints.

const LEVELS = ['CENTRAL', 'PROVINCE', 'DISTRICT', 'AREA', 'BASIC_UNIT'];
const LEVEL_LABEL = {
  CENTRAL: 'Central', PROVINCE: 'Province',
  DISTRICT: 'District', AREA: 'Area', BASIC_UNIT: 'Basic Unit',
};
const KEY_OF = {
  PROVINCE: 'provinceId', DISTRICT: 'districtId',
  AREA: 'areaId', BASIC_UNIT: 'basicUnitId',
};

const EMPTY = { provinceId: '', districtId: '', areaId: '', basicUnitId: '' };

// A Bearer token can't ride on a plain <a href>, so fetch then
// object-URL — the same approach the unit Reports page uses.
function downloadAuthed(path, filename) {
  const token = localStorage.getItem('pnap_token');
  return fetch(path, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
    .then(async (res) => {
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error?.message || `Export failed (${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    });
}

export default function UnitReportDownloads({ scope, from, to }) {
  const [sel, setSel] = useState(EMPTY);
  const [target, setTarget] = useState('CENTRAL');
  const [provinces, setProvinces] = useState([]);
  const [districts, setDistricts] = useState([]);
  const [areas, setAreas] = useState([]);
  const [units, setUnits] = useState([]);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');

  // Seed from whatever the dashboard is scoped to, so the report you
  // download matches the numbers you were just looking at.
  useEffect(() => {
    setSel({
      provinceId: scope.provinceId || '',
      districtId: scope.districtId || '',
      areaId: scope.areaId || '',
      basicUnitId: scope.basicUnitId || '',
    });
  }, [scope]);

  // ── Cascading option lists ───────────────────────────────────────
  // Each level's list is fetched for its PARENT, so a district list is
  // that province's districts and nothing else.
  useEffect(() => {
    api.get('/org/provinces').then((r) => setProvinces(r.data.data || [])).catch(() => setProvinces([]));
  }, []);
  useEffect(() => {
    if (!sel.provinceId) { setDistricts([]); return; }
    api.get('/org/districts', { params: { provinceId: sel.provinceId } })
      .then((r) => setDistricts(r.data.data || [])).catch(() => setDistricts([]));
  }, [sel.provinceId]);
  useEffect(() => {
    if (!sel.districtId) { setAreas([]); return; }
    api.get('/org/areas', { params: { districtId: sel.districtId } })
      .then((r) => setAreas(r.data.data || [])).catch(() => setAreas([]));
  }, [sel.districtId]);
  useEffect(() => {
    if (!sel.areaId) { setUnits([]); return; }
    api.get('/org/basic-units', { params: { areaId: sel.areaId } })
      .then((r) => setUnits(r.data.data || [])).catch(() => setUnits([]));
  }, [sel.areaId]);

  // The deepest level the user has actually chosen.
  const deepest = useMemo(() => {
    if (sel.basicUnitId) return 'BASIC_UNIT';
    if (sel.areaId) return 'AREA';
    if (sel.districtId) return 'DISTRICT';
    if (sel.provinceId) return 'PROVINCE';
    return 'CENTRAL';
  }, [sel]);

  // Follow the selection by default. A target deeper than the current
  // chain is impossible, so it snaps back rather than trying to export
  // a unit that is no longer chosen.
  useEffect(() => { setTarget(deepest); }, [deepest]);

  // Name lookup per level, for the chips and the download filename.
  const nameAt = useMemo(() => ({
    CENTRAL: 'Central (National)',
    PROVINCE: provinces.find((p) => String(p._id) === String(sel.provinceId))?.name,
    DISTRICT: districts.find((d) => String(d._id) === String(sel.districtId))?.name,
    AREA: areas.find((a) => String(a._id) === String(sel.areaId))?.name,
    BASIC_UNIT: units.find((u) => String(u._id) === String(sel.basicUnitId))?.name,
  }), [provinces, districts, areas, units, sel]);

  // Every level in the chain up to what's selected — these are the
  // levels a report can be generated at right now.
  const chain = LEVELS.slice(0, LEVELS.indexOf(deepest) + 1);

  function pick(level, value) {
    // Narrowing a level clears everything beneath it: a district from
    // another province must never survive a province change.
    const idx = LEVELS.indexOf(level);
    const next = { ...sel, [KEY_OF[level]]: value };
    for (const deeper of LEVELS.slice(idx + 1)) {
      if (KEY_OF[deeper]) next[KEY_OF[deeper]] = '';
    }
    setSel(next);
  }

  async function download(kind, format) {
    setErr('');
    setBusy(`${kind}-${format}`);
    try {
      const p = new URLSearchParams({ unitLevel: target });
      if (target !== 'CENTRAL') p.set('unitId', sel[KEY_OF[target]]);
      if (from) p.set('from', from);
      if (to) p.set('to', to);
      const safe = (nameAt[target] || 'unit').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
      await downloadAuthed(
        `/api/exports/unit/${kind}/${format}?${p.toString()}`,
        `${safe}-${kind}-report.${format === 'pdf' ? 'pdf' : 'xlsx'}`,
      );
    } catch (e) {
      setErr(errorMessage(e) || e.message);
    } finally {
      setBusy('');
    }
  }

  const selects = [
    { level: 'PROVINCE', options: provinces, enabled: true },
    { level: 'DISTRICT', options: districts, enabled: !!sel.provinceId },
    { level: 'AREA', options: areas, enabled: !!sel.districtId },
    { level: 'BASIC_UNIT', options: units, enabled: !!sel.areaId },
  ];

  return (
    <div className="chart-card">
      <div className="chart-card-head">
        <div>
          <div className="chart-card-title">Unit reports</div>
          <div className="chart-card-sub">
            Walk down province → district → area → basic unit, then generate that
            unit&apos;s report
          </div>
        </div>
        {deepest !== 'CENTRAL' && (
          <button type="button" className="btn ghost sm" onClick={() => setSel(EMPTY)}>
            Reset
          </button>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        {selects.map((s) => (
          <select
            key={s.level}
            value={sel[KEY_OF[s.level]]}
            disabled={!s.enabled}
            onChange={(e) => pick(s.level, e.target.value)}
            aria-label={`Select ${LEVEL_LABEL[s.level].toLowerCase()}`}
            style={{ minWidth: 175 }}
          >
            <option value="">
              {s.level === 'PROVINCE' ? 'All provinces (Central)' : `All ${LEVEL_LABEL[s.level].toLowerCase()}s`}
            </option>
            {s.options.map((o) => <option key={o._id} value={o._id}>{o.name}</option>)}
          </select>
        ))}
      </div>

      {/* Report at any level of the chosen chain without clearing the
          selection to get back up to it. */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <span className="muted" style={{ fontSize: 12 }}>Report on</span>
        {chain.map((lvl) => (
          <button
            key={lvl}
            type="button"
            className={`chip${target === lvl ? ' on' : ''}`}
            onClick={() => setTarget(lvl)}
            title={`${LEVEL_LABEL[lvl]} report`}
          >
            {nameAt[lvl] || LEVEL_LABEL[lvl]}
            <span className="muted" style={{ marginLeft: 6, fontSize: 11 }}>
              {LEVEL_LABEL[lvl]}
            </span>
          </button>
        ))}
      </div>

      {err && <div className="alert error" style={{ marginBottom: 10 }}>{err}</div>}

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
        gap: 10,
      }}>
        <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 12 }}>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 2 }}>
            <FileTextIcon size={13} /> Meetings &amp; Activities
          </div>
          <div className="muted" style={{ fontSize: 12, marginBottom: 9 }}>
            Roster, meetings with photos, activities and responsibilities.
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" className="btn sm" disabled={!!busy}
              onClick={() => download('meetings', 'pdf')}>
              {busy === 'meetings-pdf' ? 'Generating…' : 'PDF'}
            </button>
            <button type="button" className="btn secondary sm" disabled={!!busy}
              onClick={() => download('meetings', 'xlsx')}>
              {busy === 'meetings-xlsx' ? 'Generating…' : 'Excel'}
            </button>
          </div>
        </div>

        <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 12 }}>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 2 }}>
            <WalletIcon size={13} /> Finance
          </div>
          <div className="muted" style={{ fontSize: 12, marginBottom: 9 }}>
            Donations ledger, expenses ledger and the unit&apos;s net balance.
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" className="btn sm" disabled={!!busy}
              onClick={() => download('finance', 'pdf')}>
              {busy === 'finance-pdf' ? 'Generating…' : 'PDF'}
            </button>
            <button type="button" className="btn secondary sm" disabled={!!busy}
              onClick={() => download('finance', 'xlsx')}>
              {busy === 'finance-xlsx' ? 'Generating…' : 'Excel'}
            </button>
          </div>
        </div>
      </div>

      <p className="muted" style={{ fontSize: 11.5, marginTop: 10, marginBottom: 0 }}>
        A unit report covers records authored <em>at that unit</em> — a Province
        report contains province-level meetings and finance, not the sum of its
        districts. Pick the district or area itself to report on its own work.
      </p>
    </div>
  );
}
