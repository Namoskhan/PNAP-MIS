import { useEffect, useState, useMemo } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Linking,
  Modal,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams } from 'expo-router';
import { Picker } from '@react-native-picker/picker';
import { Ionicons } from '@expo/vector-icons';

import { useAuth } from '../../../src/context/AuthContext';
import { useUnit } from '../../../src/context/UnitContext';
import { api, errorMessage } from '../../../src/api/client';
import {
  canManageMeetings,
  isCentralAdminOversight,
  isSuperAdminOversight,
  isSuperAdmin,
} from '../../../src/utils/permissions';
import { useToast } from '../../../src/components/Toast';
import Badge from '../../../src/components/Badge';
import { Colors, FontSize, Spacing, Radius } from '../../../src/constants/colors';
import { shortDate, MEETING_TYPE_LABEL } from '../../../src/utils/formatters';
import { downloadAndShare } from '../../../src/utils/export';
import { formatUnitArrangedBy } from '../../../src/utils/unitFormat';
import useEventTypes from '../../../src/hooks/useEventTypes';

const DEFAULT_TYPE_CODE = 'EXC';
const MAX_PHOTOS = 10;
const MAX_DOCUMENTS = 5;

const EMPTY_FORM = {
  typeCode: DEFAULT_TYPE_CODE,
  title: '',
  description: '',
  venue: '',
  startAt: '',
  endAt: '',
  chairpersonId: '',
  agenda: '',
  gpsLat: '',
  gpsLng: '',
};

function ageLabel(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor((now - d) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  return `${diffDays} days ago`;
}

function fmtCoord(n) {
  if (n == null || Number.isNaN(Number(n))) return '—';
  return Number(n).toFixed(5);
}

function gmapsLink(lat, lng) {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

export default function MeetingsScreen() {
  const { user } = useAuth();
  const { ctx, provinces } = useUnit();
  const toast = useToast();
  const params = useLocalSearchParams();

  const queryBody = params.body || '';
  const isCongressView = queryBody === 'CONGRESS';
  const isJirgaView = queryBody === 'JIRGA';
  const isCommitteeView = queryBody === 'COMMITTEE';
  const targetBody = isCongressView ? 'CONGRESS' : (isJirgaView ? 'JIRGA' : (isCommitteeView ? 'COMMITTEE' : (params.body || 'NON_COMMITTEE')));

  const [selectedLevel, setSelectedLevel] = useState(() => {
    if (params.unitLevel) return params.unitLevel;
    if (isJirgaView && provinces && provinces.length > 0) return 'PROVINCE';
    return ctx?.unitLevel || 'CENTRAL';
  });

  const [selectedUnitId, setSelectedUnitId] = useState(() => {
    if (params.unitId && params.unitId !== 'CENTRAL') return params.unitId;
    if (isJirgaView && provinces && provinces.length > 0) return provinces[0]._id;
    return ctx?.unitId || '';
  });

  // Sync with provinces when they become available
  useEffect(() => {
    if (isJirgaView && !selectedUnitId && provinces && provinces.length > 0) {
      setSelectedLevel('PROVINCE');
      setSelectedUnitId(provinces[0]._id);
    }
  }, [provinces, isJirgaView]);

  const activeLevel = selectedLevel;
  const canManage = canManageMeetings(user)
    && !isCentralAdminOversight(user)
    && !isSuperAdminOversight(user)
    && !(isSuperAdmin(user) && (activeLevel === 'CENTRAL' || isCongressView));
  const [resolvedUnitId, setResolvedUnitId] = useState(selectedUnitId);

  useEffect(() => {
    let rawId = selectedUnitId;
    if (activeLevel === 'CENTRAL' && (!rawId || rawId === 'CENTRAL')) {
      api.get('/org/central').then((r) => {
        if (r.data?.data?._id) setResolvedUnitId(r.data.data._id);
      }).catch(() => {});
    } else {
      setResolvedUnitId(rawId);
    }
  }, [selectedUnitId, activeLevel]);

  const [bodyTab, setBodyTab] = useState('ALL');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(null);

  function getExportParams() {
    const qParams = {
      unitLevel: activeLevel,
      unitId: resolvedUnitId || (activeLevel === 'CENTRAL' ? 'CENTRAL' : (params.unitId || ctx?.unitId)),
    };
    if (isCongressView) {
      qParams.body = 'CONGRESS';
    } else if (isJirgaView) {
      qParams.body = 'JIRGA';
    } else if (isCommitteeView) {
      qParams.body = 'COMMITTEE';
    } else if (bodyTab === 'EXECUTIVE') {
      qParams.body = 'EXECUTIVE';
    } else if (bodyTab === 'GENERAL_BODY') {
      qParams.body = 'GENERAL_BODY';
    } else {
      qParams.body = 'NON_COMMITTEE';
    }
    return qParams;
  }

  function getExportFilename(ext) {
    const unitName = ctx?.unitName || (activeLevel === 'CENTRAL' ? 'Central' : activeLevel);
    const stream = isCongressView
      ? '-congress'
      : (isJirgaView
        ? '-jirga'
        : (isCommitteeView
          ? '-committee'
          : (bodyTab === 'EXECUTIVE'
            ? '-executive'
            : (bodyTab === 'GENERAL_BODY' ? '-general-body' : ''))));
    const safeUnit = (unitName || 'unit').replace(/[^a-zA-Z0-9_-]/g, '_');
    return `${safeUnit}${stream}-meetings.${ext}`;
  }

  async function handleExport(fmt) {
    if (exporting) return;
    setExporting(fmt);
    try {
      const qParams = getExportParams();
      const filename = getExportFilename(fmt);
      await downloadAndShare(`/exports/unit/meetings/${fmt}`, filename, qParams);
      toast.success(`${fmt.toUpperCase()} export downloaded.`);
    } catch (e) {
      toast.error(e.message || `Export ${fmt.toUpperCase()} failed.`);
    } finally {
      setExporting(null);
    }
  }

  async function load(silent = false) {
    if (!resolvedUnitId || resolvedUnitId === 'CENTRAL') {
      setLoading(false);
      return;
    }
    if (!silent) setLoading(true);
    try {
      const qParams = {
        unitLevel: activeLevel,
        unitId: resolvedUnitId,
      };
      if (isCongressView) {
        qParams.body = 'CONGRESS';
      } else if (isJirgaView) {
        qParams.body = 'JIRGA';
      } else if (isCommitteeView) {
        qParams.body = 'COMMITTEE';
      } else {
        qParams.body = 'NON_COMMITTEE';
      }

      const res = await api.get('/meetings', { params: qParams });
      setItems(res.data.data || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    load();
  }, [activeLevel, resolvedUnitId, isCongressView, isJirgaView, isCommitteeView]);

  function onRefresh() {
    setRefreshing(true);
    load(true);
  }

  // Load eligible members for chairperson selection
  const [chairpersonOptions, setChairpersonOptions] = useState([]);
  useEffect(() => {
    if (!resolvedUnitId || resolvedUnitId === 'CENTRAL') {
      api.get('/members', { params: { limit: 200 } }).then((r) => {
        setChairpersonOptions(r.data?.data || []);
      }).catch(() => {});
      return;
    }
    const p = { limit: 200 };
    if (activeLevel === 'BASIC_UNIT') p.basicUnitId = resolvedUnitId;
    else if (activeLevel === 'AREA') p.areaId = resolvedUnitId;
    else if (activeLevel === 'DISTRICT') p.districtId = resolvedUnitId;
    else if (activeLevel === 'PROVINCE') p.provinceId = resolvedUnitId;
    api.get('/members', { params: p }).then((r) => {
      setChairpersonOptions(r.data?.data || []);
    }).catch(() => {});
  }, [activeLevel, resolvedUnitId]);

  // Load event types dynamically
  const { types: eventTypes } = useEventTypes('MEETING', targetBody);
  const availableTypes = useMemo(() => {
    if (isCongressView) {
      const cngTypes = (eventTypes || []).filter((t) => ['CNG', 'CONGRESS'].includes(String(t.code).toUpperCase()) || String(t.label).toLowerCase().includes('congress meeting'));
      return cngTypes.length ? cngTypes : [{ code: 'CNG', label: 'Congress Meeting' }];
    }
    if (isJirgaView) {
      const jrgTypes = (eventTypes || []).filter((t) => ['JRG', 'JIRGA'].includes(String(t.code).toUpperCase()) || String(t.label).toLowerCase() === 'jirga meeting');
      return jrgTypes.length ? jrgTypes : [{ code: 'JRG', label: 'Jirga Meeting' }];
    }
    if (isCommitteeView) {
      const cmTypes = (eventTypes || []).filter((t) => ['CMP', 'COMMITTEE'].includes(String(t.code).toUpperCase()) || String(t.label).toLowerCase() === 'committee meeting');
      return cmTypes.length ? cmTypes : [{ code: 'CMP', label: 'Committee Meeting' }];
    }
    const execTypes = (eventTypes || []).filter((t) => ['EXC', 'EXECUTIVE', 'GBM', 'GENERAL_BODY'].includes(String(t.code).toUpperCase()));
    return execTypes.length ? execTypes : [
      { code: 'EXC', label: 'Executive Council' },
      { code: 'GBM', label: 'General Body' },
    ];
  }, [eventTypes, isCommitteeView, isJirgaView, isCongressView]);

  const nonCommitteeItems = useMemo(
    () => items.filter((m) => m.body !== 'COMMITTEE' && m.body !== 'JIRGA' && m.body !== 'CONGRESS'),
    [items]
  );
  const execItems = useMemo(
    () => nonCommitteeItems.filter((m) => m.typeCode === 'EXC' || m.type === 'EXC' || m.body === 'EXECUTIVE'),
    [nonCommitteeItems]
  );
  const gbmItems = useMemo(
    () => nonCommitteeItems.filter((m) => m.typeCode === 'GBM' || m.type === 'GBM' || m.body === 'GENERAL_BODY'),
    [nonCommitteeItems]
  );

  const displayedItems = useMemo(() => {
    if (isCongressView || isJirgaView || isCommitteeView) return items;
    if (bodyTab === 'EXECUTIVE') return execItems;
    if (bodyTab === 'GENERAL_BODY') return gbmItems;
    return nonCommitteeItems;
  }, [items, bodyTab, isCongressView, isJirgaView, isCommitteeView, execItems, gbmItems, nonCommitteeItems]);

  function openCreate() {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const startDefault = `${todayStr}T10:00`;
    const endDefault = `${todayStr}T12:00`;

    const initialCode = isCongressView
      ? 'CNG'
      : (isJirgaView ? 'JRG' : (isCommitteeView ? 'CMP' : (bodyTab === 'GENERAL_BODY' ? 'GBM' : 'EXC')));

    setForm({
      ...EMPTY_FORM,
      typeCode: initialCode,
      startAt: startDefault,
      endAt: endDefault,
    });
    setShowForm(true);
  }

  // Modals state
  const [editing, setEditing] = useState(null);
  const [finalizing, setFinalizing] = useState(null);
  const [finalizingLoading, setFinalizingLoading] = useState(false);
  const [supervisorCandidates, setSupervisorCandidates] = useState([]);
  const [supervisorLoading, setSupervisorLoading] = useState(false);

  const [photosFor, setPhotosFor] = useState(null);
  const [activePhotoIdx, setActivePhotoIdx] = useState(0);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);

  const [docFor, setDocFor] = useState(null);
  const [docKind, setDocKind] = useState('AGENDA');
  const [uploadingDocs, setUploadingDocs] = useState(false);

  async function uploadPhotos(meetingId, files) {
    if (!files || !files.length) return;
    const batch = files.slice(0, 10);
    const fd = new FormData();

    if (Platform.OS === 'web') {
      batch.forEach((f) => fd.append('photos', f));
    } else {
      batch.forEach((f) => {
        fd.append('photos', {
          uri: f.uri,
          name: f.name,
          type: f.type,
        });
      });
    }

    setUploadingPhotos(true);
    try {
      const r = await api.post(`/meetings/${meetingId}/photos`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const data = r.data?.data;
      if (data?.accepted?.length) {
        toast.success(`${data.accepted.length} photo(s) uploaded successfully.`);
      }
      if (data?.rejected?.length) {
        toast.error(data.rejected.map((x) => `${x.filename}: ${x.reason}`).join(' | '));
      }
      load(true);
      if (photosFor && photosFor._id === meetingId) {
        setPhotosFor(data?.meeting || { ...photosFor, photos: data?.meeting?.photos });
      }
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setUploadingPhotos(false);
    }
  }

  function handlePhotoUploadPress(m) {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.multiple = true;
      input.onchange = (e) => {
        const files = Array.from(e.target.files || []);
        if (files.length) uploadPhotos(m._id, files);
      };
      input.click();
    } else {
      pickPhotosNative(m._id);
    }
  }

  async function pickPhotosNative(meetingId) {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        toast.error('Media library permission is required to upload photos.');
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        quality: 0.85,
        exif: true,
      });
      if (!res.canceled && res.assets && res.assets.length > 0) {
        const files = res.assets.map((asset, i) => {
          const uri = asset.uri;
          const filename = asset.fileName || uri.split('/').pop() || `photo_${i}.jpg`;
          const match = /\.(\w+)$/.exec(filename);
          const type = match ? `image/${match[1]}` : 'image/jpeg';
          return { uri, name: filename, type };
        });
        uploadPhotos(meetingId, files);
      }
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  async function uploadDocument(meetingId, file, kind) {
    if (!file) return;
    const fd = new FormData();
    if (Platform.OS === 'web') {
      fd.append('file', file);
    } else {
      fd.append('file', {
        uri: file.uri,
        name: file.name,
        type: file.type || 'application/pdf',
      });
    }
    fd.append('kind', kind);

    setUploadingDocs(true);
    try {
      const r = await api.post(`/meetings/${meetingId}/documents`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast.success('Document uploaded.');
      load(true);
      if (docFor && docFor._id === meetingId) {
        setDocFor(r.data?.data?.meeting || docFor);
      }
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setUploadingDocs(false);
    }
  }

  function handleDocUploadPress(meetingId, kind) {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.pdf,.doc,.docx,image/*';
      input.onchange = (e) => {
        const file = e.target.files?.[0];
        if (file) uploadDocument(meetingId, file, kind);
      };
      input.click();
    } else {
      toast.info('Document upload is supported on web or via image picker on mobile.');
    }
  }

  async function loadSupervisorCandidates(meetingId) {
    setSupervisorLoading(true);
    try {
      const r = await api.get(`/meetings/${meetingId}/supervisor-candidates`);
      setSupervisorCandidates(r.data?.data || []);
    } catch {
      setSupervisorCandidates([]);
    } finally {
      setSupervisorLoading(false);
    }
  }

  function getMemberRoleText(s) {
    if (!s) return '';
    if (s.roleText) return s.roleText;
    if (s.roles && Array.isArray(s.roles)) {
      return s.roles.map((r) => r.customName || r.name || r.code).join(', ');
    }
    return '';
  }

  async function openFinalize(m) {
    setFinalizing({
      meeting: m,
      previouswork: m.decisions || '',
      upcomingStrategy: m.upcomingStrategy || '',
      notes: m.notes || '',
      supervisorAttended: !!m.supervisorAttended,
      supervisorMemberId: m.supervisorMemberId?._id || m.supervisorMemberId || '',
      supervisorQuery: '',
      attendance: [],
      studyRows: m.studyContributions || [],
    });
    setFinalizingLoading(true);

    if (m.unitLevel !== 'CENTRAL') {
      loadSupervisorCandidates(m._id);
    }

    try {
      const r = await api.get(`/meetings/${m._id}/attendees`);
      const list = r.data?.data || [];
      const existingMap = new Map((m.attendance || []).map((a) => [String(a.memberId?._id || a.memberId), a.status]));
      const rows = list.map((att) => ({
        memberId: att._id,
        name: att.fullName,
        memberCode: att.memberId,
        roleText: att.roleText,
        unitText: att.unitText,
        status: existingMap.get(String(att._id)) || 'ABSENT',
      }));
      setFinalizing((prev) => ({ ...prev, attendance: rows }));
    } catch {
      try {
        const r2 = await api.get('/meetings/eligible-attendees', {
          params: { unitLevel: m.unitLevel, unitId: m.unitId, body: m.body },
        });
        const list2 = r2.data?.data || [];
        const rows2 = list2.map((att) => ({
          memberId: att._id,
          name: att.fullName,
          memberCode: att.memberId,
          roleText: att.roleText,
          status: 'ABSENT',
        }));
        setFinalizing((prev) => ({ ...prev, attendance: rows2 }));
      } catch {
        setFinalizing((prev) => ({ ...prev, attendance: [] }));
      }
    } finally {
      setFinalizingLoading(false);
    }
  }

  function setAttendanceStatus(memberId, status) {
    setFinalizing((prev) => ({
      ...prev,
      attendance: (prev.attendance || []).map((r) => (r.memberId === memberId ? { ...r, status } : r)),
    }));
  }

  function markAllAttendance(status) {
    setFinalizing((prev) => ({
      ...prev,
      attendance: (prev.attendance || []).map((r) => ({ ...r, status })),
    }));
  }

  function addStudyRow() {
    setFinalizing((prev) => ({
      ...prev,
      studyRows: [...(prev.studyRows || []), { memberId: '', topic: '', summary: '' }],
    }));
  }

  function updateStudyRow(index, patch) {
    setFinalizing((prev) => ({
      ...prev,
      studyRows: (prev.studyRows || []).map((r, i) => (i === index ? { ...r, ...patch } : r)),
    }));
  }

  function removeStudyRow(index) {
    setFinalizing((prev) => ({
      ...prev,
      studyRows: (prev.studyRows || []).filter((_, i) => i !== index),
    }));
  }

  async function handleFinalizeSubmit() {
    if (!finalizing?.previouswork?.trim()) {
      toast.error('Previous work is required to finalize.');
      return;
    }
    setSaving(true);
    try {
      const isStudy = finalizing.meeting.type === 'STC' || finalizing.meeting.typeCode === 'STC';
      const payload = {
        decisions: finalizing.previouswork.trim(),
        upcomingStrategy: finalizing.upcomingStrategy?.trim() || undefined,
        notes: finalizing.notes?.trim() || undefined,
        supervisorAttended: finalizing.supervisorAttended,
        supervisorMemberId: (finalizing.supervisorAttended && finalizing.supervisorMemberId) ? finalizing.supervisorMemberId : undefined,
        attendance: (finalizing.attendance || []).map((a) => ({
          memberId: a.memberId,
          status: a.status,
        })),
        studyContributions: isStudy
          ? (finalizing.studyRows || []).filter((s) => s.memberId && s.topic?.trim())
          : undefined,
      };
      await api.post(`/meetings/${finalizing.meeting._id}/finalize`, payload);
      toast.success('Minutes recorded and meeting finalized successfully!');
      setFinalizing(null);
      load(true);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  const selectedSupervisor = (supervisorCandidates || []).find(
    (s) => s._id === finalizing?.supervisorMemberId
  ) || null;

  const filteredSupervisors = useMemo(() => {
    if (!finalizing) return [];
    const q = (finalizing.supervisorQuery || '').trim().toLowerCase();
    if (!q) return supervisorCandidates;
    return supervisorCandidates.filter((s) =>
      [s.fullName, s.unitName, s.memberCode, s.unitLevel, getMemberRoleText(s)]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q)
    );
  }, [finalizing?.supervisorQuery, supervisorCandidates]);

  function openEdit(m) {
    setEditing({
      _id: m._id,
      title: m.title || '',
      venue: m.venue || '',
      startAt: m.startAt ? m.startAt.split('T')[0] : '',
      agenda: m.agenda || '',
      description: m.description || '',
    });
  }

  async function handleEditSubmit() {
    if (!editing?.title?.trim() || !editing?.venue?.trim()) {
      toast.error('Title and venue are required.');
      return;
    }
    setSaving(true);
    try {
      await api.patch(`/meetings/${editing._id}`, {
        title: editing.title.trim(),
        venue: editing.venue.trim(),
        agenda: editing.agenda?.trim() || undefined,
        description: editing.description?.trim() || undefined,
      });
      toast.success('Meeting updated.');
      setEditing(null);
      load(true);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleCancelMeeting(m) {
    const doCancel = async () => {
      try {
        await api.post(`/meetings/${m._id}/cancel`, {});
        toast.success('Meeting cancelled.');
        load(true);
      } catch (e) {
        toast.error(errorMessage(e));
      }
    };

    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.confirm) {
      if (window.confirm(`Are you sure you want to cancel ${m.title || m.type || 'this meeting'}?`)) {
        await doCancel();
      }
    } else {
      Alert.alert('Cancel Meeting', `Are you sure you want to cancel ${m.title || m.type || 'this meeting'}?`, [
        { text: 'No', style: 'cancel' },
        { text: 'Yes, Cancel', style: 'destructive', onPress: doCancel },
      ]);
    }
  }

  async function handleSingleMeetingExport(m) {
    try {
      const safeTitle = (m.title || m.type || 'meeting').replace(/[^a-zA-Z0-9_-]/g, '_');
      await downloadAndShare(`/exports/meeting/${m._id}/pdf`, `${safeTitle}-minutes.pdf`);
      toast.success('Meeting PDF downloaded.');
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  async function handleCreate() {
    if (!form.venue?.trim()) {
      toast.error('Venue is required.');
      return;
    }
    if (!form.startAt) {
      toast.error('Start date & time is required.');
      return;
    }
    if (!form.endAt) {
      toast.error('End date & time is required.');
      return;
    }
    if (new Date(form.endAt) <= new Date(form.startAt)) {
      toast.error('End date & time must be after Start date & time.');
      return;
    }

    setSaving(true);
    try {
      const bodyPayload = isCongressView ? 'CONGRESS' : (isJirgaView ? 'JIRGA' : (isCommitteeView ? 'COMMITTEE' : (form.typeCode === 'GBM' ? 'GENERAL_BODY' : 'EXECUTIVE')));
      const typeCode = form.typeCode || (isCongressView ? 'CNG' : (isJirgaView ? 'JRG' : (isCommitteeView ? 'CMP' : 'EXC')));

      const payload = {
        title: form.title?.trim() || undefined,
        description: form.description?.trim() || undefined,
        venue: form.venue.trim(),
        startAt: new Date(form.startAt).toISOString(),
        endAt: new Date(form.endAt).toISOString(),
        typeCode,
        type: typeCode,
        body: bodyPayload,
        chairpersonId: form.chairpersonId || undefined,
        gpsLat: form.gpsLat ? parseFloat(form.gpsLat) : undefined,
        gpsLng: form.gpsLng ? parseFloat(form.gpsLng) : undefined,
        agenda: form.agenda?.trim() || undefined,
        unitLevel: activeLevel,
        unitId: resolvedUnitId,
      };

      await api.post('/meetings', payload);
      toast.success(`${isJirgaView ? 'Jirga Meeting' : 'Meeting'} scheduled.`);
      setShowForm(false);
      setForm(EMPTY_FORM);
      load(true);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  function renderItem({ item: m }) {
    const isCng = m.body === 'CONGRESS' || m.typeCode === 'CNG' || m.typeCode === 'CONGRESS';
    const isJrg = !isCng && (m.body === 'JIRGA' || m.typeCode === 'JRG' || m.typeCode === 'JIRGA');
    const isCm = !isCng && !isJrg && (m.body === 'COMMITTEE' || m.typeCode === 'CMP' || m.type === 'CMP');
    const isGbm = !isCng && !isJrg && (m.body === 'GENERAL_BODY' || m.typeCode === 'GBM' || m.type === 'GBM');
    
    let typeBadgeLabel = 'Executive';
    let typeBadgeBg = '#eef2ff';
    let typeBadgeColor = '#4338ca';

    if (isCng) { typeBadgeLabel = 'Congress'; typeBadgeBg = '#e0f2fe'; typeBadgeColor = '#0369a1'; }
    else if (isJrg) { typeBadgeLabel = 'Jirga'; typeBadgeBg = '#f3e8ff'; typeBadgeColor = '#6b21a8'; }
    else if (isCm) { typeBadgeLabel = 'Committee'; typeBadgeBg = '#fef3c7'; typeBadgeColor = '#92400e'; }
    else if (isGbm) { typeBadgeLabel = 'General Body'; typeBadgeBg = '#ecfdf5'; typeBadgeColor = '#065f46'; }

    const isFinalized = m.state === 'FINALIZED';
    const isCancelled = m.state === 'CANCELLED';

    return (
      <View style={styles.tr}>
        <View style={[styles.td, { width: 140 }]}>
           <Text style={styles.tdText}>{new Date(m.startAt).toLocaleString()}</Text>
        </View>
        <View style={[styles.td, { width: 160 }]}>
           <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
             <Badge label={typeBadgeLabel} color={typeBadgeColor} bg={typeBadgeBg} />
             <Text style={styles.tdText} numberOfLines={2}>{m.title ? `${m.type} · ${m.title}` : m.type}</Text>
           </View>
        </View>
        <View style={[styles.td, { width: 120 }]}>
           <Text style={styles.tdText} numberOfLines={2}>{m.venue || ''}</Text>
        </View>
        <View style={[styles.td, { width: 130 }]}>
           <Text style={styles.tdText} numberOfLines={2}>{m.chairpersonId?.fullName || m.chairpersonId || '—'}</Text>
        </View>
        <View style={[styles.td, { width: 100 }]}>
           <Text style={styles.tdText}>{(m.attendance || []).filter((a) => a.status === 'PRESENT' || a.status === 'LATE').length} / {(m.attendance || []).length || 0} present</Text>
        </View>
        <View style={[styles.td, { width: 95 }]}>
           <Badge label={m.state || 'SCHEDULED'} color={isFinalized ? '#15803d' : (isCancelled ? '#b91c1c' : '#b45309')} bg={isFinalized ? '#dcfce7' : (isCancelled ? '#fee2e2' : '#fef3c7')} />
        </View>
        <View style={[styles.td, { width: 95 }]}>
          {(m.photos || []).length === 0 ? (
            <Text style={[styles.tdText, { color: Colors.textMuted }]}>0</Text>
          ) : (
            <TouchableOpacity
              style={styles.rowBtnGhost}
              onPress={() => { setPhotosFor(m); setActivePhotoIdx(0); }}
            >
              <Text style={[styles.rowBtnGhostText, { color: Colors.primary }]}>
                📷 {(m.photos || []).length} · View
              </Text>
            </TouchableOpacity>
          )}
        </View>
        <View style={[styles.td, { width: 85 }]}>
          {(m.documents || []).length === 0 ? (
            <Text style={[styles.tdText, { color: Colors.textMuted }]}>0</Text>
          ) : (
            <TouchableOpacity
              style={styles.rowBtnGhost}
              onPress={() => { setDocFor(m); setDocKind('AGENDA'); }}
            >
              <Text style={[styles.rowBtnGhostText, { color: Colors.primary }]}>
                📄 {(m.documents || []).length} · Docs
              </Text>
            </TouchableOpacity>
          )}
        </View>
        <View style={[styles.td, { width: 330, flexDirection: 'row', gap: 6, alignItems: 'center' }]}>
          <TouchableOpacity style={styles.rowBtnGhost} onPress={() => handleSingleMeetingExport(m)}>
            <Ionicons name="document-text-outline" size={14} color={Colors.textMuted} />
            <Text style={styles.rowBtnGhostText}>PDF</Text>
          </TouchableOpacity>

          {canManage && !isFinalized && !isCancelled && (
            <>
              <TouchableOpacity style={styles.rowBtnGhost} onPress={() => openEdit(m)}>
                <Text style={styles.rowBtnGhostText}>Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.rowBtnGhost} onPress={() => { setDocFor(m); setDocKind('AGENDA'); }}>
                <Text style={styles.rowBtnGhostText}>Docs</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.rowBtnSecondary}
                onPress={() => handlePhotoUploadPress(m)}
                disabled={uploadingPhotos}
              >
                {uploadingPhotos ? (
                  <ActivityIndicator size="small" color={Colors.text} />
                ) : (
                  <Ionicons name="camera-outline" size={14} color={Colors.text} />
                )}
                <Text style={styles.rowBtnSecondaryText}>Photos</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.rowBtnFinalize} onPress={() => openFinalize(m)}>
                <Text style={styles.rowBtnFinalizeText}>Finalize</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.rowBtnDanger} onPress={() => handleCancelMeeting(m)}>
                <Text style={styles.rowBtnDangerText}>Cancel</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    );
  }

  const tableHeader = () => (
    <View style={styles.thRow}>
      <Text style={[styles.th, { width: 140 }]}>When</Text>
      <Text style={[styles.th, { width: 160 }]}>Type</Text>
      <Text style={[styles.th, { width: 120 }]}>Venue</Text>
      <Text style={[styles.th, { width: 130 }]}>Chairperson</Text>
      <Text style={[styles.th, { width: 100 }]}>Attendance</Text>
      <Text style={[styles.th, { width: 95 }]}>State</Text>
      <Text style={[styles.th, { width: 95 }]}>Photos</Text>
      <Text style={[styles.th, { width: 85 }]}>Docs</Text>
      <Text style={[styles.th, { width: 330 }]}>Actions</Text>
    </View>
  );

  const selectedProvince = (provinces || []).find((p) => String(p._id) === String(selectedUnitId));
  const pageTitle = isCongressView
    ? 'National Congress Meetings · PKNAP Central'
    : (isJirgaView
      ? (activeLevel === 'CENTRAL' ? 'Qomi Jirga Meetings · PKNAP Central' : `Sobayi Jirga Meetings · ${selectedProvince?.name || 'Province'}`)
      : (isCommitteeView
        ? `Committee Meetings · ${ctx?.unitName || 'PKNAP Central'}`
        : `Meetings · ${ctx?.unitName || 'PKNAP Central'}`));

  const scheduleBtnLabel = isCongressView
    ? '+ Schedule Congress Meeting'
    : (isJirgaView
      ? '+ Schedule Jirga Meeting'
      : (isCommitteeView ? '+ Schedule Committee Meeting' : '+ Schedule Meeting'));

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header matching web */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={{ flex: 1 }}>
            <View style={styles.badgeRow}>
              <View style={styles.unitLevelBadge}>
                <Text style={styles.unitLevelBadgeText}>{activeLevel.replace('_', ' ')}</Text>
              </View>
              {isJirgaView && (
                <View style={styles.streamBadgeJirga}>
                  <Text style={styles.streamBadgeTextJirga}>Jirga Stream</Text>
                </View>
              )}
            </View>
            <Text style={styles.pageTitle}>{pageTitle}</Text>
          </View>
          
          <View style={styles.headerActionsRow}>
            <TouchableOpacity
              style={[styles.btnExport, exporting === 'pdf' && { opacity: 0.6 }]}
              onPress={() => handleExport('pdf')}
              disabled={!!exporting}
            >
              {exporting === 'pdf' ? (
                <ActivityIndicator size="small" color={Colors.textMuted} />
              ) : (
                <Ionicons name="document-text-outline" size={15} color={Colors.text} />
              )}
              <Text style={styles.btnExportText}>PDF</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.btnExport, exporting === 'xlsx' && { opacity: 0.6 }]}
              onPress={() => handleExport('xlsx')}
              disabled={!!exporting}
            >
              {exporting === 'xlsx' ? (
                <ActivityIndicator size="small" color={Colors.textMuted} />
              ) : (
                <Ionicons name="stats-chart-outline" size={15} color={Colors.text} />
              )}
              <Text style={styles.btnExportText}>Excel</Text>
            </TouchableOpacity>

            {canManage && (
              <TouchableOpacity style={styles.btnSchedulePrimary} onPress={openCreate}>
                <Ionicons name="calendar" size={15} color="#fff" />
                <Text style={styles.btnSchedulePrimaryText}>{scheduleBtnLabel}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>

      {/* Province Switcher Pills for Jirga */}
      {isJirgaView && provinces && provinces.length > 0 && (
        <View style={styles.tierPillsWrapper}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tierPillsScroll}>
            {provinces.map((prov) => {
              const isActive = selectedLevel === 'PROVINCE' && String(selectedUnitId) === String(prov._id);
              return (
                <TouchableOpacity
                  key={prov._id}
                  style={[styles.tierPill, isActive && styles.tierPillActive]}
                  onPress={() => {
                    setSelectedLevel('PROVINCE');
                    setSelectedUnitId(prov._id);
                  }}
                >
                  <Ionicons
                    name="location-outline"
                    size={14}
                    color={isActive ? '#fff' : Colors.textMuted}
                    style={{ marginRight: 4 }}
                  />
                  <Text style={[styles.tierPillText, isActive && styles.tierPillTextActive]}>
                    {prov.name} Sobayi Jirga
                  </Text>
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity
              style={[styles.tierPill, selectedLevel === 'CENTRAL' && styles.tierPillActive]}
              onPress={() => {
                setSelectedLevel('CENTRAL');
                setSelectedUnitId('CENTRAL');
              }}
            >
              <Ionicons
                name="shield-outline"
                size={14}
                color={selectedLevel === 'CENTRAL' ? '#fff' : Colors.textMuted}
                style={{ marginRight: 4 }}
              />
              <Text style={[styles.tierPillText, selectedLevel === 'CENTRAL' && styles.tierPillTextActive]}>
                Qomi Jirga (Central)
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      )}

      {/* Category Sub-Tabs (only when not in specialized body view) */}
      {!isCongressView && !isJirgaView && !isCommitteeView && (
        <View style={styles.categoryRow}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
            <Text style={styles.categoryLabel}>Category:</Text>
            
            <TouchableOpacity style={[styles.catChip, bodyTab === 'ALL' && styles.catChipActive]} onPress={() => setBodyTab('ALL')}>
              <Text style={[styles.catChipText, bodyTab === 'ALL' && styles.catChipTextActive]}>All Meetings</Text>
              <Text style={styles.catChipCount}>({nonCommitteeItems.length})</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.catChip, bodyTab === 'EXECUTIVE' && styles.catChipActive]} onPress={() => setBodyTab('EXECUTIVE')}>
              <Text style={[styles.catChipText, bodyTab === 'EXECUTIVE' && styles.catChipTextActive]}>🏛️ Executive Meetings</Text>
              <Text style={styles.catChipCount}>({execItems.length})</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.catChip, bodyTab === 'GENERAL_BODY' && styles.catChipActive]} onPress={() => setBodyTab('GENERAL_BODY')}>
              <Text style={[styles.catChipText, bodyTab === 'GENERAL_BODY' && styles.catChipTextActive]}>👥 General Body Meetings</Text>
              <Text style={styles.catChipCount}>({gbmItems.length})</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      )}

      <ScrollView horizontal style={{ flex: 1 }} contentContainerStyle={{ padding: Spacing.lg }}>
        <View style={{ flex: 1 }}>
          <FlatList
            data={displayedItems}
            renderItem={renderItem}
            keyExtractor={(m) => m._id}
            ListHeaderComponent={tableHeader}
            onRefresh={onRefresh}
            refreshing={refreshing}
            contentContainerStyle={styles.tableWrap}
            ListEmptyComponent={
              !loading ? (
                <View style={{ padding: 24, alignItems: 'center' }}>
                  <Text style={{ color: Colors.textMuted }}>
                    {isJirgaView ? 'No Jirga meetings scheduled yet.' :
                    isCongressView ? 'No Congress meetings scheduled yet.' :
                    isCommitteeView ? 'No Committee meetings scheduled yet.' :
                    bodyTab === 'EXECUTIVE' ? 'No executive meetings scheduled yet.' :
                    bodyTab === 'GENERAL_BODY' ? 'No general body meetings scheduled yet.' :
                    'No meetings scheduled yet.'}
                  </Text>
                </View>
              ) : null
            }
            ListFooterComponent={loading && !refreshing ? <ActivityIndicator style={{ padding: 16 }} color={Colors.primary} /> : null}
          />
        </View>
      </ScrollView>

      {/* ========================================================================= */}
      {/* SCHEDULE MEETING MODAL                                                    */}
      {/* ========================================================================= */}
      <Modal visible={showForm} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowForm(false)}>
        <SafeAreaView style={styles.modalSafe}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
            <View style={styles.modalHeaderCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalHeaderCardTitle}>
                  {isCongressView ? 'Schedule Congress Meeting' : (isJirgaView ? 'Schedule Jirga Meeting' : (isCommitteeView ? 'Schedule Committee Meeting' : 'Schedule a Meeting'))}
                </Text>
                <Text style={styles.modalHeaderCardSub}>
                  Fields marked with <Text style={{ color: Colors.error, fontWeight: '700' }}>*</Text> are required
                </Text>
              </View>
              <TouchableOpacity style={styles.modalCloseCircle} onPress={() => setShowForm(false)}>
                <Ionicons name="close" size={20} color="#475569" />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.formScrollBody} keyboardShouldPersistTaps="handled">
              {/* Type & Title Card */}
              <View style={styles.formCard}>
                <Text style={styles.cardHeaderLabel}>Meeting Type & Title</Text>
                <View style={styles.inputGroup}>
                  <Text style={styles.inputGroupLabel}>Type <Text style={{ color: Colors.error }}>*</Text></Text>
                  <View style={styles.modernPickerWrap}>
                    <Picker
                      selectedValue={form.typeCode}
                      onValueChange={(val) => setForm((f) => ({ ...f, typeCode: val }))}
                    >
                      {availableTypes.map((t) => (
                        <Picker.Item key={t.code} label={t.label} value={t.code} />
                      ))}
                    </Picker>
                  </View>
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputGroupLabel}>Title (Optional)</Text>
                  <TextInput
                    style={styles.modernTextInput}
                    value={form.title}
                    onChangeText={(v) => setForm((f) => ({ ...f, title: v }))}
                    placeholder="e.g. Monthly Review & Strategy Session"
                    placeholderTextColor="#94a3b8"
                  />
                </View>
              </View>

              {/* Schedule, Venue & Location Card */}
              <View style={styles.formCard}>
                <Text style={styles.cardHeaderLabel}>Schedule & Location</Text>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputGroupLabel}>Start Date & Time <Text style={{ color: Colors.error }}>*</Text></Text>
                  <DateTimeField
                    value={form.startAt}
                    onChange={(v) => setForm((f) => ({ ...f, startAt: v }))}
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputGroupLabel}>End Date & Time <Text style={{ color: Colors.error }}>*</Text></Text>
                  <DateTimeField
                    value={form.endAt}
                    onChange={(v) => setForm((f) => ({ ...f, endAt: v }))}
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputGroupLabel}>Venue <Text style={{ color: Colors.error }}>*</Text></Text>
                  <TextInput
                    style={styles.modernTextInput}
                    value={form.venue}
                    onChangeText={(v) => setForm((f) => ({ ...f, venue: v }))}
                    placeholder="e.g. Provincial Secretariat, Peshawar"
                    placeholderTextColor="#94a3b8"
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputGroupLabel}>Chairperson</Text>
                  <View style={styles.modernPickerWrap}>
                    <Picker
                      selectedValue={form.chairpersonId}
                      onValueChange={(val) => setForm((f) => ({ ...f, chairpersonId: val }))}
                    >
                      <Picker.Item label="— Select chairperson (optional) —" value="" />
                      {chairpersonOptions.map((c) => (
                        <Picker.Item key={c._id} label={`${c.fullName} · ${c.memberId || ''}`} value={c._id} />
                      ))}
                    </Picker>
                  </View>
                </View>

                {/* Venue GPS row */}
                <View style={{ marginTop: 12 }}>
                  <Text style={styles.inputGroupLabel}>Venue GPS Coordinates (Optional)</Text>
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <View style={{ flex: 1 }}>
                      <TextInput
                        style={styles.modernTextInput}
                        value={form.gpsLat}
                        onChangeText={(v) => setForm((f) => ({ ...f, gpsLat: v }))}
                        placeholder="Latitude (e.g. 34.0151)"
                        placeholderTextColor="#94a3b8"
                        keyboardType="numeric"
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <TextInput
                        style={styles.modernTextInput}
                        value={form.gpsLng}
                        onChangeText={(v) => setForm((f) => ({ ...f, gpsLng: v }))}
                        placeholder="Longitude (e.g. 71.5249)"
                        placeholderTextColor="#94a3b8"
                        keyboardType="numeric"
                      />
                    </View>
                  </View>
                </View>
              </View>

              {/* Agenda & Description Card */}
              <View style={styles.formCard}>
                <Text style={styles.cardHeaderLabel}>Agenda & Details</Text>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputGroupLabel}>Description</Text>
                  <TextInput
                    style={[styles.modernTextInput, { height: 75, textAlignVertical: 'top' }]}
                    value={form.description}
                    onChangeText={(v) => setForm((f) => ({ ...f, description: v }))}
                    placeholder="Brief summary or context of the meeting"
                    placeholderTextColor="#94a3b8"
                    multiline
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputGroupLabel}>Agenda Items</Text>
                  <TextInput
                    style={[styles.modernTextInput, { height: 85, textAlignVertical: 'top' }]}
                    value={form.agenda}
                    onChangeText={(v) => setForm((f) => ({ ...f, agenda: v }))}
                    placeholder="1. Review of previous actions&#10;2. Membership campaign&#10;3. Next events"
                    placeholderTextColor="#94a3b8"
                    multiline
                  />
                </View>
              </View>

              {/* Bottom Actions */}
              <View style={styles.modalBottomActions}>
                <TouchableOpacity style={styles.btnModalCancel} onPress={() => setShowForm(false)}>
                  <Text style={styles.btnModalCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.btnModalSubmit} onPress={handleCreate} disabled={saving}>
                  {saving ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="calendar-outline" size={18} color="#fff" style={{ marginRight: 6 }} />
                      <Text style={styles.btnModalSubmitText}>
                        {isJirgaView ? 'Schedule Jirga Meeting' : 'Schedule Meeting'}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {/* ========================================================================= */}
      {/* FINALIZE MEETING MODAL                                                    */}
      {/* ========================================================================= */}
      {finalizing && (
        <Modal visible={!!finalizing} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setFinalizing(null)}>
          <SafeAreaView style={styles.modalSafe}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
              <View style={styles.modalHeaderCard}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalHeaderCardTitle}>Finalize Meeting & Record Minutes</Text>
                  <Text style={styles.modalHeaderCardSub}>
                    {finalizing.meeting.title || finalizing.meeting.type} · {new Date(finalizing.meeting.startAt).toLocaleDateString()} · {finalizing.meeting.venue || 'No venue'}
                  </Text>
                </View>
                <TouchableOpacity style={styles.modalCloseCircle} onPress={() => setFinalizing(null)}>
                  <Ionicons name="close" size={20} color="#475569" />
                </TouchableOpacity>
              </View>

              <ScrollView contentContainerStyle={styles.formScrollBody} keyboardShouldPersistTaps="handled">
                {/* Minutes & Strategy Card */}
                <View style={styles.formCard}>
                  <Text style={styles.cardHeaderLabel}>Minutes & Decisions</Text>

                  <View style={styles.inputGroup}>
                    <Text style={styles.inputGroupLabel}>
                      Previous Work (Decisions / Minutes) <Text style={{ color: Colors.error }}>*</Text>
                    </Text>
                    <TextInput
                      style={[styles.modernTextInput, { height: 95, textAlignVertical: 'top' }]}
                      value={finalizing.previouswork}
                      onChangeText={(v) => setFinalizing((f) => ({ ...f, previouswork: v }))}
                      placeholder="Detail the decisions taken and previous work reviewed..."
                      placeholderTextColor="#94a3b8"
                      multiline
                    />
                  </View>

                  <View style={styles.inputGroup}>
                    <Text style={styles.inputGroupLabel}>Upcoming Strategy (Optional)</Text>
                    <TextInput
                      style={[styles.modernTextInput, { height: 75, textAlignVertical: 'top' }]}
                      value={finalizing.upcomingStrategy}
                      onChangeText={(v) => setFinalizing((f) => ({ ...f, upcomingStrategy: v }))}
                      placeholder="Key directives and actionable plans for next cycle..."
                      placeholderTextColor="#94a3b8"
                      multiline
                    />
                  </View>

                  <View style={styles.inputGroup}>
                    <Text style={styles.inputGroupLabel}>Activity Notes (Optional)</Text>
                    <TextInput
                      style={[styles.modernTextInput, { height: 70, textAlignVertical: 'top' }]}
                      value={finalizing.notes}
                      onChangeText={(v) => setFinalizing((f) => ({ ...f, notes: v }))}
                      placeholder="General observations, venue notes, or remarks..."
                      placeholderTextColor="#94a3b8"
                      multiline
                    />
                  </View>
                </View>

                {/* Supervisor Attendance Card (for non-central units) */}
                {finalizing.meeting.unitLevel !== 'CENTRAL' && (
                  <View style={styles.formCard}>
                    <Text style={styles.cardHeaderLabel}>Supervisory Oversight</Text>
                    <TouchableOpacity
                      style={styles.checkboxRow}
                      onPress={() => setFinalizing((f) => ({ ...f, supervisorAttended: !f.supervisorAttended }))}
                    >
                      <View style={[styles.modernCheckbox, finalizing.supervisorAttended && styles.modernCheckboxActive]}>
                        {finalizing.supervisorAttended && <Ionicons name="checkmark" size={16} color="#fff" />}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.checkboxLabel}>A senior unit supervisor attended this meeting</Text>
                        <Text style={styles.checkboxSub}>Enable to link and give oversight attribution.</Text>
                      </View>
                    </TouchableOpacity>

                    {finalizing.supervisorAttended && (
                      <View style={{ marginTop: 14 }}>
                        {selectedSupervisor ? (
                          <View style={styles.supervisorSelectedCard}>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.supervisorName}>{selectedSupervisor.fullName}</Text>
                              <Text style={styles.supervisorSub}>
                                {selectedSupervisor.unitName || selectedSupervisor.unitLevel} · {selectedSupervisor.memberCode || ''}
                              </Text>
                            </View>
                            <TouchableOpacity
                              style={styles.btnChangeSupervisor}
                              onPress={() => setFinalizing((f) => ({ ...f, supervisorMemberId: '' }))}
                            >
                              <Text style={styles.btnChangeSupervisorText}>Change</Text>
                            </TouchableOpacity>
                          </View>
                        ) : (
                          <View>
                            <Text style={styles.inputGroupLabel}>Search & Pick Supervisor</Text>
                            <TextInput
                              style={styles.modernTextInput}
                              placeholder="Search supervisor by name or code..."
                              placeholderTextColor="#94a3b8"
                              value={finalizing.supervisorQuery}
                              onChangeText={(v) => setFinalizing((f) => ({ ...f, supervisorQuery: v }))}
                            />
                            {supervisorLoading ? (
                              <ActivityIndicator style={{ padding: 12 }} color={Colors.primary} />
                            ) : (
                              <View style={styles.candidateListBox}>
                                {filteredSupervisors.slice(0, 5).map((cand) => (
                                  <TouchableOpacity
                                    key={cand._id}
                                    style={styles.candidateRow}
                                    onPress={() => setFinalizing((f) => ({ ...f, supervisorMemberId: cand._id }))}
                                  >
                                    <View style={{ flex: 1 }}>
                                      <Text style={styles.candName}>{cand.fullName}</Text>
                                      <Text style={styles.candSub}>{cand.unitName || cand.unitLevel} · {cand.memberCode || ''}</Text>
                                    </View>
                                    <Ionicons name="chevron-forward" size={16} color="#94a3b8" />
                                  </TouchableOpacity>
                                ))}
                              </View>
                            )}
                          </View>
                        )}
                      </View>
                    )}
                  </View>
                )}

                {/* Attendance Roster Card */}
                <View style={styles.formCard}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <View>
                      <Text style={styles.cardHeaderLabel}>Attendance Roster</Text>
                      <Text style={styles.fieldHint}>
                        {(finalizing.attendance || []).filter((a) => a.status === 'PRESENT' || a.status === 'LATE').length} of {(finalizing.attendance || []).length} present
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      <TouchableOpacity style={styles.rosterQuickBtn} onPress={() => markAllAttendance('PRESENT')}>
                        <Text style={styles.rosterQuickBtnText}>All Present</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.rosterQuickBtn} onPress={() => markAllAttendance('ABSENT')}>
                        <Text style={styles.rosterQuickBtnText}>All Absent</Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  {finalizingLoading ? (
                    <ActivityIndicator style={{ padding: 20 }} color={Colors.primary} />
                  ) : (
                    <View style={styles.rosterTableContainer}>
                      {(!finalizing.attendance || finalizing.attendance.length === 0) ? (
                        <Text style={styles.emptyAttendanceText}>No members registered in this unit's roster.</Text>
                      ) : (
                        finalizing.attendance.map((att) => (
                          <View key={att.memberId} style={styles.rosterRow}>
                            <View style={{ flex: 1, paddingRight: 10 }}>
                              <Text style={styles.attName} numberOfLines={1}>{att.name}</Text>
                              <Text style={styles.attSub} numberOfLines={1}>
                                {att.roleText ? `${att.roleText} · ` : ''}{att.memberCode || ''}
                              </Text>
                            </View>

                            {/* 3 State Attendance Chips */}
                            <View style={styles.attChoiceGroup}>
                              <TouchableOpacity
                                style={[styles.attChoicePill, att.status === 'PRESENT' && styles.attChoicePillPresent]}
                                onPress={() => setAttendanceStatus(att.memberId, 'PRESENT')}
                              >
                                <Text style={[styles.attChoicePillText, att.status === 'PRESENT' && styles.attChoicePillTextActive]}>
                                  Present
                                </Text>
                              </TouchableOpacity>

                              <TouchableOpacity
                                style={[styles.attChoicePill, att.status === 'LATE' && styles.attChoicePillLate]}
                                onPress={() => setAttendanceStatus(att.memberId, 'LATE')}
                              >
                                <Text style={[styles.attChoicePillText, att.status === 'LATE' && styles.attChoicePillTextActive]}>
                                  Late
                                </Text>
                              </TouchableOpacity>

                              <TouchableOpacity
                                style={[styles.attChoicePill, att.status === 'ABSENT' && styles.attChoicePillAbsent]}
                                onPress={() => setAttendanceStatus(att.memberId, 'ABSENT')}
                              >
                                <Text style={[styles.attChoicePillText, att.status === 'ABSENT' && styles.attChoicePillTextActive]}>
                                  Absent
                                </Text>
                              </TouchableOpacity>
                            </View>
                          </View>
                        ))
                      )}
                    </View>
                  )}
                </View>

                {/* Bottom Actions */}
                <View style={styles.modalBottomActions}>
                  <TouchableOpacity style={styles.btnModalCancel} onPress={() => setFinalizing(null)}>
                    <Text style={styles.btnModalCancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.btnModalSubmit, { backgroundColor: '#15803d' }]}
                    onPress={handleFinalizeSubmit}
                    disabled={saving}
                  >
                    {saving ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <>
                        <Ionicons name="checkmark-done-circle" size={18} color="#fff" style={{ marginRight: 6 }} />
                        <Text style={styles.btnModalSubmitText}>Save Minutes & Finalize</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </KeyboardAvoidingView>
          </SafeAreaView>
        </Modal>
      )}

      {/* Photos Viewer Modal */}
      {photosFor && (
        <Modal visible={!!photosFor} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setPhotosFor(null)}>
          <SafeAreaView style={styles.modalSafe}>
            <View style={styles.modalHeaderCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalHeaderCardTitle}>Meeting Photos</Text>
                <Text style={styles.modalHeaderCardSub}>
                  {photosFor.title || photosFor.type} · {new Date(photosFor.startAt).toLocaleDateString()} · {(photosFor.photos || []).length} photo(s)
                </Text>
              </View>
              <TouchableOpacity style={styles.modalCloseCircle} onPress={() => setPhotosFor(null)}>
                <Ionicons name="close" size={20} color="#475569" />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.formScrollBody}>
              {(!photosFor.photos || photosFor.photos.length === 0) ? (
                <View style={{ padding: 24, alignItems: 'center' }}>
                  <Text style={{ color: Colors.textMuted }}>No photos attached to this meeting yet.</Text>
                </View>
              ) : (
                (() => {
                  const photos = photosFor.photos;
                  const cur = photos[activePhotoIdx] || photos[0];
                  return (
                    <View>
                      <View style={styles.photoMainBox}>
                        <Image source={{ uri: cur.url }} style={styles.photoMainImg} resizeMode="contain" />
                      </View>

                      <View style={styles.formCard}>
                        <Text style={styles.cardHeaderLabel}>Photo {activePhotoIdx + 1} of {photos.length}</Text>
                        <View style={styles.photoMetaRow}>
                          <Text style={styles.photoMetaLabel}>Captured:</Text>
                          <Text style={styles.photoMetaVal}>
                            {cur.capturedAt ? `${new Date(cur.capturedAt).toLocaleString()} (${ageLabel(cur.capturedAt)})` : '— not recorded —'}
                          </Text>
                        </View>
                        <View style={styles.photoMetaRow}>
                          <Text style={styles.photoMetaLabel}>GPS:</Text>
                          <View style={{ flex: 1 }}>
                            {cur.gps?.lat != null && cur.gps?.lng != null ? (
                              <View>
                                <Text style={styles.photoMetaVal}>{fmtCoord(cur.gps.lat)}, {fmtCoord(cur.gps.lng)}</Text>
                                <TouchableOpacity onPress={() => Linking.openURL(gmapsLink(cur.gps.lat, cur.gps.lng))}>
                                  <Text style={styles.linkText}>Open in Google Maps ↗</Text>
                                </TouchableOpacity>
                              </View>
                            ) : (
                              <Text style={styles.photoMetaVal}>— not recorded —</Text>
                            )}
                          </View>
                        </View>

                        {photos.length > 1 && (
                          <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                            <TouchableOpacity
                              style={[styles.btnModalCancel, activePhotoIdx === 0 && { opacity: 0.5 }]}
                              disabled={activePhotoIdx === 0}
                              onPress={() => setActivePhotoIdx((i) => Math.max(0, i - 1))}
                            >
                              <Text style={styles.btnModalCancelText}>← Prev</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[styles.btnModalCancel, activePhotoIdx === photos.length - 1 && { opacity: 0.5 }]}
                              disabled={activePhotoIdx === photos.length - 1}
                              onPress={() => setActivePhotoIdx((i) => Math.min(photos.length - 1, i + 1))}
                            >
                              <Text style={styles.btnModalCancelText}>Next →</Text>
                            </TouchableOpacity>
                          </View>
                        )}
                      </View>

                      {/* Thumbnail Strip */}
                      {photos.length > 1 && (
                        <ScrollView horizontal style={{ marginTop: 12 }} contentContainerStyle={{ gap: 8 }}>
                          {photos.map((p, i) => (
                            <TouchableOpacity
                              key={i}
                              onPress={() => setActivePhotoIdx(i)}
                              style={[styles.thumbBtn, i === activePhotoIdx && styles.thumbBtnActive]}
                            >
                              <Image source={{ uri: p.url }} style={styles.thumbImg} />
                            </TouchableOpacity>
                          ))}
                        </ScrollView>
                      )}
                    </View>
                  );
                })()
              )}
            </ScrollView>
          </SafeAreaView>
        </Modal>
      )}
    </SafeAreaView>
  );
}

function DateTimeField({ value, onChange }) {
  if (Platform.OS === 'web') {
    return (
      <input
        type="datetime-local"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: '100%',
          height: 44,
          padding: '8px 12px',
          borderRadius: 10,
          border: '1.5px solid #cbd5e1',
          backgroundColor: '#ffffff',
          color: '#0f172a',
          fontSize: '14px',
          fontFamily: 'inherit',
          outline: 'none',
          boxSizing: 'border-box',
        }}
      />
    );
  }

  return (
    <TextInput
      style={styles.modernTextInput}
      value={value}
      onChangeText={onChange}
      placeholder="YYYY-MM-DDTHH:mm"
      placeholderTextColor="#94a3b8"
    />
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f8fafc' },
  header: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.md,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.md,
    flexWrap: 'wrap',
  },
  badgeRow: { flexDirection: 'row', gap: 6, marginBottom: 4, alignItems: 'center' },
  unitLevelBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  unitLevelBadgeText: { fontSize: 10, fontWeight: '700', color: '#475569', textTransform: 'uppercase' },
  streamBadgeJirga: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: '#f3e8ff',
    borderWidth: 1,
    borderColor: '#d8b4fe',
  },
  streamBadgeTextJirga: { fontSize: 10, fontWeight: '700', color: '#6b21a8' },

  pageTitle: { fontSize: 20, fontWeight: '800', color: '#0f172a', letterSpacing: -0.3 },
  
  headerActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  btnExport: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  btnExportText: { fontSize: FontSize.xs, fontWeight: '700', color: '#334155' },
  btnSchedulePrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: Colors.primary,
    borderRadius: 8,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 2,
  },
  btnSchedulePrimaryText: { fontSize: FontSize.xs, fontWeight: '700', color: '#fff' },

  tierPillsWrapper: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  tierPillsScroll: { flexDirection: 'row', gap: 8 },
  tierPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  tierPillActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  tierPillText: { fontSize: 11, fontWeight: '600', color: '#475569' },
  tierPillTextActive: { color: '#ffffff', fontWeight: '700' },

  categoryRow: { borderBottomWidth: 1, borderBottomColor: Colors.border, paddingVertical: 10, backgroundColor: '#ffffff' },
  categoryLabel: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.textMuted, marginRight: 4, alignSelf: 'center' },
  catChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, borderWidth: 1, borderColor: Colors.border, backgroundColor: '#f8fafc' },
  catChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  catChipText: { fontSize: FontSize.xs, fontWeight: '600', color: Colors.text },
  catChipTextActive: { color: '#fff' },
  catChipCount: { fontSize: 10, color: Colors.textMuted },

  tableWrap: { backgroundColor: '#ffffff', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', overflow: 'hidden' },
  thRow: { flexDirection: 'row', backgroundColor: '#f8fafc', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  th: { padding: 12, fontSize: 11, fontWeight: '700', color: '#64748b', textAlign: 'left', textTransform: 'uppercase' },
  tr: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#f1f5f9', alignItems: 'center' },
  td: { padding: 12, justifyContent: 'center' },
  tdText: { fontSize: 12, color: '#1e293b' },
  
  rowBtnGhost: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: '#f8fafc', borderRadius: 6, borderWidth: 1, borderColor: '#e2e8f0' },
  rowBtnGhostText: { fontSize: 11, fontWeight: '600', color: '#475569' },
  rowBtnSecondary: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: '#f1f5f9', borderRadius: 6, borderWidth: 1, borderColor: '#cbd5e1' },
  rowBtnSecondaryText: { fontSize: 11, fontWeight: '600', color: '#0f172a' },
  rowBtnFinalize: { paddingHorizontal: 10, paddingVertical: 5, backgroundColor: '#15803d', borderRadius: 6 },
  rowBtnFinalizeText: { fontSize: 11, fontWeight: '700', color: '#fff' },
  rowBtnDanger: { paddingHorizontal: 8, paddingVertical: 5, backgroundColor: '#fee2e2', borderRadius: 6, borderWidth: 1, borderColor: '#fca5a5' },
  rowBtnDangerText: { fontSize: 11, fontWeight: '600', color: '#b91c1c' },

  // ================= MODERN MODAL STYLES =================
  modalSafe: { flex: 1, backgroundColor: '#f1f5f9' },
  modalHeaderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  modalHeaderCardTitle: { fontSize: 18, fontWeight: '800', color: '#0f172a', letterSpacing: -0.3 },
  modalHeaderCardSub: { fontSize: 12, color: '#64748b', marginTop: 2 },
  modalCloseCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  formScrollBody: {
    padding: 16,
    paddingBottom: 40,
    gap: 16,
  },

  formCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  cardHeaderLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 14,
    letterSpacing: -0.2,
  },

  inputGroup: {
    marginBottom: 14,
  },
  inputGroupLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 6,
  },
  modernTextInput: {
    borderWidth: 1.5,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#0f172a',
    backgroundColor: '#ffffff',
  },
  modernPickerWrap: {
    borderWidth: 1.5,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    backgroundColor: '#ffffff',
    overflow: 'hidden',
  },
  fieldHint: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 4,
  },

  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 4,
  },
  modernCheckbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#94a3b8',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modernCheckboxActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  checkboxLabel: { fontSize: 13, fontWeight: '700', color: '#0f172a' },
  checkboxSub: { fontSize: 11, color: '#64748b', marginTop: 1 },

  supervisorSelectedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    backgroundColor: '#f0fdf4',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#86efac',
  },
  supervisorName: { fontSize: 13, fontWeight: '700', color: '#15803d' },
  supervisorSub: { fontSize: 11, color: '#166534', marginTop: 2 },
  btnChangeSupervisor: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: '#ffffff',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#86efac',
  },
  btnChangeSupervisorText: { fontSize: 11, fontWeight: '700', color: '#15803d' },

  candidateListBox: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    overflow: 'hidden',
  },
  candidateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    backgroundColor: '#fff',
  },
  candName: { fontSize: 12, fontWeight: '700', color: '#0f172a' },
  candSub: { fontSize: 11, color: '#64748b' },

  rosterQuickBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#f1f5f9',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  rosterQuickBtnText: { fontSize: 11, fontWeight: '700', color: '#334155' },

  rosterTableContainer: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    overflow: 'hidden',
  },
  rosterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    backgroundColor: '#fff',
  },
  attName: { fontSize: 13, fontWeight: '700', color: '#0f172a' },
  attSub: { fontSize: 11, color: '#64748b', marginTop: 2 },
  attChoiceGroup: {
    flexDirection: 'row',
    gap: 4,
  },
  attChoicePill: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  attChoicePillPresent: {
    backgroundColor: '#dcfce7',
    borderColor: '#86efac',
  },
  attChoicePillLate: {
    backgroundColor: '#fef3c7',
    borderColor: '#fde68a',
  },
  attChoicePillAbsent: {
    backgroundColor: '#fee2e2',
    borderColor: '#fca5a5',
  },
  attChoicePillText: { fontSize: 10, fontWeight: '600', color: '#64748b' },
  attChoicePillTextActive: { color: '#0f172a', fontWeight: '800' },
  emptyAttendanceText: { fontSize: 12, color: '#64748b', padding: 14, textAlign: 'center' },

  modalBottomActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
    paddingBottom: 24,
  },
  btnModalCancel: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 10,
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#cbd5e1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnModalCancelText: { fontSize: 14, fontWeight: '700', color: '#475569' },
  btnModalSubmit: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    borderRadius: 10,
    backgroundColor: Colors.primary,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  btnModalSubmitText: { fontSize: 14, fontWeight: '700', color: '#ffffff' },

  photoMainBox: {
    height: 260,
    backgroundColor: '#0f172a',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    marginBottom: 14,
  },
  photoMainImg: { width: '100%', height: '100%' },
  photoMetaRow: { flexDirection: 'row', gap: 8, paddingVertical: 4, alignItems: 'flex-start' },
  photoMetaLabel: { width: 80, fontSize: 12, color: '#64748b', fontWeight: '700' },
  photoMetaVal: { flex: 1, fontSize: 12, color: '#0f172a' },
  linkText: { fontSize: 12, color: Colors.primary, fontWeight: '700' },
  thumbBtn: {
    width: 68,
    height: 68,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    overflow: 'hidden',
  },
  thumbBtnActive: { borderColor: Colors.primary, borderWidth: 2.5 },
  thumbImg: { width: '100%', height: '100%' },
});
