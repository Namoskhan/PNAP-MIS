import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useUnit } from '../../context/UnitContext';
import { useAuth } from '../../context/AuthContext';
import { canManageMeetings, isCentralAdminOversight, isSuperAdminOversight } from '../../utils/permissions';
import { api, errorMessage } from '../../api/client';
import useEventTypes from '../../hooks/useEventTypes';
import DynamicForm from '../../components/dynamic-form/DynamicForm';

// Default starting type when no types have loaded yet — kept here so
// the form has a sensible empty state. The picker itself is sourced
// from /api/events/types (active types only) so admins can extend
// the catalogue without a code change.
const DEFAULT_TYPE_CODE = 'GBM';

const EMPTY_FORM = {
  typeCode: DEFAULT_TYPE_CODE, title: '', venue: '', startAt: '', endAt: '',
  chairpersonId: '', agenda: '', gpsLat: '', gpsLng: '',
  dynamicData: {},
};

// SRS §3.1 — at Area+ levels, two distinct bodies meet: the Executive
// (cabinet only) and the full Committee (executive + BU office-holders
// + permanent members). The toggle filters meetings into the two
// streams. Below Area level there's only one body, so the toggle is
// hidden.
function bodySupported(level) {
  return level === 'AREA' || level === 'DISTRICT' || level === 'PROVINCE' || level === 'CENTRAL';
}

function downloadAuthed(path, filename) {
  const token = localStorage.getItem('pnap_token');
  return fetch(path, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
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

export default function MeetingsPage() {
  const { ctx } = useUnit();
  const { user } = useAuth();
  const location = useLocation();
  const canManage = canManageMeetings(user) && !isCentralAdminOversight(user) && !isSuperAdminOversight(user);
  // Pure-member viewers (no admin / cabinet / operator role) shouldn't
  // see the "this unit only / subtree" scope selector — they're
  // pinned to a single Basic Unit and the option is meaningless.
  const NON_MEMBER_ROLES = [
    'SUPER_ADMIN','PROVINCE_ADMIN','DISTRICT_ADMIN','AREA_ADMIN',
    'SECRETARY','SENIOR_MAWIN','FINANCE_SECRETARY','PRESS_SECRETARY','CULTURE_SECRETARY','SPORTS_SECRETARY',
    'PRESIDENT','SR_VICE_PRESIDENT','VICE_PRESIDENT','GENERAL_SECRETARY',
    'CHAIRMAN','CO_CHAIRMAN','SR_VICE_CHAIRMAN','VICE_CHAIRMAN','FIRST_SECRETARY','OTHER',
  ];
  const isPureMember = !!user?.roles?.includes('MEMBER')
    && !NON_MEMBER_ROLES.some((r) => user.roles?.includes(r));
  // Senior Mawin (and equivalents) at a BASIC_UNIT — the scope select
  // only ever offers "This unit only" at BU level (no subordinates),
  // so it's a single-option dropdown. Hide it for SM at BU.
  const isSmAtBu = ctx?.unitLevel === 'BASIC_UNIT'
    && (user?.roles?.includes('SENIOR_MAWIN') || user?.roles?.includes('SR_VICE_PRESIDENT') || user?.roles?.includes('FIRST_SECRETARY'));
  const [items, setItems] = useState([]);
  const [members, setMembers] = useState([]);
  const [scope, setScope] = useState('own');
  const [showCreate, setShowCreate] = useState(false);
  // Default body — read once from URL so a "Committee Meetings" link
  // from the dashboard lands on the right tab.
  const initialBody = new URLSearchParams(location.search).get('body') === 'COMMITTEE' ? 'COMMITTEE' : 'EXECUTIVE';
  const [body, setBody] = useState(initialBody);
  const [form, setForm] = useState(EMPTY_FORM);
  const [finalizing, setFinalizing] = useState(null);
  const [editing, setEditing] = useState(null);
  const [docFor, setDocFor] = useState(null);
  const [photosFor, setPhotosFor] = useState(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [gpsHint, setGpsHint] = useState('');

  const showBodyToggle = ctx && bodySupported(ctx.unitLevel);

  // Active meeting types from the EventTypeConfig catalogue (PR 4b).
  // We pass `body` only when the body toggle is shown — at BU level
  // there's no body distinction, so the unfiltered catalogue is fine.
  const { types: eventTypes } = useEventTypes('MEETING', showBodyToggle ? body : undefined);

  // Resolve the currently-selected type doc so the create dialog can
  // render its custom fields via <DynamicForm>.
  const selectedType = useMemo(() => {
    return eventTypes.find((t) => String(t.code).toUpperCase() === String(form.typeCode).toUpperCase()) || null;
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [eventTypes, form.typeCode]);

  // Latest-fetch guard — when ctx changes mid-flight (e.g. user
  // drilled into a subordinate) ignore stale responses so they don't
  // overwrite the new view's data.
  const fetchIdRef = useRef(0);

  async function reload() {
    if (!ctx) return;
    const myId = ++fetchIdRef.current;
    const params = {
      unitLevel: ctx.unitLevel, unitId: ctx.unitId,
      scope: scope === 'tree' ? 'subtree' : undefined,
    };
    if (showBodyToggle) params.body = body;
    const r = await api.get('/meetings', { params });
    if (myId === fetchIdRef.current) setItems(r.data.data);
  }

  useEffect(() => { reload(); }, [ctx, scope, body]);

  useEffect(() => {
    if (!ctx) return;
    const params = { status: 'ACTIVE', limit: 500 };
    if (ctx.unitLevel === 'BASIC_UNIT') params.basicUnitId = ctx.unitId;
    else if (ctx.unitLevel === 'AREA') params.areaId = ctx.unitId;
    else if (ctx.unitLevel === 'DISTRICT') params.districtId = ctx.unitId;
    else if (ctx.unitLevel === 'PROVINCE') params.provinceId = ctx.unitId;
    api.get('/members', { params }).then((r) => setMembers(r.data.data)).catch(() => {});
  }, [ctx]);

  const previousMeeting = useMemo(() => {
    return (items || []).find((m) => m.state === 'FINALIZED') || null;
  }, [items]);

  function captureGps() {
    setGpsHint('');
    if (!navigator.geolocation) {
      setGpsHint('GPS not supported on this device. Enter coordinates manually or skip — GPS is optional.');
      return;
    }
    setGpsHint('Requesting location…');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm((f) => ({ ...f, gpsLat: pos.coords.latitude, gpsLng: pos.coords.longitude }));
        setGpsHint('Location captured.');
      },
      (e) => {
        if (e.code === 1) setGpsHint('Location permission denied. GPS is optional.');
        else setGpsHint(`Could not get location (${e.message}). GPS is optional.`);
      },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }

  async function create() {
    setErr(''); setMsg('');
    try {
      // Strip empty strings so optional fields don't ship as ''.
      // dynamicData is preserved as-is — server validates it against
      // the type's snapshot resolved fields.
      const { dynamicData, ...rest } = form;
      const payload = { ...rest, unitLevel: ctx.unitLevel, unitId: ctx.unitId };
      if (showBodyToggle) payload.body = body;
      Object.keys(payload).forEach((k) => { if (payload[k] === '') delete payload[k]; });
      if (dynamicData && Object.keys(dynamicData).length > 0) payload.dynamicData = dynamicData;
      await api.post('/meetings', payload);
      setMsg(showBodyToggle ? `${body === 'COMMITTEE' ? 'Committee' : 'Executive'} meeting scheduled.` : 'Meeting scheduled.');
      setForm(EMPTY_FORM);
      setShowCreate(false);
      reload();
    } catch (e) { setErr(errorMessage(e)); }
  }

  async function uploadPhoto(meetingId, file) {
    if (!file) return;
    const fd = new FormData(); fd.append('photos', file);
    try {
      const r = await api.post(`/meetings/${meetingId}/photos`, fd);
      const data = r.data.data;
      if (data.rejected?.length) {
        alert(`Some photos rejected:\n${data.rejected.map((x) => `• ${x.filename}: ${x.reason}`).join('\n')}`);
      }
      reload();
    } catch (e) { alert(errorMessage(e)); }
  }

  async function cancelMeeting(m) {
    const reason = prompt('Cancellation reason:');
    if (reason == null) return;
    try {
      await api.post(`/meetings/${m._id}/cancel`, { reason });
      reload();
    } catch (e) { alert(errorMessage(e)); }
  }

  function exportPdf() {
    const params = new URLSearchParams({ unitLevel: ctx.unitLevel, unitId: ctx.unitId });
    downloadAuthed(`/api/exports/unit/meetings/pdf?${params}`, `${ctx.unitName}-meetings.pdf`).catch(() => alert('Export failed.'));
  }
  function exportXlsx() {
    const params = new URLSearchParams({ unitLevel: ctx.unitLevel, unitId: ctx.unitId });
    downloadAuthed(`/api/exports/unit/meetings/xlsx?${params}`, `${ctx.unitName}-meetings.xlsx`).catch(() => alert('Export failed.'));
  }

  if (!ctx) return <p>Select a unit context first.</p>;

  return (
    <div>
      <div className="page-header">
        <h2>
          {showBodyToggle ? (body === 'COMMITTEE' ? 'Committee Meetings' : 'Executive Meetings') : 'Meetings'} · {ctx.unitName}
        </h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {/* At BU level the only option would be "This unit only" —
              hide the single-option dropdown for every persona. Above
              BU, hide it for pure-member viewers (pinned to one unit). */}
          {!isPureMember && ctx.unitLevel !== 'BASIC_UNIT' && (
            <select value={scope} onChange={(e) => setScope(e.target.value)}>
              <option value="own">This unit only</option>
              <option value="tree">Including subordinates</option>
            </select>
          )}
          <button className="btn secondary" onClick={exportPdf}>Export PDF</button>
          <button className="btn secondary" onClick={exportXlsx}>Export Excel</button>
          {canManage && (
            <button className="btn" onClick={() => setShowCreate(true)}>
              + Schedule {showBodyToggle ? (body === 'COMMITTEE' ? 'Committee ' : 'Executive ') : ''}Meeting
            </button>
          )}
        </div>
      </div>

      {showBodyToggle && (
        <div className="toolbar" style={{ marginBottom: 12 }}>
          <button
            className={`btn ${body === 'EXECUTIVE' ? '' : 'secondary'}`}
            onClick={() => setBody('EXECUTIVE')}
          >Executive Meetings</button>
          <button
            className={`btn ${body === 'COMMITTEE' ? '' : 'secondary'}`}
            onClick={() => setBody('COMMITTEE')}
          >Committee Meetings</button>
        </div>
      )}

      {err && <div className="alert error">{err}</div>}
      {msg && <div className="alert success">{msg}</div>}

      {showCreate && (
        <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setShowCreate(false); }}>
        <div className="modal" style={{ maxWidth: 720 }} role="dialog" aria-modal="true" aria-label="Schedule Meeting">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <h3 style={{ margin: 0 }}>Schedule a Meeting</h3>
            <button type="button" className="btn secondary" onClick={() => setShowCreate(false)} aria-label="Close" style={{ padding: '4px 10px', fontSize: 18, lineHeight: 1 }}>×</button>
          </div>
          <p className="muted" style={{ marginTop: 0 }}>
            Photos uploaded later must be taken with a phone camera (EXIF metadata intact). If
            GPS is set on the meeting, photos must be taken within 1 km of the venue.
          </p>
          <div className="form-grid">
            <div className="field">
              <label>Type *</label>
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
              <label>Date &amp; Time (Start) *</label>
              <input type="datetime-local" value={form.startAt} onChange={(e) => setForm({ ...form, startAt: e.target.value })} />
            </div>
            <div className="field">
              <label>End *</label>
              <input type="datetime-local" value={form.endAt} onChange={(e) => setForm({ ...form, endAt: e.target.value })} />
            </div>
            <div className="field full">
              <label>Venue *</label>
              <input value={form.venue} onChange={(e) => setForm({ ...form, venue: e.target.value })} />
            </div>
            <div className="field">
              <label>Chairperson</label>
              <select value={form.chairpersonId} onChange={(e) => setForm({ ...form, chairpersonId: e.target.value })}>
                <option value="">— pick a member —</option>
                {members.map((m) => <option key={m._id} value={m._id}>{m.fullName} · {m.memberId || m.cnic}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Venue GPS (optional, enables photo geo-fencing)</label>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input style={{ flex: 1 }} placeholder="lat" value={form.gpsLat} onChange={(e) => setForm({ ...form, gpsLat: e.target.value })} />
                <input style={{ flex: 1 }} placeholder="lng" value={form.gpsLng} onChange={(e) => setForm({ ...form, gpsLng: e.target.value })} />
                <button type="button" className="btn secondary" onClick={captureGps}>Capture</button>
              </div>
              {gpsHint && <div className="hint" style={{ marginTop: 4, fontSize: 12, color: 'var(--muted)' }}>{gpsHint}</div>}
            </div>
            <div className="field full">
              <label>Agenda</label>
              <textarea rows={3} value={form.agenda} onChange={(e) => setForm({ ...form, agenda: e.target.value })} />
            </div>
            {previousMeeting && (
              <div className="field full">
                <div className="muted" style={{ fontSize: 13 }}>
                  Previous report on file: <strong>{previousMeeting.type}</strong>
                  {previousMeeting.title ? ` — ${previousMeeting.title}` : ''} ·
                  {' '}{new Date(previousMeeting.startAt).toLocaleDateString()} · finalized.
                  Attach previous-report documents using the <strong>Documents</strong> button after scheduling.
                </div>
              </div>
            )}
          </div>
          {/* Custom fields configured for this type via the Event
              Manager catalogue. Renders inline below the standard
              fields, sorted by the field-library sortOrder. */}
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
            <button className="btn secondary" type="button" onClick={() => setShowCreate(false)}>Cancel</button>
            <button className="btn" onClick={create}>Schedule</button>
          </div>
        </div>
        </div>
      )}

      <table className="list">
        <thead>
          <tr>
            <th>When</th><th>Type</th><th>Venue</th><th>Chairperson</th>
            <th>Attendance</th><th>State</th><th>Photos</th><th>Docs</th><th></th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 && <tr><td colSpan="9">No meetings yet.</td></tr>}
          {items.map((m) => (
            <tr key={m._id}>
              <td>{new Date(m.startAt).toLocaleString()}</td>
              <td>{m.type}{m.title ? ` · ${m.title}` : ''}</td>
              <td>{m.venue}</td>
              <td>{m.chairpersonId?.fullName || '—'}</td>
              <td>{(m.attendance || []).filter((a) => a.status === 'PRESENT').length}</td>
              <td><span className={`badge ${m.state}`}>{m.state}</span></td>
              <td>
                {(m.photos || []).length === 0 ? (
                  <span className="muted">0</span>
                ) : (
                  <button
                    className="btn ghost"
                    onClick={() => setPhotosFor(m)}
                    style={{ padding: '2px 6px' }}
                    title="View photos with capture details"
                  >
                    📷 {(m.photos || []).length} · View
                  </button>
                )}
              </td>
              <td>{(m.documents || []).length}</td>
              <td style={{ whiteSpace: 'nowrap' }}>
                <button
                  className="btn ghost"
                  onClick={() => downloadAuthed(`/api/exports/meeting/${m._id}/pdf`, `meeting-${(m.title || m.type || 'minutes').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.pdf`).catch(() => alert('PDF download failed.'))}
                  title="Download this meeting as PDF (with photos embedded)"
                >📄 PDF</button>{' '}
                {canManage && m.state !== 'FINALIZED' && m.state !== 'CANCELLED' && (
                  <>
                    <button className="btn ghost" onClick={() => setEditing(m)}>Edit</button>{' '}
                    <button className="btn ghost" onClick={() => setDocFor(m)}>Docs</button>{' '}
                    <label className="btn secondary" style={{ cursor: 'pointer' }}>
                      Photo
                      <input type="file" accept="image/*" hidden onChange={(e) => uploadPhoto(m._id, e.target.files?.[0])} />
                    </label>{' '}
                    <button className="btn" onClick={() => setFinalizing(m)}>Finalize</button>{' '}
                    <button className="btn danger" onClick={() => cancelMeeting(m)}>Cancel</button>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {finalizing && (
        <FinalizeDialog
          meeting={finalizing}
          members={members}
          onClose={() => setFinalizing(null)}
          onDone={() => { setFinalizing(null); reload(); }}
        />
      )}
      {editing && (
        <EditDialog
          meeting={editing}
          members={members}
          onClose={() => setEditing(null)}
          onDone={() => { setEditing(null); reload(); }}
        />
      )}
      {photosFor && (
        <PhotosDialog
          meeting={photosFor}
          onClose={() => setPhotosFor(null)}
        />
      )}
      {docFor && (
        <DocumentsDialog
          meeting={docFor}
          onClose={() => setDocFor(null)}
          onDone={() => { setDocFor(null); reload(); }}
        />
      )}
    </div>
  );
}

function FinalizeDialog({ meeting, members, onClose, onDone }) {
  const [decisions, setDecisions] = useState('');
  const [upcomingStrategy, setUpcomingStrategy] = useState('');
  const [notes, setNotes] = useState('');
  const [supervisorAttended, setSupervisorAttended] = useState(false);
  const [supervisorMemberId, setSupervisorMemberId] = useState('');
  const [attendance, setAttendance] = useState(() => members.map((m) => ({
    memberId: m._id, name: m.fullName, status: 'ABSENT',
  })));
  const [studyRows, setStudyRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const isStudy = meeting.type === 'STC';

  function setStatus(memberId, status) {
    setAttendance((rows) => rows.map((r) => r.memberId === memberId ? { ...r, status } : r));
  }
  function markAll(status) {
    setAttendance((rows) => rows.map((r) => ({ ...r, status })));
  }
  function addStudyRow() {
    setStudyRows((rows) => [...rows, { memberId: '', topic: '', summary: '' }]);
  }
  function updateStudyRow(i, patch) {
    setStudyRows((rows) => rows.map((r, idx) => idx === i ? { ...r, ...patch } : r));
  }
  function removeStudyRow(i) {
    setStudyRows((rows) => rows.filter((_, idx) => idx !== i));
  }

  async function submit() {
    setErr(''); setBusy(true);
    try {
      const payload = {
        decisions,
        upcomingStrategy,
        notes,
        supervisorAttended,
        supervisorMemberId: supervisorMemberId || undefined,
        attendance: attendance.map((r) => ({ memberId: r.memberId, status: r.status })),
        studyContributions: isStudy ? studyRows.filter((s) => s.memberId && s.topic.trim()) : undefined,
      };
      Object.keys(payload).forEach((k) => { if (payload[k] === '' || payload[k] === undefined) delete payload[k]; });
      await api.post(`/meetings/${meeting._id}/finalize`, payload);
      onDone();
    } catch (e) {
      setErr(errorMessage(e));
    } finally { setBusy(false); }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 760 }}>
        <h3 style={{ marginTop: 0 }}>Finalize Meeting · {meeting.type}</h3>
        <p className="muted" style={{ marginTop: 0 }}>
          At least one photo must be uploaded before finalizing. A SHA-256 hash is sealed onto the record.
        </p>
        {err && <div className="alert error">{err}</div>}

        <div className="form-grid">
          <div className="field full">
            <label>Decisions taken *</label>
            <textarea rows={3} value={decisions} onChange={(e) => setDecisions(e.target.value)} />
          </div>
          <div className="field full">
            <label>Upcoming strategy</label>
            <textarea rows={2} value={upcomingStrategy} onChange={(e) => setUpcomingStrategy(e.target.value)} />
          </div>
          <div className="field full">
            <label>Activity notes</label>
            <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div className="field">
            <label>
              <input type="checkbox" checked={supervisorAttended} onChange={(e) => setSupervisorAttended(e.target.checked)} />
              {' '}Supervisor attended
            </label>
          </div>
          {supervisorAttended && (
            <div className="field">
              <label>Supervisor</label>
              <select value={supervisorMemberId} onChange={(e) => setSupervisorMemberId(e.target.value)}>
                <option value="">— pick supervisor —</option>
                {members.map((m) => <option key={m._id} value={m._id}>{m.fullName}</option>)}
              </select>
            </div>
          )}
        </div>

        <h4 style={{ marginBottom: 6 }}>
          Attendance ({attendance.filter((r) => r.status === 'PRESENT').length} present / {attendance.length})
        </h4>
        <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
          <button type="button" className="btn ghost" onClick={() => markAll('PRESENT')}>Mark all present</button>
          <button type="button" className="btn ghost" onClick={() => markAll('ABSENT')}>Mark all absent</button>
        </div>
        <div style={{ maxHeight: 240, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 6 }}>
          <table className="list" style={{ margin: 0 }}>
            <thead>
              <tr><th>Member</th><th>Present</th><th>Late</th><th>Absent</th></tr>
            </thead>
            <tbody>
              {attendance.length === 0 && <tr><td colSpan="4" className="muted">No members on roster yet.</td></tr>}
              {attendance.map((r) => (
                <tr key={r.memberId}>
                  <td>{r.name}</td>
                  <td><input type="radio" checked={r.status === 'PRESENT'} onChange={() => setStatus(r.memberId, 'PRESENT')} /></td>
                  <td><input type="radio" checked={r.status === 'LATE'} onChange={() => setStatus(r.memberId, 'LATE')} /></td>
                  <td><input type="radio" checked={r.status === 'ABSENT'} onChange={() => setStatus(r.memberId, 'ABSENT')} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {isStudy && (
          <>
            <h4 style={{ marginBottom: 6, marginTop: 14 }}>Study Contributions</h4>
            <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
              Record what each speaker presented. Counted in their performance report.
            </p>
            {studyRows.map((s, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr auto', gap: 6, marginBottom: 6 }}>
                <select value={s.memberId} onChange={(e) => updateStudyRow(i, { memberId: e.target.value })}>
                  <option value="">— member —</option>
                  {members.map((m) => <option key={m._id} value={m._id}>{m.fullName}</option>)}
                </select>
                <input placeholder="Topic" value={s.topic} onChange={(e) => updateStudyRow(i, { topic: e.target.value })} />
                <input placeholder="Summary" value={s.summary} onChange={(e) => updateStudyRow(i, { summary: e.target.value })} />
                <button type="button" className="btn ghost" onClick={() => removeStudyRow(i)}>×</button>
              </div>
            ))}
            <button type="button" className="btn secondary" onClick={addStudyRow}>+ Add contribution</button>
          </>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'flex-end' }}>
          <button className="btn secondary" onClick={onClose}>Cancel</button>
          <button className="btn" disabled={busy || !decisions.trim()} onClick={submit}>
            {busy ? 'Finalizing…' : 'Finalize'}
          </button>
        </div>
      </div>
    </div>
  );
}

function toLocalInput(d) {
  if (!d) return '';
  const date = new Date(d);
  const tz = date.getTimezoneOffset() * 60000;
  return new Date(date - tz).toISOString().slice(0, 16);
}

function EditDialog({ meeting, members, onClose, onDone }) {
  // Edit dialog uses its own useEventTypes call so it works even when
  // opened from a context where the parent's hook hasn't refreshed.
  // Body filtering follows the meeting's own body, since changing body
  // is not allowed via this dialog.
  const { types: eventTypes } = useEventTypes('MEETING', meeting.body);
  const [form, setForm] = useState({
    typeCode: (meeting.typeCode || meeting.type || '').toUpperCase(),
    title: meeting.title || '',
    venue: meeting.venue || '',
    startAt: toLocalInput(meeting.startAt),
    endAt: toLocalInput(meeting.endAt),
    chairpersonId: meeting.chairpersonId?._id || meeting.chairpersonId || '',
    agenda: meeting.agenda || '',
    upcomingStrategy: meeting.upcomingStrategy || '',
    notes: meeting.notes || '',
    gpsLat: meeting.gps?.lat ?? '',
    gpsLng: meeting.gps?.lng ?? '',
    dynamicData: meeting.dynamicData || {},
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const selectedType = useMemo(() => {
    return eventTypes.find((t) => String(t.code).toUpperCase() === String(form.typeCode).toUpperCase()) || null;
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [eventTypes, form.typeCode]);

  async function save() {
    setErr(''); setBusy(true);
    try {
      const { dynamicData, ...rest } = form;
      const payload = { ...rest };
      Object.keys(payload).forEach((k) => { if (payload[k] === '') delete payload[k]; });
      // Always send dynamicData so the server can re-validate against
      // the (possibly new) snapshot — even if the bag is empty.
      payload.dynamicData = dynamicData || {};
      await api.patch(`/meetings/${meeting._id}`, payload);
      onDone();
    } catch (e) {
      setErr(errorMessage(e));
    } finally { setBusy(false); }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 720 }}>
        <h3 style={{ marginTop: 0 }}>Edit Meeting</h3>
        {err && <div className="alert error">{err}</div>}
        <div className="form-grid">
          <div className="field">
            <label>Type</label>
            <select
              value={form.typeCode}
              onChange={(e) => setForm({ ...form, typeCode: e.target.value, dynamicData: {} })}
            >
              {eventTypes.length === 0 && <option value={form.typeCode}>{form.typeCode}</option>}
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
          <div className="field">
            <label>Chairperson</label>
            <select value={form.chairpersonId} onChange={(e) => setForm({ ...form, chairpersonId: e.target.value })}>
              <option value="">— pick a member —</option>
              {members.map((m) => <option key={m._id} value={m._id}>{m.fullName}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Venue GPS</label>
            <div style={{ display: 'flex', gap: 6 }}>
              <input style={{ flex: 1 }} placeholder="lat" value={form.gpsLat} onChange={(e) => setForm({ ...form, gpsLat: e.target.value })} />
              <input style={{ flex: 1 }} placeholder="lng" value={form.gpsLng} onChange={(e) => setForm({ ...form, gpsLng: e.target.value })} />
            </div>
          </div>
          <div className="field full">
            <label>Agenda</label>
            <textarea rows={3} value={form.agenda} onChange={(e) => setForm({ ...form, agenda: e.target.value })} />
          </div>
        </div>
        {/* Custom-field section, sourced from the chosen type's
            EventTypeConfig. Mirrors the create dialog. */}
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
        <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'flex-end' }}>
          <button className="btn secondary" onClick={onClose}>Cancel</button>
          <button className="btn" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  );
}

// Photo gallery for a meeting — opens from the Photos column on the
// list. Shows each captured image with metadata (capture timestamp,
// GPS coordinates with map link, content hash for tamper-detection).
function PhotosDialog({ meeting, onClose }) {
  const photos = meeting.photos || [];
  const [active, setActive] = useState(0);
  const cur = photos[active];

  function fmtCoord(n) {
    if (n == null) return '—';
    return Number(n).toFixed(6);
  }
  function gmapsLink(lat, lng) {
    return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  }
  function ageLabel(d) {
    if (!d) return '';
    const ms = Date.now() - new Date(d).getTime();
    const days = Math.floor(ms / 86400000);
    if (days <= 0) return 'today';
    if (days === 1) return '1 day ago';
    if (days < 30) return `${days} days ago`;
    const months = Math.floor(days / 30);
    return months === 1 ? '1 month ago' : `${months} months ago`;
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 920, padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
          <div>
            <h3 style={{ marginTop: 0, marginBottom: 2 }}>Meeting Photos</h3>
            <div className="muted" style={{ fontSize: 12 }}>
              {meeting.title || meeting.type} · {new Date(meeting.startAt).toLocaleString()} · {photos.length} photo{photos.length === 1 ? '' : 's'}
            </div>
          </div>
          <button className="btn secondary" onClick={onClose}>Close</button>
        </div>

        {photos.length === 0 ? (
          <p className="muted" style={{ margin: '24px 0', textAlign: 'center' }}>
            No photos uploaded for this meeting yet.
          </p>
        ) : (
          <>
            {/* Main viewer + metadata side panel */}
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)', gap: 14, alignItems: 'flex-start' }}>
              <div style={{ background: '#000', borderRadius: 'var(--radius)', overflow: 'hidden', border: '1px solid var(--border)', minHeight: 260, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <a href={cur.url} target="_blank" rel="noreferrer" style={{ display: 'block', maxHeight: 420 }}>
                  <img
                    src={cur.url}
                    alt={`Photo ${active + 1}`}
                    style={{ display: 'block', maxWidth: '100%', maxHeight: 420, objectFit: 'contain' }}
                  />
                </a>
              </div>
              <div>
                <h4 style={{ marginTop: 0 }}>Photo {active + 1} of {photos.length}</h4>
                <table style={{ width: '100%', fontSize: 13 }}>
                  <tbody>
                    <tr>
                      <td style={{ color: 'var(--muted)', padding: '4px 0', verticalAlign: 'top', width: 110 }}>Captured</td>
                      <td style={{ padding: '4px 0' }}>
                        {cur.capturedAt ? (
                          <>
                            {new Date(cur.capturedAt).toLocaleString()}
                            <div className="muted" style={{ fontSize: 11 }}>{ageLabel(cur.capturedAt)}</div>
                          </>
                        ) : <span className="muted">— not recorded —</span>}
                      </td>
                    </tr>
                    <tr>
                      <td style={{ color: 'var(--muted)', padding: '4px 0', verticalAlign: 'top' }}>GPS</td>
                      <td style={{ padding: '4px 0' }}>
                        {cur.gps?.lat != null && cur.gps?.lng != null ? (
                          <>
                            <code style={{ fontSize: 11 }}>{fmtCoord(cur.gps.lat)}, {fmtCoord(cur.gps.lng)}</code>
                            <div style={{ marginTop: 4 }}>
                              <a href={gmapsLink(cur.gps.lat, cur.gps.lng)} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>
                                Open in Google Maps ↗
                              </a>
                            </div>
                          </>
                        ) : <span className="muted">— not recorded —</span>}
                      </td>
                    </tr>
                    <tr>
                      <td style={{ color: 'var(--muted)', padding: '4px 0', verticalAlign: 'top' }}>SHA-256</td>
                      <td style={{ padding: '4px 0' }}>
                        {cur.sha256 ? (
                          <code style={{ fontSize: 11, wordBreak: 'break-all' }}>{cur.sha256.slice(0, 16)}…{cur.sha256.slice(-8)}</code>
                        ) : <span className="muted">—</span>}
                      </td>
                    </tr>
                    <tr>
                      <td style={{ color: 'var(--muted)', padding: '4px 0', verticalAlign: 'top' }}>File</td>
                      <td style={{ padding: '4px 0' }}>
                        <a href={cur.url} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>Open full size ↗</a>
                      </td>
                    </tr>
                  </tbody>
                </table>
                {photos.length > 1 && (
                  <div style={{ display: 'flex', gap: 6, marginTop: 14 }}>
                    <button className="btn secondary" disabled={active === 0} onClick={() => setActive((i) => Math.max(0, i - 1))}>← Prev</button>
                    <button className="btn secondary" disabled={active === photos.length - 1} onClick={() => setActive((i) => Math.min(photos.length - 1, i + 1))}>Next →</button>
                  </div>
                )}
              </div>
            </div>

            {/* Thumbnail strip — click any to switch active */}
            {photos.length > 1 && (
              <div style={{ display: 'flex', gap: 8, marginTop: 14, overflowX: 'auto', paddingBottom: 6 }}>
                {photos.map((p, i) => (
                  <button
                    key={i}
                    onClick={() => setActive(i)}
                    style={{
                      flexShrink: 0, padding: 0,
                      border: i === active ? '2px solid var(--primary)' : '1px solid var(--border)',
                      borderRadius: 4, background: 'none', cursor: 'pointer',
                      width: 78, height: 78, overflow: 'hidden',
                    }}
                    title={p.capturedAt ? new Date(p.capturedAt).toLocaleString() : `Photo ${i + 1}`}
                  >
                    <img src={p.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function DocumentsDialog({ meeting, onClose, onDone }) {
  const [docs, setDocs] = useState(meeting.documents || []);
  const [kind, setKind] = useState('AGENDA');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function upload(file) {
    if (!file) return;
    setErr(''); setBusy(true);
    try {
      const fd = new FormData();
      fd.append('documents', file);
      fd.append('kind', kind);
      const r = await api.post(`/meetings/${meeting._id}/documents`, fd);
      setDocs(r.data.data.documents || []);
    } catch (e) { setErr(errorMessage(e)); }
    finally { setBusy(false); }
  }

  return (
    <div className="modal-backdrop" onClick={() => { onDone(); }}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>Documents</h3>
        <p className="muted" style={{ marginTop: 0 }}>
          Attach the previous-meeting report, the agenda, signed minutes, etc.
          PDFs and images supported.
        </p>
        {err && <div className="alert error">{err}</div>}

        <div className="form-grid">
          <div className="field">
            <label>Document type</label>
            <select value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="AGENDA">Agenda</option>
              <option value="PREVIOUS_REPORT">Previous Report</option>
              <option value="MINUTES">Minutes</option>
              <option value="OTHER">Other</option>
            </select>
          </div>
          <div className="field">
            <label>Upload</label>
            <input type="file" accept=".pdf,image/*,.doc,.docx" disabled={busy} onChange={(e) => upload(e.target.files?.[0])} />
          </div>
        </div>

        <table className="list" style={{ marginTop: 14 }}>
          <thead><tr><th>Filename</th><th>Type</th><th>Uploaded</th><th></th></tr></thead>
          <tbody>
            {docs.length === 0 && <tr><td colSpan="4" className="muted">No documents yet.</td></tr>}
            {docs.map((d, i) => (
              <tr key={i}>
                <td>{d.filename}</td>
                <td>{d.kind}</td>
                <td>{new Date(d.uploadedAt).toLocaleDateString()}</td>
                <td><a href={d.url} target="_blank" rel="noreferrer">Open</a></td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
          <button className="btn" onClick={onDone}>Done</button>
        </div>
      </div>
    </div>
  );
}
