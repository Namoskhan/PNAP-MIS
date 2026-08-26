import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
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
import { Picker } from '@react-native-picker/picker';
import { useUnit } from '../../../src/context/UnitContext';
import { useAuth } from '../../../src/context/AuthContext';
import { canManageMeetings, isCentralAdminOversight, isSuperAdminOversight } from '../../../src/utils/permissions';
import { api, errorMessage } from '../../../src/api/client';
import { confirmAction } from '../../../src/utils/dialog';
import { useToast } from '../../../src/components/Toast';
import Card from '../../../src/components/Card';
import Badge from '../../../src/components/Badge';
import Avatar from '../../../src/components/Avatar';
import EmptyState from '../../../src/components/EmptyState';
import DatePicker from '../../../src/components/DatePicker';
import { Colors, FontSize, Radius, Spacing } from '../../../src/constants/colors';
import { shortDate } from '../../../src/utils/formatters';

const STATE_CONFIG = {
  PENDING: { label: 'Pending', color: '#d97706', bg: '#fef3c7' },
  IN_PROGRESS: { label: 'In Progress', color: Colors.primary, bg: '#eff6ff' },
  COMPLETED: { label: 'Completed', color: Colors.success, bg: Colors.successBg },
  CANCELLED: { label: 'Cancelled', color: Colors.textMuted, bg: Colors.borderLight },
};

const FILTERS = [
  { label: 'All', value: '' },
  { label: 'Pending', value: 'PENDING' },
  { label: 'In Progress', value: 'IN_PROGRESS' },
  { label: 'Completed', value: 'COMPLETED' },
  { label: 'Cancelled', value: 'CANCELLED' },
];

export default function ResponsibilitiesScreen() {
  const { ctx } = useUnit();
  const { user } = useAuth();
  const toast = useToast();
  const canManage = canManageMeetings(user) && !isCentralAdminOversight(user) && !isSuperAdminOversight(user);

  const [items, setItems] = useState([]);
  const [members, setMembers] = useState([]);
  const [filterState, setFilterState] = useState('');
  const [loading, setLoading] = useState(true);

  // Create form modal state
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', dueDate: '', assignedToMemberId: '' });
  const [memberSearch, setMemberSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState('');

  async function reload() {
    if (!ctx?.unitId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const params = { unitLevel: ctx.unitLevel, unitId: ctx.unitId };
      if (filterState) params.state = filterState;
      const res = await api.get('/responsibilities', { params });
      setItems(res.data?.data || []);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
  }, [ctx?.unitId, ctx?.unitLevel, filterState]);

  // Load eligible members for assignment
  useEffect(() => {
    if (!ctx?.unitId || !showCreate) return;
    api.get('/meetings/eligible-attendees', {
      params: { unitLevel: ctx.unitLevel, unitId: ctx.unitId, body: 'GENERAL_BODY' },
    })
      .then((r) => setMembers(r.data?.data || []))
      .catch(() => {
        const params = { status: 'ACTIVE', limit: 300 };
        if (ctx.unitLevel === 'BASIC_UNIT') params.basicUnitId = ctx.unitId;
        else if (ctx.unitLevel === 'AREA') params.areaId = ctx.unitId;
        else if (ctx.unitLevel === 'DISTRICT') params.districtId = ctx.unitId;
        else if (ctx.unitLevel === 'PROVINCE') params.provinceId = ctx.unitId;
        else if (ctx.unitLevel === 'CENTRAL') params.scope = 'all';
        api.get('/members', { params }).then((r) => setMembers(r.data?.data || [])).catch(() => {});
      });
  }, [ctx?.unitId, showCreate]);

  async function handleCreate() {
    if (!form.title.trim() || !form.assignedToMemberId) {
      setFormErr('Title and assigned member are required.');
      return;
    }
    setFormErr('');
    setSaving(true);
    try {
      const payload = { ...form, unitLevel: ctx.unitLevel, unitId: ctx.unitId };
      Object.keys(payload).forEach((k) => { if (payload[k] === '') delete payload[k]; });
      await api.post('/responsibilities', payload);
      toast.success('Responsibility assigned successfully!');
      setShowCreate(false);
      setForm({ title: '', description: '', dueDate: '', assignedToMemberId: '' });
      reload();
    } catch (e) {
      setFormErr(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdateState(id, state) {
    try {
      await api.patch(`/responsibilities/${id}`, { state });
      toast.success(`Marked as ${STATE_CONFIG[state]?.label || state}.`);
      reload();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  async function handleDelete(item) {
    confirmAction(
      'Delete Responsibility',
      `Delete "${item.title}"? This cannot be undone.`,
      async () => {
        try {
          await api.delete(`/responsibilities/${item._id}`);
          toast.success('Responsibility deleted.');
          reload();
        } catch (e) {
          toast.error(errorMessage(e));
        }
      },
      { confirmText: 'Delete', destructive: true }
    );
  }

  const filteredMembers = members.filter((m) =>
    (m.fullName || '').toLowerCase().includes(memberSearch.toLowerCase()) ||
    (m.memberId || '').toLowerCase().includes(memberSearch.toLowerCase())
  );

  const tableHeader = () => (
    <View style={styles.thRow}>
      <Text style={[styles.th, { width: 220 }]}>Title</Text>
      <Text style={[styles.th, { width: 180 }]}>Assigned to</Text>
      <Text style={[styles.th, { width: 100 }]}>Due</Text>
      <Text style={[styles.th, { width: 100 }]}>State</Text>
      <Text style={[styles.th, { width: 150 }]}></Text>
    </View>
  );

  function renderItem({ item: r }) {
    const stateInfo = STATE_CONFIG[r.state] || STATE_CONFIG.PENDING;
    const assignee = r.assignedToMemberId;
    return (
      <View style={styles.tr}>
        <View style={[styles.td, { width: 220 }]}>
          <Text style={[styles.tdText, { fontWeight: '700' }]}>{r.title}</Text>
          {r.description ? <Text style={styles.tdSubtext} numberOfLines={2}>{r.description}</Text> : null}
        </View>

        <View style={[styles.td, { width: 180 }]}>
          <Text style={[styles.tdText, { fontWeight: '700' }]}>{assignee?.fullName || '—'}</Text>
          {assignee?.roleText ? (
            <Badge label={assignee.roleText} color="#0369a1" bg="#e0f2fe" style={{ marginTop: 2, alignSelf: 'flex-start' }} />
          ) : null}
          {assignee?.unitText ? <Text style={[styles.tdSubtext, { marginTop: 2 }]}>{assignee.unitText}</Text> : null}
        </View>

        <View style={[styles.td, { width: 100 }]}>
          <Text style={styles.tdText}>{r.dueDate ? shortDate(r.dueDate) : '—'}</Text>
        </View>

        <View style={[styles.td, { width: 100 }]}>
          <Badge label={stateInfo.label} color={stateInfo.color} bg={stateInfo.bg} />
        </View>

        <View style={[styles.td, { width: 150, flexDirection: 'row', gap: 6, flexWrap: 'wrap' }]}>
          {canManage && r.state === 'PENDING' && (
            <TouchableOpacity style={styles.btnSecondary} onPress={() => handleUpdateState(r._id, 'IN_PROGRESS')}>
              <Text style={styles.btnSecondaryText}>Start</Text>
            </TouchableOpacity>
          )}
          {canManage && r.state !== 'COMPLETED' && r.state !== 'CANCELLED' && (
            <TouchableOpacity style={styles.btnPrimary} onPress={() => handleUpdateState(r._id, 'COMPLETED')}>
              <Text style={styles.btnPrimaryText}>Mark Done</Text>
            </TouchableOpacity>
          )}
          {canManage && r.state !== 'CANCELLED' && r.state !== 'COMPLETED' && (
            <TouchableOpacity style={styles.btnDanger} onPress={() => handleUpdateState(r._id, 'CANCELLED')}>
              <Text style={styles.btnDangerText}>Cancel</Text>
            </TouchableOpacity>
          )}
          {canManage && (
            <TouchableOpacity style={styles.btnGhost} onPress={() => handleDelete(r)}>
              <Text style={styles.btnGhostText}>Delete</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.pageTitle}>Responsibilities · {ctx?.unitName}</Text>
        <View style={styles.actionsRow}>
           <View style={styles.pickerContainer}>
             <Text style={styles.pickerLabel}>State:</Text>
             <View style={styles.pickerWrapper}>
               <Picker
                 selectedValue={filterState}
                 onValueChange={(itemValue) => setFilterState(itemValue)}
                 style={styles.picker}
               >
                 {FILTERS.map(f => (
                   <Picker.Item key={f.value} label={f.label} value={f.value} />
                 ))}
               </Picker>
             </View>
           </View>
           {!!canManage && (
             <TouchableOpacity style={styles.btnPrimary} onPress={() => setShowCreate(true)}>
               <Text style={styles.btnPrimaryText}>+ Assign Responsibility</Text>
             </TouchableOpacity>
           )}
        </View>
      </View>

      <ScrollView horizontal style={{ flex: 1 }} contentContainerStyle={{ padding: Spacing.lg }}>
        <View style={{ flex: 1, minWidth: 780 }}>
          {tableHeader()}
          {loading ? (
             <View style={{ padding: 40, alignItems: 'center' }}><ActivityIndicator /></View>
          ) : items.length === 0 ? (
            <View style={{ padding: 40, alignItems: 'center' }}>
               <Text style={{ color: Colors.textMuted }}>No responsibilities yet.</Text>
            </View>
          ) : (
            <FlatList
              data={items}
              renderItem={renderItem}
              keyExtractor={(r) => r._id}
              scrollEnabled={false}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 100 }}
            />
          )}
        </View>
      </ScrollView>

      {/* Assign Responsibility Modal */}
      <Modal visible={showCreate} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowCreate(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setShowCreate(false)}>
                <Text style={styles.modalCancel}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>Assign Responsibility</Text>
              <TouchableOpacity onPress={handleCreate} disabled={saving}>
                {saving ? <ActivityIndicator color={Colors.primary} /> : <Text style={styles.modalSave}>Assign</Text>}
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
              {formErr ? (
                <View style={styles.errorBanner}>
                  <Text style={styles.errorText}>{formErr}</Text>
                </View>
              ) : null}

              <View style={styles.field}>
                <Text style={styles.label}>Task Title *</Text>
                <TextInput
                  style={styles.input}
                  value={form.title}
                  onChangeText={(v) => setForm((f) => ({ ...f, title: v }))}
                  placeholder="e.g. Organize Protest Preparation"
                />
              </View>

              <DatePicker
                label="Due Date"
                value={form.dueDate}
                onChange={(d) => setForm((f) => ({ ...f, dueDate: d }))}
                placeholder="Select due date"
              />

              <View style={styles.field}>
                <Text style={styles.label}>Description</Text>
                <TextInput
                  style={[styles.input, styles.multiline]}
                  value={form.description}
                  onChangeText={(v) => setForm((f) => ({ ...f, description: v }))}
                  placeholder="Details of the responsibility"
                  multiline
                  numberOfLines={3}
                />
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Assign to Member *</Text>
                <TextInput
                  style={[styles.input, { marginBottom: Spacing.sm }]}
                  value={memberSearch}
                  onChangeText={setMemberSearch}
                  placeholder="Search member by name..."
                />
                <ScrollView style={styles.memberList}>
                  {filteredMembers.slice(0, 25).map((m) => (
                    <TouchableOpacity
                      key={m._id}
                      style={[
                        styles.memberOption,
                        form.assignedToMemberId === m._id && styles.memberOptionActive,
                      ]}
                      onPress={() => setForm((f) => ({ ...f, assignedToMemberId: m._id }))}
                    >
                      <Avatar name={m.fullName} size={32} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.memberName}>{m.fullName}</Text>
                        <Text style={styles.memberMeta}>{m.memberId || m.phone || 'Member'}</Text>
                      </View>
                      {form.assignedToMemberId === m._id && (
                        <Text style={styles.checkMark}>✓</Text>
                      )}
                    </TouchableOpacity>
                  ))}
                </ScrollView>
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
  header: { padding: Spacing.lg, borderBottomWidth: 1, borderBottomColor: Colors.border, backgroundColor: Colors.surface, gap: Spacing.sm },
  pageTitle: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.text },
  actionsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.md, marginTop: Spacing.xs, flexWrap: 'wrap' },
  pickerContainer: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  pickerLabel: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.textMuted, marginRight: Spacing.sm },
  pickerWrapper: { flex: 1, backgroundColor: Colors.surface, borderRadius: 8, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden', height: 40, justifyContent: 'center' },
  picker: { width: '100%', height: 40, color: Colors.text },
  btnPrimary: { backgroundColor: Colors.primary, paddingHorizontal: Spacing.md, paddingVertical: 10, borderRadius: 8 },
  btnPrimaryText: { color: '#fff', fontSize: FontSize.sm, fontWeight: '700' },
  btnSecondary: { backgroundColor: Colors.surfaceAlt, paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.border },
  btnSecondaryText: { color: Colors.text, fontSize: FontSize.sm, fontWeight: '600' },
  btnDanger: { backgroundColor: '#fee2e2', paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.sm, borderWidth: 1, borderColor: '#fca5a5' },
  btnDangerText: { color: '#b91c1c', fontSize: FontSize.sm, fontWeight: '600' },
  btnGhost: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.sm },
  btnGhostText: { color: Colors.textMuted, fontSize: FontSize.sm, fontWeight: '600' },

  thRow: { flexDirection: 'row', borderBottomWidth: 2, borderBottomColor: Colors.border, paddingBottom: Spacing.sm, marginBottom: Spacing.sm },
  th: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.text, paddingHorizontal: Spacing.sm },
  tr: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: Colors.borderLight, paddingVertical: Spacing.md, alignItems: 'center' },
  td: { paddingHorizontal: Spacing.sm },
  tdText: { fontSize: FontSize.sm, color: Colors.text },
  tdSubtext: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  
  // Modal styles
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  modalTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.text },
  modalCancel: { fontSize: FontSize.base, color: Colors.textMuted },
  modalSave: { fontSize: FontSize.base, fontWeight: '700', color: Colors.primary },
  modalBody: { padding: Spacing.lg, paddingBottom: 40 },
  field: { marginBottom: Spacing.md },
  label: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.text, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: 10, paddingHorizontal: Spacing.md, paddingVertical: 10, fontSize: FontSize.sm, color: Colors.text },
  multiline: { height: 70, textAlignVertical: 'top' },
  memberList: { maxHeight: 220, borderWidth: 1, borderColor: Colors.borderLight, borderRadius: Radius.md, overflow: 'hidden' },
  memberOption: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.borderLight, backgroundColor: Colors.surface },
  memberOptionActive: { backgroundColor: '#eff6ff' },
  memberName: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.text },
  memberMeta: { fontSize: FontSize.xs - 1, color: Colors.textMuted },
  checkMark: { fontSize: 18, color: Colors.primary, fontWeight: '700' },
  errorBanner: { backgroundColor: Colors.errorBg, borderRadius: 8, padding: Spacing.md, marginBottom: Spacing.md, borderWidth: 1, borderColor: Colors.error + '30' },
  errorText: { color: Colors.error, fontSize: FontSize.sm, fontWeight: '500' },
});
