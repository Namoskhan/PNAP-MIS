import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
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
import * as ImagePicker from 'expo-image-picker';
import { api, errorMessage, isNetworkError, resolveMediaUrl } from '../../../src/api/client';
import { useAuth } from '../../../src/context/AuthContext';
import { useNetwork } from '../../../src/context/NetworkContext';
import { canManageMeetings } from '../../../src/utils/permissions';
import {
  getCache,
  setCache,
  enqueueOfflineAction,
  persistOfflineFile,
} from '../../../src/services/offlineStorage';
import Card from '../../../src/components/Card';
import Badge from '../../../src/components/Badge';
import EmptyState from '../../../src/components/EmptyState';
import { useToast } from '../../../src/components/Toast';
import { Colors, FontSize, Radius, Spacing } from '../../../src/constants/colors';
import { shortDate, ACTIVITY_TYPE_LABEL } from '../../../src/utils/formatters';

function InfoRow({ label, value }) {
  if (!value) return null;
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

export default function ActivityDetailScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { user } = useAuth();
  const { isOnline } = useNetwork();
  const toast = useToast();

  const [activity, setActivity] = useState(null);
  const [loading, setLoading] = useState(true);

  // Modals state
  const [showPhotos, setShowPhotos] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState('');

  const [showComplete, setShowComplete] = useState(false);
  const [outcomeNotes, setOutcomeNotes] = useState('');
  const [completingBusy, setCompletingBusy] = useState(false);
  const [completeError, setCompleteError] = useState('');

  const [showCancel, setShowCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancellingBusy, setCancellingBusy] = useState(false);
  const [cancelError, setCancelError] = useState('');

  const canManage = canManageMeetings(user);

  async function load(silent = false) {
    if (!silent) setLoading(true);
    let active = true;

    // Load from cache first
    try {
      const cached = await getCache(`activity_detail_${id}`);
      if (active && cached) {
        setActivity(cached);
        if (!silent) setLoading(false);
      }
    } catch {}

    try {
      const r = await api.get(`/activities/${id}`);
      if (active && r.data?.data) {
        setActivity(r.data.data);
        await setCache(`activity_detail_${id}`, r.data.data);
      }
    } catch (e) {
      if (!silent && !activity && !isNetworkError(e)) {
        toast.error(errorMessage(e));
      }
    } finally {
      if (active) setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [id]);

  // Upload Photos (Online / Offline)
  async function handleUploadPhoto() {
    setPhotoError('');
    let validAssets = [];
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        quality: 0.85,
        exif: true,
      });
      if (result.canceled || !result.assets?.length) return;

      // Validate photo formats (JPEG, PNG, WebP)
      const invalidNames = [];
      for (const a of (result.assets || []).slice(0, 10)) {
        const mime = (a.mimeType || a.type || '').toLowerCase();
        const ext = (a.fileName || a.name || a.uri || '').toLowerCase();
        const isJpg = mime.includes('jpeg') || mime.includes('jpg') || ext.endsWith('.jpg') || ext.endsWith('.jpeg');
        const isPng = mime.includes('png') || ext.endsWith('.png');
        const isWebp = mime.includes('webp') || ext.endsWith('.webp');
        if (isJpg || isPng || isWebp) {
          validAssets.push(a);
        } else {
          invalidNames.push(a.fileName || 'file');
        }
      }

      if (invalidNames.length > 0) {
        toast.error(`Only JPG, PNG, and WebP formats are supported. Excluded: ${invalidNames.join(', ')}`);
        if (validAssets.length === 0) return;
      }

      setUploadingPhoto(true);

      if (!isOnline) {
        throw new Error('OFFLINE_MODE');
      }

      toast.show('Uploading photos...', 'info');

      const fd = new FormData();
      for (let i = 0; i < validAssets.length; i++) {
        const asset = validAssets[i];
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

      const r = await api.post(`/activities/${activity._id}/photos`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const data = r.data.data;
      if (data?.accepted?.length) {
        toast.success(`${data.accepted.length} photo(s) added.`);
      }
      if (data?.rejected?.length) {
        const rejectMsg = data.rejected.map((rj) => `${rj.filename || 'Photo'}: ${rj.reason}`).join('\n');
        setPhotoError(rejectMsg);
        toast.error(`Rejected: ${data.rejected[0]?.reason || 'GPS/EXIF check failed'}`);
      }
      load(true);
    } catch (e) {
      if (e.message === 'OFFLINE_MODE' || isNetworkError(e)) {
        await enqueueOfflineAction({
          entityType: 'ACTIVITY',
          action: 'UPLOAD_PHOTOS',
          endpoint: `/activities/${activity._id}/photos`,
          method: 'POST',
          files: validAssets.map((a, i) => {
            const rawFile = (typeof File !== 'undefined' && a.file instanceof File)
              ? a.file
              : ((typeof Blob !== 'undefined' && a.file instanceof Blob)
                ? a.file
                : (a.file || null));
            return {
              fieldName: 'photos',
              uri: a.uri,
              file: rawFile,
              name: a.fileName || a.name || `photo_${Date.now()}_${i}.jpg`,
              type: a.mimeType || a.type || 'image/jpeg',
            };
          }),
          displayTitle: `Upload Photos: ${activity.title || 'Activity'}`,
        });

        // Optimistically record photos on activity so photo-gated completion passes offline
        const offlinePhotos = validAssets.map((a, i) => ({
          url: a.uri,
          filename: a.fileName || `offline_photo_${i}.jpg`,
          _isOffline: true,
        }));
        const updated = {
          ...activity,
          photos: [...(activity.photos || []), ...offlinePhotos],
        };
        setActivity(updated);
        await setCache(`activity_detail_${activity._id}`, updated);
        toast.success(`${validAssets.length} photo(s) saved offline. Will sync when back online.`);
        return;
      }
      const msg = errorMessage(e);
      setPhotoError(msg);
      toast.error(msg);
    } finally {
      setUploadingPhoto(false);
    }
  }

  // Complete Activity (Online / Offline)
  async function submitComplete() {
    setCompleteError('');
    const photoCount = (activity?.photos || []).length;
    const isPhotoHeavy = ['PROTEST', 'JALSA', 'CAMPAIGN'].includes(activity?.typeCode || activity?.type);
    if (isPhotoHeavy && photoCount < 2) {
      const msg = `At least 2 photos required to complete ${ACTIVITY_TYPE_LABEL[activity?.typeCode] || 'this activity'}. Currently: ${photoCount}.`;
      setCompleteError(msg);
      toast.error(msg);
      return;
    }

    setCompletingBusy(true);
    const payload = {
      outcomeNotes: outcomeNotes.trim() || undefined,
    };

    try {
      if (!isOnline) {
        throw new Error('OFFLINE_MODE');
      }

      await api.post(`/activities/${activity._id}/complete`, payload);
      toast.success('Activity marked completed.');
      setShowComplete(false);
      setCompleteError('');
      load(true);
    } catch (e) {
      if (e.message === 'OFFLINE_MODE' || isNetworkError(e)) {
        await enqueueOfflineAction({
          entityType: 'ACTIVITY',
          action: 'UPDATE',
          endpoint: `/activities/${activity._id}/complete`,
          method: 'POST',
          payload,
          displayTitle: `Complete Activity: ${activity.title || 'Activity'}`,
        });

        const updated = {
          ...activity,
          state: 'COMPLETED',
          outcomeNotes: payload.outcomeNotes,
          _isOfflineCompleted: true,
        };
        setActivity(updated);
        await setCache(`activity_detail_${activity._id}`, updated);
        toast.success('Completed offline. Will sync when back online.');
        setShowComplete(false);
        setCompleteError('');
        return;
      }
      const msg = errorMessage(e);
      setCompleteError(msg);
      toast.error(msg);
    } finally {
      setCompletingBusy(false);
    }
  }

  // Cancel Activity (Online / Offline)
  async function submitCancel() {
    setCancelError('');
    if (!cancelReason.trim()) {
      const msg = 'Please enter a cancellation reason.';
      setCancelError(msg);
      toast.error(msg);
      return;
    }

    setCancellingBusy(true);
    const payload = { reason: cancelReason.trim() };

    try {
      if (!isOnline) {
        throw new Error('OFFLINE_MODE');
      }

      await api.post(`/activities/${activity._id}/cancel`, payload);
      toast.success('Activity cancelled.');
      setShowCancel(false);
      setCancelReason('');
      setCancelError('');
      load(true);
    } catch (e) {
      if (e.message === 'OFFLINE_MODE' || isNetworkError(e)) {
        await enqueueOfflineAction({
          entityType: 'ACTIVITY',
          action: 'UPDATE',
          endpoint: `/activities/${activity._id}/cancel`,
          method: 'POST',
          payload,
          displayTitle: `Cancel Activity: ${activity.title || 'Activity'}`,
        });

        const updated = {
          ...activity,
          state: 'CANCELLED',
          outcomeNotes: (activity.outcomeNotes || '') + `\n[CANCELLED] ${payload.reason}`,
          _isOfflineCancelled: true,
        };
        setActivity(updated);
        await setCache(`activity_detail_${activity._id}`, updated);
        toast.success('Cancellation saved offline. Will sync when back online.');
        setShowCancel(false);
        setCancelReason('');
        setCancelError('');
        return;
      }
      const msg = errorMessage(e);
      setCancelError(msg);
      toast.error(msg);
    } finally {
      setCancellingBusy(false);
    }
  }

  if (loading && !activity) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background }}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (!activity) return <EmptyState icon="❌" title="Activity not found" />;

  const a = activity;
  const photos = a.photos || [];
  const isCompleted = a.state === 'COMPLETED' || a._isOfflineCompleted;
  const isCancelled = a.state === 'CANCELLED' || a._isOfflineCancelled;
  const canEditState = canManage && !isCompleted && !isCancelled;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Title and Badges */}
        <Card style={{ marginBottom: Spacing.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: Spacing.sm }}>
            <View style={{ flex: 1 }}>
              <Text style={styles.aTitle}>{a.title || ACTIVITY_TYPE_LABEL[a.typeCode] || a.typeCode}</Text>
              <Text style={styles.aSub}>{shortDate(a.startAt)} · {a.venue || 'No venue'}</Text>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 4 }}>
              <Badge
                label={isCompleted ? 'COMPLETED' : (isCancelled ? 'CANCELLED' : (a.state || 'SCHEDULED'))}
                color={isCompleted ? Colors.success : (isCancelled ? Colors.textMuted : Colors.primary)}
                bg={isCompleted ? Colors.successBg : (isCancelled ? Colors.surfaceAlt : '#eff6ff')}
              />
              {a._isOffline && (
                <Badge label="OFFLINE CREATED" color={Colors.warning} bg="rgba(217, 119, 6, 0.15)" />
              )}
            </View>
          </View>
        </Card>

        {/* Action Buttons Bar */}
        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.actionBtn} onPress={() => setShowPhotos(true)}>
            <Text style={styles.actionBtnIcon}>📷</Text>
            <Text style={styles.actionBtnText}>Photos ({photos.length})</Text>
          </TouchableOpacity>

          {canEditState && (
            <TouchableOpacity
              style={[styles.actionBtn, { borderColor: Colors.success, backgroundColor: Colors.successBg }]}
              onPress={() => setShowComplete(true)}
            >
              <Text style={styles.actionBtnIcon}>✅</Text>
              <Text style={[styles.actionBtnText, { color: Colors.success }]}>Complete</Text>
            </TouchableOpacity>
          )}

          {canEditState && (
            <TouchableOpacity
              style={[styles.actionBtn, { borderColor: Colors.error, backgroundColor: Colors.errorBg }]}
              onPress={() => setShowCancel(true)}
            >
              <Text style={styles.actionBtnIcon}>✕</Text>
              <Text style={[styles.actionBtnText, { color: Colors.error }]}>Cancel</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Photo Thumbnail Strip */}
        {photos.length > 0 && (
          <Card style={{ marginBottom: Spacing.md }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.sm }}>
              <Text style={styles.sectionTitle}>Photographs ({photos.length})</Text>
              <TouchableOpacity onPress={() => setShowPhotos(true)}>
                <Text style={styles.linkText}>View all →</Text>
              </TouchableOpacity>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: Spacing.sm }}>
              {photos.map((p, i) => (
                <TouchableOpacity key={i} onPress={() => setShowPhotos(true)}>
                  <Image
                    source={{ uri: p.url ? resolveMediaUrl(p.url) : p.uri }}
                    style={styles.thumbImage}
                    resizeMode="cover"
                  />
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Card>
        )}

        {/* Details Card */}
        <Card style={{ marginBottom: Spacing.md }}>
          <Text style={styles.sectionTitle}>Activity Details</Text>
          <InfoRow label="Activity Type" value={ACTIVITY_TYPE_LABEL[a.typeCode] || a.typeCode} />
          <InfoRow label="Start Time" value={a.startAt ? new Date(a.startAt).toLocaleString('en-PK') : undefined} />
          <InfoRow label="End Time" value={a.endAt ? new Date(a.endAt).toLocaleString('en-PK') : undefined} />
          <InfoRow label="Venue" value={a.venue} />
          <InfoRow label="Unit" value={a.unitId?.name || a.unitName} />
          {a.leadMemberId?.fullName && <InfoRow label="Lead Officer" value={a.leadMemberId.fullName} />}
        </Card>

        {/* Campaign Metrics (if applicable) */}
        {a.typeCode === 'CAMPAIGN' && (
          <Card style={{ marginBottom: Spacing.md }}>
            <Text style={styles.sectionTitle}>Campaign Metrics</Text>
            {a.campaign_householdsVisited != null && <InfoRow label="Households Visited" value={String(a.campaign_householdsVisited)} />}
            {a.campaign_peopleContacted != null && <InfoRow label="People Contacted" value={String(a.campaign_peopleContacted)} />}
            {a.campaign_pamphletsDistributed != null && <InfoRow label="Pamphlets Distributed" value={String(a.campaign_pamphletsDistributed)} />}
            {a.campaign_actualJoiners != null && <InfoRow label="New Members / Joiners" value={String(a.campaign_actualJoiners)} />}
            {a.campaign_volunteerHours != null && <InfoRow label="Volunteer Hours" value={String(a.campaign_volunteerHours)} />}
          </Card>
        )}

        {/* Description */}
        {a.description ? (
          <Card style={{ marginBottom: Spacing.md }}>
            <Text style={styles.sectionTitle}>Description</Text>
            <Text style={styles.bodyText}>{a.description}</Text>
          </Card>
        ) : null}

        {/* Outcome Notes / Cancellation Reason */}
        {a.outcomeNotes ? (
          <Card style={{ marginBottom: Spacing.md }}>
            <Text style={styles.sectionTitle}>Outcome Notes / Resolution</Text>
            <Text style={styles.bodyText}>{a.outcomeNotes}</Text>
          </Card>
        ) : null}
      </ScrollView>

      {/* ================= PHOTOS MODAL ================= */}
      <Modal visible={showPhotos} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowPhotos(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowPhotos(false)}>
              <Text style={styles.modalCancel}>Close</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Photos ({photos.length})</Text>
            {canEditState ? (
              <TouchableOpacity onPress={handleUploadPhoto} disabled={uploadingPhoto}>
                {uploadingPhoto ? <ActivityIndicator color={Colors.primary} /> : <Text style={styles.modalSave}>+ Add</Text>}
              </TouchableOpacity>
            ) : <View style={{ width: 40 }} />}
          </View>

          {photoError ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{photoError}</Text>
            </View>
          ) : null}

          <ScrollView contentContainerStyle={{ padding: Spacing.md, gap: Spacing.md }}>
            {photos.length === 0 ? (
              <EmptyState
                icon="📷"
                title="No photos yet"
                message="Upload EXIF/GPS photos to document this activity."
                actionLabel={canEditState ? "Upload Photos" : undefined}
                onAction={canEditState ? handleUploadPhoto : undefined}
              />
            ) : (
              photos.map((p, i) => (
                <Card key={i} style={{ padding: 0, overflow: 'hidden' }}>
                  <Image
                    source={{ uri: p.url ? resolveMediaUrl(p.url) : p.uri }}
                    style={{ width: '100%', height: 260 }}
                    resizeMode="cover"
                  />
                  <View style={{ padding: Spacing.sm }}>
                    <Text style={{ fontSize: FontSize.xs, color: Colors.textMuted }}>
                      Photo {i + 1} {p.capturedAt ? `· Captured ${shortDate(p.capturedAt)}` : ''}
                      {p._isOffline ? ' · (Offline Pending Sync)' : ''}
                    </Text>
                  </View>
                </Card>
              ))
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* ================= COMPLETE MODAL ================= */}
      <Modal visible={showComplete} animationType="slide" transparent onRequestClose={() => setShowComplete(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalBackdrop}>
          <View style={styles.modalBox}>
            <Text style={styles.modalBoxTitle}>Complete Activity</Text>
            <Text style={styles.modalBoxSub}>
              Record outcome notes and complete this event. Photos uploaded: {photos.length}.
            </Text>

            {completeError ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{completeError}</Text>
              </View>
            ) : null}

            <Text style={styles.fieldLabel}>Outcome Notes / Observations</Text>
            <TextInput
              style={[styles.input, { height: 90, textAlignVertical: 'top' }]}
              placeholder="e.g. Activity conducted successfully with 50 attendees..."
              value={outcomeNotes}
              onChangeText={setOutcomeNotes}
              multiline
            />

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalSecondaryBtn} onPress={() => setShowComplete(false)} disabled={completingBusy}>
                <Text style={styles.modalSecondaryBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalPrimaryBtn} onPress={submitComplete} disabled={completingBusy}>
                {completingBusy ? <ActivityIndicator color="#fff" /> : <Text style={styles.modalPrimaryBtnText}>Mark Complete</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ================= CANCEL MODAL ================= */}
      <Modal visible={showCancel} animationType="slide" transparent onRequestClose={() => setShowCancel(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalBackdrop}>
          <View style={styles.modalBox}>
            <Text style={styles.modalBoxTitle}>Cancel Activity</Text>
            <Text style={styles.modalBoxSub}>
              Provide a clear reason for cancellation.
            </Text>

            {cancelError ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{cancelError}</Text>
              </View>
            ) : null}

            <Text style={styles.fieldLabel}>Reason for Cancellation *</Text>
            <TextInput
              style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
              placeholder="e.g. Postponed due to heavy rain..."
              value={cancelReason}
              onChangeText={setCancelReason}
              multiline
            />

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalSecondaryBtn} onPress={() => setShowCancel(false)} disabled={cancellingBusy}>
                <Text style={styles.modalSecondaryBtnText}>Close</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalPrimaryBtn, { backgroundColor: Colors.error }]}
                onPress={submitCancel}
                disabled={cancellingBusy}
              >
                {cancellingBusy ? <ActivityIndicator color="#fff" /> : <Text style={styles.modalPrimaryBtnText}>Cancel Activity</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.md, paddingBottom: 40 },
  aTitle: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.text, marginBottom: 2 },
  aSub: { fontSize: FontSize.xs, color: Colors.textMuted },
  sectionTitle: { fontSize: FontSize.base, fontWeight: '700', color: Colors.text, marginBottom: Spacing.sm },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  rowLabel: { fontSize: FontSize.sm, color: Colors.textMuted },
  rowValue: { fontSize: FontSize.sm, color: Colors.text, fontWeight: '500', flex: 1, textAlign: 'right' },
  bodyText: { fontSize: FontSize.sm, color: Colors.text, lineHeight: 20 },
  linkText: { fontSize: FontSize.xs, color: Colors.primary, fontWeight: '600' },

  actionRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
  },
  actionBtnIcon: { fontSize: 14 },
  actionBtnText: { fontSize: FontSize.xs, fontWeight: '600', color: Colors.text },

  thumbImage: { width: 80, height: 80, borderRadius: Radius.md, backgroundColor: Colors.surfaceAlt },

  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
    backgroundColor: Colors.surface,
  },
  modalTitle: { fontSize: FontSize.base, fontWeight: '700', color: Colors.text },
  modalCancel: { fontSize: FontSize.sm, color: Colors.textMuted, fontWeight: '500' },
  modalSave: { fontSize: FontSize.sm, color: Colors.primary, fontWeight: '700' },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: Spacing.lg },
  modalBox: { backgroundColor: Colors.surface, borderRadius: Radius.xl, padding: Spacing.lg },
  modalBoxTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.text, marginBottom: 4 },
  modalBoxSub: { fontSize: FontSize.xs, color: Colors.textMuted, marginBottom: Spacing.md },
  fieldLabel: { fontSize: FontSize.xs, fontWeight: '600', color: Colors.textSecondary, marginBottom: 4 },
  input: {
    backgroundColor: Colors.surfaceAlt,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    padding: Spacing.sm,
    fontSize: FontSize.sm,
    color: Colors.text,
    marginBottom: Spacing.md,
  },
  modalActions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm },
  modalSecondaryBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border },
  modalSecondaryBtnText: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.textSecondary },
  modalPrimaryBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: Radius.md, backgroundColor: Colors.primary },
  modalPrimaryBtnText: { fontSize: FontSize.sm, fontWeight: '600', color: '#fff' },

  errorBox: { backgroundColor: '#fee2e2', borderWidth: 1, borderColor: '#fca5a5', padding: 8, borderRadius: Radius.md, marginBottom: Spacing.sm },
  errorText: { fontSize: FontSize.xs, color: '#b91c1c', fontWeight: '600' },
});
