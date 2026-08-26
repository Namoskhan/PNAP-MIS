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
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';

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
  const params = useLocalSearchParams();
  const queryBody = params.body;
  
  const isCongressView = queryBody === 'CONGRESS';
  const isJirgaView = queryBody === 'JIRGA';
  const isCommitteeView = queryBody === 'COMMITTEE';
  const targetBody = isCongressView ? 'CONGRESS' : (isJirgaView ? 'JIRGA' : (isCommitteeView ? 'COMMITTEE' : 'EXECUTIVE'));

  async function load(silent = false) {
    if (!ctx?.unitId) { setLoading(false); return; }
    if (!silent) setLoading(true);
    try {
      const res = await api.get('/activities', {
        params: { unitLevel: ctx.unitLevel, unitId: ctx.unitId, body: targetBody },
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
      await api.post('/activities', { ...form, unitLevel: ctx.unitLevel, unitId: ctx.unitId, body: targetBody });
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
    const isCng = a.body === 'CONGRESS';
    const isJrg = a.body === 'JIRGA';
    const isCm = a.body === 'COMMITTEE';

    let typeBadgeLabel = isCng ? 'Congress' : (isJrg ? 'Jirga' : (isCm ? 'Committee' : 'Executive'));
    let typeBadgeBg = isCng ? '#e0f2fe' : (isJrg ? '#f3e8ff' : (isCm ? '#e0f2fe' : '#f1f5f9'));
    let typeBadgeColor = isCng ? '#0369a1' : (isJrg ? '#6b21a8' : (isCm ? '#0369a1' : '#475569'));

    return (
      <View style={styles.tr}>
        <View style={[styles.td, { width: 140 }]}>
           <Text style={styles.tdText}>{new Date(a.startAt).toLocaleString()}</Text>
        </View>
        <View style={[styles.td, { width: 160 }]}>
           <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
             <Badge label={typeBadgeLabel} color={typeBadgeColor} bg={typeBadgeBg} />
             <Text style={styles.tdText}>{a.type || ACTIVITY_TYPE_LABEL[a.typeCode] || a.typeCode}</Text>
           </View>
        </View>
        <View style={[styles.td, { width: 180 }]}>
           <Text style={styles.tdText} numberOfLines={2}>{a.title || 'Untitled'}</Text>
        </View>
        <View style={[styles.td, { width: 120 }]}>
           <Text style={styles.tdText} numberOfLines={2}>{a.venue || '—'}</Text>
        </View>
        <View style={[styles.td, { width: 100 }]}>
           <Badge label={a.state || 'DRAFT'} color={a.state === 'COMPLETED' ? '#15803d' : '#b45309'} bg={a.state === 'COMPLETED' ? '#dcfce7' : '#fef3c7'} />
        </View>
        <View style={[styles.td, { width: 80 }]}>
           <Text style={styles.tdText}>{(a.photos || []).length}</Text>
        </View>
      </View>
    );
  }

  const tableHeader = () => (
    <View style={styles.thRow}>
      <Text style={[styles.th, { width: 140 }]}>When</Text>
      <Text style={[styles.th, { width: 160 }]}>Type</Text>
      <Text style={[styles.th, { width: 180 }]}>Title</Text>
      <Text style={[styles.th, { width: 120 }]}>Venue</Text>
      <Text style={[styles.th, { width: 100 }]}>State</Text>
      <Text style={[styles.th, { width: 80 }]}>Photos</Text>
    </View>
  );

  let pageTitle = isCongressView
    ? 'National Congress Activities · PKNAP Central'
    : (isJirgaView
      ? (ctx?.unitLevel === 'CENTRAL' ? 'Qomi Jirga Activities' : `Sobayi Jirga Activities · ${ctx?.unitName}`)
      : (isCommitteeView ? `Committee Activities · ${ctx?.unitName}` : `Executive Activities · ${ctx?.unitName || 'PKNAP Central'}`));

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.pageTitle}>{pageTitle}</Text>
        <View style={styles.actionsRow}>
           <TouchableOpacity style={styles.btnSecondary}>
             <Ionicons name="document-text-outline" size={16} color={Colors.textMuted} />
             <Text style={styles.btnSecondaryText}>Export PDF</Text>
           </TouchableOpacity>
           <TouchableOpacity style={styles.btnSecondary}>
             <Ionicons name="stats-chart-outline" size={16} color={Colors.textMuted} />
             <Text style={styles.btnSecondaryText}>Export Excel</Text>
           </TouchableOpacity>
        </View>
      </View>

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
  header: { padding: Spacing.lg, paddingBottom: 0, backgroundColor: Colors.background },
  pageTitle: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.text, marginBottom: Spacing.md },
  actionsRow: { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap', marginBottom: Spacing.md },
  btnSecondary: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, gap: 6 },
  btnSecondaryText: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.text },
  btnPrimary: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.primary, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, gap: 6 },
  btnPrimaryText: { fontSize: FontSize.sm, fontWeight: '600', color: '#fff' },

  tableWrap: { backgroundColor: Colors.surface, borderRadius: 8, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  thRow: { flexDirection: 'row', backgroundColor: Colors.surfaceAlt, borderBottomWidth: 1, borderBottomColor: Colors.border },
  th: { padding: 12, fontSize: FontSize.sm, fontWeight: '600', color: Colors.text, textAlign: 'left' },
  tr: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: Colors.border, alignItems: 'center' },
  td: { padding: 12, justifyContent: 'center' },
  tdText: { fontSize: FontSize.sm, color: Colors.text },
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
