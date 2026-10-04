import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, errorMessage } from '../../api/client';
import { FileTextIcon, WalletIcon } from '../icons';
import { useUnit } from '../../context/UnitContext';

// Province / District / Area / Basic Unit reports.

const LEVELS = ['CENTRAL', 'PROVINCE', 'DISTRICT', 'AREA', 'BASIC_UNIT'];
const KEY_OF = {
  PROVINCE: 'provinceId', DISTRICT: 'districtId',
  AREA: 'areaId', BASIC_UNIT: 'basicUnitId',
};

const EMPTY = { provinceId: '', districtId: '', areaId: '', basicUnitId: '' };

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

export default function UnitReportDownloads({ scope, from, to, accessScope }) {
  const { t } = useTranslation();
  const locked = Boolean(accessScope?.unitId);
  const { provinces = [] } = useUnit() || {};
  const [sel, setSel] = useState(EMPTY);
  const [target, setTarget] = useState('CENTRAL');
  const [districts, setDistricts] = useState([]);
  const [areas, setAreas] = useState([]);
  const [units, setUnits] = useState([]);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');

  const levelLabel = {
    CENTRAL: t('admin.central', 'Central'),
    PROVINCE: t('units.province', 'Province'),
    DISTRICT: t('units.district', 'District'),
    AREA: t('units.area', 'Area'),
    BASIC_UNIT: t('units.basicUnit', 'Basic Unit'),
  };

  useEffect(() => {
    setSel({
      provinceId: scope.provinceId || '',
      districtId: scope.districtId || '',
      areaId: scope.areaId || '',
      basicUnitId: scope.basicUnitId || '',
    });
  }, [scope]);

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

  const deepest = useMemo(() => {
    if (sel.basicUnitId) return 'BASIC_UNIT';
    if (sel.areaId) return 'AREA';
    if (sel.districtId) return 'DISTRICT';
    if (sel.provinceId) return 'PROVINCE';
    return 'CENTRAL';
  }, [sel]);

  useEffect(() => { setTarget(deepest); }, [deepest]);

  const nameAt = useMemo(() => ({
    CENTRAL: `${levelLabel.CENTRAL} (${t('dashboard.national', 'National')})`,
    PROVINCE: provinces.find((p) => String(p._id) === String(sel.provinceId))?.name,
    DISTRICT: districts.find((d) => String(d._id) === String(sel.districtId))?.name,
    AREA: areas.find((a) => String(a._id) === String(sel.areaId))?.name,
    BASIC_UNIT: units.find((u) => String(u._id) === String(sel.basicUnitId))?.name,
  }), [provinces, districts, areas, units, sel, levelLabel, t]);

  const chain = locked ? [accessScope.level] : LEVELS.slice(0, LEVELS.indexOf(deepest) + 1);

  function pick(level, value) {
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
      const reportLevel = locked ? accessScope.level : target;
      const p = new URLSearchParams({ unitLevel: reportLevel });
      if (reportLevel !== 'CENTRAL') p.set('unitId', locked ? accessScope.unitId : sel[KEY_OF[target]]);
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
          <div className="chart-card-title">{t('dashboard.unitReports', 'Unit reports')}</div>
          <div className="chart-card-sub">
            {locked ? t('dashboard.unitReportsSubLocked', 'Download reports for your own unit.') : t('dashboard.unitReportsSub', 'Choose a province, district, area or basic unit, then download its report.')}
          </div>
        </div>
        {!locked && deepest !== 'CENTRAL' && (
          <button type="button" className="btn ghost sm" onClick={() => setSel(EMPTY)}>
            {t('common.reset', 'Reset')}
          </button>
        )}
      </div>

      {!locked && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        {selects.map((s) => (
          <select
            key={s.level}
            value={sel[KEY_OF[s.level]]}
            disabled={!s.enabled}
            onChange={(e) => pick(s.level, e.target.value)}
            aria-label={`${t('common.select', 'Select')} ${levelLabel[s.level]}`}
            style={{ minWidth: 175 }}
          >
            <option value="">
              {s.level === 'PROVINCE'
                ? t('dashboard.allProvincesCentral', 'All provinces (Central)')
                : t('dashboard.allTierPlaceholder', 'All {{tier}}', { tier: levelLabel[s.level] })}
            </option>
            {s.options.map((o) => <option key={o._id} value={o._id}>{o.name}</option>)}
          </select>
        ))}
      </div>}

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <span className="muted" style={{ fontSize: 12 }}>{t('dashboard.reportOn', 'Report on')}</span>
        {chain.map((lvl) => (
          <button
            key={lvl}
            type="button"
            className={`chip${target === lvl ? ' on' : ''}`}
            disabled={locked}
            onClick={() => setTarget(lvl)}
            title={`${levelLabel[lvl]} ${t('dashboard.unitReports', 'report')}`}
          >
            {nameAt[lvl] || levelLabel[lvl]}
            <span className="muted" style={{ marginLeft: 6, fontSize: 11 }}>
              {levelLabel[lvl]}
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
            <FileTextIcon size={13} /> {t('dashboard.meetingsAndActivitiesReport', 'Meetings & Activities')}
          </div>
          <div className="muted" style={{ fontSize: 12, marginBottom: 9 }}>
            {t('dashboard.meetingsAndActivitiesDesc', 'Member list, meetings with photos, activities and assigned tasks.')}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" className="btn sm" disabled={!!busy}
              onClick={() => download('meetings', 'pdf')}>
              {busy === 'meetings-pdf' ? t('dashboard.preparing', 'Preparing…') : 'PDF'}
            </button>
            <button type="button" className="btn secondary sm" disabled={!!busy}
              onClick={() => download('meetings', 'xlsx')}>
              {busy === 'meetings-xlsx' ? t('dashboard.preparing', 'Preparing…') : 'Excel'}
            </button>
          </div>
        </div>

        <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 12 }}>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 2 }}>
            <WalletIcon size={13} /> {t('dashboard.finance', 'Finance')}
          </div>
          <div className="muted" style={{ fontSize: 12, marginBottom: 9 }}>
            {t('dashboard.financeDesc', 'Donations, expenses and money left.')}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" className="btn sm" disabled={!!busy}
              onClick={() => download('finance', 'pdf')}>
              {busy === 'finance-pdf' ? t('dashboard.preparing', 'Preparing…') : 'PDF'}
            </button>
            <button type="button" className="btn secondary sm" disabled={!!busy}
              onClick={() => download('finance', 'xlsx')}>
              {busy === 'finance-xlsx' ? t('dashboard.preparing', 'Preparing…') : 'Excel'}
            </button>
          </div>
        </div>
      </div>

      <p className="muted" style={{ fontSize: 11.5, marginTop: 10, marginBottom: 0 }}>
        {t('dashboard.unitReportsFootNote', "Each report shows only the selected unit's own meetings and finances.")}
        {!locked && (' ' + t('dashboard.unitReportsDistrictAreaNote', 'For a district or area report, select that district or area above.'))}
      </p>
    </div>
  );
}
