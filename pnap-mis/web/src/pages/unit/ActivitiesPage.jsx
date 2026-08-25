import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useUnit } from '../../context/UnitContext';
import { useAuth } from '../../context/AuthContext';
import { canManageMeetings, isCentralAdminOversight, isSuperAdminOversight } from '../../utils/permissions';
import { api, errorMessage } from '../../api/client';
import { useToast } from '../../components/Toast';
import useEventTypes from '../../hooks/useEventTypes';
import DynamicForm from '../../components/dynamic-form/DynamicForm';

import dialog from '../../components/dialog';
import { XIcon } from '../../components/icons';
import { formatUnitArrangedBy } from '../../utils/unitFormat';
function bodySupported(level) {
  return level === 'AREA' || level === 'DISTRICT' || level === 'PROVINCE' || level === 'CENTRAL';
}

// Default starting type — picker itself is sourced from
// /api/events/types (the EventTypeConfig catalogue).
const DEFAULT_TYPE_CODE = 'CAMPAIGN';

// Mirrors upload.array('photos', 10) on the server route — kept in sync
// so the picker never sends a batch the server will truncate silently.
const MAX_PHOTOS = 10;

export default function ActivitiesPage() {
  const { ctx } = useUnit();
  const { user } = useAuth();
  const toast = useToast();
  const location = useLocation();
  const canManage = canManageMeetings(user) && !isCentralAdminOversight(user) && !isSuperAdminOversight(user);

  // URL check: committee vs jirga vs congress vs regular executive activities
  const queryBody = new URLSearchParams(location.search).get('body');
  const isCongressView = queryBody === 'CONGRESS';
  const isJirgaView = queryBody === 'JIRGA';
  const isCommitteeView = queryBody === 'COMMITTEE';
  const targetBody = isCongressView ? 'CONGRESS' : (isJirgaView ? 'JIRGA' : (isCommitteeView ? 'COMMITTEE' : 'EXECUTIVE'));

  const [items, setItems] = useState([]);
  const [show, setShow] = useState(false);
  const [form, setForm] = useState({
    typeCode: DEFAULT_TYPE_CODE, title: '', description: '', startAt: '', endAt: '', venue: '',
    campaign_householdsVisited: '', campaign_peopleContacted: '', campaign_pamphletsDistributed: '',
    campaign_expectedJoiners: '', campaign_actualJoiners: '', campaign_volunteerHours: '',
    dynamicData: {},
  });

  // Active activity types from the EventTypeConfig catalogue for this stream
  const { types: eventTypes } = useEventTypes('ACTIVITY', targetBody);
  const availableTypes = useMemo(() => {
    if (isCongressView) {
      return eventTypes.filter((t) => t.appliesTo?.congress !== false);
    }
    if (isJirgaView) {
      return eventTypes.filter((t) => t.appliesTo?.jirga !== false);
    }
    if (isCommitteeView) {
      return eventTypes.filter((t) => t.appliesTo?.committee !== false);
    }
    return eventTypes.filter((t) => t.appliesTo?.executive !== false);
  }, [eventTypes, isCommitteeView, isJirgaView, isCongressView]);

  const selectedType = useMemo(() => {
    return availableTypes.find((t) => String(t.code).toUpperCase() === String(form.typeCode).toUpperCase())
      || eventTypes.find((t) => String(t.code).toUpperCase() === String(form.typeCode).toUpperCase())
      || null;
  }, [availableTypes, eventTypes, form.typeCode]);

  // Latest-fetch guard — drop stale responses from a previous ctx.
  const fetchIdRef = useRef(0);

  async function reload() {
    if (!ctx) return;
    const myId = ++fetchIdRef.current;
    const params = {
      unitLevel: ctx.unitLevel,
      unitId: ctx.unitId,
      body: targetBody,
    };
    const r = await api.get('/activities', { params });
    if (myId === fetchIdRef.current) setItems(r.data.data || []);
  }
  useEffect(() => { reload(); }, [ctx, targetBody]);

  // Clean separation of items for the active stream
  const displayedItems = useMemo(() => {
    return (items || []).filter((a) => {
      if (isCongressView) return a.body === 'CONGRESS';
      if (isJirgaView) return a.body === 'JIRGA';
      if (isCommitteeView) return a.body === 'COMMITTEE';
      return a.body === 'EXECUTIVE' || !a.body || (a.body !== 'COMMITTEE' && a.body !== 'JIRGA' && a.body !== 'CONGRESS');
    });
  }, [items, isCommitteeView, isJirgaView, isCongressView]);

  function openCreate() {
    const initialCode = availableTypes[0]?.code || DEFAULT_TYPE_CODE;
    setForm({
      typeCode: initialCode,
      title: '',
      description: '',
      startAt: '',
      endAt: '',
      venue: '',
      campaign_householdsVisited: '',
      campaign_peopleContacted: '',
      campaign_pamphletsDistributed: '',
      campaign_expectedJoiners: '',
      campaign_actualJoiners: '',
      campaign_volunteerHours: '',
      dynamicData: {},
    });
    setShow(true);
  }

  async function create() {
    try {
      const { dynamicData, ...rest } = form;
      const payload = { ...rest, unitLevel: ctx.unitLevel, unitId: ctx.unitId, body: targetBody };
      Object.keys(payload).forEach((k) => { if (payload[k] === '') delete payload[k]; });
      if (dynamicData && Object.keys(dynamicData).length > 0) payload.dynamicData = dynamicData;
      const title = form.title;
      await api.post('/activities', payload);
      setShow(false);
      reload();
      const bodyLabel = isCongressView ? 'Congress' : (isCommitteeView ? 'Committee' : 'Executive');
      toast.success(
        `${bodyLabel} activity "${title}" recorded.`,
        { title: 'Activity recorded' }
      );
    } catch (e) {
      toast.error(errorMessage(e), { title: 'Could not record activity', duration: 7000 });
    }
  }

  // Takes the whole FileList: the route is upload.array('photos', 10),
  // so the server has always accepted a batch — the picker just never
  // offered one, which forced a separate request (and a separate
  // reload) per photo when finalizing needs two.
  async function uploadPhotos(id, fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    if (files.length > MAX_PHOTOS) {
      toast.warning(
        `Only ${MAX_PHOTOS} photos can be uploaded at once — the first ${MAX_PHOTOS} were sent.`,
        { title: 'Too many selected', duration: 7000 },
      );
    }
    const batch = files.slice(0, MAX_PHOTOS);
    const fd = new FormData();
    batch.forEach((f) => fd.append('photos', f));
    const pending = toast.info(
      batch.length === 1 ? `Uploading ${batch[0].name}…` : `Uploading ${batch.length} photos…`,
      { duration: 0 },
    );
    try {
      const r = await api.post(`/activities/${id}/photos`, fd);
      const data = r.data.data;
      toast.dismiss(pending);
      const okCount = batch.length - (data.rejected?.length || 0);
      if (okCount > 0) {
        toast.success(`${okCount} photo${okCount === 1 ? '' : 's'} uploaded.`);
      }
      if (data.rejected?.length) {
        // Partial success — the accepted photos did upload, so this is a
        // warning rather than an error, and it lists what to re-shoot.
        toast.warning(
          `${data.rejected.length} photo(s) rejected: ${data.rejected.map((x) => `${x.filename} (${x.reason})`).join('; ')}`,
          { title: 'Some photos rejected', duration: 9000 }
        );
      }
      reload();
    } catch (e) {
      toast.dismiss(pending);
      toast.error(errorMessage(e), { title: 'Photo upload failed', duration: 7000 });
    }
  }

  async function complete(id) {
    try {
      await api.post(`/activities/${id}/complete`, {});
      reload();
      toast.success('Activity marked complete.');
    } catch (e) {
      toast.error(errorMessage(e), { title: 'Could not complete activity', duration: 7000 });
    }
  }

  async function cancelActivity(a) {
    const reason = await dialog.prompt('Cancellation reason:');
    if (reason == null) return;
    try {
      await api.post(`/activities/${a._id}/cancel`, { reason });
      reload();
      toast.success(`"${a.title || 'Activity'}" cancelled.`, { title: 'Activity cancelled' });
    } catch (e) {
      toast.error(errorMessage(e), { title: 'Could not cancel activity', duration: 7000 });
    }
  }

  // Download helper used by other units pages — object URL approach
  // so an authenticated fetch can surface in the browser's Downloads.
  function downloadAuthed(path, filename) {
    const token = localStorage.getItem('pnap_token');
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    return fetch(path, { headers })
      .then(async (res) => {
        if (!res.ok) throw new Error('Export failed');
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = filename;
        document.body.appendChild(a); a.click(); a.remove();
        URL.revokeObjectURL(url);
      });
  }

  function exportParams() {
    const params = new URLSearchParams({
      unitLevel: ctx.unitLevel,
      unitId: ctx.unitId,
      body: targetBody,
    });
    return params;
  }
  function exportName(ext) {
    return `${ctx.unitName}-${targetBody.toLowerCase()}-activities.${ext}`;
  }
  function exportPdf() {
    downloadAuthed(`/api/exports/unit/activities/pdf?${exportParams()}`, exportName('pdf')).catch(() => toast.error('Export failed.', { title: 'Could not export' }));
  }
  function exportXlsx() {
    downloadAuthed(`/api/exports/unit/activities/xlsx?${exportParams()}`, exportName('xlsx')).catch(() => toast.error('Export failed.', { title: 'Could not export' }));
  }

  if (!ctx) return <p>Select a unit context first.</p>;

  return (
    <div>
      <div className="page-header">
        <h2>
          {isCongressView
            ? 'National Congress Activities · PKNAP Central'
            : (isJirgaView
              ? (ctx.unitLevel === 'CENTRAL' ? 'Qomi Jirga Activities' : `Sobayi Jirga Activities · ${ctx.unitName}`)
              : (isCommitteeView ? `Committee Activities · ${ctx.unitName}` : `Executive Activities · ${ctx.unitName}`))}
        </h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn secondary" onClick={exportPdf}>Export PDF</button>
          <button className="btn secondary" onClick={exportXlsx}>Export Excel</button>
          {canManage && (
            <button className="btn" onClick={openCreate}>
              {isCongressView ? '+ Record Congress Activity' : (isJirgaView ? '+ Record Jirga Activity' : (isCommitteeView ? '+ Record Committee Activity' : '+ Record Activity'))}
            </button>
          )}
        </div>
      </div>

      {show && (
        <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setShow(false); }}>
          <div className="modal" style={{ maxWidth: 720 }} role="dialog" aria-modal="true" aria-label="Record Activity">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <h3 style={{ margin: 0 }}>
                {isCongressView ? 'Record Congress Activity' : (isJirgaView ? 'Record Jirga Activity' : (isCommitteeView ? 'Record Committee Activity' : 'Record Activity'))}
              </h3>
              <button
                type="button"
                className="btn secondary"
                onClick={() => setShow(false)}
                aria-label="Close"
                style={{ padding: '4px 10px', fontSize: 18, lineHeight: 1 }}
              >
                <XIcon size={16} />
              </button>
            </div>
            <div className="form-grid">
              <div className="field">
                <label>Type</label>
                <select
                  value={form.typeCode}
                  onChange={(e) => setForm({ ...form, typeCode: e.target.value, dynamicData: {} })}
                >
                  {availableTypes.length === 0 && <option value="">— Loading types —</option>}
                  {availableTypes.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}
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
          {displayedItems.length === 0 && (
            <tr>
              <td colSpan="7" style={{ textAlign: 'center', padding: '24px 12px', color: 'var(--text-muted)' }}>
                No {isCongressView ? 'Congress' : (isJirgaView ? 'Jirga' : (isCommitteeView ? 'committee' : 'executive'))} activities recorded yet.
              </td>
            </tr>
          )}
          {displayedItems.map((a) => {
            const isCng = a.body === 'CONGRESS';
            const isJrg = a.body === 'JIRGA';
            const isCm = a.body === 'COMMITTEE';
            return (
            <tr key={a._id}>
              <td>{new Date(a.startAt).toLocaleString()}</td>
              <td>
                <span
                  className="badge"
                  style={{
                    marginRight: 6,
                    background: isCng ? '#e0f2fe' : (isJrg ? '#f3e8ff' : (isCm ? 'var(--primary-subtle, #e0f2fe)' : 'var(--surface-sunken, #f1f5f9)')),
                    color: isCng ? '#0369a1' : (isJrg ? '#6b21a8' : (isCm ? 'var(--primary, #0369a1)' : 'var(--text-muted, #475569)')),
                    border: isCng ? '1px solid #bae6fd' : (isJrg ? '1px solid #d8b4fe' : undefined),
                    fontWeight: 600,
                    fontSize: 11,
                  }}
                >
                  {isCng ? 'Congress' : (isJrg ? 'Jirga' : (isCm ? 'Committee' : 'Executive'))}
                </span>
                {a.type}
              </td>
              <td>
                <div>{a.title}</div>
                {a.unitLevel && (
                  <div className="muted" style={{ fontSize: 11, marginTop: 3 }}>
                    <span className="badge" style={{ fontSize: 10, padding: '1px 5px', background: 'var(--surface-alt)', border: '1px solid var(--border)' }}>
                      {formatUnitArrangedBy(a, { isCommitteeView, isJirgaView, isCongressView })}
                    </span>
                  </div>
                )}
              </td>
              <td>{a.venue || '—'}</td>
              <td><span className={`badge ${a.state}`}>{a.state}</span></td>
              <td>{(a.photos || []).length}</td>
              <td style={{ whiteSpace: 'nowrap' }}>
                {canManage && a.state !== 'COMPLETED' && a.state !== 'CANCELLED' && (
                  <>
                    <label className="btn secondary" style={{ cursor: 'pointer' }}>
                      Photos
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        hidden
                        // Snapshot to an array BEFORE clearing value:
                        // resetting the input empties its live FileList.
                        // The reset is what lets the same file be picked
                        // again after a rejection.
                        onChange={(e) => {
                          const picked = Array.from(e.target.files || []);
                          e.target.value = '';
                          uploadPhotos(a._id, picked);
                        }}
                      />
                    </label>{' '}
                    <button className="btn" onClick={() => complete(a._id)}>Complete</button>{' '}
                    <button className="btn danger" onClick={() => cancelActivity(a)}>Cancel</button>
                  </>
                )}
              </td>
            </tr>
          );
        })}
        </tbody>
      </table>
    </div>
  );
}
