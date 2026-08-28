import { useEffect, useState, useMemo } from 'react';
import {
  ActivityIndicator,
  FlatList,
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
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Picker } from '@react-native-picker/picker';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { useAuth } from '../../../src/context/AuthContext';
import { useUnit } from '../../../src/context/UnitContext';
import { api, errorMessage } from '../../../src/api/client';
import { canManageMeetings, isPureMember } from '../../../src/utils/permissions';
import { useToast } from '../../../src/components/Toast';
import { Storage } from '../../../src/utils/storage';
import Badge from '../../../src/components/Badge';
import Card from '../../../src/components/Card';
import EmptyState from '../../../src/components/EmptyState';
import DateTimePicker from '../../../src/components/DateTimePicker';
import { Colors, FontSize, Spacing, Radius } from '../../../src/constants/colors';
import { shortDate, MEETING_TYPE_LABEL } from '../../../src/utils/formatters';
import useEventTypes from '../../../src/hooks/useEventTypes';

const DEFAULT_TYPE_CODE = 'EXC';

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

export default function MeetingsScreen() {
  const { user } = useAuth();
  const { ctx, provinces } = useUnit();
  const router = useRouter();
  const toast = useToast();
  const params = useLocalSearchParams();

  const queryBody = params.body || '';
  const isCongressView = queryBody === 'CONGRESS';
  const isJirgaView = queryBody === 'JIRGA';
  const isCommitteeView = queryBody === 'COMMITTEE';
  const targetBody = isCongressView ? 'CONGRESS' : (isJirgaView ? 'JIRGA' : (isCommitteeView ? 'COMMITTEE' : (params.body || 'NON_COMMITTEE')));

  const activeLevel = params.unitLevel || ctx?.unitLevel || 'BASIC_UNIT';
  const activeUnitId = params.unitId || ctx?.unitId || '';

  const canManage = canManageMeetings(user);

  const [bodyTab, setBodyTab] = useState('ALL');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(null);

  // Eligible attendees for chairperson selector
  const [chairpersonOptions, setChairpersonOptions] = useState([]);
  const [loadingChairpersons, setLoadingChairpersons] = useState(false);

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

  useEffect(() => {
    if (!showForm || !ctx) return;
    let active = true;
    setLoadingChairpersons(true);
    const bodyForAttendees = isCongressView ? 'CONGRESS'
      : (isJirgaView ? 'JIRGA'
      : (isCommitteeView ? 'COMMITTEE'
      : ((form.typeCode === 'GBM' || form.typeCode === 'GENERAL_BODY') ? 'GENERAL_BODY' : 'EXECUTIVE')));

    api.get('/meetings/eligible-attendees', {
      params: {
        unitLevel: activeLevel,
        unitId: activeUnitId,
        body: bodyForAttendees,
        typeCode: form.typeCode,
      },
    })
      .then((r) => { if (active) setChairpersonOptions(r.data.data || []); })
      .catch(() => {})
      .finally(() => { if (active) setLoadingChairpersons(false); });
    return () => { active = false; };
  }, [showForm, activeLevel, activeUnitId, form.typeCode, isCongressView, isJirgaView, isCommitteeView]);

  async function load(silent = false) {
    if (!silent) setLoading(true);
    try {
      const qParams = {
        unitLevel: activeLevel,
        unitId: activeUnitId,
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
      if (isPureMember(user)) {
        qParams.scope = 'chain';
      }

      const res = await api.get('/meetings', { params: qParams });
      setItems(res.data.data || []);
    } catch {
      // fail silently
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    load();
  }, [activeLevel, activeUnitId, isCongressView, isJirgaView, isCommitteeView]);

  function onRefresh() {
    setRefreshing(true);
    load(true);
  }

  // Stream categorization
  const nonCommitteeItems = useMemo(() => {
    if (isCongressView || isJirgaView || isCommitteeView) return items;
    return (items || []).filter((m) =>
      m.body !== 'COMMITTEE' && m.body !== 'JIRGA' && m.body !== 'CONGRESS' &&
      m.typeCode !== 'CMP' && m.type !== 'CMP' && m.type !== 'COMMITTEE' && m.type !== 'Committee Meeting' &&
      m.typeCode !== 'JRG' && m.typeCode !== 'JIRGA' && m.type !== 'JRG' && m.type !== 'JIRGA' &&
      m.typeCode !== 'CNG' && m.typeCode !== 'CONGRESS' && m.type !== 'CNG' && m.type !== 'CONGRESS'
    );
  }, [items, isCongressView, isJirgaView, isCommitteeView]);

  const execItems = useMemo(() => {
    return nonCommitteeItems.filter((m) => m.body === 'EXECUTIVE' || (!m.body && m.typeCode !== 'GBM' && m.type !== 'GBM' && m.type !== 'General Body Meeting'));
  }, [nonCommitteeItems]);

  const gbmItems = useMemo(() => {
    return nonCommitteeItems.filter((m) => m.body === 'GENERAL_BODY' || m.typeCode === 'GBM' || m.type === 'GBM' || m.type === 'General Body Meeting');
  }, [nonCommitteeItems]);

  const displayedItems = useMemo(() => {
    if (isCongressView || isJirgaView || isCommitteeView) return items;
    if (bodyTab === 'EXECUTIVE') return execItems;
    if (bodyTab === 'GENERAL_BODY') return gbmItems;
    return nonCommitteeItems;
  }, [bodyTab, execItems, gbmItems, nonCommitteeItems, items, isCongressView, isJirgaView, isCommitteeView]);

  const tabs = useMemo(() => {
    if (isCongressView || isJirgaView || isCommitteeView) return [];
    return [
      { label: `All (${nonCommitteeItems.length})`, value: 'ALL' },
      { label: `Executive (${execItems.length})`, value: 'EXECUTIVE' },
      { label: `General Body (${gbmItems.length})`, value: 'GENERAL_BODY' },
    ];
  }, [nonCommitteeItems.length, execItems.length, gbmItems.length, isCongressView, isJirgaView, isCommitteeView]);

  async function handleGetLocation() {
    try {
      if (Platform.OS === 'web') {
        if (!navigator.geolocation) {
          toast.error('GPS not supported on this browser');
          return;
        }
        toast.show('Requesting location...', 'info');
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const lat = Number(pos.coords.latitude.toFixed(6));
            const lng = Number(pos.coords.longitude.toFixed(6));
            setForm((f) => ({ ...f, gpsLat: lat, gpsLng: lng }));
            toast.success(`Location captured: ${lat}, ${lng}`);
          },
          (err) => {
            toast.error(err.message || 'Location permission denied');
          },
          { enableHighAccuracy: true, timeout: 10000 }
        );
        return;
      }
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        toast.error('Permission to access location was denied');
        return;
      }
      toast.show('Requesting location...', 'info');
      const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const lat = Number(location.coords.latitude.toFixed(6));
      const lng = Number(location.coords.longitude.toFixed(6));
      setForm(f => ({ ...f, gpsLat: lat, gpsLng: lng }));
      toast.success(`Location captured: ${lat}, ${lng}`);
    } catch {
      toast.error('Failed to get location');
    }
  }

  async function handleExport(type) {
    if (!ctx && !params.unitId) return;
    if (exporting) return;
    setExporting(type);
    try {
      toast.show('Generating export...', 'info');
      const qParams = new URLSearchParams({
        unitLevel: activeLevel,
        unitId: activeUnitId,
      });
      if (isCongressView) {
        qParams.set('body', 'CONGRESS');
      } else if (isJirgaView) {
        qParams.set('body', 'JIRGA');
      } else if (isCommitteeView) {
        qParams.set('body', 'COMMITTEE');
      } else if (bodyTab === 'EXECUTIVE') {
        qParams.set('body', 'EXECUTIVE');
      } else if (bodyTab === 'GENERAL_BODY') {
        qParams.set('body', 'GENERAL_BODY');
      } else {
        qParams.set('body', 'NON_COMMITTEE');
      }

      const baseURL = api.defaults.baseURL || process.env.EXPO_PUBLIC_API_BASE_URL || 'http://localhost:5000/api';
      const normalizedBaseURL = baseURL.replace(/\/$/, '');
      const url = `${normalizedBaseURL}/exports/unit/meetings/${type}?${qParams.toString()}`;
      const ext = type === 'pdf' ? 'pdf' : 'xlsx';
      const filename = `${ctx?.unitName || 'meetings'}-${bodyTab.toLowerCase()}.${ext}`;

      const token = await Storage.getItem('pnap_token');
      const authHeader = token ? `Bearer ${token}` : '';

      if (Platform.OS === 'web') {
        const res = await fetch(url, {
          headers: authHeader ? { Authorization: authHeader } : {},
        });
        if (!res.ok) throw new Error(`Export failed (${res.status})`);
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

      const fileUri = `${FileSystem.documentDirectory}${filename}`;
      const downloadResult = await FileSystem.downloadAsync(url, fileUri, {
        headers: authHeader ? { Authorization: authHeader } : {},
      });

      if (downloadResult.status === 200) {
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(downloadResult.uri, {
            mimeType: type === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            dialogTitle: `Share ${type.toUpperCase()} Export`,
            UTI: type === 'pdf' ? 'com.adobe.pdf' : 'com.microsoft.excel.xls',
          });
        } else {
          toast.success(`Saved to ${downloadResult.uri}`);
        }
      } else {
        toast.error('Export failed on server');
      }
    } catch (e) {
      toast.error(e?.message || 'Export failed');
    } finally {
      setExporting(null);
    }
  }

  async function handleCreate() {
    setFormError('');
    if (!form.title.trim() || !form.startAt) {
      const msg = 'Title and start date are required.';
      setFormError(msg);
      toast.error(msg);
      return;
    }
    setSaving(true);
    try {
      const targetBodyForCreate = isCongressView ? 'CONGRESS'
        : (isJirgaView ? 'JIRGA'
        : (isCommitteeView ? 'COMMITTEE'
        : ((form.typeCode === 'GBM' || form.typeCode === 'GENERAL_BODY') ? 'GENERAL_BODY' : 'EXECUTIVE')));

      const bodyPayload = {
        unitLevel: activeLevel,
        unitId: activeUnitId,
        typeCode: form.typeCode,
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        venue: form.venue.trim() || undefined,
        startAt: form.startAt,
        endAt: form.endAt || undefined,
        chairpersonId: form.chairpersonId || undefined,
        agenda: form.agenda.trim() || undefined,
        body: targetBodyForCreate,
      };
      if (form.gpsLat && form.gpsLng) {
        bodyPayload.gps = { lat: Number(form.gpsLat), lng: Number(form.gpsLng) };
      }
      await api.post('/meetings', bodyPayload);
      toast.success('Meeting scheduled successfully.');
      setShowForm(false);
      setForm(EMPTY_FORM);
      setFormError('');
      load();
    } catch (e) {
      const msg = errorMessage(e);
      setFormError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  function renderMeetingItem({ item }) {
    const isPresent = item.attendance?.some((a) => String(a.memberId?._id || a.memberId) === String(user?.memberId) && a.status === 'PRESENT');
    const isFinalized = item.state === 'FINALIZED';
    const isCancelled = item.state === 'CANCELLED';
    const statusColor = isCancelled ? Colors.error : (isFinalized ? Colors.success : Colors.warning);
    const statusBg = isCancelled ? Colors.errorBg : (isFinalized ? Colors.successBg : Colors.warningBg);

    const isCng = item.body === 'CONGRESS' || item.typeCode === 'CNG' || item.typeCode === 'CONGRESS';
    const isJrg = !isCng && (item.body === 'JIRGA' || item.typeCode === 'JRG' || item.typeCode === 'JIRGA');
    const isCm = !isCng && !isJrg && (item.body === 'COMMITTEE' || item.typeCode === 'CMP');
    const isGbm = !isCng && !isJrg && (item.body === 'GENERAL_BODY' || item.typeCode === 'GBM');

    const streamLabel = isCng ? 'National Congress'
      : (isJirgaView ? 'Jirga'
      : (isCommitteeView ? 'Committee'
      : (isGbm ? 'General Body' : 'Executive')));

    return (
      <TouchableOpacity onPress={() => router.push(`/meetings/${item._id}`)} activeOpacity={0.7}>
        <Card style={styles.card}>
          <View style={styles.cardTop}>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>{item.title || MEETING_TYPE_LABEL[item.typeCode] || item.typeCode}</Text>
              <Text style={styles.cardSubtitle}>
                {streamLabel} · {shortDate(item.startAt)} {item.venue ? `· ${item.venue}` : ''}
              </Text>
            </View>
            <Badge label={item.state} color={statusColor} bg={statusBg} />
          </View>

          {item.description ? (
            <Text style={styles.cardDesc} numberOfLines={2}>{item.description}</Text>
          ) : null}

          <View style={styles.cardFooter}>
            <View style={styles.metaRow}>
              <Ionicons name="people-outline" size={14} color={Colors.textMuted} />
              <Text style={styles.metaText}>{item.attendance?.length || 0} attendees</Text>
            </View>
            <View style={styles.metaRow}>
              <Ionicons name="images-outline" size={14} color={Colors.textMuted} />
              <Text style={styles.metaText}>{item.photos?.length || 0} photos</Text>
            </View>
            {item.state === 'SCHEDULED' && isPresent && (
              <View style={styles.myStatusBadge}>
                <Text style={styles.myStatusText}>Marked Present</Text>
              </View>
            )}
          </View>
        </Card>
      </TouchableOpacity>
    );
  }

  const pageTitle = isCongressView ? 'National Congress Meetings'
    : (isJirgaView ? 'Jirga Meetings'
    : (isCommitteeView ? 'Committee Meetings'
    : 'Meetings'));

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>{pageTitle}</Text>
          <Text style={styles.headerSubtitle}>
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
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => {
                setForm({
                  ...EMPTY_FORM,
                  typeCode: isCongressView ? 'CNG' : (isJirgaView ? 'JRG' : (isCommitteeView ? 'CMP' : DEFAULT_TYPE_CODE)),
                });
                setFormError('');
                setShowForm(true);
              }}
            >
              <Ionicons name="add" size={18} color="#fff" />
              <Text style={styles.primaryBtnText}>Schedule</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Body tabs if multiple streams */}
      {tabs.length > 0 && (
        <View style={styles.tabBar}>
          {tabs.map((t) => (
            <TouchableOpacity
              key={t.value}
              style={[styles.tabBtn, bodyTab === t.value && styles.tabBtnActive]}
              onPress={() => setBodyTab(t.value)}
            >
              <Text style={[styles.tabBtnText, bodyTab === t.value && styles.tabBtnTextActive]}>
                {t.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* List */}
      <FlatList
        data={displayedItems}
        keyExtractor={(item) => item._id}
        renderItem={renderMeetingItem}
        contentContainerStyle={styles.list}
        refreshing={refreshing}
        onRefresh={onRefresh}
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator style={{ marginTop: 40 }} color={Colors.primary} />
          ) : (
            <EmptyState
              icon="calendar-outline"
              title="No meetings found"
              subtitle={canManage ? 'Tap "Schedule" above to organize a new meeting.' : 'No meetings recorded for this unit.'}
            />
          )
        }
      />

      {/* Create / Schedule Modal */}
      <Modal visible={showForm} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowForm(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setShowForm(false)}>
                <Text style={styles.modalCancel}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>Schedule Meeting</Text>
              <TouchableOpacity onPress={handleCreate} disabled={saving}>
                {saving ? <ActivityIndicator color={Colors.primary} /> : <Text style={styles.modalSave}>Save</Text>}
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.formContent} keyboardShouldPersistTaps="handled">
              {formError ? (
                <View style={{ backgroundColor: '#fee2e2', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#fca5a5', marginBottom: 16 }}>
                  <Text style={{ color: '#b91c1c', fontSize: 13, fontWeight: '700' }}>⚠️ Could not schedule meeting:</Text>
                  <Text style={{ color: '#b91c1c', fontSize: 12, marginTop: 4 }}>{formError}</Text>
                </View>
              ) : null}

              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Meeting Type</Text>
                <View style={styles.pickerWrap}>
                  <Picker
                    selectedValue={form.typeCode}
                    onValueChange={(val) => setForm({ ...form, typeCode: val })}
                    style={styles.picker}
                  >
                    {availableTypes.map((t) => (
                      <Picker.Item key={t.code} label={t.label} value={t.code} />
                    ))}
                  </Picker>
                </View>
              </View>

              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Title *</Text>
                <TextInput
                  style={styles.fieldInput}
                  placeholder="e.g. Monthly Executive Session"
                  placeholderTextColor={Colors.textLight}
                  value={form.title}
                  onChangeText={(v) => setForm({ ...form, title: v })}
                />
              </View>

              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Start Time *</Text>
                <DateTimePicker
                  value={form.startAt}
                  onChange={(v) => setForm({ ...form, startAt: v })}
                  placeholder="Select start date & time"
                  mode="datetime"
                />
              </View>

              <View style={styles.field}>
                <Text style={styles.fieldLabel}>End Time (optional)</Text>
                <DateTimePicker
                  value={form.endAt}
                  onChange={(v) => setForm({ ...form, endAt: v })}
                  placeholder="Select end date & time"
                  mode="datetime"
                />
              </View>

              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Venue</Text>
                <TextInput
                  style={styles.fieldInput}
                  placeholder="e.g. Central Secretariat / Conference Room"
                  placeholderTextColor={Colors.textLight}
                  value={form.venue}
                  onChangeText={(v) => setForm({ ...form, venue: v })}
                />
              </View>

              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Chairperson</Text>
                <View style={styles.pickerWrap}>
                  <Picker
                    selectedValue={form.chairpersonId}
                    onValueChange={(val) => setForm({ ...form, chairpersonId: val })}
                    style={styles.picker}
                  >
                    <Picker.Item label="— Pick a chairperson —" value="" />
                    {loadingChairpersons && <Picker.Item label="Loading eligible attendees..." value="" enabled={false} />}
                    {!loadingChairpersons && chairpersonOptions.map((m) => (
                      <Picker.Item
                        key={m._id}
                        label={`${m.fullName}${m.roleText ? ` · ${m.roleText}` : (m.memberId ? ` · ${m.memberId}` : '')}`}
                        value={m._id}
                      />
                    ))}
                  </Picker>
                </View>
              </View>

              {/* Venue GPS */}
              <View style={styles.field}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <Text style={styles.fieldLabel}>Venue GPS (Latitude & Longitude)</Text>
                  <TouchableOpacity onPress={handleGetLocation} style={styles.captureGpsBtn}>
                    <Text style={styles.captureGpsText}>📍 Capture GPS</Text>
                  </TouchableOpacity>
                </View>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TextInput
                    style={[styles.fieldInput, { flex: 1 }]}
                    placeholder="Latitude (e.g. 34.0151)"
                    placeholderTextColor={Colors.textLight}
                    value={form.gpsLat ? String(form.gpsLat) : ''}
                    onChangeText={(v) => setForm({ ...form, gpsLat: v })}
                    keyboardType="numeric"
                  />
                  <TextInput
                    style={[styles.fieldInput, { flex: 1 }]}
                    placeholder="Longitude (e.g. 71.5249)"
                    placeholderTextColor={Colors.textLight}
                    value={form.gpsLng ? String(form.gpsLng) : ''}
                    onChangeText={(v) => setForm({ ...form, gpsLng: v })}
                    keyboardType="numeric"
                  />
                </View>
              </View>

              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Agenda (optional)</Text>
                <TextInput
                  style={[styles.fieldInput, styles.fieldMultiline]}
                  placeholder="Key topics to discuss..."
                  placeholderTextColor={Colors.textLight}
                  value={form.agenda}
                  onChangeText={(v) => setForm({ ...form, agenda: v })}
                  multiline
                />
              </View>

              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Description (optional)</Text>
                <TextInput
                  style={[styles.fieldInput, styles.fieldMultiline]}
                  placeholder="Additional context or notes..."
                  placeholderTextColor={Colors.textLight}
                  value={form.description}
                  onChangeText={(v) => setForm({ ...form, description: v })}
                  multiline
                />
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: { fontSize: FontSize.lg, fontWeight: '800', color: Colors.text },
  headerSubtitle: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  headerSub: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
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
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 3,
    elevation: 2,
  },
  primaryBtnText: { fontSize: FontSize.xs, fontWeight: '700', color: '#fff' },
  exportBtn: {
    backgroundColor: Colors.surfaceAlt,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  exportBtnText: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.text },
  createBtn: {
    backgroundColor: Colors.primary,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: Radius.sm,
    flexDirection: 'row',
    alignItems: 'center',
  },
  createBtnText: { fontSize: FontSize.xs, fontWeight: '700', color: '#fff' },

  // Tabs
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 8,
  },
  tabsRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 8,
  },
  tabBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceAlt,
  },
  tabBtnActive: { backgroundColor: Colors.primary },
  tabBtnText: { fontSize: FontSize.xs, fontWeight: '600', color: Colors.textMuted },
  tabBtnTextActive: { color: '#fff', fontWeight: '700' },

  // List
  list: { padding: Spacing.lg, paddingBottom: 40 },
  card: { marginBottom: Spacing.md, padding: Spacing.md },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  cardTitle: { fontSize: FontSize.base, fontWeight: '700', color: Colors.text, marginBottom: 2 },
  cardSubtitle: { fontSize: FontSize.xs, color: Colors.textMuted },
  cardDesc: { fontSize: FontSize.xs, color: Colors.text, marginTop: 6, lineHeight: 16 },
  chairpersonText: { fontSize: FontSize.xs, color: Colors.text, marginTop: 6, fontWeight: '500' },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: FontSize.xs, color: Colors.textMuted },
  myStatusBadge: { backgroundColor: Colors.successBg, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginLeft: 'auto' },
  myStatusText: { fontSize: 10, fontWeight: '700', color: Colors.success },
  footerInfo: { fontSize: FontSize.xs, color: Colors.textMuted },

  // Modal
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: 14,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  modalCancel: { fontSize: FontSize.base, color: Colors.textMuted, fontWeight: '500' },
  modalTitle: { fontSize: FontSize.base, fontWeight: '700', color: Colors.text },
  modalSave: { fontSize: FontSize.base, color: Colors.primary, fontWeight: '700' },
  formContent: { padding: Spacing.lg, paddingBottom: 60 },
  field: { marginBottom: Spacing.lg },
  fieldLabel: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.text, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  fieldInput: {
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    fontSize: FontSize.base,
    color: Colors.text,
    backgroundColor: Colors.surface,
  },
  fieldMultiline: { minHeight: 80, textAlignVertical: 'top' },
  pickerWrap: {
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface,
    overflow: 'hidden',
    height: 48,
    justifyContent: 'center',
  },
  picker: { width: '100%', height: 48 },
  captureGpsBtn: { paddingVertical: 2, paddingHorizontal: 6 },
  captureGpsText: { fontSize: FontSize.xs, color: Colors.primary, fontWeight: '700' },
});
