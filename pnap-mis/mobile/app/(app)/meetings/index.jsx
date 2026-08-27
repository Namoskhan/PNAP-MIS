import { useEffect, useMemo, useRef, useState } from 'react';
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
import { Link } from 'expo-router';
import { Picker } from '@react-native-picker/picker';
import { useAuth } from '../../../src/context/AuthContext';
import { useUnit } from '../../../src/context/UnitContext';
import { api, errorMessage } from '../../../src/api/client';
import { canManageMeetings, isPureMember } from '../../../src/utils/permissions';
import { useToast } from '../../../src/components/Toast';
import { Storage } from '../../../src/utils/storage';
import Card from '../../../src/components/Card';
import Badge from '../../../src/components/Badge';
import EmptyState from '../../../src/components/EmptyState';
import DateTimePicker from '../../../src/components/DateTimePicker';
import * as Location from 'expo-location';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Colors, FontSize, Spacing, Radius } from '../../../src/constants/colors';
import { shortDate, MEETING_TYPE_LABEL } from '../../../src/utils/formatters';

const EMPTY_FORM = {
  typeCode: 'EXC',
  title: '',
  description: '',
  venue: '',
  startAt: '',
  endAt: '',
  agenda: '',
  chairpersonId: '',
  gpsLat: '',
  gpsLng: '',
};

export default function MeetingsScreen() {
  const { user } = useAuth();
  const { ctx } = useUnit();
  const toast = useToast();
  const canManage = canManageMeetings(user);
  const [body, setBody] = useState('ALL');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [eventTypes, setEventTypes] = useState([]);
  const [chairpersons, setChairpersons] = useState([]);
  const [loadingChairpersons, setLoadingChairpersons] = useState(false);

  useEffect(() => {
    if (!showForm || !ctx) return;
    let active = true;
    setLoadingChairpersons(true);
    const targetBody = (form.typeCode === 'GBM' || form.typeCode === 'GENERAL_BODY') ? 'GENERAL_BODY' : 'EXECUTIVE';
    api.get('/meetings/eligible-attendees', {
      params: {
        unitLevel: ctx.unitLevel,
        unitId: ctx.unitId,
        body: targetBody,
        typeCode: form.typeCode,
      },
    })
      .then((r) => { if (active) setChairpersons(r.data.data || []); })
      .catch(() => {})
      .finally(() => { if (active) setLoadingChairpersons(false); });
    return () => { active = false; };
  }, [showForm, ctx, form.typeCode]);

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
    } catch (e) {
      toast.error('Failed to get location');
    }
  }

  async function handleExport(type) {
    if (!ctx) return;
    try {
      toast.show('Generating export...', 'info');
      const params = new URLSearchParams({ unitLevel: ctx.unitLevel, unitId: ctx.unitId });
      if (body === 'EXECUTIVE') {
        params.set('body', 'EXECUTIVE');
      } else if (body === 'GENERAL_BODY') {
        params.set('body', 'GENERAL_BODY');
      } else {
        params.set('body', 'NON_COMMITTEE');
      }
      const baseURL = api.defaults.baseURL || process.env.EXPO_PUBLIC_API_BASE_URL || 'http://localhost:5000/api';
      const normalizedBaseURL = baseURL.replace(/\/$/, '');
      const url = `${normalizedBaseURL}/exports/unit/meetings/${type}?${params.toString()}`;
      const ext = type === 'pdf' ? 'pdf' : 'xlsx';
      const filename = `${ctx.unitName || 'Meetings'}-${body === 'EXECUTIVE' ? 'executive-' : (body === 'GENERAL_BODY' ? 'general-body-' : '')}meetings.${ext}`;

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

      // Native device (iOS / Android)
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
    }
  }

  useEffect(() => {
    api.get('/events/types', { params: { category: 'MEETING' } })
      .then(r => setEventTypes(r.data.data || []))
      .catch(() => {});
  }, []);

  async function load(silent = false) {
    if (!ctx?.unitId) { setLoading(false); return; }
    if (!silent) setLoading(true);
    try {
      const params = {
        unitLevel: ctx.unitLevel,
        unitId: ctx.unitId,
        scope: isPureMember(user) ? 'chain' : undefined,
        body: 'NON_COMMITTEE',
      };
      const res = await api.get('/meetings', { params });
      setItems(res.data.data || []);
    } catch { /* ignore */ } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => { load(); }, [ctx?.unitLevel, ctx?.unitId]);

  function onRefresh() { setRefreshing(true); load(true); }

  const nonCommitteeItems = useMemo(() => {
    return (items || []).filter((m) =>
      m.body !== 'COMMITTEE' && m.body !== 'JIRGA' && m.body !== 'CONGRESS' &&
      m.typeCode !== 'CMP' && m.type !== 'CMP' && m.type !== 'COMMITTEE' && m.type !== 'Committee Meeting' &&
      m.typeCode !== 'JRG' && m.typeCode !== 'JIRGA' && m.type !== 'JRG' && m.type !== 'JIRGA' &&
      m.typeCode !== 'CNG' && m.typeCode !== 'CONGRESS' && m.type !== 'CNG' && m.type !== 'CONGRESS'
    );
  }, [items]);

  const execItems = useMemo(() => {
    return nonCommitteeItems.filter((m) => m.body === 'EXECUTIVE' || (!m.body && m.typeCode !== 'GBM' && m.type !== 'GBM' && m.type !== 'General Body Meeting'));
  }, [nonCommitteeItems]);

  const gbmItems = useMemo(() => {
    return nonCommitteeItems.filter((m) => m.body === 'GENERAL_BODY' || m.typeCode === 'GBM' || m.type === 'GBM' || m.type === 'General Body Meeting');
  }, [nonCommitteeItems]);

  const displayedItems = useMemo(() => {
    if (body === 'EXECUTIVE') return execItems;
    if (body === 'GENERAL_BODY') return gbmItems;
    return nonCommitteeItems;
  }, [body, execItems, gbmItems, nonCommitteeItems]);

  const bodyTabs = useMemo(() => [
    { label: `All (${nonCommitteeItems.length})`, value: 'ALL' },
    { label: `Executive (${execItems.length})`, value: 'EXECUTIVE' },
    { label: `General Body (${gbmItems.length})`, value: 'GENERAL_BODY' },
  ], [nonCommitteeItems.length, execItems.length, gbmItems.length]);

  async function handleCreate() {
    if (!form.title.trim() || !form.startAt) {
      toast.error('Title and start date are required.');
      return;
    }
    setSaving(true);
    try {
      const targetBody = (form.typeCode === 'GBM' || form.typeCode === 'GENERAL_BODY') ? 'GENERAL_BODY' : 'EXECUTIVE';
      const payload = {
        ...form,
        body: targetBody,
        unitLevel: ctx.unitLevel,
        unitId: ctx.unitId,
      };
      if (payload.gpsLat !== '' && payload.gpsLat !== null && payload.gpsLat !== undefined) {
        payload.gpsLat = Number(payload.gpsLat);
      } else {
        delete payload.gpsLat;
      }
      if (payload.gpsLng !== '' && payload.gpsLng !== null && payload.gpsLng !== undefined) {
        payload.gpsLng = Number(payload.gpsLng);
      } else {
        delete payload.gpsLng;
      }
      if (!payload.chairpersonId) delete payload.chairpersonId;
      if (!payload.agenda) delete payload.agenda;
      if (!payload.description) delete payload.description;
      if (!payload.endAt) delete payload.endAt;

      await api.post('/meetings', payload);
      toast.success('Meeting created.');
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
    return (
      <Link href={`/meetings/${m._id}`} asChild>
        <TouchableOpacity>
          <Card style={styles.card}>
            <View style={styles.row}>
              <View style={styles.dateBox}>
                <Text style={styles.dateDay}>{new Date(m.startAt).getDate()}</Text>
                <Text style={styles.dateMon}>{new Date(m.startAt).toLocaleString('default', { month: 'short' })}</Text>
              </View>
              <View style={styles.info}>
                <Text style={styles.title} numberOfLines={1}>{m.title || MEETING_TYPE_LABEL[m.typeCode] || m.typeCode}</Text>
                <Text style={styles.meta} numberOfLines={1}>{m.venue || 'No venue'} · {shortDate(m.startAt)}</Text>
              </View>
              <Badge label={MEETING_TYPE_LABEL[m.typeCode] || m.typeCode} color={Colors.primary} bg="#eff6ff" />
            </View>
          </Card>
        </TouchableOpacity>
      </Link>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      {/* Body Toggle */}
      <View style={styles.tabRow}>
        {bodyTabs.map((t) => (
          <TouchableOpacity
            key={t.value}
            style={[styles.tab, body === t.value && styles.tabActive]}
            onPress={() => setBody(t.value)}
          >
            <Text style={[styles.tabText, body === t.value && styles.tabTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      
      <View style={styles.exportRow}>
        <TouchableOpacity style={styles.exportBtn} onPress={() => handleExport('pdf')} disabled={displayedItems.length === 0}>
          <Text style={styles.exportBtnText}>📄 PDF</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.exportBtn} onPress={() => handleExport('xlsx')} disabled={displayedItems.length === 0}>
          <Text style={styles.exportBtnText}>📊 Excel</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={displayedItems}
        renderItem={renderItem}
        keyExtractor={(m) => m._id}
        contentContainerStyle={styles.list}
        onRefresh={onRefresh}
        refreshing={refreshing}
        ListEmptyComponent={!loading && <EmptyState icon="📅" title="No meetings" subtitle="No meetings recorded yet." />}
        ListFooterComponent={loading && !refreshing ? <ActivityIndicator style={{ padding: 16 }} color={Colors.primary} /> : null}
      />

      {/* FAB — create meeting */}
      {canManage && ctx?.unitId && (
        <TouchableOpacity style={styles.fab} onPress={() => setShowForm(true)}>
          <Text style={styles.fabText}>+</Text>
        </TouchableOpacity>
      )}

      {/* Create Meeting Modal */}
      <Modal visible={showForm} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowForm(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setShowForm(false)}>
                <Text style={styles.modalCancel}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>New Meeting</Text>
              <TouchableOpacity onPress={handleCreate} disabled={saving}>
                {saving ? <ActivityIndicator color={Colors.primary} /> : <Text style={styles.modalSave}>Save</Text>}
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.formContent} keyboardShouldPersistTaps="handled">
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Meeting Type *</Text>
                <View style={styles.pickerWrap}>
                  <Picker
                    selectedValue={form.typeCode}
                    onValueChange={(v) => setForm({ ...form, typeCode: v })}
                    style={styles.picker}
                  >
                    {eventTypes.filter(t => ['EXC', 'EXECUTIVE', 'GBM', 'GENERAL_BODY'].includes(String(t.code).toUpperCase())).map(t => (
                      <Picker.Item key={t.code} label={t.label} value={t.code} />
                    ))}
                    {eventTypes.length === 0 && <Picker.Item label="Executive Meeting" value="EXC" />}
                  </Picker>
                </View>
              </View>
              <FormField label="Title *" value={form.title} onChangeText={(v) => setForm((f) => ({ ...f, title: v }))} />
              
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Chairperson</Text>
                <View style={styles.pickerWrap}>
                  <Picker
                    selectedValue={form.chairpersonId}
                    onValueChange={(v) => setForm({ ...form, chairpersonId: v })}
                    style={styles.picker}
                  >
                    <Picker.Item label="— Select Chairperson —" value="" />
                    {chairpersons.map(c => {
                      const detail = c.roleText ? ` · ${c.roleText}` : (c.memberId ? ` · ${c.memberId}` : '');
                      return (
                        <Picker.Item
                          key={c._id || c.M_ID}
                          label={`${c.fullName || 'Unknown'}${detail}`}
                          value={c._id || c.M_ID}
                        />
                      );
                    })}
                  </Picker>
                </View>
                {loadingChairpersons && <ActivityIndicator style={{ marginTop: 4 }} />}
              </View>

              <FormField label="Venue *" value={form.venue} onChangeText={(v) => setForm((f) => ({ ...f, venue: v }))} />
              
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Venue GPS (optional)</Text>
                <View style={styles.gpsRow}>
                  <TextInput
                    style={[styles.fieldInput, styles.gpsInput]}
                    placeholder="Latitude"
                    placeholderTextColor={Colors.textLight}
                    value={form.gpsLat !== null && form.gpsLat !== undefined ? String(form.gpsLat) : ''}
                    onChangeText={(v) => setForm((f) => ({ ...f, gpsLat: v }))}
                    keyboardType="numeric"
                  />
                  <TextInput
                    style={[styles.fieldInput, styles.gpsInput]}
                    placeholder="Longitude"
                    placeholderTextColor={Colors.textLight}
                    value={form.gpsLng !== null && form.gpsLng !== undefined ? String(form.gpsLng) : ''}
                    onChangeText={(v) => setForm((f) => ({ ...f, gpsLng: v }))}
                    keyboardType="numeric"
                  />
                  <TouchableOpacity style={styles.gpsBtnInline} onPress={handleGetLocation}>
                    <Text style={styles.gpsBtnInlineText}>📍 Capture</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <DateTimePicker
                label="Start Date & Time *"
                value={form.startAt}
                mode="datetime"
                onChange={(d) => setForm((f) => ({ ...f, startAt: d }))}
                placeholder="Select start time"
              />
              <DateTimePicker
                label="End Date & Time"
                value={form.endAt}
                mode="datetime"
                onChange={(d) => setForm((f) => ({ ...f, endAt: d }))}
                placeholder="Select end time"
              />
              <FormField label="Agenda" value={form.agenda} onChangeText={(v) => setForm((f) => ({ ...f, agenda: v }))} multiline />
              <FormField label="Description" value={form.description} onChangeText={(v) => setForm((f) => ({ ...f, description: v }))} multiline />
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
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
        autoCapitalize="sentences"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  tabRow: { flexDirection: 'row', backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabActive: { borderBottomWidth: 2, borderBottomColor: Colors.primary },
  tabText: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.textMuted },
  tabTextActive: { color: Colors.primary },
  list: { padding: Spacing.lg },
  card: { marginBottom: Spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  dateBox: { width: 44, alignItems: 'center', backgroundColor: Colors.primaryLight + '15', borderRadius: 10, paddingVertical: 6 },
  dateDay: { fontSize: FontSize.xl, fontWeight: '800', color: Colors.primary, lineHeight: 26 },
  dateMon: { fontSize: FontSize.xs, fontWeight: '600', color: Colors.primaryLight, textTransform: 'uppercase' },
  info: { flex: 1 },
  title: { fontSize: FontSize.base, fontWeight: '600', color: Colors.text, marginBottom: 2 },
  meta: { fontSize: FontSize.xs, color: Colors.textMuted },
  fab: {
    position: 'absolute', bottom: 24, right: 24,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center',
    ...Platform.select({
      web: { boxShadow: '0px 6px 12px rgba(0,0,0,0.4)' },
      default: {
        shadowColor: Colors.primary, shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.4, shadowRadius: 12, elevation: 8,
      },
    }),
  },
  fabText: { color: '#fff', fontSize: 28, fontWeight: '300', lineHeight: 34 },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: Spacing.lg, backgroundColor: Colors.surface,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  modalCancel: { fontSize: FontSize.base, color: Colors.textMuted, fontWeight: '500' },
  modalTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.text },
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
  pickerWrap: { borderWidth: 1.5, borderColor: Colors.border, borderRadius: Radius.md, backgroundColor: Colors.surface, overflow: 'hidden', height: 44, justifyContent: 'center' },
  picker: { width: '100%', height: 44 },
  exportRow: { flexDirection: 'row', paddingHorizontal: Spacing.md, gap: Spacing.sm, marginBottom: Spacing.sm },
  exportBtn: { flex: 1, backgroundColor: Colors.surface, paddingVertical: 8, borderRadius: Radius.sm, alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  exportBtnText: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.text },
  gpsRow: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'center' },
  gpsInput: { flex: 1 },
  gpsBtnInline: { backgroundColor: Colors.primary, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  gpsBtnInlineText: { color: '#fff', fontWeight: '700', fontSize: FontSize.sm },
});
