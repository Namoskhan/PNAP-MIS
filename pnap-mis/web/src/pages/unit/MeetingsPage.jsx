import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useUnit } from '../../context/UnitContext';
import { useAuth } from '../../context/AuthContext';
import { canManageMeetings, isCentralAdminOversight, isSuperAdminOversight, roleLabel } from '../../utils/permissions';
import { api, errorMessage } from '../../api/client';
import useEventTypes from '../../hooks/useEventTypes';
import DynamicForm from '../../components/dynamic-form/DynamicForm';
import { useToast } from '../../components/Toast';

import dialog from '../../components/dialog';
import { XIcon } from '../../components/icons';
import { formatUnitArrangedBy } from '../../utils/unitFormat';
// Default starting type when no types have loaded yet — kept here so
// the form has a sensible empty state. The picker itself is sourced
// Default starting type when no types have loaded yet — kept here so
// the form has a sensible empty state. The picker itself is sourced
// from /api/events/types (active types only) so admins can extend
// the catalogue without a code change.
const DEFAULT_TYPE_CODE = 'EXC';

// Mirror the server's upload.array caps so the picker never sends a
// batch that would be silently truncated: photos 10, documents 5.
const MAX_PHOTOS = 10;
const MAX_DOCUMENTS = 5;

const EMPTY_FORM = {
  typeCode: DEFAULT_TYPE_CODE, title: '', description: '', venue: '', startAt: '', endAt: '',
  chairpersonId: '', agenda: '', gpsLat: '', gpsLng: '',
  dynamicData: {},
};

// SRS §3.1 — two distinct bodies meet: the Executive (cabinet only)
// and the full Committee (executive + office-holders + permanent
// members). The toggle filters meetings into the two streams.
//
// BASIC_UNIT is included by product directive: a Basic Unit Senior
// Mawin runs both kinds of meeting and needs the same two streams the
// Area and District Senior Mawin get. The server puts no unit-level
// restriction on `body` (see meetingController.list / create), and
// records written before this toggle existed carry no `body` field —
// the Executive filter matches those explicitly, so nothing that was
// visible at BU level disappears from the list.
function bodySupported(level) {
  return level === 'BASIC_UNIT' || level === 'AREA' || level === 'DISTRICT'
    || level === 'PROVINCE' || level === 'CENTRAL';
}

// Friendly labels for the owning-unit tier, shown to members when a
// meeting in their list belongs to a unit above their own.
const LEVEL_LABELS = {
  BASIC_UNIT: 'Basic Unit',
  AREA: 'Area',
  DISTRICT: 'District',
  PROVINCE: 'Province',
  CENTRAL: 'Central',
};

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
  const toast = useToast();
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
  const [chairpersonCandidates, setChairpersonCandidates] = useState([]);
  const [loadingChairpersons, setLoadingChairpersons] = useState(false);
  const [meetingTab, setMeetingTab] = useState('ALL'); // 'ALL' | 'EXECUTIVE' | 'GENERAL_BODY'
  const [showCreate, setShowCreate] = useState(false);
  
  // URL check: committee vs jirga vs regular meetings
  const queryBody = new URLSearchParams(location.search).get('body');
  const isJirgaView = queryBody === 'JIRGA';
  const isCommitteeView = queryBody === 'COMMITTEE';
  const [form, setForm] = useState(EMPTY_FORM);
  const [finalizing, setFinalizing] = useState(null);
  const [editing, setEditing] = useState(null);
  const [docFor, setDocFor] = useState(null);
  const [photosFor, setPhotosFor] = useState(null);
  const [gpsHint, setGpsHint] = useState('');
  const [creating, setCreating] = useState(false);
  // Supervisor candidates are a different population from `members`
  // (office-holders ABOVE this meeting's unit, not the local roster),
  // so they live in their own state and load only when the finalize
  // dialog actually asks for them.
  const [supervisorCandidates, setSupervisorCandidates] = useState([]);
  const [supervisorsLoading, setSupervisorsLoading] = useState(false);
  const supervisorsForRef = useRef(null);

  const showBodyToggle = ctx && bodySupported(ctx.unitLevel);

  // Active meeting types from the EventTypeConfig catalogue
  const { types: eventTypes } = useEventTypes('MEETING');

  // Filter types based on current stream view:
  // On Jirga stream: Jirga Meeting only
  // On Committee stream: Committee Meeting only
  // On regular Meetings stream: Executive Meeting and General Body Meeting
  const availableTypes = useMemo(() => {
    if (isJirgaView) {
      const jrgTypes = eventTypes.filter((t) => ['JRG', 'JIRGA'].includes(String(t.code).toUpperCase()) || String(t.label).toLowerCase() === 'jirga meeting');
      return jrgTypes.length ? jrgTypes : [{ code: 'JRG', label: 'Jirga Meeting' }];
    }
    if (isCommitteeView) {
      const cmTypes = eventTypes.filter((t) => ['CMP', 'COMMITTEE'].includes(String(t.code).toUpperCase()) || String(t.label).toLowerCase() === 'committee meeting');
      return cmTypes.length ? cmTypes : [{ code: 'CMP', label: 'Committee Meeting' }];
    }
    return eventTypes.filter((t) => ['EXC', 'EXECUTIVE', 'GBM', 'GENERAL_BODY'].includes(String(t.code).toUpperCase()));
  }, [eventTypes, isCommitteeView, isJirgaView]);

  // Resolve the currently-selected type doc so the create dialog can
  // render its custom fields via <DynamicForm>.
  const selectedType = useMemo(() => {
    return availableTypes.find((t) => String(t.code).toUpperCase() === String(form.typeCode).toUpperCase())
      || eventTypes.find((t) => String(t.code).toUpperCase() === String(form.typeCode).toUpperCase())
      || null;
  }, [availableTypes, eventTypes, form.typeCode]);

  // Load eligible attendees for the chairperson dropdown whenever the create modal is open or type changes
  useEffect(() => {
    if (!showCreate || !ctx) return;
    let active = true;
    setLoadingChairpersons(true);
    const targetBody = isJirgaView
      ? 'JIRGA'
      : (isCommitteeView
        ? 'COMMITTEE'
        : (form.typeCode === 'GBM' || form.typeCode === 'GENERAL_BODY' ? 'GENERAL_BODY' : 'EXECUTIVE'));
    api.get('/meetings/eligible-attendees', {
      params: {
        unitLevel: ctx.unitLevel,
        unitId: ctx.unitId,
        body: targetBody,
        typeCode: form.typeCode,
      },
    })
      .then((r) => { if (active) setChairpersonCandidates(r.data.data || []); })
      .catch(() => {})
      .finally(() => { if (active) setLoadingChairpersons(false); });
    return () => { active = false; };
  }, [showCreate, ctx, isCommitteeView, isJirgaView, form.typeCode]);

  // Separate meeting collections for pristine categorization
  const jirgaItems = useMemo(() => {
    return (items || []).filter((m) => m.body === 'JIRGA' || m.typeCode === 'JRG' || m.typeCode === 'JIRGA' || m.type === 'JRG' || m.type === 'JIRGA');
  }, [items]);

  const committeeItems = useMemo(() => {
    return (items || []).filter((m) => m.body === 'COMMITTEE' || m.typeCode === 'CMP' || m.type === 'CMP' || m.type === 'COMMITTEE' || m.type === 'Committee Meeting');
  }, [items]);

  const nonCommitteeItems = useMemo(() => {
    return (items || []).filter((m) => m.body !== 'COMMITTEE' && m.body !== 'JIRGA' && m.typeCode !== 'CMP' && m.type !== 'CMP' && m.type !== 'COMMITTEE' && m.type !== 'Committee Meeting' && m.typeCode !== 'JRG' && m.typeCode !== 'JIRGA' && m.type !== 'JRG' && m.type !== 'JIRGA');
  }, [items]);

  const execItems = useMemo(() => {
    return nonCommitteeItems.filter((m) => m.body === 'EXECUTIVE' || (!m.body && m.typeCode !== 'GBM' && m.type !== 'GBM' && m.type !== 'General Body Meeting'));
  }, [nonCommitteeItems]);

  const gbmItems = useMemo(() => {
    return nonCommitteeItems.filter((m) => m.body === 'GENERAL_BODY' || m.typeCode === 'GBM' || m.type === 'GBM' || m.type === 'General Body Meeting');
  }, [nonCommitteeItems]);

  const displayedItems = useMemo(() => {
    if (isJirgaView) {
      return jirgaItems;
    }
    if (isCommitteeView) {
      return committeeItems;
    }
    if (meetingTab === 'EXECUTIVE') {
      return execItems;
    }
    if (meetingTab === 'GENERAL_BODY') {
      return gbmItems;
    }
    return nonCommitteeItems;
  }, [isJirgaView, isCommitteeView, meetingTab, jirgaItems, committeeItems, execItems, gbmItems, nonCommitteeItems]);

  // Latest-fetch guard — when ctx changes mid-flight (e.g. user
  // drilled into a subordinate) ignore stale responses so they don't
  // overwrite the new view's data.
  const fetchIdRef = useRef(0);

  async function reload() {
    if (!ctx) return;
    const myId = ++fetchIdRef.current;
    const params = {
      unitLevel: ctx.unitLevel, unitId: ctx.unitId,
      scope: isPureMember ? 'chain' : undefined,
    };
    if (isJirgaView) {
      params.body = 'JIRGA';
    } else if (isCommitteeView) {
      params.body = 'COMMITTEE';
    } else if (showBodyToggle) {
      params.body = 'NON_COMMITTEE';
    }
    const r = await api.get('/meetings', { params });
    if (myId === fetchIdRef.current) setItems(r.data.data);
  }

  useEffect(() => { reload(); }, [ctx, isCommitteeView, isJirgaView, isPureMember]);

  useEffect(() => {
    if (!ctx) return;
    // Local roster — feeds the attendance table and the chairperson
    // picker. CENTRAL has no unit key of its own on Member, so it asks
    // for the unrestricted roster explicitly; the server honours that
    // only for Super Admin and clamps everyone else to their scope.
    // Without this branch the request carried no filter at all and
    // came back with every member in the system.
    const params = { status: 'ACTIVE', limit: 500 };
    if (ctx.unitLevel === 'BASIC_UNIT') params.basicUnitId = ctx.unitId;
    else if (ctx.unitLevel === 'AREA') params.areaId = ctx.unitId;
    else if (ctx.unitLevel === 'DISTRICT') params.districtId = ctx.unitId;
    else if (ctx.unitLevel === 'PROVINCE') params.provinceId = ctx.unitId;
    else if (ctx.unitLevel === 'CENTRAL') params.scope = 'all';
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

  function openCreate() {
    const initialCode = isJirgaView
      ? (availableTypes[0]?.code || 'JRG')
      : (isCommitteeView
        ? (availableTypes[0]?.code || 'CMP')
        : (availableTypes.find((t) => t.code === 'EXC')?.code || availableTypes[0]?.code || 'EXC'));
    setForm({ ...EMPTY_FORM, typeCode: initialCode });
    setShowCreate(true);
  }

  // Feedback here goes through toasts rather than an inline banner:
  // the create dialog is a fixed overlay, so a banner rendered behind
  // it was invisible — the failure case in particular looked like the
  // Schedule button had done nothing.
  async function create() {
    if (creating) return;
    setCreating(true);
    try {
      // Strip empty strings so optional fields don't ship as ''.
      // dynamicData is preserved as-is — server validates it against
      // the type's snapshot resolved fields.
      const { dynamicData, ...rest } = form;
      const payload = { ...rest, unitLevel: ctx.unitLevel, unitId: ctx.unitId };
      if (isJirgaView) {
        payload.body = 'JIRGA';
      } else if (isCommitteeView) {
        payload.body = 'COMMITTEE';
      } else if (form.typeCode === 'GBM' || form.typeCode === 'GENERAL_BODY') {
        payload.body = 'GENERAL_BODY';
      } else {
        payload.body = 'EXECUTIVE';
      }
      Object.keys(payload).forEach((k) => { if (payload[k] === '') delete payload[k]; });
      if (dynamicData && Object.keys(dynamicData).length > 0) payload.dynamicData = dynamicData;
      const r = await api.post('/meetings', payload);
      const m = r.data.data;
      const bodyLabel = isJirgaView ? 'Jirga' : (isCommitteeView ? 'Committee' : (payload.body === 'GENERAL_BODY' ? 'General Body' : 'Executive'));
      toast.success(
        `${[bodyLabel, m.title || m.type].filter(Boolean).join(' · ')} — ${new Date(m.startAt).toLocaleString()} at ${m.venue}.`,
        { title: 'Meeting scheduled' },
      );
      setShowCreate(false);
      setForm(EMPTY_FORM);
      reload();
    } catch (e) {
      toast.error(errorMessage(e), { title: 'Could not schedule meeting', duration: 7000 });
    } finally {
      setCreating(false);
    }
  }

  async function openFinalize(m) {
    // Populate attendance list with all eligible attendees resolved for this meeting stream
    const targetBody = m.body || (m.typeCode === 'CMP' || m.type === 'CMP' || m.type === 'COMMITTEE' ? 'COMMITTEE' : (m.typeCode === 'JRG' || m.typeCode === 'JIRGA' ? 'JIRGA' : 'EXECUTIVE'));
    try {
      const r = await api.get('/meetings/eligible-attendees', {
        params: {
          unitLevel: m.unitLevel,
          unitId: m.unitId,
          body: targetBody,
          typeCode: m.typeCode || m.type,
        },
      });
      const eligibleAttendees = r.data.data || [];
      const roster = eligibleAttendees.map((att) => {
        const existing = (m.attendance || []).find((a) => String(a.memberId?._id || a.memberId) === String(att._id));
        return {
          memberId: att._id,
          fullName: att.fullName,
          memberIdCode: att.memberId,
          phone: att.phone,
          cnic: att.cnic,
          roleText: att.roleText,
          unitText: att.unitText,
          status: existing ? existing.status : 'PRESENT',
        };
      });
      setFinalizing({
        meeting: m,
        attendance: roster,
        guestAttendees: m.guestAttendees || [],
        decisions: m.decisions || '',
        upcomingStrategy: m.upcomingStrategy || '',
        notes: m.notes || '',
        supervisorAttended: m.supervisorAttended || false,
        supervisorMemberId: m.supervisorMemberId?._id || m.supervisorMemberId || '',
        studyContributions: m.studyContributions || [],
      });
    } catch {
      // Fallback to local roster if attendee endpoint fails
      const roster = members.map((mem) => {
        const existing = (m.attendance || []).find((a) => String(a.memberId?._id || a.memberId) === String(mem._id));
        return {
          memberId: mem._id,
          fullName: mem.fullName,
          memberIdCode: mem.memberId,
          status: existing ? existing.status : 'PRESENT',
        };
      });
      setFinalizing({
        meeting: m,
        attendance: roster,
        guestAttendees: m.guestAttendees || [],
        decisions: m.decisions || '',
        upcomingStrategy: m.upcomingStrategy || '',
        notes: m.notes || '',
        supervisorAttended: m.supervisorAttended || false,
        supervisorMemberId: m.supervisorMemberId?._id || m.supervisorMemberId || '',
        studyContributions: m.studyContributions || [],
      });
    }
  }

  async function openEdit(m) {
    setEditing({
      _id: m._id,
      title: m.title || '',
      description: m.description || '',
      venue: m.venue || '',
      type: m.type || '',
      typeCode: m.typeCode || m.type || '',
      startAt: m.startAt ? new Date(m.startAt).toISOString().slice(0, 16) : '',
      endAt: m.endAt ? new Date(m.endAt).toISOString().slice(0, 16) : '',
      agenda: m.agenda || '',
      chairpersonId: m.chairpersonId?._id || m.chairpersonId || '',
      upcomingStrategy: m.upcomingStrategy || '',
      notes: m.notes || '',
      previousMeetingId: m.previousMeetingId || '',
      dynamicData: m.dynamicData || {},
    });
  }

  // Photo uploads run through EXIF / GPS / duplicate checks server-side
  // and can take a moment, so we show a sticky "uploading" toast and
  // swap it for the verdict. A rejection is a warning, not an error —
  // the meeting is fine, the photo just didn't pass the checks.
  // Whole FileList — the route is upload.array('photos', 10), so a
  // batch was always accepted; only the picker was single-file.
  async function uploadPhotos(meetingId, fileList) {
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
      const r = await api.post(`/meetings/${meetingId}/photos`, fd);
      const data = r.data.data;
      toast.dismiss(pending);
      if (data.accepted?.length) {
        const total = (data.meeting?.photos || []).length;
        toast.success(
          `${data.accepted.join(', ')} added${total ? ` — ${total} photo${total === 1 ? '' : 's'} on this meeting.` : '.'}`,
          { title: 'Photo uploaded' },
        );
      }
      if (data.rejected?.length) {
        toast.warning(
          data.rejected.map((x) => `${x.filename}: ${x.reason}`).join(' | '),
          { title: 'Photo rejected', duration: 9000 },
        );
      }
      reload();
    } catch (e) {
      toast.dismiss(pending);
      toast.error(errorMessage(e), { title: 'Photo upload failed', duration: 9000 });
    }
  }

  // Lazy — the finalize dialog calls this the first time "Supervisor
  // attended" is ticked, so opening the dialog to record attendance
  // costs nothing. Cached per meeting; cleared when the dialog closes.
  async function loadSupervisorCandidates(meetingId) {
    if (supervisorsForRef.current === meetingId) return;
    supervisorsForRef.current = meetingId;
    setSupervisorsLoading(true);
    try {
      const r = await api.get(`/meetings/${meetingId}/supervisor-candidates`);
      setSupervisorCandidates(r.data.data);
    } catch (e) {
      supervisorsForRef.current = null;
      setSupervisorCandidates([]);
      toast.error(errorMessage(e), { title: 'Could not load supervisors', duration: 7000 });
    } finally {
      setSupervisorsLoading(false);
    }
  }

  function closeFinalize() {
    setFinalizing(null);
    supervisorsForRef.current = null;
    setSupervisorCandidates([]);
  }

  async function cancelMeeting(m) {
    const reason = await dialog.prompt('Cancellation reason:');
    if (reason == null) return;
    try {
      await api.post(`/meetings/${m._id}/cancel`, { reason });
      reload();
      toast.success(`"${m.title || 'Meeting'}" cancelled.`, { title: 'Meeting cancelled' });
    } catch (e) {
      toast.error(errorMessage(e), { title: 'Could not cancel meeting', duration: 7000 });
    }
  }

  // Body travels with the download alongside scope, so the exported
  // report covers exactly the stream the user is looking at.
  function exportParams() {
    const params = new URLSearchParams({ unitLevel: ctx.unitLevel, unitId: ctx.unitId });
    if (isJirgaView) {
      params.set('body', 'JIRGA');
    } else if (isCommitteeView) {
      params.set('body', 'COMMITTEE');
    } else if (meetingTab === 'EXECUTIVE') {
      params.set('body', 'EXECUTIVE');
    } else if (meetingTab === 'GENERAL_BODY') {
      params.set('body', 'GENERAL_BODY');
    } else if (showBodyToggle) {
      params.set('body', 'NON_COMMITTEE');
    }
    return params;
  }
  function exportName(ext) {
    const stream = isJirgaView ? '-jirga' : (isCommitteeView ? '-committee' : (meetingTab === 'EXECUTIVE' ? '-executive' : meetingTab === 'GENERAL_BODY' ? '-general-body' : ''));
    return `${ctx.unitName}${stream}-meetings.${ext}`;
  }
  function exportPdf() {
    downloadAuthed(`/api/exports/unit/meetings/pdf?${exportParams()}`, exportName('pdf')).catch(() => toast.error('Export failed.', { title: 'Could not export' }));
  }
  function exportXlsx() {
    downloadAuthed(`/api/exports/unit/meetings/xlsx?${exportParams()}`, exportName('xlsx')).catch(() => toast.error('Export failed.', { title: 'Could not export' }));
  }

  if (!ctx) return <p>Select a unit context first.</p>;

  return (
    <div>
      <div className="page-header">
        <h2>
          {isJirgaView
            ? (ctx.unitLevel === 'CENTRAL' ? 'Qomi Jirga Meetings' : `Sobayi Jirga Meetings · ${ctx.unitName}`)
            : (isCommitteeView ? `Committee Meetings · ${ctx.unitName}` : `Meetings · ${ctx.unitName}`)}
        </h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn secondary" onClick={exportPdf}>Export PDF</button>
          <button className="btn secondary" onClick={exportXlsx}>Export Excel</button>
          {canManage && (
            <button className="btn" onClick={openCreate}>
              {isJirgaView ? '+ Schedule Jirga Meeting' : (isCommitteeView ? '+ Schedule Committee Meeting' : '+ Schedule Meeting')}
            </button>
          )}
        </div>
      </div>

      {showCreate && (
        <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setShowCreate(false); }}>
        <div className="modal" style={{ maxWidth: 720 }} role="dialog" aria-modal="true" aria-label="Schedule Meeting">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <h3 style={{ margin: 0 }}>
              {isJirgaView ? 'Schedule a Jirga Meeting' : (isCommitteeView ? 'Schedule a Committee Meeting' : 'Schedule a Meeting')}
            </h3>
            <button type="button" className="btn secondary" onClick={() => setShowCreate(false)} aria-label="Close" style={{ padding: '4px 10px', fontSize: 18, lineHeight: 1 }}><XIcon size={16} /></button>
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
                {availableTypes.length === 0 && <option value="">— Loading types —</option>}
                {availableTypes.map((t) => <option key={t.code || t._id} value={t.code}>{t.label}</option>)}
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
                <option value="">— pick a chairperson —</option>
                {loadingChairpersons && <option disabled>Loading eligible attendees…</option>}
                {!loadingChairpersons && chairpersonCandidates.map((m) => (
                  <option key={m._id} value={m._id}>
                    {m.fullName}{m.roleText ? ` · ${m.roleText}` : (m.memberId ? ` · ${m.memberId}` : '')}
                  </option>
                ))}
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
              <label>Description</label>
              <textarea
                rows={3}
                placeholder="What this meeting is about"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
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
            <button className="btn" onClick={create} disabled={creating}>{creating ? 'Scheduling…' : 'Schedule'}</button>
          </div>
        </div>
        </div>
      )}

      {!isCommitteeView && !isJirgaView && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, borderBottom: '1px solid var(--border)', paddingBottom: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="muted" style={{ fontSize: 13, marginRight: 4, fontWeight: 500 }}>Category:</span>
          <button
            type="button"
            className={`btn ${meetingTab === 'ALL' ? '' : 'ghost'}`}
            style={{ padding: '6px 14px', fontSize: 13, borderRadius: 20 }}
            onClick={() => setMeetingTab('ALL')}
          >
            All Meetings <span style={{ opacity: 0.75, marginLeft: 4, fontSize: 11 }}>({nonCommitteeItems.length})</span>
          </button>
          <button
            type="button"
            className={`btn ${meetingTab === 'EXECUTIVE' ? '' : 'ghost'}`}
            style={{ padding: '6px 14px', fontSize: 13, borderRadius: 20 }}
            onClick={() => setMeetingTab('EXECUTIVE')}
          >
            🏛️ Executive Meetings <span style={{ opacity: 0.75, marginLeft: 4, fontSize: 11 }}>({execItems.length})</span>
          </button>
          <button
            type="button"
            className={`btn ${meetingTab === 'GENERAL_BODY' ? '' : 'ghost'}`}
            style={{ padding: '6px 14px', fontSize: 13, borderRadius: 20 }}
            onClick={() => setMeetingTab('GENERAL_BODY')}
          >
            👥 General Body Meetings <span style={{ opacity: 0.75, marginLeft: 4, fontSize: 11 }}>({gbmItems.length})</span>
          </button>
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
          {displayedItems.length === 0 && (
            <tr>
              <td colSpan="9" style={{ textAlign: 'center', padding: '24px 12px', color: 'var(--muted)' }}>
                {isJirgaView
                  ? 'No Jirga meetings scheduled yet.'
                  : (isCommitteeView
                  ? 'No committee meetings scheduled yet.'
                  : (meetingTab === 'EXECUTIVE'
                  ? 'No executive meetings scheduled yet.'
                  : (meetingTab === 'GENERAL_BODY'
                  ? 'No general body meetings scheduled yet.'
                  : 'No meetings scheduled yet.')))}
              </td>
            </tr>
          )}
          {displayedItems.map((m) => {
            const isJrg = m.body === 'JIRGA' || m.typeCode === 'JRG' || m.typeCode === 'JIRGA' || m.type === 'JRG' || m.type === 'JIRGA';
            const isCm = !isJrg && (m.body === 'COMMITTEE' || m.typeCode === 'CMP' || m.type === 'CMP' || m.type === 'COMMITTEE' || m.type === 'Committee Meeting');
            const isGbm = !isJrg && (m.body === 'GENERAL_BODY' || m.typeCode === 'GBM' || m.type === 'GBM' || m.type === 'General Body Meeting');
            return (
              <tr key={m._id}>
                <td>{new Date(m.startAt).toLocaleString()}</td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    {isJrg ? (
                      <span className="badge" style={{ backgroundColor: '#f3e8ff', color: '#6b21a8', border: '1px solid #d8b4fe', fontWeight: 600, fontSize: 11 }}>Jirga</span>
                    ) : isCm ? (
                      <span className="badge" style={{ backgroundColor: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', fontWeight: 600, fontSize: 11 }}>Committee</span>
                    ) : isGbm ? (
                      <span className="badge" style={{ backgroundColor: '#ecfdf5', color: '#065f46', border: '1px solid #a7f3d0', fontWeight: 600, fontSize: 11 }}>General Body</span>
                    ) : (
                      <span className="badge" style={{ backgroundColor: '#eef2ff', color: '#4338ca', border: '1px solid #c7d2fe', fontWeight: 600, fontSize: 11 }}>Executive</span>
                    )}
                    <span>{m.title ? `${m.type} · ${m.title}` : m.type}</span>
                  </div>
                  {m.unitLevel && (
                    <div className="muted" style={{ fontSize: 11, marginTop: 3 }}>
                      <span className="badge" style={{ fontSize: 10, padding: '1px 5px', background: 'var(--surface-alt)', border: '1px solid var(--border)' }}>
                        {formatUnitArrangedBy(m, { isCommitteeView })}
                      </span>
                    </div>
                  )}
                </td>
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
                    onClick={() => downloadAuthed(`/api/exports/meeting/${m._id}/pdf`, `meeting-${(m.title || m.type || 'minutes').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.pdf`).catch(() => toast.error('PDF download failed.', { title: 'Could not export' }))}
                    title="Download this meeting as PDF (with photos embedded)"
                  >📄 PDF</button>{' '}
                  {canManage && m.state !== 'FINALIZED' && m.state !== 'CANCELLED' && (
                    <>
                      <button className="btn ghost" onClick={() => setEditing(m)}>Edit</button>{' '}
                      <button className="btn ghost" onClick={() => setDocFor(m)}>Docs</button>{' '}
                      <label className="btn secondary" style={{ cursor: 'pointer' }}>
                        Photos
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          hidden
                          onChange={(e) => {
                            const picked = Array.from(e.target.files || []);
                            e.target.value = '';
                            uploadPhotos(m._id, picked);
                          }}
                        />
                      </label>{' '}
                      <button className="btn" onClick={() => setFinalizing(m)}>Finalize</button>{' '}
                      <button className="btn danger" onClick={() => cancelMeeting(m)}>Cancel</button>
                    </>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {finalizing && (
        <FinalizeDialog
          meeting={finalizing}
          supervisorCandidates={supervisorCandidates}
          supervisorsLoading={supervisorsLoading}
          onNeedSupervisors={() => loadSupervisorCandidates(finalizing._id)}
          onClose={closeFinalize}
          onDone={() => {
            closeFinalize(); reload();
            toast.success('Minutes recorded and the meeting is now finalized.', { title: 'Meeting finalized', duration: 7000 });
          }}
        />
      )}
      {editing && (
        <EditDialog
          meeting={editing}
          onClose={() => setEditing(null)}
          onDone={() => { setEditing(null); reload(); toast.success('Meeting updated.'); }}
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

function FinalizeDialog({
  meeting, supervisorCandidates, supervisorsLoading, onNeedSupervisors, onClose, onDone,
}) {
  const { user } = useAuth();
  const [previouswork, setPreviouswork] = useState('');
  const [upcomingStrategy, setUpcomingStrategy] = useState('');
  const [notes, setNotes] = useState('');
  const [supervisorAttended, setSupervisorAttended] = useState(false);
  const [supervisorMemberId, setSupervisorMemberId] = useState('');
  const [supervisorQuery, setSupervisorQuery] = useState('');
  const [attendance, setAttendance] = useState([]);
  const [eligibleAttendees, setEligibleAttendees] = useState([]);
  const [loadingAttendees, setLoadingAttendees] = useState(true);
  const [studyRows, setStudyRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const isStudy = meeting.type === 'STC';

  // Load strictly eligible attendees for this meeting stream/body
  useEffect(() => {
    let active = true;
    setLoadingAttendees(true);
    api.get(`/meetings/${meeting._id}/attendees`)
      .then((r) => {
        if (!active) return;
        const list = r.data.data || [];
        setEligibleAttendees(list);
        const existingMap = new Map((meeting.attendance || []).map((a) => [String(a.memberId?._id || a.memberId), a.status]));
        const rows = list.map((m) => ({
          memberId: m._id,
          name: m.fullName,
          memberCode: m.memberId,
          roleText: m.roleText,
          status: existingMap.get(String(m._id)) || 'ABSENT',
        }));
        setAttendance(rows);
      })
      .catch(() => {
        if (active) setErr('Could not load attendees roster.');
      })
      .finally(() => {
        if (active) setLoadingAttendees(false);
      });
    return () => { active = false; };
  }, [meeting._id]);

  // A Central meeting has no level above it, so nobody is eligible to
  // supervise it — the field is suppressed rather than shown empty.
  const supervisionApplies = meeting.unitLevel !== 'CENTRAL';

  function roleText(s) {
    return (s.roles || []).map((r) => r.customName || roleLabel(user, r.code)).join(', ');
  }

  const selectedSupervisor = supervisorCandidates.find((s) => s._id === supervisorMemberId) || null;

  // Candidates span several tiers now, so the list can be long on a
  // phone. Filter across every visible token — name, role, unit and
  // member code — so any of them narrows it.
  const filteredSupervisors = useMemo(() => {
    const q = supervisorQuery.trim().toLowerCase();
    if (!q) return supervisorCandidates;
    return supervisorCandidates.filter((s) => [
      s.fullName, s.unitName, s.memberCode, LEVEL_LABELS[s.unitLevel], roleText(s),
    ].filter(Boolean).join(' ').toLowerCase().includes(q));
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [supervisorQuery, supervisorCandidates, user]);

  function toggleSupervisorAttended(checked) {
    setSupervisorAttended(checked);
    if (checked) onNeedSupervisors();
    else { setSupervisorMemberId(''); setSupervisorQuery(''); }
  }

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
        // The dialog labels this "Previous work", but the server (and
        // the Meeting model) call the field `decisions` — send it under
        // the canonical name or finalize 400s on a missing required key.
        decisions: previouswork,
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
            <label>Previous work *</label>
            <textarea rows={3} value={previouswork} onChange={(e) => setPreviouswork(e.target.value)} />
          </div>
          <div className="field full">
            <label>Upcoming strategy</label>
            <textarea rows={2} value={upcomingStrategy} onChange={(e) => setUpcomingStrategy(e.target.value)} />
          </div>
          <div className="field full">
            <label>Activity notes</label>
            <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div className="field full">
            {supervisionApplies ? (
              <label>
                <input type="checkbox" checked={supervisorAttended} onChange={(e) => toggleSupervisorAttended(e.target.checked)} />
                {' '}Supervisor attended
              </label>
            ) : (
              <div className="muted" style={{ fontSize: 12 }}>
                <strong>Supervisor attendance</strong> does not apply to a Central meeting —
                there is no level above it to send a supervisor.
              </div>
            )}
          </div>
          {supervisionApplies && supervisorAttended && (
            <div className="field full">
              <label>Supervisor</label>
              {selectedSupervisor ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <div>
                    <strong>{selectedSupervisor.fullName}</strong>
                    <div className="muted" style={{ fontSize: 12 }}>
                      {[roleText(selectedSupervisor),
                        `${selectedSupervisor.unitName} (${LEVEL_LABELS[selectedSupervisor.unitLevel] || selectedSupervisor.unitLevel})`,
                      ].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={() => { setSupervisorMemberId(''); setSupervisorQuery(''); }}
                  >Change</button>
                </div>
              ) : supervisorsLoading ? (
                <div className="muted" style={{ fontSize: 12 }}>Loading eligible supervisors…</div>
              ) : supervisorCandidates.length === 0 ? (
                <div className="muted" style={{ fontSize: 12 }}>
                  No active office-holders were found above this unit, so there is nobody
                  eligible to record as supervisor.
                </div>
              ) : (
                <>
                  <input
                    type="search"
                    placeholder="Search by name, role or unit…"
                    value={supervisorQuery}
                    onChange={(e) => setSupervisorQuery(e.target.value)}
                  />
                  <div style={{
                    maxHeight: 200, overflowY: 'auto', marginTop: 6,
                    border: '1px solid var(--border)', borderRadius: 6,
                  }}>
                    {filteredSupervisors.length === 0 && (
                      <div className="muted" style={{ fontSize: 12, padding: 8 }}>
                        No supervisor matches “{supervisorQuery}”.
                      </div>
                    )}
                    {filteredSupervisors.map((s) => (
                      <button
                        key={s._id}
                        type="button"
                        onClick={() => setSupervisorMemberId(s._id)}
                        style={{
                          display: 'block', width: '100%', textAlign: 'left',
                          padding: '6px 8px', border: 'none', background: 'none',
                          cursor: 'pointer', borderBottom: '1px solid var(--border)',
                        }}
                      >
                        {s.fullName}
                        <div className="muted" style={{ fontSize: 11 }}>
                          {[roleText(s), `${s.unitName} (${LEVEL_LABELS[s.unitLevel] || s.unitLevel})`]
                            .filter(Boolean).join(' · ')}
                        </div>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        <h4 style={{ marginBottom: 6 }}>
          Attendance ({attendance.filter((r) => r.status === 'PRESENT' || r.status === 'LATE').length} present / {attendance.length})
        </h4>
        <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
          <button type="button" className="btn ghost" onClick={() => markAll('PRESENT')}>Mark all present</button>
          <button type="button" className="btn ghost" onClick={() => markAll('ABSENT')}>Mark all absent</button>
        </div>
        <div style={{ maxHeight: 240, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 6 }}>
          <table className="list" style={{ margin: 0 }}>
            <thead>
              <tr><th>Attendee / Member</th><th>Present</th><th>Late</th><th>Absent</th></tr>
            </thead>
            <tbody>
              {loadingAttendees && (
                <tr><td colSpan="4" className="muted" style={{ padding: 12 }}>Loading attendee roster…</td></tr>
              )}
              {!loadingAttendees && attendance.length === 0 && (
                <tr><td colSpan="4" className="muted" style={{ padding: 12 }}>No eligible attendees found for this {meeting.body === 'JIRGA' ? 'jirga' : (meeting.body === 'COMMITTEE' ? 'committee' : meeting.body === 'GENERAL_BODY' ? 'general body' : 'executive')} meeting.</td></tr>
              )}
              {!loadingAttendees && attendance.map((r) => (
                <tr key={r.memberId}>
                  <td>
                    <strong>{r.name}</strong>
                    {r.memberCode && <span className="muted" style={{ fontSize: 12, marginLeft: 6 }}>· {r.memberCode}</span>}
                    {r.roleText && <div className="muted" style={{ fontSize: 11 }}>{r.roleText}</div>}
                  </td>
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
                  {eligibleAttendees.map((m) => (
                    <option key={m._id} value={m._id}>
                      {m.fullName}{m.roleText ? ` · ${m.roleText}` : ''}
                    </option>
                  ))}
                </select>
                <input placeholder="Topic" value={s.topic} onChange={(e) => updateStudyRow(i, { topic: e.target.value })} />
                <input placeholder="Summary" value={s.summary} onChange={(e) => updateStudyRow(i, { summary: e.target.value })} />
                <button type="button" className="btn ghost" onClick={() => removeStudyRow(i)}><XIcon size={16} /></button>
              </div>
            ))}
            <button type="button" className="btn secondary" onClick={addStudyRow}>+ Add contribution</button>
          </>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'flex-end' }}>
          <button className="btn secondary" onClick={onClose}>Cancel</button>
          <button className="btn" disabled={busy || !previouswork.trim()} onClick={submit}>
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

function EditDialog({ meeting, onClose, onDone }) {
  const isJirgaMeeting = meeting.body === 'JIRGA' || meeting.typeCode === 'JRG' || meeting.typeCode === 'JIRGA' || meeting.type === 'JRG';
  const isCommitteeMeeting = !isJirgaMeeting && (meeting.body === 'COMMITTEE' || meeting.typeCode === 'CMP');
  const { types: eventTypes } = useEventTypes('MEETING');
  const availableTypes = useMemo(() => {
    if (isJirgaMeeting) {
      const jrgTypes = eventTypes.filter((t) => ['JRG', 'JIRGA'].includes(String(t.code).toUpperCase()) || String(t.label).toLowerCase() === 'jirga meeting');
      return jrgTypes.length ? jrgTypes : [{ code: 'JRG', label: 'Jirga Meeting' }];
    }
    if (isCommitteeMeeting) {
      const cmTypes = eventTypes.filter((t) => ['CMP', 'COMMITTEE'].includes(String(t.code).toUpperCase()) || String(t.label).toLowerCase() === 'committee meeting');
      return cmTypes.length ? cmTypes : [{ code: 'CMP', label: 'Committee Meeting' }];
    }
    return eventTypes.filter((t) => ['EXC', 'EXECUTIVE', 'GBM', 'GENERAL_BODY'].includes(String(t.code).toUpperCase()));
  }, [eventTypes, isCommitteeMeeting, isJirgaMeeting]);

  const [form, setForm] = useState({
    typeCode: (meeting.typeCode || meeting.type || '').toUpperCase(),
    title: meeting.title || '',
    description: meeting.description || '',
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
  const [chairpersonOptions, setChairpersonOptions] = useState([]);
  const [loadingChairperson, setLoadingChairperson] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const selectedType = useMemo(() => {
    return availableTypes.find((t) => String(t.code).toUpperCase() === String(form.typeCode).toUpperCase())
      || eventTypes.find((t) => String(t.code).toUpperCase() === String(form.typeCode).toUpperCase())
      || null;
  }, [availableTypes, eventTypes, form.typeCode]);

  useEffect(() => {
    let active = true;
    setLoadingChairperson(true);
    const targetBody = isJirgaMeeting
      ? 'JIRGA'
      : (isCommitteeMeeting
        ? 'COMMITTEE'
        : (form.typeCode === 'GBM' || form.typeCode === 'GENERAL_BODY' ? 'GENERAL_BODY' : 'EXECUTIVE'));
    api.get('/meetings/eligible-attendees', {
      params: {
        unitLevel: meeting.unitLevel,
        unitId: meeting.unitId,
        body: targetBody,
        typeCode: form.typeCode,
      },
    })
      .then((r) => { if (active) setChairpersonOptions(r.data.data || []); })
      .catch(() => {})
      .finally(() => { if (active) setLoadingChairperson(false); });
    return () => { active = false; };
  }, [meeting.unitLevel, meeting.unitId, isCommitteeMeeting, isJirgaMeeting, form.typeCode]);

  async function save() {
    setErr(''); setBusy(true);
    try {
      const { dynamicData, ...rest } = form;
      const payload = { ...rest };
      if (isJirgaMeeting) {
        payload.body = 'JIRGA';
      } else if (isCommitteeMeeting) {
        payload.body = 'COMMITTEE';
      } else if (form.typeCode === 'GBM' || form.typeCode === 'GENERAL_BODY') {
        payload.body = 'GENERAL_BODY';
      } else {
        payload.body = 'EXECUTIVE';
      }
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
              {availableTypes.length === 0 && <option value={form.typeCode}>{form.typeCode}</option>}
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
          <div className="field">
            <label>Chairperson</label>
            <select
              value={form.chairpersonId}
              onChange={(e) => setForm({ ...form, chairpersonId: e.target.value })}
            >
              <option value="">— pick a chairperson —</option>
              {loadingChairperson && <option disabled>Loading eligible attendees…</option>}
              {!loadingChairperson && chairpersonOptions.map((m) => (
                <option key={m._id} value={m._id}>
                  {m.fullName}{m.roleText ? ` · ${m.roleText}` : (m.memberId ? ` · ${m.memberId}` : '')}
                </option>
              ))}
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
            <label>Description</label>
            <textarea
              rows={3}
              placeholder="What this meeting is about"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
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
  const toast = useToast();
  const [docs, setDocs] = useState(meeting.documents || []);
  const [kind, setKind] = useState('AGENDA');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // Route is uploadAny.array('documents', 5) — a batch was always
  // accepted server-side; only the picker was single-file.
  async function upload(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    if (files.length > MAX_DOCUMENTS) {
      toast.warning(
        `Only ${MAX_DOCUMENTS} documents can be uploaded at once — the first ${MAX_DOCUMENTS} were sent.`,
        { title: 'Too many selected', duration: 7000 },
      );
    }
    const batch = files.slice(0, MAX_DOCUMENTS);
    setErr(''); setBusy(true);
    try {
      const fd = new FormData();
      batch.forEach((f) => fd.append('documents', f));
      fd.append('kind', kind);
      const r = await api.post(`/meetings/${meeting._id}/documents`, fd);
      setDocs(r.data.data.documents || []);
      // Reported here, not in onDone — that fires when the dialog is
      // closed, which happens whether or not anything was attached.
      toast.success(
        batch.length === 1
          ? `${batch[0].name} attached.`
          : `${batch.length} documents attached.`,
        { title: 'Document uploaded' },
      );
    } catch (e) {
      toast.error(errorMessage(e), { title: 'Document upload failed', duration: 9000 });
    }
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
            <input
              type="file"
              accept=".pdf,image/*,.doc,.docx"
              multiple
              disabled={busy}
              onChange={(e) => {
                // Snapshot before clearing — resetting empties the FileList.
                const picked = Array.from(e.target.files || []);
                e.target.value = '';
                upload(picked);
              }}
            />
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
