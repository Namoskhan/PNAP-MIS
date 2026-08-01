import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useUnit } from '../../context/UnitContext';
import { useAuth } from '../../context/AuthContext';
import { canManageMeetings, isCentralAdminOversight, isSuperAdminOversight } from '../../utils/permissions';
import { api, errorMessage } from '../../api/client';
import useEventTypes from '../../hooks/useEventTypes';
import DynamicForm from '../../components/dynamic-form/DynamicForm';

function bodySupported(level) {
  return level === 'AREA' || level === 'DISTRICT' || level === 'PROVINCE' || level === 'CENTRAL';
}

// Default starting type — picker itself is sourced from
// /api/events/types (the EventTypeConfig catalogue).
const DEFAULT_TYPE_CODE = 'CAMPAIGN';

export default function ActivitiesPage() {
  const { ctx } = useUnit();
  const { user } = useAuth();
  const location = useLocation();
  const canManage = canManageMeetings(user) && !isCentralAdminOversight(user) && !isSuperAdminOversight(user);
  // Pure-member viewers shouldn't see the scope selector — they're
  // pinned to their own Basic Unit.
  const NON_MEMBER_ROLES = [
    'SUPER_ADMIN','PROVINCE_ADMIN','DISTRICT_ADMIN','AREA_ADMIN',
    'SECRETARY','SENIOR_MAWIN','FINANCE_SECRETARY','PRESS_SECRETARY','CULTURE_SECRETARY','SPORTS_SECRETARY',
    'PRESIDENT','SR_VICE_PRESIDENT','VICE_PRESIDENT','GENERAL_SECRETARY',
    'CHAIRMAN','CO_CHAIRMAN','SR_VICE_CHAIRMAN','VICE_CHAIRMAN','FIRST_SECRETARY','OTHER',
  ];
  const isPureMember = !!user?.roles?.includes('MEMBER')
    && !NON_MEMBER_ROLES.some((r) => user.roles?.includes(r));
  // Senior Mawin (and equivalents) at a BASIC_UNIT — single-option
  // scope select is meaningless. Hide it.
  const isSmAtBu = ctx?.unitLevel === 'BASIC_UNIT'
    && (user?.roles?.includes('SENIOR_MAWIN') || user?.roles?.includes('SR_VICE_PRESIDENT') || user?.roles?.includes('FIRST_SECRETARY'));
  const [items, setItems] = useState([]);
  const [scope, setScope] = useState('own');
  const initialBody = new URLSearchParams(location.search).get('body') === 'COMMITTEE' ? 'COMMITTEE' : 'EXECUTIVE';
  const [body, setBody] = useState(initialBody);
  const [show, setShow] = useState(false);
  const [form, setForm] = useState({
    typeCode: DEFAULT_TYPE_CODE, title: '', description: '', startAt: '', endAt: '', venue: '',
    campaign_householdsVisited: '', campaign_peopleContacted: '', campaign_pamphletsDistributed: '',
    campaign_expectedJoiners: '', campaign_actualJoiners: '', campaign_volunteerHours: '',
    dynamicData: {},
  });
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  const showBodyToggle = ctx && bodySupported(ctx.unitLevel);

  // Active activity types from the EventTypeConfig catalogue. Body
  // filter applies only when the toggle is shown.
  const { types: eventTypes } = useEventTypes('ACTIVITY', showBodyToggle ? body : undefined);
  const selectedType = useMemo(() => {
    return eventTypes.find((t) => String(t.code).toUpperCase() === String(form.typeCode).toUpperCase()) || null;
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [eventTypes, form.typeCode]);

  // Latest-fetch guard — drop stale responses from a previous ctx.
  const fetchIdRef = useRef(0);

  async function reload() {
    if (!ctx) return;
    const myId = ++fetchIdRef.current;
    const params = {
      unitLevel: ctx.unitLevel, unitId: ctx.unitId,
      scope: scope === 'tree' ? 'subtree' : undefined,
    };
    if (showBodyToggle) params.body = body;
    const r = await api.get('/activities', { params });
    if (myId === fetchIdRef.current) setItems(r.data.data);
  }
  useEffect(() => { reload(); }, [ctx, scope, body]);

  async function create() {
    setErr(''); setMsg('');
    try {
      const { dynamicData, ...rest } = form;
      const payload = { ...rest, unitLevel: ctx.unitLevel, unitId: ctx.unitId };
      if (showBodyToggle) payload.body = body;
      Object.keys(payload).forEach((k) => { if (payload[k] === '') delete payload[k]; });
      if (dynamicData && Object.keys(dynamicData).length > 0) payload.dynamicData = dynamicData;
      await api.post('/activities', payload);
      setMsg(showBodyToggle ? `${body === 'COMMITTEE' ? 'Committee' : 'Executive'} activity recorded.` : 'Activity recorded.');
      setShow(false);
      setForm((f) => ({ ...f, title: '', description: '', startAt: '', endAt: '', venue: '', dynamicData: {} }));
      reload();
    } catch (e) { setErr(errorMessage(e)); }
  }

  async function uploadPhoto(id, file) {
    if (!file) return;
    const fd = new FormData(); fd.append('photos', file);
    try {
      const r = await api.post(`/activities/${id}/photos`, fd);
      const data = r.data.data;
      if (data.rejected?.length) {
        alert(`Some photos rejected:\n${data.rejected.map((x) => `• ${x.filename}: ${x.reason}`).join('\n')}`);
      }
      reload();
    } catch (e) { alert(errorMessage(e)); }
  }

  async function complete(id) {
    try { await api.post(`/activities/${id}/complete`, {}); reload(); }
    catch (e) { alert(errorMessage(e)); }
  }

  if (!ctx) return <p>Select a unit context first.</p>;

  return (
    <div>
      <div className="page-header">
        <h2>
          {showBodyToggle ? (body === 'COMMITTEE' ? 'Committee Activities' : 'Executive Activities') : 'Activities'} · {ctx.unitName}
        </h2>
        <div style={{ display: 'flex', gap: 8 }}>
          {/* Single-option select at BU level — hide for everyone there. */}
          {!isPureMember && ctx.unitLevel !== 'BASIC_UNIT' && (
            <select value={scope} onChange={(e) => setScope(e.target.value)}>
              <option value="own">This unit only</option>
              <option value="tree">Including subordinates</option>
            </select>
          )}
          {canManage && <button className="btn" onClick={() => setShow(true)}>
            + Record {showBodyToggle ? (body === 'COMMITTEE' ? 'Committee ' : 'Executive ') : ''}Activity
          </button>}
        </div>
      </div>

      {showBodyToggle && (
        <div className="toolbar" style={{ marginBottom: 12 }}>
          <button
            className={`btn ${body === 'EXECUTIVE' ? '' : 'secondary'}`}
            onClick={() => setBody('EXECUTIVE')}
          >Executive Activities</button>
          <button
            className={`btn ${body === 'COMMITTEE' ? '' : 'secondary'}`}
            onClick={() => setBody('COMMITTEE')}
          >Committee Activities</button>
        </div>
      )}

      {err && <div className="alert error">{err}</div>}
      {msg && <div className="alert success">{msg}</div>}

      {show && (
        <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setShow(false); }}>
        <div className="modal" style={{ maxWidth: 720 }} role="dialog" aria-modal="true" aria-label="Record Activity">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <h3 style={{ margin: 0 }}>Record Activity</h3>
            <button type="button" className="btn secondary" onClick={() => setShow(false)} aria-label="Close" style={{ padding: '4px 10px', fontSize: 18, lineHeight: 1 }}>×</button>
          </div>
          <div className="form-grid">
            <div className="field">
              <label>Type</label>
              <select
                value={form.typeCode}
                onChange={(e) => setForm({ ...form, typeCode: e.target.value, dynamicData: {} })}
              >
                {eventTypes.length === 0 && <option value="">— Loading types —</option>}
                {eventTypes.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Title</label>
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div className="field">
              <label>Start</label>
              <input type="datetime-local" value={form.startAt} onChange={(e) => setForm({ ...form, startAt: e.target.value })} />
            </div>
            <div className="field">
              <label>End</label>
              <input type="datetime-local" value={form.endAt} onChange={(e) => setForm({ ...form, endAt: e.target.value })} />
            </div>
            <div className="field full">
              <label>Venue</label>
              <input value={form.venue} onChange={(e) => setForm({ ...form, venue: e.target.value })} />
            </div>
            <div className="field full">
              <label>Description</label>
              <textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            {form.typeCode === 'CAMPAIGN' && (
              <>
                <div className="field"><label>Households Visited</label>
                  <input type="number" value={form.campaign_householdsVisited} onChange={(e) => setForm({ ...form, campaign_householdsVisited: e.target.value })} /></div>
                <div className="field"><label>People Contacted</label>
                  <input type="number" value={form.campaign_peopleContacted} onChange={(e) => setForm({ ...form, campaign_peopleContacted: e.target.value })} /></div>
                <div className="field"><label>Pamphlets Distributed</label>
                  <input type="number" value={form.campaign_pamphletsDistributed} onChange={(e) => setForm({ ...form, campaign_pamphletsDistributed: e.target.value })} /></div>
                <div className="field"><label>Expected Joiners</label>
                  <input type="number" value={form.campaign_expectedJoiners} onChange={(e) => setForm({ ...form, campaign_expectedJoiners: e.target.value })} /></div>
                <div className="field"><label>Actual Joiners</label>
                  <input type="number" value={form.campaign_actualJoiners} onChange={(e) => setForm({ ...form, campaign_actualJoiners: e.target.value })} /></div>
                <div className="field"><label>Volunteer Hours</label>
                  <input type="number" step="0.5" value={form.campaign_volunteerHours} onChange={(e) => setForm({ ...form, campaign_volunteerHours: e.target.value })} /></div>
              </>
            )}
          </div>
          {/* Custom fields configured for this activity type via the
              Event Manager catalogue. */}
          {selectedType && (selectedType.fields || []).length > 0 && (
            <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px dashed var(--border)' }}>
              <div className="muted" style={{ fontSize: 12, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                {selectedType.label} fields
              </div>
              <DynamicForm
                snapshot={selectedType}
                value={form.dynamicData || {}}
                onChange={(next) => setForm({ ...form, dynamicData: next })}
                mode="create"
              />
            </div>
          )}
          <div style={{ marginTop: 18, display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button className="btn secondary" type="button" onClick={() => setShow(false)}>Cancel</button>
            <button className="btn" onClick={create}>Save Activity</button>
          </div>
        </div>
        </div>
      )}

      <table className="list">
        <thead>
          <tr><th>When</th><th>Type</th><th>Title</th><th>Venue</th><th>State</th><th>Photos</th><th></th></tr>
        </thead>
        <tbody>
          {items.length === 0 && <tr><td colSpan="7">No activities yet.</td></tr>}
          {items.map((a) => (
            <tr key={a._id}>
              <td>{new Date(a.startAt).toLocaleString()}</td>
              <td>{a.type}</td>
              <td>{a.title}</td>
              <td>{a.venue || '—'}</td>
              <td><span className={`badge ${a.state}`}>{a.state}</span></td>
              <td>{(a.photos || []).length}</td>
              <td style={{ whiteSpace: 'nowrap' }}>
                {canManage && a.state !== 'COMPLETED' && (
                  <>
                    <label className="btn secondary" style={{ cursor: 'pointer' }}>
                      Photo
                      <input type="file" accept="image/*" hidden onChange={(e) => uploadPhoto(a._id, e.target.files?.[0])} />
                    </label>{' '}
                    <button className="btn" onClick={() => complete(a._id)}>Complete</button>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
