import { useEffect, useState, useMemo } from 'react';
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
import { useLocalSearchParams } from 'expo-router';
import { useUnit } from '../../../src/context/UnitContext';
import { useAuth } from '../../../src/context/AuthContext';
import { canManageMeetings, isCentralAdminOversight, isSuperAdminOversight } from '../../../src/utils/permissions';
import { api, errorMessage } from '../../../src/api/client';
import { confirmAction } from '../../../src/utils/dialog';
import { useToast } from '../../../src/components/Toast';
import Badge from '../../../src/components/Badge';
import Avatar from '../../../src/components/Avatar';
import DatePicker from '../../../src/components/DatePicker';
import { Colors, FontSize, Radius, Spacing } from '../../../src/constants/colors';
import { shortDate } from '../../../src/utils/formatters';
import { Ionicons } from '@expo/vector-icons';

const STATE_CONFIG = {
  PENDING: { label: 'Pending', color: '#d97706', bg: '#fef3c7' },
  IN_PROGRESS: { label: 'In Progress', color: Colors.primary, bg: '#eff6ff' },
  COMPLETED: { label: 'Completed', color: Colors.success, bg: Colors.successBg },
  CANCELLED: { label: 'Cancelled', color: Colors.textMuted, bg: Colors.borderLight },
};

const FILTERS = [
  { label: 'All states', value: '' },
  { label: 'Pending', value: 'PENDING' },
  { label: 'In Progress', value: 'IN_PROGRESS' },
  { label: 'Completed', value: 'COMPLETED' },
  { label: 'Cancelled', value: 'CANCELLED' },
];

export default function ResponsibilitiesScreen() {
  const { ctx } = useUnit();
  const { user } = useAuth();
  const toast = useToast();
  const params = useLocalSearchParams();
  const canManage = canManageMeetings(user) && !isCentralAdminOversight(user) && !isSuperAdminOversight(user);

  const activeLevel = params.unitLevel || ctx?.unitLevel || 'CENTRAL';
  const [resolvedUnitId, setResolvedUnitId] = useState(params.unitId || ctx?.unitId);

  useEffect(() => {
    let rawId = params.unitId || ctx?.unitId;
    if (activeLevel === 'CENTRAL' && (!rawId || rawId === 'CENTRAL')) {
      api.get('/org/central').then((r) => {
        if (r.data?.data?._id) setResolvedUnitId(r.data.data._id);
      }).catch(() => {});
    } else {
      setResolvedUnitId(rawId);
    }
  }, [params.unitId, params.unitLevel, ctx?.unitId]);

  const [items, setItems] = useState([]);
  const [members, setMembers] = useState([]);
  const [filterState, setFilterState] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Create form modal state
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', dueDate: '', assignedToMemberId: '' });
  const [memberSearch, setMemberSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState('');

  // Complete note modal state
  const [completeItem, setCompleteItem] = useState(null);
  const [completionNote, setCompletionNote] = useState('');
  const [completing, setCompleting] = useState(false);

  async function reload(silent = false) {
    if (!resolvedUnitId || resolvedUnitId === 'CENTRAL') {
      setLoading(false);
      return;
    }
    if (!silent) setLoading(true);
    try {
      const qParams = { unitLevel: activeLevel, unitId: resolvedUnitId };
      if (filterState) qParams.state = filterState;
      const res = await api.get('/responsibilities', { params: qParams });
      setItems(res.data?.data || []);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    reload();
  }, [activeLevel, resolvedUnitId, filterState]);

  function onRefresh() {
    setRefreshing(true);
    reload(true);
  }

  // Load eligible members for assignment
  useEffect(() => {
    if (!resolvedUnitId || resolvedUnitId === 'CENTRAL' || !showCreate) return;
    api.get('/meetings/eligible-attendees', {
      params: { unitLevel: activeLevel, unitId: resolvedUnitId, body: 'GENERAL_BODY' },
    })
      .then((r) => setMembers(r.data?.data || []))
      .catch(() => {
        const p = { status: 'ACTIVE', limit: 300 };
        if (activeLevel === 'BASIC_UNIT') p.basicUnitId = resolvedUnitId;
        else if (activeLevel === 'AREA') p.areaId = resolvedUnitId;
        else if (activeLevel === 'DISTRICT') p.districtId = resolvedUnitId;
        else if (activeLevel === 'PROVINCE') p.provinceId = resolvedUnitId;
        else if (activeLevel === 'CENTRAL') p.scope = 'all';
        api.get('/members', { params: p }).then((r) => setMembers(r.data?.data || [])).catch(() => {});
      });
  }, [activeLevel, resolvedUnitId, showCreate]);

  async function handleCreate() {
    if (!form.title.trim() || !form.assignedToMemberId) {
      setFormErr('Pick a member and enter a title.');
      return;
    }
    setFormErr('');
    setSaving(true);
    try {
      const payload = { ...form, unitLevel: activeLevel, unitId: resolvedUnitId };
      Object.keys(payload).forEach((k) => { if (payload[k] === '') delete payload[k]; });
      const assignee = members.find((m) => m._id === form.assignedToMemberId);
      await api.post('/responsibilities', payload);
      setShowCreate(false);
      setForm({ title: '', description: '', dueDate: '', assignedToMemberId: '' });
      setMemberSearch('');
      reload(true);
      toast.success(
        assignee ? `"${payload.title}" assigned to ${assignee.fullName}.` : `"${payload.title}" assigned.`
      );
    } catch (e) {
      setFormErr(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdateState(id, patch) {
    try {
      await api.patch(`/responsibilities/${id}`, patch);
      reload(true);
      const stateLabel = patch.state ? (STATE_CONFIG[patch.state]?.label || patch.state) : 'Updated';
      toast.success(patch.state ? `Marked ${stateLabel.toLowerCase()}.` : 'Responsibility updated.');
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  async function handleCompleteSubmit() {
    if (!completeItem) return;
    setCompleting(true);
    try {
      await api.patch(`/responsibilities/${completeItem._id}`, {
        state: 'COMPLETED',
        completionNote: completionNote.trim() || undefined,
      });
      toast.success('Marked completed.');
      setCompleteItem(null);
      setCompletionNote('');
      reload(true);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setCompleting(false);
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
          reload(true);
        } catch (e) {
          toast.error(errorMessage(e));
        }
      },
      { confirmText: 'Delete', destructive: true }
    );
  }

  const filteredMembers = useMemo(() => {
    if (!memberSearch.trim()) return members;
    const q = memberSearch.toLowerCase();
    return members.filter((m) =>
      (m.fullName || '').toLowerCase().includes(q) ||
      (m.memberId || '').toLowerCase().includes(q) ||
      (m.phone || '').includes(q) ||
      (m.roleText || '').toLowerCase().includes(q)
    );
  }, [members, memberSearch]);

  const unitDisplayName = ctx?.unitName || (activeLevel === 'CENTRAL' ? 'PKNAP Central' : activeLevel);

  const tableHeader = () => (
    <View style={styles.thRow}>
      <Text style={[styles.th, { width: 240 }]}>Title</Text>
      <Text style={[styles.th, { width: 200 }]}>Assigned to</Text>
      <Text style={[styles.th, { width: 110 }]}>Due</Text>
      <Text style={[styles.th, { width: 110 }]}>State</Text>
      <Text style={[styles.th, { width: 220 }]}>Actions</Text>
    </View>
  );

  function renderItem({ item: r }) {
    const stateInfo = STATE_CONFIG[r.state] || STATE_CONFIG.PENDING;
    const assignee = r.assignedToMemberId;
    return (
      <View style={styles.tr}>
        <View style={[styles.td, { width: 240 }]}>
          <Text style={[styles.tdText, { fontWeight: '700' }]}>{r.title}</Text>
          {r.description ? <Text style={styles.tdSubtext} numberOfLines={2}>{r.description}</Text> : null}
        </View>

        <View style={[styles.td, { width: 200 }]}>
          <Text style={[styles.tdText, { fontWeight: '700' }]}>{assignee?.fullName || '—'}</Text>
          {assignee?.roleText ? (
            <Badge
              label={assignee.roleText}
              color="#0369a1"
              bg="#e0f2fe"
              style={{ marginTop: 3, alignSelf: 'flex-start' }}
            />
          ) : null}
          {assignee?.unitText ? <Text style={[styles.tdSubtext, { marginTop: 2 }]}>{assignee.unitText}</Text> : null}
        </View>

        <View style={[styles.td, { width: 110 }]}>
          <Text style={styles.tdText}>{r.dueDate ? shortDate(r.dueDate) : '—'}</Text>
        </View>

        <View style={[styles.td, { width: 110 }]}>
          <Badge label={stateInfo.label} color={stateInfo.color} bg={stateInfo.bg} />
        </View>

        <View style={[styles.td, { width: 220, flexDirection: 'row', gap: 6, flexWrap: 'wrap', alignItems: 'center' }]}>
          {canManage && r.state === 'PENDING' && (
            <TouchableOpacity style={styles.btnSecondary} onPress={() => handleUpdateState(r._id, { state: 'IN_PROGRESS' })}>
              <Text style={styles.btnSecondaryText}>Start</Text>
            </TouchableOpacity>
          )}
          {canManage && r.state !== 'COMPLETED' && r.state !== 'CANCELLED' && (
            <TouchableOpacity
              style={styles.btnPrimarySmall}
              onPress={() => {
                setCompleteItem(r);
                setCompletionNote('');
              }}
            >
              <Text style={styles.btnPrimarySmallText}>Mark Done</Text>
            </TouchableOpacity>
          )}
          {canManage && r.state !== 'CANCELLED' && r.state !== 'COMPLETED' && (
            <TouchableOpacity style={styles.btnDanger} onPress={() => handleUpdateState(r._id, { state: 'CANCELLED' })}>
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
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.pageTitle}>Responsibilities · {unitDisplayName}</Text>
        
        {/* Filter & Action row */}
        <View style={styles.actionsRow}>
          {/* State Filter Chips */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
            {FILTERS.map((f) => {
              const active = filterState === f.value;
              return (
                <TouchableOpacity
                  key={f.value}
                  style={[styles.filterChip, active && styles.filterChipActive]}
                  onPress={() => setFilterState(f.value)}
                >
                  <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{f.label}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {!!canManage && (
            <TouchableOpacity style={styles.btnPrimary} onPress={() => setShowCreate(true)}>
              <Ionicons name="add" size={16} color="#fff" style={{ marginRight: 4 }} />
              <Text style={styles.btnPrimaryText}>Assign Responsibility</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Table Content */}
      <ScrollView horizontal style={{ flex: 1 }} contentContainerStyle={{ padding: Spacing.lg }}>
        <View style={{ flex: 1, minWidth: 880 }}>
          {tableHeader()}
          {loading && !refreshing ? (
            <View style={{ padding: 40, alignItems: 'center' }}><ActivityIndicator color={Colors.primary} /></View>
          ) : items.length === 0 ? (
            <View style={{ padding: 40, alignItems: 'center' }}>
              <Text style={{ color: Colors.textMuted }}>No responsibilities yet.</Text>
            </View>
          ) : (
            <FlatList
              data={items}
              renderItem={renderItem}
              keyExtractor={(r) => r._id}
              onRefresh={onRefresh}
              refreshing={refreshing}
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
              <Text style={styles.modalTitle}>Assign a responsibility</Text>
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
                <Text style={styles.label}>Title *</Text>
                <TextInput
                  style={styles.input}
                  value={form.title}
                  onChangeText={(v) => setForm((f) => ({ ...f, title: v }))}
                  placeholder="e.g. Mobilize voters in Block 4"
                  placeholderTextColor={Colors.textMuted}
                />
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Assign to *</Text>
                <TextInput
                  style={[styles.input, { marginBottom: Spacing.xs }]}
                  value={memberSearch}
                  onChangeText={setMemberSearch}
                  placeholder="Search member by name, ID, or phone..."
                  placeholderTextColor={Colors.textMuted}
                />
                <ScrollView style={styles.memberList} nestedScrollEnabled>
                  {filteredMembers.length === 0 ? (
                    <View style={{ padding: 16, alignItems: 'center' }}>
                      <Text style={{ color: Colors.textMuted, fontSize: FontSize.xs }}>No eligible members found</Text>
                    </View>
                  ) : (
                    filteredMembers.slice(0, 30).map((m) => {
                      const isSelected = form.assignedToMemberId === m._id;
                      const role = m.roleText || 'Member';
                      const unit = m.unitText || (m.basicUnitId?.name ? `Basic Unit: ${m.basicUnitId.name}` : '');
                      const meta = [role, unit].filter(Boolean).join(' · ');
                      return (
                        <TouchableOpacity
                          key={m._id}
                          style={[
                            styles.memberOption,
                            isSelected && styles.memberOptionActive,
                          ]}
                          onPress={() => setForm((f) => ({ ...f, assignedToMemberId: m._id }))}
                        >
                          <Avatar name={m.fullName || '?'} size={32} />
                          <View style={{ flex: 1 }}>
                            <Text style={styles.memberName}>{m.fullName} {m.memberId ? `(${m.memberId})` : ''}</Text>
                            {meta ? <Text style={styles.memberMeta}>{meta}</Text> : null}
                          </View>
                          {isSelected && (
                            <Ionicons name="checkmark-circle" size={20} color={Colors.primary} />
                          )}
                        </TouchableOpacity>
                      );
                    })
                  )}
                </ScrollView>
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
                  placeholder="Details and instructions..."
                  placeholderTextColor={Colors.textMuted}
                  multiline
                  numberOfLines={3}
                />
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {/* Mark Done / Completion Note Modal */}
      <Modal visible={!!completeItem} transparent animationType="fade" onRequestClose={() => setCompleteItem(null)}>
        <View style={styles.promptBackdrop}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.promptCard}>
            <Text style={styles.promptTitle}>Mark Completed</Text>
            <Text style={styles.promptSubtitle}>"{completeItem?.title}"</Text>

            <Text style={[styles.label, { marginTop: Spacing.md }]}>Completion note (optional):</Text>
            <TextInput
              style={[styles.input, styles.multiline, { height: 80 }]}
              value={completionNote}
              onChangeText={setCompletionNote}
              placeholder="e.g. All attendees confirmed and venue booked."
              placeholderTextColor={Colors.textMuted}
              multiline
              numberOfLines={3}
            />

            <View style={styles.promptActions}>
              <TouchableOpacity
                style={styles.btnSecondary}
                onPress={() => setCompleteItem(null)}
                disabled={completing}
              >
                <Text style={styles.btnSecondaryText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.btnPrimary}
                onPress={handleCompleteSubmit}
                disabled={completing}
              >
                {completing ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.btnPrimaryText}>Mark Done</Text>
                )}
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: {
    padding: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.surface,
    gap: Spacing.sm,
  },
  pageTitle: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.text },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
    marginTop: Spacing.xs,
    flexWrap: 'wrap',
  },
  filterScroll: { flexDirection: 'row', gap: 6, paddingVertical: 4 },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: Colors.surfaceAlt,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  filterChipText: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  filterChipTextActive: {
    color: '#fff',
  },
  btnPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    borderRadius: 8,
  },
  btnPrimaryText: { color: '#fff', fontSize: FontSize.sm, fontWeight: '700' },
  btnPrimarySmall: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radius.sm,
  },
  btnPrimarySmallText: { color: '#fff', fontSize: FontSize.xs, fontWeight: '700' },
  btnSecondary: {
    backgroundColor: Colors.surfaceAlt,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  btnSecondaryText: { color: Colors.text, fontSize: FontSize.xs, fontWeight: '600' },
  btnDanger: {
    backgroundColor: '#fee2e2',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: '#fca5a5',
  },
  btnDangerText: { color: '#b91c1c', fontSize: FontSize.xs, fontWeight: '600' },
  btnGhost: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: Radius.sm,
  },
  btnGhostText: { color: Colors.textMuted, fontSize: FontSize.xs, fontWeight: '600' },

  thRow: {
    flexDirection: 'row',
    borderBottomWidth: 2,
    borderBottomColor: Colors.border,
    paddingBottom: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  th: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.text, paddingHorizontal: Spacing.sm },
  tr: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
    paddingVertical: Spacing.md,
    alignItems: 'center',
  },
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
  input: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    fontSize: FontSize.sm,
    color: Colors.text,
  },
  multiline: { height: 70, textAlignVertical: 'top' },
  memberList: {
    maxHeight: 180,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    borderRadius: Radius.md,
    overflow: 'hidden',
    marginTop: 4,
  },
  memberOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
    backgroundColor: Colors.surface,
  },
  memberOptionActive: { backgroundColor: '#eff6ff' },
  memberName: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.text },
  memberMeta: { fontSize: FontSize.xs - 1, color: Colors.textMuted, marginTop: 1 },
  errorBanner: {
    backgroundColor: Colors.errorBg,
    borderRadius: 8,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.error + '30',
  },
  errorText: { color: Colors.error, fontSize: FontSize.sm, fontWeight: '500' },

  // Prompt card modal
  promptBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  promptCard: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 10,
  },
  promptTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.text },
  promptSubtitle: { fontSize: FontSize.sm, color: Colors.textMuted, marginTop: 2 },
  promptActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.sm,
    marginTop: Spacing.lg,
  },
});

