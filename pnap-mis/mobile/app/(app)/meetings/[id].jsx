import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Picker } from '@react-native-picker/picker';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { api, errorMessage } from '../../../src/api/client';
import { useAuth } from '../../../src/context/AuthContext';
import { canManageMeetings, isSuperAdmin, isSuperAdminOversight, isCentralAdminOversight } from '../../../src/utils/permissions';
import { Storage } from '../../../src/utils/storage';
import Card from '../../../src/components/Card';
import Badge from '../../../src/components/Badge';
import EmptyState from '../../../src/components/EmptyState';
import Avatar from '../../../src/components/Avatar';
import { useToast } from '../../../src/components/Toast';
import { Colors, FontSize, Spacing, Radius } from '../../../src/constants/colors';
import { shortDate, MEETING_TYPE_LABEL } from '../../../src/utils/formatters';

const LEVEL_LABELS = {
  BASIC_UNIT: 'Basic Unit',
  AREA: 'Area',
  DISTRICT: 'District',
  PROVINCE: 'Province',
  CENTRAL: 'Central',
};

function InfoRow({ label, value }) {
  if (!value) return null;
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

export default function MeetingDetailScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { user } = useAuth();
  const toast = useToast();
  const [meeting, setMeeting] = useState(null);
  const [loading, setLoading] = useState(true);

  const isSuper = isSuperAdmin(user);
  const isCentralOrCongress = meeting?.unitLevel === 'CENTRAL' || meeting?.body === 'CONGRESS';
  const canManage = canManageMeetings(user)
    && !isCentralAdminOversight(user)
    && !isSuperAdminOversight(user)
    && !(isSuper && isCentralOrCongress);

  // Modals
  const [showFinalize, setShowFinalize] = useState(false);
  const [showPhotos, setShowPhotos] = useState(false);
  const [showDocs, setShowDocs] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const [activePhotoIdx, setActivePhotoIdx] = useState(0);

  // In-modal error messages
  const [photoError, setPhotoError] = useState('');
  const [finalizeError, setFinalizeError] = useState('');
  const [docError, setDocError] = useState('');
  const [cancelError, setCancelError] = useState('');

  // Cancel state
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);

  // Document upload state
  const [docKind, setDocKind] = useState('AGENDA');
  const [uploadingDoc, setUploadingDoc] = useState(false);

  // Photo upload state
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // Finalize form state
  const [previouswork, setPreviouswork] = useState('');
  const [upcomingStrategy, setUpcomingStrategy] = useState('');
  const [notes, setNotes] = useState('');
  const [supervisorAttended, setSupervisorAttended] = useState(false);
  const [supervisorMemberId, setSupervisorMemberId] = useState('');
  const [supervisorQuery, setSupervisorQuery] = useState('');
  const [supervisorCandidates, setSupervisorCandidates] = useState([]);
  const [supervisorsLoading, setSupervisorsLoading] = useState(false);
  const [attendance, setAttendance] = useState([]);
  const [loadingAttendees, setLoadingAttendees] = useState(false);
  const [finalizingBusy, setFinalizingBusy] = useState(false);

  function load() {
    api.get(`/meetings/${id}`)
      .then((r) => setMeeting(r.data.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, [id]);

  async function openFinalizeModal() {
    setShowFinalize(true);
    setLoadingAttendees(true);
    setPreviouswork(meeting?.decisions || '');
    setUpcomingStrategy(meeting?.upcomingStrategy || '');
    setNotes(meeting?.notes || '');
    setSupervisorAttended(Boolean(meeting?.supervisorAttended));
    setSupervisorMemberId(meeting?.supervisorMemberId?._id || meeting?.supervisorMemberId || '');

    try {
      const r = await api.get(`/meetings/${meeting._id}/attendees`);
      const list = r.data.data || [];
      const existingMap = new Map((meeting.attendance || []).map((a) => [String(a.memberId?._id || a.memberId), a.status]));
      const rows = list.map((m) => ({
        memberId: m._id,
        name: m.fullName,
        memberCode: m.memberId,
        roleText: m.roleText,
        status: existingMap.get(String(m._id)) || 'ABSENT',
      }));
      setAttendance(rows);
    } catch (e) {
      toast.error('Could not load attendee roster.');
    } finally {
      setLoadingAttendees(false);
    }

    if (meeting?.supervisorAttended) {
      loadSupervisors();
    }
  }

  async function loadSupervisors() {
    setSupervisorsLoading(true);
    try {
      const r = await api.get(`/meetings/${meeting._id}/supervisor-candidates`);
      setSupervisorCandidates(r.data.data || []);
    } catch {
      setSupervisorCandidates([]);
    } finally {
      setSupervisorsLoading(false);
    }
  }

  function toggleSupervisorAttended(val) {
    setSupervisorAttended(val);
    if (val) {
      loadSupervisors();
    } else {
      setSupervisorMemberId('');
      setSupervisorQuery('');
    }
  }

  function setAttendanceStatus(memberId, status) {
    setAttendance((rows) => rows.map((r) => r.memberId === memberId ? { ...r, status } : r));
  }

  function markAllAttendance(status) {
    setAttendance((rows) => rows.map((r) => ({ ...r, status })));
  }

  async function submitFinalize() {
    setFinalizeError('');
    if (!previouswork.trim()) {
      const msg = 'Previous work / Decisions are required.';
      setFinalizeError(msg);
      toast.error(msg);
      return;
    }
    setFinalizingBusy(true);
    try {
      const payload = {
        decisions: previouswork.trim(),
        upcomingStrategy: upcomingStrategy.trim() || undefined,
        notes: notes.trim() || undefined,
        supervisorAttended,
        supervisorMemberId: supervisorAttended && supervisorMemberId ? supervisorMemberId : undefined,
        attendance: attendance.map((r) => ({ memberId: r.memberId, status: r.status })),
      };
      await api.post(`/meetings/${meeting._id}/finalize`, payload);
      toast.success('Meeting finalized successfully.');
      setShowFinalize(false);
      setFinalizeError('');
      load();
    } catch (e) {
      const msg = errorMessage(e);
      setFinalizeError(msg);
      toast.error(msg);
    } finally {
      setFinalizingBusy(false);
    }
  }

  async function handleCancelSubmit() {
    setCancelError('');
    if (!cancelReason.trim()) {
      const msg = 'Please enter a cancellation reason.';
      setCancelError(msg);
      toast.error(msg);
      return;
    }
    setCancelling(true);
    try {
      await api.post(`/meetings/${meeting._id}/cancel`, { reason: cancelReason.trim() });
      toast.success('Meeting cancelled.');
      setShowCancel(false);
      setCancelReason('');
      setCancelError('');
      load();
    } catch (e) {
      const msg = errorMessage(e);
      setCancelError(msg);
      toast.error(msg);
    } finally {
      setCancelling(false);
    }
  }

  async function handleUploadPhoto() {
    setPhotoError('');
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        quality: 0.85,
        exif: true,
      });
      if (result.canceled || !result.assets?.length) return;

      setUploadingPhoto(true);
      toast.show('Uploading photos...', 'info');

      const fd = new FormData();
      for (let i = 0; i < result.assets.slice(0, 10).length; i++) {
        const asset = result.assets[i];
        if (Platform.OS === 'web') {
          if (asset.file) {
            fd.append('photos', asset.file);
          } else if (asset.uri) {
            try {
              const res = await fetch(asset.uri);
              const blob = await res.blob();
              fd.append('photos', blob, asset.fileName || `photo_${Date.now()}_${i}.jpg`);
            } catch {
              fd.append('photos', asset.uri);
            }
          }
        } else {
          fd.append('photos', {
            uri: asset.uri,
            name: asset.fileName || `photo_${Date.now()}_${i}.jpg`,
            type: asset.mimeType || 'image/jpeg',
          });
        }
      }

      const r = await api.post(`/meetings/${meeting._id}/photos`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const data = r.data.data;
      if (data.accepted?.length) {
        toast.success(`${data.accepted.length} photo(s) added.`);
      }
      if (data.rejected?.length) {
        const rejectMsg = data.rejected.map((rj) => `${rj.filename || 'Photo'}: ${rj.reason}`).join('\n');
        setPhotoError(rejectMsg);
        toast.error(`Rejected: ${data.rejected[0]?.reason || 'GPS/EXIF check failed'}`);
      }
      load();
    } catch (e) {
      const msg = errorMessage(e);
      setPhotoError(msg);
      toast.error(msg);
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function handleUploadDoc() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
        multiple: true,
      });
      if (result.canceled || !result.assets?.length) return;

      setUploadingDoc(true);
      toast.show('Uploading documents...', 'info');

      const fd = new FormData();
      result.assets.slice(0, 5).forEach((asset, i) => {
        if (Platform.OS === 'web') {
          fd.append('documents', asset.file || asset.uri);
        } else {
          fd.append('documents', {
            uri: asset.uri,
            name: asset.name || `document_${i}.pdf`,
            type: asset.mimeType || 'application/pdf',
          });
        }
      });
      fd.append('kind', docKind);

      await api.post(`/meetings/${meeting._id}/documents`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast.success('Document uploaded.');
      load();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setUploadingDoc(false);
    }
  }

  async function handleExportPdf() {
    if (!meeting) return;
    try {
      toast.show('Downloading PDF minutes...', 'info');
      const baseURL = api.defaults.baseURL || process.env.EXPO_PUBLIC_API_BASE_URL || 'http://localhost:5000/api';
      const normalizedBaseURL = baseURL.replace(/\/$/, '');
      const url = `${normalizedBaseURL}/exports/meeting/${meeting._id}/pdf`;
      const filename = `meeting-${(meeting.title || meeting.type || 'minutes').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.pdf`;

      const token = await Storage.getItem('pnap_token');
      const authHeader = token ? `Bearer ${token}` : '';

      if (Platform.OS === 'web') {
        const res = await fetch(url, {
          headers: authHeader ? { Authorization: authHeader } : {},
        });
        if (!res.ok) throw new Error('PDF export failed');
        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(blobUrl);
        toast.success(`Downloaded ${filename}`);
        return;
      }

      // Native
      const fileUri = `${FileSystem.documentDirectory}${filename}`;
      const downloadResult = await FileSystem.downloadAsync(url, fileUri, {
        headers: authHeader ? { Authorization: authHeader } : {},
      });

      if (downloadResult.status === 200) {
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(downloadResult.uri, {
            mimeType: 'application/pdf',
            dialogTitle: 'Share Meeting PDF',
            UTI: 'com.adobe.pdf',
          });
        } else {
          toast.success(`Saved to ${downloadResult.uri}`);
        }
      } else {
        toast.error('Export failed on server');
      }
    } catch (e) {
      toast.error(e?.message || 'PDF export failed');
    }
  }

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={Colors.primary} /></View>;
  if (!meeting) return <EmptyState icon="❌" title="Meeting not found" />;

  const m = meeting;
  const attendees = m.attendance || [];
  const photos = m.photos || [];
  const documents = m.documents || [];
  const chairperson = m.chairpersonId;
  const isCng = m.body === 'CONGRESS' || m.typeCode === 'CNG' || m.typeCode === 'CONGRESS' || m.type === 'CNG' || m.type === 'CONGRESS';
  const isJrg = !isCng && (m.body === 'JIRGA' || m.typeCode === 'JRG' || m.typeCode === 'JIRGA' || m.type === 'JRG' || m.type === 'JIRGA');
  const isCm = !isCng && !isJrg && (m.body === 'COMMITTEE' || m.typeCode === 'CMP' || m.type === 'CMP' || m.type === 'COMMITTEE');
  const isGbm = !isCng && !isJrg && (m.body === 'GENERAL_BODY' || m.typeCode === 'GBM' || m.type === 'GBM');

  const streamBadge = isCng
    ? { label: 'National Congress', color: '#0369a1', bg: '#e0f2fe' }
    : isJrg
    ? { label: 'Jirga Meeting', color: '#6b21a8', bg: '#f3e8ff' }
    : isCm
    ? { label: 'Committee Meeting', color: '#92400e', bg: '#fef3c7' }
    : isGbm
    ? { label: 'General Body Meeting', color: '#065f46', bg: '#ecfdf5' }
    : { label: 'Executive Meeting', color: '#4338ca', bg: '#eef2ff' };

  const stateColor = m.state === 'CANCELLED' ? Colors.error : (m.state === 'FINALIZED' ? Colors.success : Colors.warning);
  const stateBg = m.state === 'CANCELLED' ? Colors.errorBg : (m.state === 'FINALIZED' ? Colors.successBg : Colors.warningBg);

  const curPhoto = photos[activePhotoIdx] || null;

  const filteredSupervisors = supervisorCandidates.filter((s) => {
    const q = supervisorQuery.trim().toLowerCase();
    if (!q) return true;
    const str = `${s.fullName} ${s.unitName} ${s.memberCode} ${LEVEL_LABELS[s.unitLevel] || s.unitLevel}`.toLowerCase();
    return str.includes(q);
  });

  const selectedSupervisorObj = supervisorCandidates.find((s) => s._id === supervisorMemberId) || null;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Header Card */}
        <Card style={styles.headerCard}>
          <Text style={styles.meetingTitle}>
            {m.title || MEETING_TYPE_LABEL[m.typeCode] || m.type || 'Meeting'}
          </Text>
          <View style={styles.badges}>
            <Badge label={streamBadge.label} color={streamBadge.color} bg={streamBadge.bg} />
            <Badge label={m.state || 'SCHEDULED'} color={stateColor} bg={stateBg} />
          </View>
        </Card>

        {/* Action Bar */}
        <View style={styles.actionsRow}>
          <TouchableOpacity style={styles.actionBtn} onPress={() => setShowPhotos(true)}>
            <Text style={styles.actionBtnText}>📷 Photos ({photos.length})</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={() => setShowDocs(true)}>
            <Text style={styles.actionBtnText}>📎 Docs ({documents.length})</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={handleExportPdf}>
            <Text style={styles.actionBtnText}>📄 PDF</Text>
          </TouchableOpacity>
          {canManage && m.state !== 'FINALIZED' && m.state !== 'CANCELLED' && (
            <>
              <TouchableOpacity style={[styles.actionBtn, styles.actionBtnPrimary]} onPress={openFinalizeModal}>
                <Text style={[styles.actionBtnText, { color: '#fff' }]}>✅ Finalize</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionBtn} onPress={() => setShowCancel(true)}>
                <Text style={[styles.actionBtnText, { color: Colors.error }]}>❌ Cancel</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* Visual Photos Preview if photos exist */}
        {photos.length > 0 && (
          <Card style={{ marginBottom: Spacing.md }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.sm }}>
              <Text style={styles.sectionTitle}>Uploaded Photos ({photos.length})</Text>
              <TouchableOpacity onPress={() => setShowPhotos(true)}>
                <Text style={{ fontSize: FontSize.xs, color: Colors.primary, fontWeight: '700' }}>View Gallery ↗</Text>
              </TouchableOpacity>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {photos.map((p, idx) => (
                <TouchableOpacity
                  key={idx}
                  onPress={() => {
                    setActivePhotoIdx(idx);
                    setShowPhotos(true);
                  }}
                  style={styles.photoThumbWrap}
                >
                  <Image source={{ uri: p.url }} style={styles.photoThumb} />
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Card>
        )}

        {/* Details Card */}
        <Card style={{ marginBottom: Spacing.md }}>
          <Text style={styles.sectionTitle}>Meeting Information</Text>
          <InfoRow label="Start Time" value={m.startAt ? new Date(m.startAt).toLocaleString('en-PK') : undefined} />
          <InfoRow label="End Time" value={m.endAt ? new Date(m.endAt).toLocaleString('en-PK') : undefined} />
          <InfoRow label="Venue" value={m.venue} />
          <InfoRow label="Chairperson" value={chairperson?.fullName ? `${chairperson.fullName}${chairperson.memberId ? ` · ${chairperson.memberId}` : ''}` : undefined} />
          <InfoRow label="Unit" value={m.unitName || m.unitId?.name || (m.unitLevel ? LEVEL_LABELS[m.unitLevel] || m.unitLevel : undefined)} />
          {m.gps?.lat != null && m.gps?.lng != null && (
            <InfoRow label="Venue GPS" value={`${Number(m.gps.lat).toFixed(4)}, ${Number(m.gps.lng).toFixed(4)}`} />
          )}
        </Card>

        {/* Agenda */}
        {m.agenda ? (
          <Card style={{ marginBottom: Spacing.md }}>
            <Text style={styles.sectionTitle}>Agenda</Text>
            <Text style={styles.bodyText}>{m.agenda}</Text>
          </Card>
        ) : null}

        {/* Decisions / Previous Work (if recorded) */}
        {m.decisions ? (
          <Card style={{ marginBottom: Spacing.md }}>
            <Text style={styles.sectionTitle}>Decisions / Minutes</Text>
            <Text style={styles.bodyText}>{m.decisions}</Text>
          </Card>
        ) : null}

        {/* Upcoming Strategy */}
        {m.upcomingStrategy ? (
          <Card style={{ marginBottom: Spacing.md }}>
            <Text style={styles.sectionTitle}>Upcoming Strategy</Text>
            <Text style={styles.bodyText}>{m.upcomingStrategy}</Text>
          </Card>
        ) : null}

        {/* Description / Notes */}
        {m.description ? (
          <Card style={{ marginBottom: Spacing.md }}>
            <Text style={styles.sectionTitle}>Description</Text>
            <Text style={styles.bodyText}>{m.description}</Text>
          </Card>
        ) : null}

        {/* Attendance Summary */}
        {attendees.length > 0 && (
          <Card>
            <Text style={styles.sectionTitle}>
              Attendance ({attendees.filter((a) => a.status === 'PRESENT' || a.present).length} Present / {attendees.length} Total)
            </Text>
            {attendees.map((a, i) => {
              const safeName = a.memberId?.fullName || a.memberIdCode || a.name || '—';
              const isPresent = a.status === 'PRESENT' || a.present;
              const isLate = a.status === 'LATE';
              const badgeLabel = isLate ? 'Late' : (isPresent ? 'Present' : 'Absent');
              const badgeColor = isLate ? Colors.warning : (isPresent ? Colors.success : Colors.error);
              const badgeBg = isLate ? Colors.warningBg : (isPresent ? Colors.successBg : Colors.errorBg);
              return (
                <View key={i} style={styles.attendeeRow}>
                  <Avatar name={safeName === '—' ? '?' : safeName} size={32} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.attendeeName} numberOfLines={1}>{safeName}</Text>
                    {a.memberId?.memberId && <Text style={styles.attendeeCode}>{a.memberId.memberId}</Text>}
                  </View>
                  <Badge label={badgeLabel} color={badgeColor} bg={badgeBg} />
                </View>
              );
            })}
          </Card>
        )}
      </ScrollView>

      {/* ================= PHOTOS MODAL ================= */}
      <Modal visible={showPhotos} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowPhotos(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowPhotos(false)}>
              <Text style={styles.modalCancel}>Close</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Meeting Photos ({photos.length})</Text>
            {canManage && m.state !== 'FINALIZED' && m.state !== 'CANCELLED' ? (
              <TouchableOpacity onPress={handleUploadPhoto} disabled={uploadingPhoto}>
                {uploadingPhoto ? <ActivityIndicator color={Colors.primary} /> : <Text style={styles.modalSave}>+ Add</Text>}
              </TouchableOpacity>
            ) : <View style={{ width: 40 }} />}
          </View>
          <ScrollView contentContainerStyle={styles.formContent}>
            {photoError ? (
              <View style={{ backgroundColor: '#fee2e2', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#fca5a5', marginBottom: 14 }}>
                <Text style={{ color: '#b91c1c', fontSize: 13, fontWeight: '700' }}>⚠️ Photo Rejection Details:</Text>
                <Text style={{ color: '#b91c1c', fontSize: 12, marginTop: 4, lineHeight: 17 }}>{photoError}</Text>
              </View>
            ) : null}

            {photos.length === 0 ? (
              <EmptyState icon="📷" title="No photos uploaded" subtitle="Take or upload meeting photos for geo-fencing and record sealing." />
            ) : (
              <>
                {curPhoto && (
                  <View style={styles.photoMainCard}>
                    <Image source={{ uri: curPhoto.url }} style={styles.photoMainImage} resizeMode="contain" />
                    <View style={styles.photoMeta}>
                      <Text style={styles.photoMetaTitle}>Photo {activePhotoIdx + 1} of {photos.length}</Text>
                      {curPhoto.capturedAt && (
                        <Text style={styles.photoMetaText}>🕒 Captured: {new Date(curPhoto.capturedAt).toLocaleString()}</Text>
                      )}
                      {curPhoto.gps?.lat != null && curPhoto.gps?.lng != null && (
                        <TouchableOpacity onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${curPhoto.gps.lat},${curPhoto.gps.lng}`)}>
                          <Text style={styles.photoMetaLink}>📍 GPS: {Number(curPhoto.gps.lat).toFixed(4)}, {Number(curPhoto.gps.lng).toFixed(4)} (Open in Maps ↗)</Text>
                        </TouchableOpacity>
                      )}
                      {curPhoto.sha256 && (
                        <Text style={styles.photoMetaCode}>SHA-256: {curPhoto.sha256.slice(0, 16)}...</Text>
                      )}
                    </View>
                  </View>
                )}

                {/* Thumbnails */}
                {photos.length > 1 && (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginVertical: 12 }}>
                    {photos.map((p, idx) => (
                      <TouchableOpacity
                        key={idx}
                        onPress={() => setActivePhotoIdx(idx)}
                        style={[styles.photoThumbWrap, activePhotoIdx === idx && styles.photoThumbWrapActive]}
                      >
                        <Image source={{ uri: p.url }} style={styles.photoThumb} />
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                )}
              </>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* ================= DOCUMENTS MODAL ================= */}
      <Modal visible={showDocs} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowDocs(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowDocs(false)}>
              <Text style={styles.modalCancel}>Close</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Attached Documents</Text>
            <View style={{ width: 40 }} />
          </View>
          <ScrollView contentContainerStyle={styles.formContent}>
            {docError ? (
              <View style={{ backgroundColor: '#fee2e2', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#fca5a5', marginBottom: 14 }}>
                <Text style={{ color: '#b91c1c', fontSize: 13, fontWeight: '700' }}>⚠️ Document Error:</Text>
                <Text style={{ color: '#b91c1c', fontSize: 12, marginTop: 4 }}>{docError}</Text>
              </View>
            ) : null}

            {canManage && m.state !== 'FINALIZED' && m.state !== 'CANCELLED' && (
              <Card style={{ marginBottom: Spacing.lg }}>
                <Text style={styles.fieldLabel}>Upload New Document</Text>
                <View style={styles.pickerWrap}>
                  <Picker selectedValue={docKind} onValueChange={(v) => setDocKind(v)} style={styles.picker}>
                    <Picker.Item label="Agenda Document" value="AGENDA" />
                    <Picker.Item label="Previous Report" value="PREVIOUS_REPORT" />
                    <Picker.Item label="Signed Minutes" value="MINUTES" />
                    <Picker.Item label="Other Supporting Document" value="OTHER" />
                  </Picker>
                </View>
                <TouchableOpacity style={[styles.actionBtn, styles.actionBtnPrimary, { marginTop: 10 }]} onPress={handleUploadDoc} disabled={uploadingDoc}>
                  {uploadingDoc ? <ActivityIndicator color="#fff" /> : <Text style={[styles.actionBtnText, { color: '#fff' }]}>📁 Select & Upload File</Text>}
                </TouchableOpacity>
              </Card>
            )}

            <Text style={styles.sectionTitle}>Attached Files ({documents.length})</Text>
            {documents.length === 0 ? (
              <Text style={{ color: Colors.textMuted, fontSize: FontSize.sm, marginVertical: 12 }}>No documents attached to this meeting yet.</Text>
            ) : (
              documents.map((d, i) => (
                <Card key={i} style={{ marginBottom: Spacing.sm }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <View style={{ flex: 1, marginRight: Spacing.sm }}>
                      <Text style={{ fontSize: FontSize.sm, fontWeight: '700', color: Colors.text }} numberOfLines={1}>
                        📄 {d.filename || 'Document'}
                      </Text>
                      <Text style={{ fontSize: FontSize.xs, color: Colors.textMuted }}>
                        {d.kind} · {d.uploadedAt ? new Date(d.uploadedAt).toLocaleDateString() : 'Uploaded'}
                      </Text>
                    </View>
                    {d.url && (
                      <TouchableOpacity style={styles.docOpenBtn} onPress={() => Linking.openURL(d.url)}>
                        <Text style={styles.docOpenBtnText}>Open ↗</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </Card>
              ))
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* ================= CANCEL MODAL ================= */}
      <Modal visible={showCancel} transparent animationType="fade" onRequestClose={() => setShowCancel(false)}>
        <View style={styles.overlayBg}>
          <View style={styles.dialogCard}>
            <Text style={styles.dialogTitle}>Cancel Meeting</Text>
            <Text style={styles.dialogSubtitle}>Please provide a reason for cancelling this meeting:</Text>
            {cancelError ? (
              <View style={{ backgroundColor: '#fee2e2', padding: 8, borderRadius: 6, marginVertical: 6 }}>
                <Text style={{ color: '#b91c1c', fontSize: 12, fontWeight: '600' }}>⚠️ {cancelError}</Text>
              </View>
            ) : null}
            <TextInput
              style={[styles.fieldInput, { minHeight: 80, textAlignVertical: 'top', marginTop: 10 }]}
              placeholder="Cancellation reason..."
              placeholderTextColor={Colors.textLight}
              value={cancelReason}
              onChangeText={setCancelReason}
              multiline
              autoFocus
            />
            <View style={styles.dialogActions}>
              <TouchableOpacity style={styles.dialogBtnSecondary} onPress={() => setShowCancel(false)}>
                <Text style={styles.dialogBtnSecondaryText}>Go Back</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.dialogBtnDanger} onPress={handleCancelSubmit} disabled={cancelling}>
                {cancelling ? <ActivityIndicator color="#fff" /> : <Text style={styles.dialogBtnDangerText}>Confirm Cancel</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ================= FINALIZE MEETING MODAL ================= */}
      <Modal visible={showFinalize} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowFinalize(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setShowFinalize(false)}>
                <Text style={styles.modalCancel}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>Finalize Meeting</Text>
              <TouchableOpacity onPress={submitFinalize} disabled={finalizingBusy}>
                {finalizingBusy ? <ActivityIndicator color={Colors.primary} /> : <Text style={styles.modalSave}>Finalize</Text>}
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.formContent} keyboardShouldPersistTaps="handled">
              {finalizeError ? (
                <View style={{ backgroundColor: '#fee2e2', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#fca5a5', marginBottom: 14 }}>
                  <Text style={{ color: '#b91c1c', fontSize: 13, fontWeight: '700' }}>⚠️ Finalization Error:</Text>
                  <Text style={{ color: '#b91c1c', fontSize: 12, marginTop: 4 }}>{finalizeError}</Text>
                </View>
              ) : null}

              {/* Previous work / Decisions */}
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Previous Work / Decisions *</Text>
                <TextInput
                  style={[styles.fieldInput, styles.fieldMultiline]}
                  placeholder="Record summary of decisions and previous work discussions..."
                  placeholderTextColor={Colors.textLight}
                  value={previouswork}
                  onChangeText={setPreviouswork}
                  multiline
                />
              </View>

              {/* Upcoming Strategy */}
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Upcoming Strategy (optional)</Text>
                <TextInput
                  style={[styles.fieldInput, styles.fieldMultiline]}
                  placeholder="Strategy points for next session..."
                  placeholderTextColor={Colors.textLight}
                  value={upcomingStrategy}
                  onChangeText={setUpcomingStrategy}
                  multiline
                />
              </View>

              {/* Activity Notes */}
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Activity Notes (optional)</Text>
                <TextInput
                  style={[styles.fieldInput, styles.fieldMultiline]}
                  placeholder="General notes or observations..."
                  placeholderTextColor={Colors.textLight}
                  value={notes}
                  onChangeText={setNotes}
                  multiline
                />
              </View>

              {/* Supervisor Attended Section */}
              {m.unitLevel !== 'CENTRAL' && (
                <Card style={{ marginBottom: Spacing.lg }}>
                  <TouchableOpacity
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
                    onPress={() => toggleSupervisorAttended(!supervisorAttended)}
                  >
                    <View style={[styles.checkbox, supervisorAttended && styles.checkboxActive]}>
                      {supervisorAttended && <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800' }}>✓</Text>}
                    </View>
                    <Text style={{ fontSize: FontSize.sm, fontWeight: '700', color: Colors.text }}>
                      Supervisor Attended
                    </Text>
                  </TouchableOpacity>

                  {supervisorAttended && (
                    <View style={{ marginTop: 12 }}>
                      {selectedSupervisorObj ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: Colors.surfaceAlt, padding: 10, borderRadius: 8 }}>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontWeight: '700', fontSize: FontSize.sm, color: Colors.text }}>{selectedSupervisorObj.fullName}</Text>
                            <Text style={{ fontSize: FontSize.xs, color: Colors.textMuted }}>
                              {selectedSupervisorObj.unitName} ({LEVEL_LABELS[selectedSupervisorObj.unitLevel] || selectedSupervisorObj.unitLevel})
                            </Text>
                          </View>
                          <TouchableOpacity onPress={() => setSupervisorMemberId('')}>
                            <Text style={{ color: Colors.primary, fontWeight: '700', fontSize: FontSize.xs }}>Change</Text>
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <>
                          <TextInput
                            style={[styles.fieldInput, { marginBottom: 6 }]}
                            placeholder="Search supervisor by name or unit..."
                            placeholderTextColor={Colors.textLight}
                            value={supervisorQuery}
                            onChangeText={setSupervisorQuery}
                          />
                          {supervisorsLoading ? (
                            <ActivityIndicator size="small" color={Colors.primary} style={{ padding: 12 }} />
                          ) : (
                            <View style={styles.supervisorList}>
                              {filteredSupervisors.length === 0 ? (
                                <Text style={{ padding: 10, fontSize: FontSize.xs, color: Colors.textMuted }}>No supervisors found.</Text>
                              ) : (
                                filteredSupervisors.slice(0, 10).map((s) => (
                                  <TouchableOpacity
                                    key={s._id}
                                    style={styles.supervisorItem}
                                    onPress={() => setSupervisorMemberId(s._id)}
                                  >
                                    <Text style={{ fontWeight: '600', fontSize: FontSize.sm, color: Colors.text }}>{s.fullName}</Text>
                                    <Text style={{ fontSize: FontSize.xs, color: Colors.textMuted }}>
                                      {s.unitName} ({LEVEL_LABELS[s.unitLevel] || s.unitLevel}) · {s.memberCode || ''}
                                    </Text>
                                  </TouchableOpacity>
                                ))
                              )}
                            </View>
                          )}
                        </>
                      )}
                    </View>
                  )}
                </Card>
              )}

              {/* Attendance Checklist */}
              <View style={{ marginBottom: Spacing.md }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <Text style={styles.sectionTitle}>
                    Attendance ({attendance.filter((r) => r.status === 'PRESENT' || r.status === 'LATE').length} Present / {attendance.length} Total)
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
                  <TouchableOpacity style={styles.bulkAttBtn} onPress={() => markAllAttendance('PRESENT')}>
                    <Text style={styles.bulkAttBtnText}>Mark All Present</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.bulkAttBtn} onPress={() => markAllAttendance('ABSENT')}>
                    <Text style={styles.bulkAttBtnText}>Mark All Absent</Text>
                  </TouchableOpacity>
                </View>

                {loadingAttendees ? (
                  <ActivityIndicator size="small" color={Colors.primary} style={{ padding: 20 }} />
                ) : (
                  attendance.map((r) => (
                    <View key={r.memberId} style={styles.finalizeAttRow}>
                      <View style={{ flex: 1, marginRight: 8 }}>
                        <Text style={{ fontSize: FontSize.sm, fontWeight: '600', color: Colors.text }}>{r.name}</Text>
                        <Text style={{ fontSize: FontSize.xs, color: Colors.textMuted }}>
                          {r.roleText ? `${r.roleText} · ` : ''}{r.memberCode || ''}
                        </Text>
                      </View>
                      <View style={styles.attOptionsRow}>
                        {['PRESENT', 'LATE', 'ABSENT'].map((st) => {
                          const isActive = r.status === st;
                          return (
                            <TouchableOpacity
                              key={st}
                              style={[
                                styles.attOptionPill,
                                isActive && (st === 'PRESENT' ? styles.attPillPresent : (st === 'LATE' ? styles.attPillLate : styles.attPillAbsent)),
                              ]}
                              onPress={() => setAttendanceStatus(r.memberId, st)}
                            >
                              <Text style={[styles.attOptionPillText, isActive && { color: '#fff' }]}>
                                {st === 'PRESENT' ? 'Present' : (st === 'LATE' ? 'Late' : 'Absent')}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>
                  ))
                )}
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { padding: Spacing.lg, paddingBottom: 40 },
  headerCard: { marginBottom: Spacing.md },
  meetingTitle: { fontSize: FontSize.xl, fontWeight: '800', color: Colors.text, marginBottom: Spacing.sm },
  badges: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  sectionTitle: { fontSize: FontSize.base, fontWeight: '700', color: Colors.text, marginBottom: Spacing.sm },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  rowLabel: { fontSize: FontSize.sm, color: Colors.textMuted, fontWeight: '500' },
  rowValue: { fontSize: FontSize.sm, color: Colors.text, fontWeight: '600', flex: 1, textAlign: 'right' },
  bodyText: { fontSize: FontSize.base, color: Colors.text, lineHeight: 22 },
  attendeeRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  attendeeName: { fontSize: FontSize.sm, color: Colors.text, fontWeight: '600' },
  attendeeCode: { fontSize: FontSize.xs, color: Colors.textMuted },

  // Actions
  actionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.md },
  actionBtn: { backgroundColor: Colors.surface, paddingVertical: 10, paddingHorizontal: 14, borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', flexGrow: 1 },
  actionBtnPrimary: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  actionBtnText: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.text },

  // Photos Preview
  photoThumbWrap: { width: 72, height: 72, borderRadius: Radius.sm, overflow: 'hidden', borderWidth: 1, borderColor: Colors.border },
  photoThumbWrapActive: { borderColor: Colors.primary, borderWidth: 2.5 },
  photoThumb: { width: '100%', height: '100%', objectFit: 'cover' },
  photoMainCard: { backgroundColor: Colors.surface, borderRadius: Radius.md, overflow: 'hidden', borderWidth: 1, borderColor: Colors.border, marginBottom: 12 },
  photoMainImage: { width: '100%', height: 260, backgroundColor: '#000' },
  photoMeta: { padding: Spacing.md },
  photoMetaTitle: { fontSize: FontSize.base, fontWeight: '700', color: Colors.text, marginBottom: 4 },
  photoMetaText: { fontSize: FontSize.xs, color: Colors.textMuted, marginBottom: 4 },
  photoMetaLink: { fontSize: FontSize.xs, color: Colors.primary, fontWeight: '600', marginBottom: 4 },
  photoMetaCode: { fontSize: FontSize.xs, color: Colors.textMuted, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },

  // Documents
  docOpenBtn: { backgroundColor: Colors.primaryLight + '20', paddingVertical: 6, paddingHorizontal: 10, borderRadius: Radius.sm },
  docOpenBtnText: { fontSize: FontSize.xs, color: Colors.primary, fontWeight: '700' },

  // Modal Common
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingVertical: 14, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
  modalCancel: { fontSize: FontSize.base, color: Colors.textMuted, fontWeight: '500' },
  modalTitle: { fontSize: FontSize.base, fontWeight: '700', color: Colors.text },
  modalSave: { fontSize: FontSize.base, color: Colors.primary, fontWeight: '700' },
  formContent: { padding: Spacing.lg, paddingBottom: 60 },
  field: { marginBottom: Spacing.lg },
  fieldLabel: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.text, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  fieldInput: { borderWidth: 1.5, borderColor: Colors.border, borderRadius: 10, paddingHorizontal: Spacing.md, paddingVertical: 11, fontSize: FontSize.base, color: Colors.text, backgroundColor: Colors.surfaceAlt },
  fieldMultiline: { minHeight: 80, textAlignVertical: 'top' },
  pickerWrap: { borderWidth: 1.5, borderColor: Colors.border, borderRadius: Radius.md, backgroundColor: Colors.surface, overflow: 'hidden', height: 44, justifyContent: 'center' },
  picker: { width: '100%', height: 44 },

  // Dialog Overlay
  overlayBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: Spacing.lg },
  dialogCard: { backgroundColor: Colors.surface, width: '100%', maxWidth: 420, borderRadius: Radius.lg, padding: Spacing.lg, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 10, elevation: 10 },
  dialogTitle: { fontSize: FontSize.lg, fontWeight: '800', color: Colors.text, marginBottom: 4 },
  dialogSubtitle: { fontSize: FontSize.sm, color: Colors.textMuted },
  dialogActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 16 },
  dialogBtnSecondary: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: Radius.sm, backgroundColor: Colors.surfaceAlt },
  dialogBtnSecondaryText: { color: Colors.text, fontWeight: '600', fontSize: FontSize.sm },
  dialogBtnDanger: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: Radius.sm, backgroundColor: Colors.error },
  dialogBtnDangerText: { color: '#fff', fontWeight: '700', fontSize: FontSize.sm },

  // Finalize Checklist & Supervisor
  checkbox: { width: 22, height: 22, borderRadius: 4, borderWidth: 2, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.surface },
  checkboxActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  supervisorList: { maxHeight: 180, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm, marginTop: 6, overflow: 'hidden' },
  supervisorItem: { padding: 10, borderBottomWidth: 1, borderBottomColor: Colors.borderLight, backgroundColor: Colors.surface },
  bulkAttBtn: { backgroundColor: Colors.surfaceAlt, paddingVertical: 6, paddingHorizontal: 12, borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border },
  bulkAttBtnText: { fontSize: FontSize.xs, fontWeight: '600', color: Colors.text },
  finalizeAttRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  attOptionsRow: { flexDirection: 'row', gap: 4 },
  attOptionPill: { paddingVertical: 6, paddingHorizontal: 8, borderRadius: Radius.sm, backgroundColor: Colors.surfaceAlt, borderWidth: 1, borderColor: Colors.border },
  attPillPresent: { backgroundColor: Colors.success, borderColor: Colors.success },
  attPillLate: { backgroundColor: Colors.warning, borderColor: Colors.warning },
  attPillAbsent: { backgroundColor: Colors.error, borderColor: Colors.error },
  attOptionPillText: { fontSize: 11, fontWeight: '700', color: Colors.textMuted },
});
