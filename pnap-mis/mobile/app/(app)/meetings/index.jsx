import { useEffect, useRef, useState } from 'react';
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
import { useAuth } from '../../../src/context/AuthContext';
import { useUnit } from '../../../src/context/UnitContext';
import { api, errorMessage } from '../../../src/api/client';
import { canManageMeetings } from '../../../src/utils/permissions';
import { useToast } from '../../../src/components/Toast';
import Card from '../../../src/components/Card';
import Badge from '../../../src/components/Badge';
import EmptyState from '../../../src/components/EmptyState';
import { Colors, FontSize, Spacing } from '../../../src/constants/colors';
import { shortDate, MEETING_TYPE_LABEL } from '../../../src/utils/formatters';

const BODY_TABS = [
  { label: 'Executive', value: 'EXECUTIVE' },
  { label: 'Committee', value: 'COMMITTEE' },
];

const EMPTY_FORM = {
  typeCode: 'EXC',
  title: '',
  description: '',
  venue: '',
  startAt: '',
  endAt: '',
  agenda: '',
};

export default function MeetingsScreen() {
  const { user } = useAuth();
  const { ctx } = useUnit();
  const toast = useToast();
  const canManage = canManageMeetings(user);
  const [body, setBody] = useState('EXECUTIVE');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  async function load(silent = false) {
    if (!ctx?.unitId) { setLoading(false); return; }
    if (!silent) setLoading(true);
    try {
      const res = await api.get('/meetings', {
        params: { unitLevel: ctx.unitLevel, unitId: ctx.unitId, body },
      });
      setItems(res.data.data || []);
    } catch { /* ignore */ } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => { load(); }, [ctx?.unitId, body]);

  function onRefresh() { setRefreshing(true); load(true); }

  async function handleCreate() {
    if (!form.title.trim() || !form.startAt) {
      toast.error('Title and start date are required.');
      return;
    }
    setSaving(true);
    try {
      await api.post('/meetings', {
        ...form,
        body,
        unitLevel: ctx.unitLevel,
        unitId: ctx.unitId,
      });
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
        {BODY_TABS.map((t) => (
          <TouchableOpacity
            key={t.value}
            style={[styles.tab, body === t.value && styles.tabActive]}
            onPress={() => setBody(t.value)}
          >
            <Text style={[styles.tabText, body === t.value && styles.tabTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={items}
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
              <FormField label="Title *" value={form.title} onChangeText={(v) => setForm((f) => ({ ...f, title: v }))} />
              <FormField label="Venue" value={form.venue} onChangeText={(v) => setForm((f) => ({ ...f, venue: v }))} />
              <FormField label="Start Date/Time (ISO)" value={form.startAt} onChangeText={(v) => setForm((f) => ({ ...f, startAt: v }))} placeholder="2026-08-25T10:00:00" keyboardType="default" />
              <FormField label="End Date/Time (ISO)" value={form.endAt} onChangeText={(v) => setForm((f) => ({ ...f, endAt: v }))} placeholder="2026-08-25T12:00:00" />
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
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4, shadowRadius: 12, elevation: 8,
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
});
