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
import { Ionicons } from '@expo/vector-icons';
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
  PENDING: { label: 'Pending', color: '#d97706', bg: '#fef3c7', badgeStatus: 'PENDING' },
  IN_PROGRESS: { label: 'In Progress', color: Colors.primary, bg: '#eff6ff', badgeStatus: 'ACTIVE' },
  COMPLETED: { label: 'Completed', color: Colors.success, bg: Colors.successBg, badgeStatus: 'ACTIVE' },
  CANCELLED: { label: 'Cancelled', color: Colors.textMuted, bg: Colors.surfaceAlt, badgeStatus: 'INACTIVE' },
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
  const [resolvedUnitName, setResolvedUnitName] = useState(ctx?.unitName || (activeLevel === 'CENTRAL' ? 'PKNAP Central' : activeLevel));

  useEffect(() => {
    let rawId = params.unitId || ctx?.unitId;
    if (activeLevel === 'CENTRAL' && (!rawId || rawId === 'CENTRAL')) {
      api.get('/org/central').then((r) => {
        if (r.data?.data?._id) {
          setResolvedUnitId(r.data.data._id);
          if (r.data.data.name) setResolvedUnitName(r.data.data.name);
        }
      }).catch(() => {});
    } else {
      setResolvedUnitId(rawId);
      if (ctx?.unitName) setResolvedUnitName(ctx.unitName);
    }
  }, [params.unitId, params.unitLevel, ctx?.unitId, ctx?.unitName, activeLevel]);

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

  function renderItem({ item: r }) {
    const stateInfo = STATE_CONFIG[r.state] || STATE_CONFIG.PENDING;
    const assignee = r.assignedToMemberId;

    return (
      <Card style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>{r.title}</Text>
            {r.description ? (
              <Text style={styles.cardDesc} numberOfLines={3}>{r.description}</Text>
            ) : null}
          </View>
          <Badge label={stateInfo.label} color={stateInfo.color} bg={stateInfo.bg} />
        </View>

        <View style={styles.cardDivider} />

        <View style={styles.cardMetaRow}>
          <View style={styles.assigneeBox}>
            <Avatar name={assignee?.fullName || '?'} size={36} />
            <View style={{ flex: 1, marginLeft: Spacing.sm }}>
              <Text style={styles.assigneeName}>{assignee?.fullName || '—'}</Text>
              {assignee?.roleText ? (
                <Text style={styles.assigneeRole}>{assignee.roleText}</Text>
              ) : null}
              {assignee?.unitText ? (
                <Text style={styles.assigneeUnit} numberOfLines={1}>{assignee.unitText}</Text>
              ) : null}
            </View>
          </View>

          <View style={styles.dueBox}>
            <Ionicons name="calendar-outline" size={14} color={Colors.textMuted} style={{ marginRight: 4 }} />
            <Text style={styles.dueText}>
              {r.dueDate ? shortDate(r.dueDate) : 'No due date'}
            </Text>
          </View>
        </View>

        {canManage && (
          <View style={styles.actionsRow}>
            {r.state === 'PENDING' && (
              <TouchableOpacity
                style={styles.btnSecondary}
                onPress={() => handleUpdateState(r._id, { state: 'IN_PROGRESS' })}
              >
                <Ionicons name="play" size={12} color={Colors.primary} style={{ marginRight: 4 }} />
                <Text style={styles.btnSecondaryText}>Start</Text>
              </TouchableOpacity>
            )}

            {r.state !== 'COMPLETED' && r.state !== 'CANCELLED' && (
              <TouchableOpacity
                style={styles.btnPrimarySmall}
                onPress={() => {
                  setCompleteItem(r);
                  setCompletionNote('');
                }}
              >
                <Ionicons name="checkmark-done" size={13} color="#fff" style={{ marginRight: 4 }} />
                <Text style={styles.btnPrimarySmallText}>Mark Done</Text>
              </TouchableOpacity>
            )}

            {r.state !== 'CANCELLED' && r.state !== 'COMPLETED' && (
              <TouchableOpacity
                style={styles.btnDanger}
                onPress={() => handleUpdateState(r._id, { state: 'CANCELLED' })}
              >
                <Text style={styles.btnDangerText}>Cancel</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity style={styles.btnGhost} onPress={() => handleDelete(r)}>
              <Ionicons name="trash-outline" size={15} color={Colors.error} />
            </TouchableOpacity>
          </View>
        )}
      </Card>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerScope}>
              {activeLevel ? `${activeLevel.replace('_', ' ')} RESPONSIBILITIES` : 'RESPONSIBILITIES'}
            </Text>
            <Text style={styles.pageTitle}>Responsibilities · {resolvedUnitName}</Text>
          </View>

          {!!canManage && (
            <TouchableOpacity style={styles.btnPrimary} onPress={() => setShowCreate(true)}>
              <Ionicons name="add" size={16} color="#fff" style={{ marginRight: 4 }} />
              <Text style={styles.btnPrimaryText}>Assign</Text>
            </TouchableOpacity>
          )}
        </View>

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
                <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                  {f.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* List Content */}
      <FlatList
        data={items}
        renderItem={renderItem}
        keyExtractor={(r) => r._id}
        onRefresh={onRefresh}
        refreshing={refreshing}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          !loading && (
            <EmptyState
              icon="📋"
              title="No responsibilities yet"
              message={
                filterState
                  ? 'No tasks found for this filter state.'
                  : 'Tap "+ Assign" to allocate a task or responsibility to a member.'
              }
            />
          )
        }
        ListFooterComponent={
          loading && !refreshing ? (
            <ActivityIndicator style={{ padding: 20 }} color={Colors.primary} />
          ) : null
        }
      />

      {/* Assign Responsibility Modal */}
      <Modal
        visible={showCreate}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => { if (!saving) setShowCreate(false); }}
      >
        <SafeAreaView style={styles.modalSafe}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={{ flex: 1 }}
          >
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Assign a responsibility</Text>
                <Text style={styles.modalSub}>{resolvedUnitName}</Text>
              </View>
              <TouchableOpacity
                onPress={() => { if (!saving) setShowCreate(false); }}
                disabled={saving}
                style={{ padding: 4 }}
              >
                <Ionicons name="close" size={22} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
              {formErr ? (
                <View style={styles.errorBanner}>
                  <Ionicons name="alert-circle" size={16} color={Colors.error} style={{ marginRight: 6 }} />
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
                  placeholderTextColor={Colors.textLight}
                />
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Assign to Member *</Text>
                <TextInput
                  style={[styles.input, { marginBottom: Spacing.xs }]}
                  value={memberSearch}
                  onChangeText={setMemberSearch}
                  placeholder="Filter member by name, ID, or phone..."
                  placeholderTextColor={Colors.textLight}
                  autoCapitalize="none"
                />
                <ScrollView style={styles.memberList} nestedScrollEnabled>
                  {filteredMembers.length === 0 ? (
                    <View style={{ padding: 16, alignItems: 'center' }}>
                      <Text style={{ color: Colors.textMuted, fontSize: FontSize.xs }}>
                        No eligible members found
                      </Text>
                    </View>
                  ) : (
                    filteredMembers.slice(0, 40).map((m) => {
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
                            <Text style={[styles.memberNameText, isSelected && { color: Colors.primary }]}>
                              {m.fullName} {m.memberId ? `(${m.memberId})` : ''}
                            </Text>
                            {meta ? <Text style={styles.memberMetaText}>{meta}</Text> : null}
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
                  placeholderTextColor={Colors.textLight}
                  multiline
                  numberOfLines={3}
                />
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => { if (!saving) setShowCreate(false); }}
                disabled={saving}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, saving && { opacity: 0.7 }]}
                onPress={handleCreate}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.saveText}>Assign Responsibility</Text>
                )}
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {/* Mark Done / Completion Note Modal */}
      <Modal
        visible={!!completeItem}
        transparent
        animationType="fade"
        onRequestClose={() => { if (!completing) setCompleteItem(null); }}
      >
        <View style={styles.promptBackdrop}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.promptCard}
          >
            <Text style={styles.promptTitle}>Mark Completed</Text>
            <Text style={styles.promptSubtitle}>"{completeItem?.title}"</Text>

            <Text style={[styles.label, { marginTop: Spacing.md }]}>Completion note (optional):</Text>
            <TextInput
              style={[styles.input, styles.multiline, { height: 80 }]}
              value={completionNote}
              onChangeText={setCompletionNote}
              placeholder="e.g. All attendees confirmed and venue booked."
              placeholderTextColor={Colors.textLight}
              multiline
              numberOfLines={3}
            />

            <View style={styles.promptActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setCompleteItem(null)}
                disabled={completing}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.saveBtn}
                onPress={handleCompleteSubmit}
                disabled={completing}
              >
                {completing ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.saveText}>Mark Done</Text>
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
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.surface,
    gap: Spacing.sm,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerScope: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.textMuted,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  pageTitle: { fontSize: FontSize.lg, fontWeight: '800', color: Colors.text, marginTop: 1 },
  filterScroll: { flexDirection: 'row', gap: 6, paddingVertical: 4 },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.pill,
    backgroundColor: Colors.surfaceAlt || '#f1f5f9',
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
    fontWeight: '700',
  },
  btnPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    borderRadius: Radius.md,
  },
  btnPrimaryText: { color: '#fff', fontSize: FontSize.sm, fontWeight: '700' },
  list: { padding: Spacing.md, paddingBottom: 40 },
  card: { marginBottom: Spacing.sm, padding: Spacing.md },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  cardTitle: { fontSize: FontSize.base, fontWeight: '700', color: Colors.text },
  cardDesc: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 3, lineHeight: 16 },
  cardDivider: { height: 1, backgroundColor: Colors.borderLight || '#f1f5f9', marginVertical: 10 },
  cardMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  assigneeBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  assigneeName: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.text },
  assigneeRole: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.primary,
    marginTop: 1,
  },
  assigneeUnit: {
    fontSize: 10,
    color: Colors.textMuted,
    marginTop: 1,
  },
  dueBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceAlt || '#f8fafc',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  dueText: { fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: '500' },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight || '#f1f5f9',
  },
  btnPrimarySmall: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.sm,
  },
  btnPrimarySmallText: { color: '#fff', fontSize: FontSize.xs, fontWeight: '700' },
  btnSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceAlt || '#f1f5f9',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  btnSecondaryText: { color: Colors.text, fontSize: FontSize.xs, fontWeight: '600' },
  btnDanger: {
    backgroundColor: '#fee2e2',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: '#fca5a5',
  },
  btnDangerText: { color: '#b91c1c', fontSize: FontSize.xs, fontWeight: '600' },
  btnGhost: {
    padding: 6,
    marginLeft: 'auto',
  },

  // Modal styles
  modalSafe: { flex: 1, backgroundColor: Colors.background },
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
  modalTitle: { fontSize: FontSize.base, fontWeight: '700', color: Colors.text },
  modalSub: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  modalBody: { padding: Spacing.lg, paddingBottom: 40 },
  field: { marginBottom: Spacing.md },
  label: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.text, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    fontSize: FontSize.sm,
    color: Colors.text,
  },
  multiline: { height: 70, textAlignVertical: 'top' },
  memberList: {
    maxHeight: 180,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    overflow: 'hidden',
    marginTop: 4,
    backgroundColor: Colors.surface,
  },
  memberOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight || '#f1f5f9',
    backgroundColor: Colors.surface,
  },
  memberOptionActive: { backgroundColor: '#eff6ff' },
  memberNameText: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.text },
  memberMetaText: { fontSize: 10, color: Colors.textMuted, marginTop: 1 },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef2f2',
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  errorText: { color: Colors.error, fontSize: FontSize.xs, fontWeight: '500', flex: 1 },
  modalFooter: {
    flexDirection: 'row',
    gap: Spacing.md,
    padding: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  cancelBtn: {
    flex: 1,
    borderRadius: Radius.md,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cancelText: { color: Colors.text, fontWeight: '600', fontSize: FontSize.sm },
  saveBtn: {
    flex: 2,
    borderRadius: Radius.md,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: Colors.primary,
  },
  saveText: { color: '#fff', fontWeight: '700', fontSize: FontSize.sm },

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
