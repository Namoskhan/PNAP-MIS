import { useEffect, useState } from 'react';
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
import DatePicker from '../../../src/components/DatePicker';
import { Colors, FontSize, Spacing } from '../../../src/constants/colors';
import { shortDate, ACTIVITY_TYPE_LABEL } from '../../../src/utils/formatters';

const TYPE_OPTIONS = ['CAMPAIGN', 'PROTEST', 'JALSA', 'SEMINAR', 'STUDY_CIRCLE', 'TASK', 'COMMUNITY_SERVICE'];

export default function ActivitiesScreen() {
  const { user } = useAuth();
  const { ctx } = useUnit();
  const toast = useToast();
  const canManage = canManageMeetings(user);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ typeCode: 'CAMPAIGN', title: '', venue: '', startAt: '', endAt: '', description: '' });
  const [saving, setSaving] = useState(false);

  async function load(silent = false) {
    if (!ctx?.unitId) { setLoading(false); return; }
    if (!silent) setLoading(true);
    try {
      const res = await api.get('/activities', {
        params: { unitLevel: ctx.unitLevel, unitId: ctx.unitId },
      });
      setItems(res.data.data || []);
    } catch { /* ignore */ } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => { load(); }, [ctx?.unitId]);
  function onRefresh() { setRefreshing(true); load(true); }

  async function handleCreate() {
    if (!form.title.trim() || !form.startAt) { toast.error('Title and start date are required.'); return; }
    setSaving(true);
    try {
      await api.post('/activities', { ...form, unitLevel: ctx.unitLevel, unitId: ctx.unitId });
      toast.success('Activity created.');
      setShowForm(false);
      setForm({ typeCode: 'CAMPAIGN', title: '', venue: '', startAt: '', endAt: '', description: '' });
      load(true);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  const TYPE_COLORS = {
    CAMPAIGN: Colors.primary,
    PROTEST: Colors.error,
    JALSA: Colors.warning,
    SEMINAR: Colors.success,
    STUDY_CIRCLE: Colors.info,
    TASK: Colors.textMuted,
    COMMUNITY_SERVICE: '#7c3aed',
  };

  function renderItem({ item: a }) {
    const color = TYPE_COLORS[a.typeCode] || Colors.primary;
    return (
      <Link href={`/activities/${a._id}`} asChild>
        <TouchableOpacity>
          <Card style={styles.card}>
            <View style={styles.row}>
              <View style={[styles.typeBar, { backgroundColor: color }]} />
              <View style={styles.info}>
                <Text style={styles.title} numberOfLines={1}>{a.title || ACTIVITY_TYPE_LABEL[a.typeCode] || a.typeCode}</Text>
                <Text style={styles.meta}>{shortDate(a.startAt)} · {a.venue || '—'}</Text>
              </View>
              <Badge label={ACTIVITY_TYPE_LABEL[a.typeCode] || a.typeCode} color={color} bg={color + '15'} />
            </View>
          </Card>
        </TouchableOpacity>
      </Link>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <FlatList
        data={items}
        renderItem={renderItem}
        keyExtractor={(a) => a._id}
        contentContainerStyle={styles.list}
        onRefresh={onRefresh}
        refreshing={refreshing}
        ListEmptyComponent={!loading && <EmptyState icon="🚩" title="No activities" subtitle="No activities recorded yet." />}
        ListFooterComponent={loading && !refreshing ? <ActivityIndicator style={{ padding: 16 }} color={Colors.primary} /> : null}
      />

      {canManage && ctx?.unitId && (
        <TouchableOpacity style={styles.fab} onPress={() => setShowForm(true)}>
          <Text style={styles.fabText}>+</Text>
        </TouchableOpacity>
      )}

      <Modal visible={showForm} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowForm(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setShowForm(false)}><Text style={styles.modalCancel}>Cancel</Text></TouchableOpacity>
              <Text style={styles.modalTitle}>New Activity</Text>
              <TouchableOpacity onPress={handleCreate} disabled={saving}>
                {saving ? <ActivityIndicator color={Colors.primary} /> : <Text style={styles.modalSave}>Save</Text>}
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.formContent} keyboardShouldPersistTaps="handled">
              {/* Type picker */}
              <Text style={styles.fieldLabel}>Type *</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: Spacing.lg }}>
                {TYPE_OPTIONS.map((t) => (
                  <TouchableOpacity
                    key={t}
                    style={[styles.typeChip, form.typeCode === t && styles.typeChipActive]}
                    onPress={() => setForm((f) => ({ ...f, typeCode: t }))}
                  >
                    <Text style={[styles.typeChipText, form.typeCode === t && styles.typeChipTextActive]}>
                      {ACTIVITY_TYPE_LABEL[t] || t}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <FormField label="Title *" value={form.title} onChangeText={(v) => setForm((f) => ({ ...f, title: v }))} />
              <FormField label="Venue" value={form.venue} onChangeText={(v) => setForm((f) => ({ ...f, venue: v }))} />
              <DatePicker
                label="Activity Date *"
                value={form.startAt ? form.startAt.split('T')[0] : ''}
                onChange={(d) => setForm((f) => ({
                  ...f,
                  startAt: `${d}T10:00:00.000Z`,
                  endAt: `${d}T14:00:00.000Z`,
                }))}
                placeholder="Select activity date"
              />
              <FormField label="Description" value={form.description} onChangeText={(v) => setForm((f) => ({ ...f, description: v }))} multiline />
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

function FormField({ label, value, onChangeText, placeholder, multiline }) {
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
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  list: { padding: Spacing.lg },
  card: { marginBottom: Spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  typeBar: { width: 4, height: 44, borderRadius: 2 },
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
  modalCancel: { fontSize: FontSize.base, color: Colors.textMuted },
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
  typeChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 99, borderWidth: 1.5, borderColor: Colors.border, marginRight: 6, backgroundColor: Colors.surface },
  typeChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  typeChipText: { fontSize: FontSize.xs, fontWeight: '600', color: Colors.textMuted },
  typeChipTextActive: { color: '#fff' },
});
