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
import { useUnit } from '../../../src/context/UnitContext';
import { useAuth } from '../../../src/context/AuthContext';
import { canManageMeetings } from '../../../src/utils/permissions';
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
  const canManage = canManageMeetings(user);

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

  function renderItem({ item: r }) {
    const stateInfo = STATE_CONFIG[r.state] || STATE_CONFIG.PENDING;
    const assignee = r.assignedToMemberId;
    return (
      <Card style={styles.card}>
        <View style={styles.cardTop}>
          <View style={{ flex: 1, marginRight: Spacing.sm }}>
            <Text style={styles.respTitle}>{r.title}</Text>
            {r.dueDate ? (
              <Text style={styles.respDue}>Due: {shortDate(r.dueDate)}</Text>
            ) : null}
          </View>
          <Badge label={stateInfo.label} color={stateInfo.color} bg={stateInfo.bg} />
        </View>

        {r.description ? (
          <Text style={styles.respDesc} numberOfLines={3}>{r.description}</Text>
        ) : null}

        {/* Assignee Row */}
        <View style={styles.assigneeRow}>
          <Avatar name={assignee?.fullName || '?'} size={32} />
          <View style={{ flex: 1 }}>
            <Text style={styles.assigneeName}>{assignee?.fullName || 'Unassigned'}</Text>
            {assignee?.memberId ? <Text style={styles.assigneeId}>{assignee.memberId}</Text> : null}
          </View>
        </View>

        {/* Status Action Buttons */}
        {canManage ? (
          <View style={styles.actionRow}>
            {r.state !== 'IN_PROGRESS' && r.state !== 'COMPLETED' && (
              <TouchableOpacity
                style={[styles.statusBtn, { borderColor: Colors.primary }]}
                onPress={() => handleUpdateState(r._id, 'IN_PROGRESS')}
              >
                <Text style={[styles.statusBtnText, { color: Colors.primary }]}>▶ Start</Text>
              </TouchableOpacity>
            )}

            {r.state !== 'COMPLETED' && (
              <TouchableOpacity
                style={[styles.statusBtn, { borderColor: Colors.success }]}
                onPress={() => handleUpdateState(r._id, 'COMPLETED')}
              >
                <Text style={[styles.statusBtnText, { color: Colors.success }]}>✓ Done</Text>
              </TouchableOpacity>
            )}

            {r.state !== 'CANCELLED' && (
              <TouchableOpacity
                style={[styles.statusBtn, { borderColor: Colors.textMuted }]}
                onPress={() => handleUpdateState(r._id, 'CANCELLED')}
              >
                <Text style={[styles.statusBtnText, { color: Colors.textMuted }]}>✕ Cancel</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[styles.statusBtn, { borderColor: Colors.error }]}
              onPress={() => handleDelete(r)}
            >
              <Text style={[styles.statusBtnText, { color: Colors.error }]}>🗑</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </Card>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header Banner */}
      <View style={styles.banner}>
        <View style={{ flex: 1 }}>
          <Text style={styles.bannerTitle}>📋 Unit Responsibilities</Text>
          <Text style={styles.bannerSub}>{ctx?.unitName || 'Select a unit'}</Text>
        </View>
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterStrip}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterList}>
          {FILTERS.map((f) => (
            <TouchableOpacity
              key={f.value}
              style={[styles.filterPill, filterState === f.value && styles.filterPillActive]}
              onPress={() => setFilterState(f.value)}
            >
              <Text style={[styles.filterText, filterState === f.value && styles.filterTextActive]}>
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <FlatList
        data={items}
        renderItem={renderItem}
        keyExtractor={(r) => r._id}
        contentContainerStyle={styles.list}
        onRefresh={reload}
        refreshing={loading}
        ListEmptyComponent={
          !loading && <EmptyState icon="📋" title="No responsibilities" subtitle="No tasks or responsibilities assigned for this filter." />
        }
      />

      {/* FAB Button */}
      {canManage && (
        <TouchableOpacity style={styles.fab} onPress={() => setShowCreate(true)}>
          <Text style={styles.fabText}>+</Text>
        </TouchableOpacity>
      )}

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
  banner: { backgroundColor: Colors.primary, padding: Spacing.lg, flexDirection: 'row', alignItems: 'center' },
  bannerTitle: { fontSize: FontSize.lg, fontWeight: '800', color: '#fff' },
  bannerSub: { fontSize: FontSize.xs, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
  filterStrip: { backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
  filterList: { padding: Spacing.sm, gap: 8, flexDirection: 'row' },
  filterPill: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.background },
  filterPillActive: { borderColor: Colors.primary, backgroundColor: '#eff6ff' },
  filterText: { fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: '600' },
  filterTextActive: { color: Colors.primary, fontWeight: '700' },
  list: { padding: Spacing.md, paddingBottom: 80 },
  card: { marginBottom: Spacing.md, padding: Spacing.md },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 },
  respTitle: { fontSize: FontSize.base, fontWeight: '700', color: Colors.text },
  respDue: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  respDesc: { fontSize: FontSize.xs, color: Colors.textLight, lineHeight: 18, marginBottom: Spacing.sm },
  assigneeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.surfaceAlt,
    padding: Spacing.sm,
    borderRadius: Radius.md,
    marginBottom: Spacing.sm,
  },
  assigneeName: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.text },
  assigneeId: { fontSize: FontSize.xs - 1, color: Colors.textMuted },
  actionRow: { flexDirection: 'row', gap: 8, borderTopWidth: 1, borderTopColor: Colors.borderLight, paddingTop: Spacing.sm },
  statusBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radius.sm,
    borderWidth: 1,
    backgroundColor: Colors.surface,
  },
  statusBtnText: { fontSize: FontSize.xs, fontWeight: '600' },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
  },
  fabText: { color: '#fff', fontSize: 30, fontWeight: '300', lineHeight: 32 },
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
