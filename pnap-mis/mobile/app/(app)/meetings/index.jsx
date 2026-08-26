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
import { shortDate, MEETING_TYPE_LABEL } from '../../../src/utils/formatters';
import { Ionicons } from '@expo/vector-icons';

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

  const isCentral = ctx?.unitLevel === 'CENTRAL';

  const [bodyTab, setBodyTab] = useState('ALL');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  async function load(silent = false) {
    if (!ctx?.unitId) {
      setLoading(false);
      return;
    }
    if (!silent) setLoading(true);
    try {
      const params = { unitLevel: ctx.unitLevel, unitId: ctx.unitId };
      
      // Just fetch NON_COMMITTEE
      params.body = 'NON_COMMITTEE';

      const res = await api.get('/meetings', { params });
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
  }, [ctx?.unitId, bodyTab]);

  function onRefresh() {
    setRefreshing(true);
    load(true);
  }

  const congressItems = [];
  const jirgaItems = [];
  const committeeItems = [];
  
  const nonCommitteeItems = useMemo(() => items.filter((m) => !['COMMITTEE', 'JIRGA', 'CONGRESS', 'CMP', 'JRG', 'CNG'].includes(m.body) && !['COMMITTEE', 'JIRGA', 'CONGRESS', 'CMP', 'JRG', 'CNG'].includes(m.typeCode)), [items]);
  const execItems = useMemo(() => nonCommitteeItems.filter((m) => m.body === 'EXECUTIVE' || (!m.body && m.typeCode !== 'GBM')), [nonCommitteeItems]);
  const gbmItems = useMemo(() => nonCommitteeItems.filter((m) => m.body === 'GENERAL_BODY' || m.typeCode === 'GBM'), [nonCommitteeItems]);

  const displayedItems = useMemo(() => {
    if (bodyTab === 'CONGRESS') return congressItems;
    if (bodyTab === 'JIRGA') return jirgaItems;
    if (bodyTab === 'COMMITTEE') return committeeItems;
    if (bodyTab === 'EXECUTIVE') return execItems;
    if (bodyTab === 'GENERAL_BODY') return gbmItems;
    return nonCommitteeItems;
  }, [bodyTab, congressItems, jirgaItems, committeeItems, execItems, gbmItems, nonCommitteeItems]);

  async function handleCreate() {
    if (!form.title.trim() || !form.startAt) {
      toast.error('Title and start date are required.');
      return;
    }
    setSaving(true);
    try {
      await api.post('/meetings', {
        ...form,
        body: bodyTab === 'ALL' ? 'EXECUTIVE' : bodyTab,
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
        <View style={[styles.td, { width: 140 }]}>
           <Text style={styles.tdText} numberOfLines={2}>{m.chairpersonId?.fullName || m.chairpersonId || ''}</Text>
        </View>
        <View style={[styles.td, { width: 100 }]}>
           <Text style={styles.tdText}>{(m.attendance || []).filter((a) => a.status === 'PRESENT' || a.status === 'LATE').length} / {(m.attendance || []).length} present</Text>
        </View>
        <View style={[styles.td, { width: 100 }]}>
           <Badge label={m.state || 'DRAFT'} color={m.state === 'FINALIZED' ? '#15803d' : '#b45309'} bg={m.state === 'FINALIZED' ? '#dcfce7' : '#fef3c7'} />
        </View>
        <View style={[styles.td, { width: 80 }]}>
           <Text style={styles.tdText}>{(m.photos || []).length}</Text>
        </View>
        <View style={[styles.td, { width: 80 }]}>
           <Text style={styles.tdText}>{(m.documents || []).length}</Text>
        </View>
      </View>
    );
  }

  const tableHeader = () => (
    <View style={styles.thRow}>
      <Text style={[styles.th, { width: 140 }]}>When</Text>
      <Text style={[styles.th, { width: 160 }]}>Type</Text>
      <Text style={[styles.th, { width: 120 }]}>Venue</Text>
      <Text style={[styles.th, { width: 140 }]}>Chairperson</Text>
      <Text style={[styles.th, { width: 100 }]}>Attendance</Text>
      <Text style={[styles.th, { width: 100 }]}>State</Text>
      <Text style={[styles.th, { width: 80 }]}>Photos</Text>
      <Text style={[styles.th, { width: 80 }]}>Docs</Text>
    </View>
  );

  let pageTitle = `Meetings · PKNAP Central`;

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header matching web */}
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

      {/* Category Sub-Tabs */}
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
                    {bodyTab === 'EXECUTIVE' ? 'No executive meetings scheduled yet.' :
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

      {/* Create Meeting Modal */}
      <Modal visible={showForm} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowForm(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setShowForm(false)}>
                <Text style={styles.modalCancel}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>Schedule a Meeting</Text>
              <TouchableOpacity onPress={handleCreate} disabled={saving}>
                {saving ? <ActivityIndicator color={Colors.primary} /> : <Text style={styles.modalSave}>Save</Text>}
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.formContent} keyboardShouldPersistTaps="handled">
              <FormField label="Title *" value={form.title} onChangeText={(v) => setForm((f) => ({ ...f, title: v }))} />
              <FormField label="Venue *" value={form.venue} onChangeText={(v) => setForm((f) => ({ ...f, venue: v }))} />
              <DatePicker
                label="Meeting Date *"
                value={form.startAt ? form.startAt.split('T')[0] : ''}
                onChange={(d) => setForm((f) => ({
                  ...f,
                  startAt: `${d}T10:00:00.000Z`,
                  endAt: `${d}T12:00:00.000Z`,
                }))}
                placeholder="Select meeting date"
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
  header: { padding: Spacing.lg, paddingBottom: Spacing.sm, backgroundColor: Colors.surface },
  pageTitle: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.text, marginBottom: 12 },
  actionsRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  btnSecondary: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: Colors.surfaceAlt, borderRadius: 8, borderWidth: 1, borderColor: Colors.border },
  btnSecondaryText: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.textMuted },
  btnPrimary: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: Colors.primary, borderRadius: 8 },
  btnPrimaryText: { fontSize: FontSize.sm, fontWeight: '600', color: '#fff' },

  tabScrollWrap: { backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
  mainTab: { paddingHorizontal: Spacing.md, paddingVertical: 8, marginRight: 8, borderRadius: 20 },
  mainTabActive: { backgroundColor: Colors.primaryLight + '20' },
  mainTabText: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.textMuted },
  mainTabTextActive: { color: Colors.primary },

  categoryRow: { borderBottomWidth: 1, borderBottomColor: Colors.border, paddingVertical: 12, backgroundColor: Colors.background },
  categoryLabel: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.textMuted, marginRight: 4, alignSelf: 'center' },
  catChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface },
  catChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  catChipText: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.text },
  catChipTextActive: { color: '#fff' },
  catChipCount: { fontSize: FontSize.xs, color: Colors.textMuted },

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
