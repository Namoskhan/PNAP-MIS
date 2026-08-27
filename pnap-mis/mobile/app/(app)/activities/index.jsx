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
  View,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { useAuth } from '../../../src/context/AuthContext';
import { useUnit } from '../../../src/context/UnitContext';
import { api, errorMessage } from '../../../src/api/client';
import { canManageMeetings, isCentralAdminOversight, isSuperAdminOversight, isSuperAdmin } from '../../../src/utils/permissions';
import { useToast } from '../../../src/components/Toast';
import Badge from '../../../src/components/Badge';
import { Colors, FontSize, Spacing } from '../../../src/constants/colors';
import { ACTIVITY_TYPE_LABEL } from '../../../src/utils/formatters';
import { downloadAndShare } from '../../../src/utils/export';
import { formatUnitArrangedBy } from '../../../src/utils/unitFormat';
import useEventTypes from '../../../src/hooks/useEventTypes';

const DEFAULT_TYPE_CODE = 'CAMPAIGN';
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

export default function ActivitiesScreen() {
  const { user } = useAuth();
  const { ctx, provinces } = useUnit();
  const toast = useToast();
  const params = useLocalSearchParams();

  const queryBody = params.body;
  const isCongressView = queryBody === 'CONGRESS';
  const isJirgaView = queryBody === 'JIRGA';
  const isCommitteeView = queryBody === 'COMMITTEE';
  const targetBody = isCongressView ? 'CONGRESS' : (isJirgaView ? 'JIRGA' : (isCommitteeView ? 'COMMITTEE' : 'EXECUTIVE'));

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

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(null);

  const [photosFor, setPhotosFor] = useState(null);
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
    setShowForm(true);
  }

  async function handleCreate() {
    if (!form.title?.trim()) {
      toast.error('Title is required.');
      return;
    }
    if (!form.startAt) {
      toast.error('Start date & time is required.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description?.trim() || undefined,
        venue: form.venue?.trim() || undefined,
        startAt: new Date(form.startAt).toISOString(),
        endAt: form.endAt ? new Date(form.endAt).toISOString() : undefined,
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
      load(true);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  async function uploadPhotos(activityId, files) {
    if (!files || !files.length) return;
    if (files.length > MAX_PHOTOS) {
      toast.error(`Only ${MAX_PHOTOS} photos can be uploaded at once. Sending first ${MAX_PHOTOS}.`);
    }
    const batch = files.slice(0, MAX_PHOTOS);
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
      const r = await api.post(`/activities/${activityId}/photos`, fd, {
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
      if (photosFor && photosFor._id === activityId) {
        setPhotosFor(data?.activity || { ...photosFor, photos: data?.activity?.photos });
      }
    } catch (e) {
      toast.error(errorMessage(e));
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

  const selectedProvince = (provinces || []).find((p) => String(p._id) === String(selectedUnitId));
  const pageTitle = isCongressView
    ? 'National Congress Activities · PKNAP Central'
    : (isJirgaView
      ? (activeLevel === 'CENTRAL' ? 'Qomi Jirga Activities · PKNAP Central' : `Sobayi Jirga Activities · ${selectedProvince?.name || 'Province'}`)
      : (isCommitteeView ? `Committee Activities · ${ctx?.unitName || 'PKNAP Central'}` : `Executive Activities · ${ctx?.unitName || 'PKNAP Central'}`));

  const recordBtnLabel = isCongressView
    ? '+ Record Congress Activity'
    : (isJirgaView
      ? '+ Record Jirga Activity'
      : (isCommitteeView ? '+ Record Committee Activity' : '+ Record Activity'));

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.pageTitle}>{pageTitle}</Text>
        <View style={styles.actionsRow}>
           <TouchableOpacity
             style={[styles.btnSecondary, exporting === 'pdf' && { opacity: 0.6 }]}
             onPress={() => handleExport('pdf')}
             disabled={!!exporting}
           >
             {exporting === 'pdf' ? (
               <ActivityIndicator size="small" color={Colors.textMuted} />
             ) : (
               <Ionicons name="document-text-outline" size={16} color={Colors.textMuted} />
             )}
             <Text style={styles.btnSecondaryText}>Export PDF</Text>
           </TouchableOpacity>
           <TouchableOpacity
             style={[styles.btnSecondary, exporting === 'xlsx' && { opacity: 0.6 }]}
             onPress={() => handleExport('xlsx')}
             disabled={!!exporting}
           >
             {exporting === 'xlsx' ? (
               <ActivityIndicator size="small" color={Colors.textMuted} />
             ) : (
               <Ionicons name="stats-chart-outline" size={16} color={Colors.textMuted} />
             )}
             <Text style={styles.btnSecondaryText}>Export Excel</Text>
           </TouchableOpacity>

           {canManage && (
             <TouchableOpacity style={styles.btnPrimary} onPress={openCreate}>
               <Ionicons name="calendar" size={16} color="#fff" />
               <Text style={styles.btnPrimaryText}>{recordBtnLabel}</Text>
             </TouchableOpacity>
           )}
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
              <Text style={[styles.tierPillText, selectedLevel === 'CENTRAL' && styles.tierPillTextActive]}>
                Qomi Jirga (Central)
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      )}

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

              <DateTimeField
                label="Start Date & Time *"
                value={form.startAt}
                onChange={(val) => setForm((f) => ({ ...f, startAt: val }))}
              />

              <DateTimeField
                label="End Date & Time"
                value={form.endAt}
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

function DateTimeField({ label, value, onChange }) {
  if (Platform.OS === 'web') {
    return (
      <View style={styles.field}>
        <Text style={styles.fieldLabel}>{label}</Text>
        <input
          type="datetime-local"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{
            width: '100%',
            height: 44,
            padding: '8px 12px',
            borderRadius: 10,
            border: `1.5px solid ${Colors.border}`,
            backgroundColor: Colors.surfaceAlt,
            color: Colors.text,
            fontSize: '15px',
            fontFamily: 'inherit',
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />
      </View>
    );
  }

  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={styles.fieldInput}
        value={value}
        onChangeText={onChange}
        placeholder="YYYY-MM-DDTHH:mm"
        placeholderTextColor={Colors.textLight}
      />
    </View>
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
  header: { padding: Spacing.lg, paddingBottom: Spacing.sm, backgroundColor: Colors.surface },
  pageTitle: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.text, marginBottom: 12 },
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
});
