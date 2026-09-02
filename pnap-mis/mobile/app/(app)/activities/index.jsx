import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
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
  useWindowDimensions,
  View,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { useAuth } from '../../../src/context/AuthContext';
import { useUnit } from '../../../src/context/UnitContext';
import { api, errorMessage } from '../../../src/api/client';
import { canManageMeetings, isCentralAdminOversight, isSuperAdminOversight, isSuperAdmin, isHigherAdmin } from '../../../src/utils/permissions';
import { useToast } from '../../../src/components/Toast';
import Badge from '../../../src/components/Badge';
import Card from '../../../src/components/Card';
import DateTimePicker from '../../../src/components/DateTimePicker';
import { Colors, FontSize, Radius, Spacing } from '../../../src/constants/colors';
import { ACTIVITY_TYPE_LABEL } from '../../../src/utils/formatters';
import { downloadAndShare } from '../../../src/utils/export';
import { formatUnitArrangedBy } from '../../../src/utils/unitFormat';
import useEventTypes from '../../../src/hooks/useEventTypes';

const DEFAULT_TYPE_CODE = 'COR';
const MAX_PHOTOS = 10;

const EMPTY_FORM = {
  typeCode: DEFAULT_TYPE_CODE,
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
};

function timeAgo(date) {
  if (!date) return '—';
  const diffDays = Math.floor((Date.now() - new Date(date)) / (1000 * 60 * 60 * 24));
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

export default function ActivitiesScreen() {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const { user } = useAuth();
  const { ctx, provinces, setCtx } = useUnit();
  const toast = useToast();
  const params = useLocalSearchParams();

  const queryBody = params.body;
  const isCongressView = queryBody === 'CONGRESS';
  const isJirgaView = queryBody === 'JIRGA';
  const isCommitteeView = queryBody === 'COMMITTEE';
  const targetBody = isCongressView ? 'CONGRESS' : (isJirgaView ? 'JIRGA' : (isCommitteeView ? 'COMMITTEE' : 'EXECUTIVE'));

  const activeLevel = params.unitLevel || ctx?.unitLevel || 'CENTRAL';
  const rawUnitId = params.unitId || ctx?.unitId || '';
  const canManage = canManageMeetings(user)
    && !isCentralAdminOversight(user)
    && !isSuperAdminOversight(user)
    && !(isSuperAdmin(user) && (activeLevel === 'CENTRAL' || isCongressView));
  const [resolvedUnitId, setResolvedUnitId] = useState(rawUnitId);

  useEffect(() => {
    let currentRaw = rawUnitId;
    if (activeLevel === 'CENTRAL' && (!currentRaw || currentRaw === 'CENTRAL')) {
      api.get('/org/central').then((r) => {
        if (r.data?.data?._id) setResolvedUnitId(r.data.data._id);
      }).catch(() => {});
    } else {
      setResolvedUnitId(currentRaw);
    }
  }, [rawUnitId, activeLevel]);

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(null);

  const [photosFor, setPhotosFor] = useState(null);
  const [photoError, setPhotoError] = useState('');
  const [activePhotoIdx, setActivePhotoIdx] = useState(0);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);

  // Active activity types from the EventTypeConfig catalogue
  const { types: eventTypes } = useEventTypes('ACTIVITY', targetBody);
  const availableTypes = useMemo(() => {
    if (isCongressView) {
      const list = (eventTypes || []).filter((t) => t.appliesTo?.congress !== false);
      return list.length ? list : [{ code: 'CAMPAIGN', label: 'Campaign' }, { code: 'JALSA', label: 'Jalsa' }];
    }
    if (isJirgaView) {
      const list = (eventTypes || []).filter((t) => t.appliesTo?.jirga !== false);
      return list.length ? list : [{ code: 'CAMPAIGN', label: 'Campaign' }, { code: 'SEMINAR', label: 'Seminar' }];
    }
    if (isCommitteeView) {
      const list = (eventTypes || []).filter((t) => t.appliesTo?.committee !== false);
      return list.length ? list : [{ code: 'TASK', label: 'Task' }, { code: 'CAMPAIGN', label: 'Campaign' }];
    }
    const list = (eventTypes || []).filter((t) => t.appliesTo?.executive !== false);
    return list.length ? list : [
      { code: 'CAMPAIGN', label: 'Campaign' },
      { code: 'PROTEST', label: 'Protest' },
      { code: 'JALSA', label: 'Jalsa' },
      { code: 'SEMINAR', label: 'Seminar' },
      { code: 'STUDY_CIRCLE', label: 'Study Circle' },
      { code: 'TASK', label: 'Task' },
      { code: 'COMMUNITY_SERVICE', label: 'Community Service' },
    ];
  }, [eventTypes, isCommitteeView, isJirgaView, isCongressView]);

  function getExportParams() {
    return {
      unitLevel: activeLevel,
      unitId: resolvedUnitId || (activeLevel === 'CENTRAL' ? 'CENTRAL' : (params.unitId || ctx?.unitId)),
      body: targetBody,
      scope: 'own',
    };
  }

  function getExportFilename(ext) {
    const unitName = ctx?.unitName || (activeLevel === 'CENTRAL' ? 'Central' : activeLevel);
    const stream = isCongressView
      ? '-congress'
      : (isJirgaView
        ? '-jirga'
        : (isCommitteeView
          ? '-committee'
          : '-executive'));
    const safeUnit = (unitName || 'unit').replace(/[^a-zA-Z0-9_-]/g, '_');
    return `${safeUnit}${stream}-activities.${ext}`;
  }

  async function handleExport(fmt) {
    if (exporting) return;
    setExporting(fmt);
    try {
      const qParams = getExportParams();
      const filename = getExportFilename(fmt);
      await downloadAndShare(`/exports/unit/activities/${fmt}`, filename, qParams);
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
      const res = await api.get('/activities', {
        params: { unitLevel: activeLevel, unitId: resolvedUnitId, body: targetBody },
      });
      setItems(res.data.data || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => { load(); }, [activeLevel, resolvedUnitId, targetBody]);
  function onRefresh() { setRefreshing(true); load(true); }

  function openCreate() {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const startDefault = `${todayStr}T10:00`;
    const endDefault = `${todayStr}T13:00`;

    const initialCode = availableTypes[0]?.code || DEFAULT_TYPE_CODE;
    setForm({
      ...EMPTY_FORM,
      typeCode: initialCode,
      startAt: startDefault,
      endAt: endDefault,
    });
    setFormError('');
    setShowForm(true);
  }

  async function handleCreate() {
    setFormError('');
    if (!form.title?.trim()) {
      const msg = 'Title is required.';
      setFormError(msg);
      toast.error(msg);
      return;
    }
    if (!form.startAt) {
      const msg = 'Start date & time is required.';
      setFormError(msg);
      toast.error(msg);
      return;
    }

    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description?.trim() || undefined,
        venue: form.venue?.trim() || undefined,
        startAt: form.startAt,
        endAt: form.endAt || undefined,
        typeCode: form.typeCode,
        type: form.typeCode,
        body: targetBody,
        unitLevel: activeLevel,
        unitId: resolvedUnitId,
      };

      if (form.typeCode === 'CAMPAIGN') {
        if (form.campaign_householdsVisited) payload.campaign_householdsVisited = Number(form.campaign_householdsVisited);
        if (form.campaign_peopleContacted) payload.campaign_peopleContacted = Number(form.campaign_peopleContacted);
        if (form.campaign_pamphletsDistributed) payload.campaign_pamphletsDistributed = Number(form.campaign_pamphletsDistributed);
        if (form.campaign_expectedJoiners) payload.campaign_expectedJoiners = Number(form.campaign_expectedJoiners);
        if (form.campaign_actualJoiners) payload.campaign_actualJoiners = Number(form.campaign_actualJoiners);
        if (form.campaign_volunteerHours) payload.campaign_volunteerHours = Number(form.campaign_volunteerHours);
      }

      await api.post('/activities', payload);
      const streamLabel = isCongressView ? 'Congress' : (isJirgaView ? 'Jirga' : (isCommitteeView ? 'Committee' : 'Executive'));
      toast.success(`${streamLabel} activity "${form.title}" recorded.`);
      setShowForm(false);
      setForm(EMPTY_FORM);
      setFormError('');
      load(true);
    } catch (e) {
      const msg = errorMessage(e);
      setFormError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  async function uploadPhotos(activityId, files) {
    if (!files || !files.length) return;
    setPhotoError('');
    if (files.length > MAX_PHOTOS) {
      toast.error(`Only ${MAX_PHOTOS} photos can be uploaded at once. Sending first ${MAX_PHOTOS}.`);
    }
    const batch = files.slice(0, MAX_PHOTOS);
    const fd = new FormData();

    for (let i = 0; i < batch.length; i++) {
      const f = batch[i];
      if (Platform.OS === 'web') {
        if (f.file) {
          fd.append('photos', f.file);
        } else if (f.uri) {
          try {
            const res = await fetch(f.uri);
            const blob = await res.blob();
            fd.append('photos', blob, f.name || `photo_${Date.now()}_${i}.jpg`);
          } catch {
            fd.append('photos', f);
          }
        } else {
          fd.append('photos', f);
        }
      } else {
        fd.append('photos', {
          uri: f.uri,
          name: f.name || `photo_${Date.now()}_${i}.jpg`,
          type: f.type || 'image/jpeg',
        });
      }
    }

    setUploadingPhotos(true);
    try {
      const r = await api.post(`/activities/${activityId}/photos`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const data = r.data?.data;
      if (data?.accepted?.length) {
        toast.success(`${data.accepted.length} photo(s) uploaded successfully.`);
      }
      if (data?.rejected?.length) {
        const rejectMsg = data.rejected.map((x) => `${x.filename || 'Photo'}: ${x.reason}`).join('\n');
        setPhotoError(rejectMsg);
        toast.error(`Rejected: ${data.rejected[0]?.reason || 'GPS/EXIF check failed'}`);
      }
      load(true);
      if (photosFor && photosFor._id === activityId) {
        setPhotosFor(data?.activity || { ...photosFor, photos: data?.activity?.photos });
      }
    } catch (e) {
      const msg = errorMessage(e);
      setPhotoError(msg);
      toast.error(msg);
    } finally {
      setUploadingPhotos(false);
    }
  }

  function handlePhotoUploadPress(a) {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.multiple = true;
      input.onchange = (e) => {
        const files = Array.from(e.target.files || []);
        if (files.length) uploadPhotos(a._id, files);
      };
      input.click();
    } else {
      pickPhotosNative(a._id);
    }
  }

  async function pickPhotosNative(activityId) {
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
        uploadPhotos(activityId, files);
      }
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  async function handleCompleteActivity(a) {
    const doComplete = async () => {
      try {
        await api.post(`/activities/${a._id}/complete`, {});
        toast.success('Activity marked complete.');
        load(true);
      } catch (e) {
        toast.error(errorMessage(e));
      }
    };

    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.confirm) {
      if (window.confirm(`Mark "${a.title || 'this activity'}" as complete?`)) {
        await doComplete();
      }
    } else {
      Alert.alert('Complete Activity', `Mark "${a.title || 'this activity'}" as complete?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Complete', onPress: doComplete },
      ]);
    }
  }

  async function handleCancelActivity(a) {
    const doCancel = async () => {
      try {
        await api.post(`/activities/${a._id}/cancel`, {});
        toast.success(`"${a.title || 'Activity'}" cancelled.`);
        load(true);
      } catch (e) {
        toast.error(errorMessage(e));
      }
    };

    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.confirm) {
      if (window.confirm(`Are you sure you want to cancel "${a.title || 'this activity'}"?`)) {
        await doCancel();
      }
    } else {
      Alert.alert('Cancel Activity', `Are you sure you want to cancel "${a.title || 'this activity'}"?`, [
        { text: 'No', style: 'cancel' },
        { text: 'Yes, Cancel', style: 'destructive', onPress: doCancel },
      ]);
    }
  }

  function renderItem({ item: a }) {
    const isCng = a.body === 'CONGRESS';
    const isJrg = a.body === 'JIRGA';
    const isCm = a.body === 'COMMITTEE';

    const typeBadgeLabel = isCng ? 'Congress' : (isJrg ? 'Jirga' : (isCm ? 'Committee' : 'Executive'));
    const typeBadgeBg = isCng ? '#e0f2fe' : (isJrg ? '#f3e8ff' : (isCm ? '#e0f2fe' : '#f1f5f9'));
    const typeBadgeColor = isCng ? '#0369a1' : (isJrg ? '#6b21a8' : (isCm ? '#0369a1' : '#475569'));

    const photoCount = (a.photos || []).length;

    return (
      <View style={styles.tr}>
        {/* When */}
        <View style={[styles.td, { width: 140 }]}>
          <Text style={styles.tdText}>{new Date(a.startAt).toLocaleString()}</Text>
        </View>

        {/* Type */}
        <View style={[styles.td, { width: 160 }]}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
            <Badge label={typeBadgeLabel} color={typeBadgeColor} bg={typeBadgeBg} />
            <Text style={styles.tdText}>{a.type || ACTIVITY_TYPE_LABEL[a.typeCode] || a.typeCode}</Text>
          </View>
        </View>

        {/* Title & Arranged By */}
        <View style={[styles.td, { width: 200 }]}>
          <Text style={styles.tdText} numberOfLines={2}>{a.title || 'Untitled'}</Text>
          {a.unitLevel && (
            <View style={{ marginTop: 3 }}>
              <Text style={{ fontSize: 10, color: Colors.textMuted }}>
                {formatUnitArrangedBy(a, { isCommitteeView, isJirgaView, isCongressView })}
              </Text>
            </View>
          )}
        </View>

        {/* Venue */}
        <View style={[styles.td, { width: 120 }]}>
          <Text style={styles.tdText} numberOfLines={2}>{a.venue || '—'}</Text>
        </View>

        {/* State */}
        <View style={[styles.td, { width: 100 }]}>
          <Badge
            label={a.state || 'DRAFT'}
            color={a.state === 'COMPLETED' ? '#15803d' : (a.state === 'CANCELLED' ? '#b91c1c' : '#b45309')}
            bg={a.state === 'COMPLETED' ? '#dcfce7' : (a.state === 'CANCELLED' ? '#fee2e2' : '#fef3c7')}
          />
        </View>

        {/* Photos */}
        <View style={[styles.td, { width: 95 }]}>
          {photoCount > 0 ? (
            <TouchableOpacity
              style={styles.rowBtnGhost}
              onPress={() => {
                setPhotosFor(a);
                setActivePhotoIdx(0);
              }}
            >
              <Ionicons name="camera-outline" size={14} color={Colors.primary} />
              <Text style={[styles.rowBtnGhostText, { color: Colors.primary }]}>
                {photoCount} · View
              </Text>
            </TouchableOpacity>
          ) : (
            <Text style={[styles.tdText, { color: Colors.textMuted }]}>0</Text>
          )}
        </View>

        {/* Actions */}
        <View style={[styles.td, { width: 240, flexDirection: 'row', gap: 6 }]}>
          {canManage && a.state !== 'COMPLETED' && a.state !== 'CANCELLED' && (
            <>
              <TouchableOpacity
                style={styles.rowBtnGhost}
                onPress={() => handlePhotoUploadPress(a)}
                disabled={uploadingPhotos}
              >
                <Ionicons name="camera-outline" size={14} color={Colors.textMuted} />
                <Text style={styles.rowBtnGhostText}>Photos</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.rowBtnFinalize}
                onPress={() => handleCompleteActivity(a)}
              >
                <Text style={styles.rowBtnFinalizeText}>Complete</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.rowBtnDanger}
                onPress={() => handleCancelActivity(a)}
              >
                <Text style={styles.rowBtnDangerText}>Cancel</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    );
  }

  function renderCardItem(a) {
    const isCng = a.body === 'CONGRESS';
    const isJrg = a.body === 'JIRGA';
    const isCm = a.body === 'COMMITTEE';

    const typeBadgeLabel = isCng ? 'Congress' : (isJrg ? 'Jirga' : (isCm ? 'Committee' : 'Executive'));
    const typeBadgeBg = isCng ? '#e0f2fe' : (isJrg ? '#f3e8ff' : (isCm ? '#e0f2fe' : '#f1f5f9'));
    const typeBadgeColor = isCng ? '#0369a1' : (isJrg ? '#6b21a8' : (isCm ? '#0369a1' : '#475569'));

    const photoCount = (a.photos || []).length;
    const statusColor = a.state === 'COMPLETED' ? '#15803d' : (a.state === 'CANCELLED' ? '#b91c1c' : '#b45309');
    const statusBg = a.state === 'COMPLETED' ? '#dcfce7' : (a.state === 'CANCELLED' ? '#fee2e2' : '#fef3c7');

    return (
      <Card style={styles.activityCard}>
        {/* Top Badges Row */}
        <View style={styles.cardBadgesRow}>
          <View style={styles.cardBadgesLeft}>
            <Badge label={typeBadgeLabel} color={typeBadgeColor} bg={typeBadgeBg} />
            <Badge
              label={a.type || ACTIVITY_TYPE_LABEL[a.typeCode] || a.typeCode || 'Activity'}
              color={Colors.primary}
              bg="#eff6ff"
            />
          </View>
          <Badge label={a.state || 'DRAFT'} color={statusColor} bg={statusBg} />
        </View>

        {/* Title */}
        <Text style={styles.cardActivityTitle}>{a.title || 'Untitled Activity'}</Text>

        {/* Arranged by Unit */}
        {a.unitLevel && (
          <View style={styles.cardUnitRow}>
            <Ionicons name="business-outline" size={13} color={Colors.textMuted} />
            <Text style={styles.cardUnitText} numberOfLines={1}>
              {formatUnitArrangedBy(a, { isCommitteeView, isJirgaView, isCongressView })}
            </Text>
          </View>
        )}

        {/* Info Grid: Date/Time & Venue */}
        <View style={styles.cardInfoGrid}>
          <View style={styles.cardInfoRow}>
            <Ionicons name="calendar-outline" size={14} color={Colors.primary} />
            <Text style={styles.cardInfoText}>{new Date(a.startAt).toLocaleString()}</Text>
          </View>
          {a.venue ? (
            <View style={styles.cardInfoRow}>
              <Ionicons name="location-outline" size={14} color={Colors.error} />
              <Text style={styles.cardInfoText} numberOfLines={1}>{a.venue}</Text>
            </View>
          ) : null}
        </View>

        {/* Description */}
        {a.description ? (
          <Text style={styles.cardDescText} numberOfLines={3}>{a.description}</Text>
        ) : null}

        {/* Campaign Metrics */}
        {a.campaignMetrics && Object.values(a.campaignMetrics).some((v) => Number(v) > 0) && (
          <View style={styles.metricsPillsRow}>
            {Number(a.campaignMetrics.peopleContacted) > 0 && (
              <View style={styles.metricBadge}>
                <Text style={styles.metricBadgeVal}>{a.campaignMetrics.peopleContacted}</Text>
                <Text style={styles.metricBadgeLbl}>Contacted</Text>
              </View>
            )}
            {Number(a.campaignMetrics.householdsVisited) > 0 && (
              <View style={styles.metricBadge}>
                <Text style={styles.metricBadgeVal}>{a.campaignMetrics.householdsVisited}</Text>
                <Text style={styles.metricBadgeLbl}>Households</Text>
              </View>
            )}
            {Number(a.campaignMetrics.actualJoiners) > 0 && (
              <View style={styles.metricBadge}>
                <Text style={styles.metricBadgeVal}>{a.campaignMetrics.actualJoiners}</Text>
                <Text style={styles.metricBadgeLbl}>Joiners</Text>
              </View>
            )}
          </View>
        )}

        {/* Bottom Actions Row */}
        <View style={styles.cardBottomBar}>
          {photoCount > 0 ? (
            <TouchableOpacity
              style={styles.cardPhotoTag}
              onPress={() => {
                setPhotosFor(a);
                setActivePhotoIdx(0);
              }}
            >
              <Ionicons name="images-outline" size={14} color={Colors.primary} />
              <Text style={styles.cardPhotoTagText}>{photoCount} Photo{photoCount === 1 ? '' : 's'}</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.cardNoPhotoTag}>
              <Ionicons name="image-outline" size={14} color={Colors.textLight} />
              <Text style={styles.cardNoPhotoText}>0 Photos</Text>
            </View>
          )}

          <View style={styles.cardButtonCluster}>
            {canManage && a.state !== 'COMPLETED' && a.state !== 'CANCELLED' && (
              <>
                <TouchableOpacity
                  style={styles.cardActionBtnSecondary}
                  onPress={() => handlePhotoUploadPress(a)}
                  disabled={uploadingPhotos}
                >
                  <Ionicons name="camera-outline" size={14} color={Colors.text} />
                  <Text style={styles.cardActionBtnSecondaryText}>Photo</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.cardActionBtnComplete}
                  onPress={() => handleCompleteActivity(a)}
                >
                  <Ionicons name="checkmark-circle" size={14} color="#fff" />
                  <Text style={styles.cardActionBtnCompleteText}>Complete</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.cardActionBtnCancel}
                  onPress={() => handleCancelActivity(a)}
                >
                  <Ionicons name="close-circle-outline" size={15} color={Colors.error} />
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Card>
    );
  }

  const tableHeader = () => (
    <View style={styles.thRow}>
      <Text style={[styles.th, { width: 140 }]}>When</Text>
      <Text style={[styles.th, { width: 160 }]}>Type</Text>
      <Text style={[styles.th, { width: 200 }]}>Title</Text>
      <Text style={[styles.th, { width: 120 }]}>Venue</Text>
      <Text style={[styles.th, { width: 100 }]}>State</Text>
      <Text style={[styles.th, { width: 95 }]}>Photos</Text>
      <Text style={[styles.th, { width: 240 }]}>Actions</Text>
    </View>
  );

  const pageTitle = isCongressView
    ? 'National Congress Activities'
    : (isJirgaView
      ? (activeLevel === 'CENTRAL' ? 'Qomi Jirga Activities' : 'Sobayi Jirga Activities')
      : (isCommitteeView ? 'Committee Activities' : 'Activities'));

  const recordBtnLabel = isCongressView
    ? '+ Record Congress Activity'
    : (isJirgaView
      ? '+ Record Jirga Activity'
      : (isCommitteeView ? '+ Record Committee Activity' : '+ Record Activity'));

  // If user opened Congress stream but is below Central tier, show guidance card
  if (isCongressView && activeLevel !== 'CENTRAL') {
    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={{ padding: Spacing.lg }}>
          <View style={styles.guidanceCard}>
            <View style={styles.guidanceIconBox}>
              <Ionicons name="people-outline" size={40} color={Colors.primary} />
            </View>
            <Text style={styles.guidanceTitle}>National Congress operates exclusively at the Central Level</Text>
            <Text style={styles.guidanceText}>
              Under the PKNAP constitution, the <Text style={{ fontWeight: '700' }}>National Congress (قومي کانګرس)</Text> is the supreme representative assembly operating at the Central tier. Lower tiers operate via <Text style={{ fontWeight: '700' }}>Sobayi Jirga</Text> (Province) and <Text style={{ fontWeight: '700' }}>Zilla & Elaqayi Committees</Text> (District & Area).
            </Text>

            <View style={styles.guidanceBtnCol}>
              <TouchableOpacity
                style={styles.guidanceBtnPrimary}
                onPress={() => {
                  setCtx({ unitLevel: 'CENTRAL', unitId: 'CENTRAL', unitName: 'PKNAP Central' });
                }}
              >
                <Ionicons name="globe-outline" size={18} color="#fff" style={{ marginRight: 6 }} />
                <Text style={styles.guidanceBtnPrimaryText}>Switch to Central Unit Context →</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // If user opened Jirga stream but is below Province tier, show guidance card
  if (isJirgaView && activeLevel !== 'CENTRAL' && activeLevel !== 'PROVINCE') {
    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={{ padding: Spacing.lg }}>
          <View style={styles.guidanceCard}>
            <View style={styles.guidanceIconBox}>
              <Ionicons name="people-outline" size={40} color={Colors.primary} />
            </View>
            <Text style={styles.guidanceTitle}>Jirga is only available at Provincial and Central tiers</Text>
            <Text style={styles.guidanceText}>
              Under the party constitution, the <Text style={{ fontWeight: '700' }}>Sobayi Jirga (صوبايي جرګه)</Text> operates at the Province level, and the <Text style={{ fontWeight: '700' }}>Qomi Jirga / National Jirga (قومي جرګه)</Text> operates at the Central level. District and Area units operate via <Text style={{ fontWeight: '700' }}>Zilla & Elaqayi Committees</Text>.
            </Text>

            <View style={styles.guidanceBtnCol}>
              {isHigherAdmin(user) && (
                <TouchableOpacity
                  style={styles.guidanceBtnPrimary}
                  onPress={() => {
                    setCtx({ unitLevel: 'CENTRAL', unitId: 'CENTRAL', unitName: 'PKNAP Central' });
                  }}
                >
                  <Ionicons name="globe-outline" size={18} color="#fff" style={{ marginRight: 6 }} />
                  <Text style={styles.guidanceBtnPrimaryText}>Open Qomi Jirga (Central)</Text>
                </TouchableOpacity>
              )}

              {user?.scope?.provinceId && (
                <TouchableOpacity
                  style={styles.guidanceBtnSecondary}
                  onPress={() => {
                    setCtx({ unitLevel: 'PROVINCE', unitId: user.scope.provinceId, unitName: user.scope.provinceName || 'Province' });
                  }}
                >
                  <Ionicons name="location-outline" size={18} color={Colors.primary} style={{ marginRight: 6 }} />
                  <Text style={styles.guidanceBtnSecondaryText}>Open My Sobayi Jirga</Text>
                </TouchableOpacity>
              )}

              {isHigherAdmin(user) && provinces && provinces.length > 0 && (
                <View style={{ marginTop: 12 }}>
                  <Text style={styles.guidanceSubHead}>OR SWITCH TO PROVINCIAL SOBAYI JIRGA:</Text>
                  <View style={styles.provGrid}>
                    {provinces.map((prov) => (
                      <TouchableOpacity
                        key={prov._id}
                        style={styles.provPillBtn}
                        onPress={() => setCtx({ unitLevel: 'PROVINCE', unitId: prov._id, unitName: prov.name })}
                      >
                        <Text style={styles.provPillBtnText}>{prov.name} Sobayi Jirga →</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.pageTitle}>{pageTitle}</Text>
          <Text style={styles.pageSubtitle}>
            {ctx?.unitName ? `${ctx.unitName} · ` : ''}{activeLevel.replace('_', ' ')}
          </Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => handleExport('pdf')}
            disabled={!!exporting}
          >
            {exporting === 'pdf' ? (
              <ActivityIndicator size="small" color={Colors.primary} />
            ) : (
              <Ionicons name="document-text-outline" size={20} color={Colors.primary} />
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => handleExport('xlsx')}
            disabled={!!exporting}
          >
            {exporting === 'xlsx' ? (
              <ActivityIndicator size="small" color={Colors.primary} />
            ) : (
              <Ionicons name="grid-outline" size={20} color={Colors.primary} />
            )}
          </TouchableOpacity>

          {canManage && (
            <TouchableOpacity style={styles.primaryBtn} onPress={openCreate}>
              <Ionicons name="add" size={18} color="#fff" />
              <Text style={styles.primaryBtnText}>Record</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {isMobile ? (
        <FlatList
          data={items}
          renderItem={({ item }) => renderCardItem(item)}
          keyExtractor={(a) => a._id}
          onRefresh={onRefresh}
          refreshing={refreshing}
          contentContainerStyle={styles.mobileListContainer}
          ListEmptyComponent={
            !loading ? (
              <View style={styles.emptyWrap}>
                <Ionicons name="flag-outline" size={44} color={Colors.textLight} style={{ marginBottom: 10 }} />
                <Text style={styles.emptyTitle}>No activities recorded yet</Text>
                <Text style={styles.emptySubtitle}>
                  {canManage
                    ? 'Tap the Record button above to log a new activity.'
                    : 'No activities found for this unit.'}
                </Text>
              </View>
            ) : null
          }
          ListFooterComponent={loading && !refreshing ? <ActivityIndicator style={{ padding: 16 }} color={Colors.primary} /> : null}
        />
      ) : (
        <ScrollView horizontal style={{ flex: 1 }} contentContainerStyle={{ padding: Spacing.lg }}>
          <View style={{ flex: 1 }}>
            <FlatList
              data={items}
              renderItem={renderItem}
              keyExtractor={(a) => a._id}
              ListHeaderComponent={tableHeader}
              onRefresh={onRefresh}
              refreshing={refreshing}
              contentContainerStyle={styles.tableWrap}
              ListEmptyComponent={
                !loading ? (
                  <View style={{ padding: 24, alignItems: 'center' }}>
                    <Text style={{ color: Colors.textMuted }}>
                      No {isCongressView ? 'Congress' : (isJirgaView ? 'Jirga' : (isCommitteeView ? 'committee' : 'executive'))} activities recorded yet.
                    </Text>
                  </View>
                ) : null
              }
              ListFooterComponent={loading && !refreshing ? <ActivityIndicator style={{ padding: 16 }} color={Colors.primary} /> : null}
            />
          </View>
        </ScrollView>
      )}

      {/* Record Activity Modal */}
      <Modal visible={showForm} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowForm(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setShowForm(false)}><Text style={styles.modalCancel}>Cancel</Text></TouchableOpacity>
              <Text style={styles.modalTitle}>
                {isCongressView ? 'Record Congress Activity' : (isJirgaView ? 'Record Jirga Activity' : (isCommitteeView ? 'Record Committee Activity' : 'Record Activity'))}
              </Text>
              <TouchableOpacity onPress={handleCreate} disabled={saving}>
                {saving ? <ActivityIndicator color={Colors.primary} /> : <Text style={styles.modalSave}>Save</Text>}
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.formContent} keyboardShouldPersistTaps="handled">
              {formError ? (
                <View style={{ backgroundColor: '#fee2e2', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#fca5a5', marginBottom: 16 }}>
                  <Text style={{ color: '#b91c1c', fontSize: 13, fontWeight: '700' }}>⚠️ Could not record activity:</Text>
                  <Text style={{ color: '#b91c1c', fontSize: 12, marginTop: 4 }}>{formError}</Text>
                </View>
              ) : null}

              {/* Type Dropdown */}
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Type *</Text>
                <View style={styles.pickerWrapper}>
                  <Picker
                    selectedValue={form.typeCode}
                    onValueChange={(val) => setForm((f) => ({ ...f, typeCode: val }))}
                  >
                    {availableTypes.map((t) => (
                      <Picker.Item key={t.code} label={t.label || t.code} value={t.code} />
                    ))}
                  </Picker>
                </View>
              </View>

              <FormField label="Title *" value={form.title} onChangeText={(v) => setForm((f) => ({ ...f, title: v }))} placeholder="Activity title" />

              <DateTimePicker
                label="Start Date & Time *"
                value={form.startAt}
                mode="datetime"
                placeholder="Select start date & time"
                onChange={(val) => setForm((f) => ({ ...f, startAt: val }))}
              />

              <DateTimePicker
                label="End Date & Time"
                value={form.endAt}
                mode="datetime"
                placeholder="Select end date & time"
                onChange={(val) => setForm((f) => ({ ...f, endAt: val }))}
              />

              <FormField label="Venue" value={form.venue} onChangeText={(v) => setForm((f) => ({ ...f, venue: v }))} placeholder="Venue location" />
              <FormField label="Description" value={form.description} onChangeText={(v) => setForm((f) => ({ ...f, description: v }))} placeholder="Activity details and description" multiline />

              {/* Campaign fields */}
              {form.typeCode === 'CAMPAIGN' && (
                <View style={styles.campaignSection}>
                  <Text style={styles.campaignSectionTitle}>Campaign Metrics</Text>
                  <FormField
                    label="Households Visited"
                    value={form.campaign_householdsVisited}
                    onChangeText={(v) => setForm((f) => ({ ...f, campaign_householdsVisited: v }))}
                    placeholder="0"
                    keyboardType="numeric"
                  />
                  <FormField
                    label="People Contacted"
                    value={form.campaign_peopleContacted}
                    onChangeText={(v) => setForm((f) => ({ ...f, campaign_peopleContacted: v }))}
                    placeholder="0"
                    keyboardType="numeric"
                  />
                  <FormField
                    label="Pamphlets Distributed"
                    value={form.campaign_pamphletsDistributed}
                    onChangeText={(v) => setForm((f) => ({ ...f, campaign_pamphletsDistributed: v }))}
                    placeholder="0"
                    keyboardType="numeric"
                  />
                  <FormField
                    label="Expected Joiners"
                    value={form.campaign_expectedJoiners}
                    onChangeText={(v) => setForm((f) => ({ ...f, campaign_expectedJoiners: v }))}
                    placeholder="0"
                    keyboardType="numeric"
                  />
                  <FormField
                    label="Actual Joiners"
                    value={form.campaign_actualJoiners}
                    onChangeText={(v) => setForm((f) => ({ ...f, campaign_actualJoiners: v }))}
                    placeholder="0"
                    keyboardType="numeric"
                  />
                  <FormField
                    label="Volunteer Hours"
                    value={form.campaign_volunteerHours}
                    onChangeText={(v) => setForm((f) => ({ ...f, campaign_volunteerHours: v }))}
                    placeholder="0"
                    keyboardType="numeric"
                  />
                </View>
              )}
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {/* Photos Viewer Modal */}
      {photosFor && (
        <Modal visible={!!photosFor} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setPhotosFor(null)}>
          <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>Activity Photos</Text>
                <Text style={styles.modalSub} numberOfLines={1}>
                  {photosFor.title || photosFor.type} · {new Date(photosFor.startAt).toLocaleDateString()} · {(photosFor.photos || []).length} photo{(photosFor.photos || []).length === 1 ? '' : 's'}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setPhotosFor(null)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.formContent}>
              {photoError ? (
                <View style={{ backgroundColor: '#fee2e2', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#fca5a5', marginBottom: 14 }}>
                  <Text style={{ color: '#b91c1c', fontSize: 13, fontWeight: '700' }}>⚠️ Photo Rejection Details:</Text>
                  <Text style={{ color: '#b91c1c', fontSize: 12, marginTop: 4, lineHeight: 17 }}>{photoError}</Text>
                </View>
              ) : null}

              {(!photosFor.photos || photosFor.photos.length === 0) ? (
                <View style={{ padding: 24, alignItems: 'center' }}>
                  <Text style={{ color: Colors.textMuted }}>No photos attached to this activity yet.</Text>
                </View>
              ) : (
                <>
                  {(() => {
                    const photos = photosFor.photos;
                    const cur = photos[activePhotoIdx] || photos[0];
                    return (
                      <View>
                        {/* Main Image */}
                        <View style={styles.photoMainBox}>
                          <Image
                            source={{ uri: cur.url }}
                            style={styles.photoMainImg}
                            resizeMode="contain"
                          />
                        </View>

                        {/* Metadata Details */}
                        <View style={styles.photoMetaCard}>
                          <Text style={styles.photoMetaTitle}>Photo {activePhotoIdx + 1} of {photos.length}</Text>
                          
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

                          {cur.sha256 ? (
                            <View style={styles.photoMetaRow}>
                              <Text style={styles.photoMetaLabel}>SHA-256:</Text>
                              <Text style={[styles.photoMetaVal, { fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', fontSize: 11 }]}>
                                {cur.sha256.slice(0, 16)}...{cur.sha256.slice(-8)}
                              </Text>
                            </View>
                          ) : null}

                          <View style={styles.photoMetaRow}>
                            <Text style={styles.photoMetaLabel}>File:</Text>
                            <TouchableOpacity onPress={() => Linking.openURL(cur.url)}>
                              <Text style={styles.linkText}>Open full size ↗</Text>
                            </TouchableOpacity>
                          </View>

                          {photos.length > 1 && (
                            <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                              <TouchableOpacity
                                style={[styles.btnSecondary, activePhotoIdx === 0 && { opacity: 0.5 }]}
                                disabled={activePhotoIdx === 0}
                                onPress={() => setActivePhotoIdx((i) => Math.max(0, i - 1))}
                              >
                                <Text style={styles.btnSecondaryText}>← Prev</Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={[styles.btnSecondary, activePhotoIdx === photos.length - 1 && { opacity: 0.5 }]}
                                disabled={activePhotoIdx === photos.length - 1}
                                onPress={() => setActivePhotoIdx((i) => Math.min(photos.length - 1, i + 1))}
                              >
                                <Text style={styles.btnSecondaryText}>Next →</Text>
                              </TouchableOpacity>
                            </View>
                          )}
                        </View>

                        {/* Thumbnail Strip */}
                        {photos.length > 1 && (
                          <ScrollView horizontal style={{ marginTop: 14 }} contentContainerStyle={{ gap: 8 }}>
                            {photos.map((p, i) => (
                              <TouchableOpacity
                                key={i}
                                onPress={() => setActivePhotoIdx(i)}
                                style={[
                                  styles.thumbBtn,
                                  i === activePhotoIdx && styles.thumbBtnActive,
                                ]}
                              >
                                <Image source={{ uri: p.url }} style={styles.thumbImg} />
                              </TouchableOpacity>
                            ))}
                          </ScrollView>
                        )}
                      </View>
                    );
                  })()}
                </>
              )}
            </ScrollView>
          </SafeAreaView>
        </Modal>
      )}
    </SafeAreaView>
  );
}

function FormField({ label, value, onChangeText, placeholder, multiline, keyboardType }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={[styles.fieldInput, multiline && styles.fieldMultiline]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder || label}
        placeholderTextColor={Colors.textLight}
        multiline={multiline}
        keyboardType={keyboardType || 'default'}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    flexWrap: 'wrap',
    gap: 8,
  },
  pageTitle: { fontSize: FontSize.lg, fontWeight: '800', color: Colors.text },
  pageSubtitle: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  iconBtn: {
    backgroundColor: Colors.surfaceAlt,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtn: {
    backgroundColor: Colors.primary,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: Radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    ...Platform.select({
      web: {
        boxShadow: '0 2px 3px rgba(30, 64, 175, 0.18)',
      },
      default: {
        shadowColor: Colors.primary,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.18,
        shadowRadius: 3,
        elevation: 2,
      },
    }),
  },
  primaryBtnText: { fontSize: FontSize.xs, fontWeight: '700', color: '#fff' },
  actionsRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  btnSecondary: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: Colors.surfaceAlt, borderRadius: 8, borderWidth: 1, borderColor: Colors.border },
  btnSecondaryText: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.textMuted },
  btnPrimary: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: Colors.primary, borderRadius: 8 },
  btnPrimaryText: { fontSize: FontSize.sm, fontWeight: '600', color: '#fff' },

  tierPillsWrapper: { paddingHorizontal: 16, paddingVertical: 10, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
  tierPillsScroll: { flexDirection: 'row', gap: 8 },
  tierPill: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: Colors.surfaceAlt, borderWidth: 1, borderColor: Colors.border },
  tierPillActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  tierPillText: { fontSize: FontSize.xs, fontWeight: '600', color: Colors.text },
  tierPillTextActive: { color: '#fff', fontWeight: '700' },

  tableWrap: { backgroundColor: Colors.surface, borderRadius: 8, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  thRow: { flexDirection: 'row', backgroundColor: Colors.surfaceAlt, borderBottomWidth: 1, borderBottomColor: Colors.border },
  th: { padding: 12, fontSize: FontSize.sm, fontWeight: '600', color: Colors.text, textAlign: 'left' },
  tr: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: Colors.border, alignItems: 'center' },
  td: { padding: 12, justifyContent: 'center' },
  tdText: { fontSize: FontSize.sm, color: Colors.text },

  rowBtnGhost: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: Colors.surfaceAlt, borderRadius: 4, borderWidth: 1, borderColor: Colors.border },
  rowBtnGhostText: { fontSize: FontSize.xs, fontWeight: '600', color: Colors.textMuted },
  rowBtnFinalize: { paddingHorizontal: 10, paddingVertical: 4, backgroundColor: Colors.primary, borderRadius: 4 },
  rowBtnFinalizeText: { fontSize: FontSize.xs, fontWeight: '700', color: '#fff' },
  rowBtnDanger: { paddingHorizontal: 8, paddingVertical: 4, backgroundColor: '#fee2e2', borderRadius: 4, borderWidth: 1, borderColor: '#fca5a5' },
  rowBtnDangerText: { fontSize: FontSize.xs, fontWeight: '600', color: '#b91c1c' },

  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: Spacing.lg, backgroundColor: Colors.surface,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  modalCancel: { fontSize: FontSize.base, color: Colors.textMuted, fontWeight: '500' },
  modalTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.text },
  modalSub: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  modalSave: { fontSize: FontSize.base, color: Colors.primary, fontWeight: '700' },
  formContent: { padding: Spacing.lg },
  field: { marginBottom: Spacing.lg },
  fieldLabel: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.text, marginBottom: 6 },
  fieldInput: {
    borderWidth: 1.5, borderColor: Colors.border, borderRadius: 10,
    paddingHorizontal: Spacing.md, paddingVertical: 11,
    fontSize: FontSize.base, color: Colors.text, backgroundColor: Colors.surfaceAlt,
  },
  fieldMultiline: { minHeight: 80, textAlignVertical: 'top' },
  pickerWrapper: {
    borderWidth: 1.5, borderColor: Colors.border, borderRadius: 10,
    backgroundColor: Colors.surfaceAlt, overflow: 'hidden',
  },

  campaignSection: {
    padding: 14, backgroundColor: Colors.surfaceAlt, borderRadius: 10,
    borderWidth: 1, borderColor: Colors.border, marginTop: 8, marginBottom: 16,
  },
  campaignSectionTitle: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.text, marginBottom: 10 },

  photoMainBox: {
    height: 260, backgroundColor: '#0f172a', borderRadius: 10,
    justifyContent: 'center', alignItems: 'center', overflow: 'hidden',
  },
  photoMainImg: { width: '100%', height: '100%' },
  photoMetaCard: {
    marginTop: 14, padding: 14, backgroundColor: Colors.surface,
    borderRadius: 10, borderWidth: 1, borderColor: Colors.border,
  },
  photoMetaTitle: { fontSize: FontSize.base, fontWeight: '700', color: Colors.text, marginBottom: 8 },
  photoMetaRow: { flexDirection: 'row', gap: 8, paddingVertical: 4, alignItems: 'flex-start' },
  photoMetaLabel: { width: 85, fontSize: FontSize.sm, color: Colors.textMuted, fontWeight: '600' },
  photoMetaVal: { flex: 1, fontSize: FontSize.sm, color: Colors.text },
  linkText: { fontSize: FontSize.sm, color: Colors.primary, fontWeight: '600' },
  thumbBtn: {
    width: 68, height: 68, borderRadius: 6, borderWidth: 1,
    borderColor: Colors.border, overflow: 'hidden',
  },
  thumbBtnActive: { borderColor: Colors.primary, borderWidth: 2 },
  thumbImg: { width: '100%', height: '100%' },

  // Guidance Card (when on lower tier context)
  guidanceCard: {
    backgroundColor: '#fff',
    borderRadius: Radius.xl,
    padding: Spacing.xl,
    alignItems: 'center',
    textAlign: 'center',
    marginVertical: Spacing.lg,
  },
  guidanceIconBox: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#eff6ff',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  guidanceTitle: {
    fontSize: FontSize.lg,
    fontWeight: '800',
    color: Colors.text,
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  guidanceText: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: Spacing.lg,
  },
  guidanceBtnCol: {
    width: '100%',
    gap: 10,
  },
  guidanceBtnPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    paddingVertical: 12,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.md,
  },
  guidanceBtnPrimaryText: {
    color: '#fff',
    fontSize: FontSize.md,
    fontWeight: '700',
  },
  guidanceBtnSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: Colors.primary,
    paddingVertical: 12,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.md,
  },
  guidanceBtnSecondaryText: {
    color: Colors.primary,
    fontSize: FontSize.md,
    fontWeight: '700',
  },
  guidanceSubHead: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textMuted,
    letterSpacing: 0.5,
    marginBottom: 8,
    textAlign: 'center',
  },
  provGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
  },
  provPillBtn: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: Radius.full,
  },
  provPillBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.text,
  },

  // Responsive Cards Layout for Mobile
  mobileListContainer: {
    padding: Spacing.md,
    paddingBottom: 40,
  },
  activityCard: {
    marginBottom: Spacing.md,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardBadgesRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    flexWrap: 'wrap',
    gap: 6,
  },
  cardBadgesLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  cardActivityTitle: {
    fontSize: FontSize.base,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 4,
    lineHeight: 22,
  },
  cardUnitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 8,
  },
  cardUnitText: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontWeight: '500',
    flex: 1,
  },
  cardInfoGrid: {
    flexDirection: 'column',
    gap: 6,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    marginBottom: 8,
  },
  cardInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  cardInfoText: {
    fontSize: FontSize.xs,
    color: Colors.text,
    fontWeight: '500',
    flex: 1,
  },
  cardDescText: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    lineHeight: 18,
    marginBottom: 10,
  },
  metricsPillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
  },
  metricBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#f8fafc',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  metricBadgeVal: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.primary,
  },
  metricBadgeLbl: {
    fontSize: 10,
    color: Colors.textMuted,
    fontWeight: '600',
  },
  cardBottomBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    flexWrap: 'wrap',
    gap: 8,
  },
  cardPhotoTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#eff6ff',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  cardPhotoTagText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.primary,
  },
  cardNoPhotoTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  cardNoPhotoText: {
    fontSize: FontSize.xs,
    color: Colors.textLight,
  },
  cardButtonCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  cardActionBtnSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.surfaceAlt,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardActionBtnSecondaryText: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    color: Colors.text,
  },
  cardActionBtnComplete: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#16a34a',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.sm,
  },
  cardActionBtnCompleteText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: '#fff',
  },
  cardActionBtnCancel: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: '#fee2e2',
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  emptyWrap: {
    padding: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: FontSize.base,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 4,
  },
  emptySubtitle: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    textAlign: 'center',
    maxWidth: 280,
  },
});
