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
import { useLanguage } from '../../../src/context/LanguageContext';
import { canManageMeetings, isCentralAdminOversight, isSuperAdminOversight } from '../../../src/utils/permissions';
import { api, errorMessage, isNetworkError } from '../../../src/api/client';
import { useNetwork } from '../../../src/context/NetworkContext';
import {
  getCache,
  setCache,
  enqueueOfflineAction,
  getOfflineEntities,
} from '../../../src/services/offlineStorage';
import { getCachedAttendees } from '../../../src/services/scopeDataCache';
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
  const { t, isRTL } = useLanguage();
  const toast = useToast();
  const params = useLocalSearchParams();

  const canManage = canManageMeetings(user) && !isCentralAdminOversight(user) && !isSuperAdminOversight(user);

  const { isOnline } = useNetwork();
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

  // Filters with localization
  const filters = useMemo(() => [
    { label: t('responsibilities.allStates', 'All states'), value: '' },
    { label: t('common.pending', 'Pending'), value: 'PENDING' },
    { label: t('responsibilities.inProgress', 'In Progress'), value: 'IN_PROGRESS' },
    { label: t('common.completed', 'Completed'), value: 'COMPLETED' },
    { label: t('common.cancelled', 'Cancelled'), value: 'CANCELLED' },
  ], [t]);

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

    const cacheKey = `responsibilities_${activeLevel}_${resolvedUnitId}_${filterState || 'all'}`;
    const [cached, offlineCreated] = await Promise.all([
      getCache(cacheKey),
      getOfflineEntities('RESPONSIBILITY'),
    ]);

    const unitOffline = (offlineCreated || []).filter(
      (r) => (!resolvedUnitId || r.unitId === resolvedUnitId) && (!filterState || r.state === filterState)
    );

    if (cached && cached.length > 0) {
      setItems([...unitOffline, ...cached]);
      if (!silent) setLoading(false);
    } else if (unitOffline.length > 0) {
      setItems(unitOffline);
      if (!silent) setLoading(false);
    } else if (!silent) {
      setLoading(true);
    }

    if (!isOnline) {
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      const qParams = { unitLevel: activeLevel, unitId: resolvedUnitId };
      if (filterState) qParams.state = filterState;
      const res = await api.get('/responsibilities', { params: qParams });
      const serverList = res.data?.data || [];
      await setCache(cacheKey, serverList);
      setItems([...unitOffline, ...serverList]);
    } catch (e) {
      if (!isNetworkError(e) || (!cached?.length && !unitOffline.length)) {
        toast.error(errorMessage(e));
      }
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
    let active = true;

    // Load cached attendees first
    getCachedAttendees(activeLevel, resolvedUnitId, 'GENERAL_BODY').then((cached) => {
      if (active && cached?.length > 0) setMembers(cached);
    }).catch(() => {});

    if (!isOnline) return;

    api.get('/meetings/eligible-attendees', {
      params: { unitLevel: activeLevel, unitId: resolvedUnitId, body: 'GENERAL_BODY' },
    })
      .then((r) => {
        if (active && r.data?.data) setMembers(r.data.data);
      })
      .catch(() => {
        const p = { status: 'ACTIVE', limit: 300 };
        if (activeLevel === 'BASIC_UNIT') p.basicUnitId = resolvedUnitId;
        else if (activeLevel === 'AREA') p.areaId = resolvedUnitId;
        else if (activeLevel === 'DISTRICT') p.districtId = resolvedUnitId;
        else if (activeLevel === 'PROVINCE') p.provinceId = resolvedUnitId;
        else if (activeLevel === 'CENTRAL') p.scope = 'all';
        api.get('/members', { params: p })
          .then((r) => {
            if (active && r.data?.data) setMembers(r.data.data);
          })
          .catch(() => {});
      });

    return () => { active = false; };
  }, [activeLevel, resolvedUnitId, showCreate, isOnline]);

  async function handleCreate() {
    if (!form.title.trim() || !form.assignedToMemberId) {
      setFormErr(t('responsibilities.pickMemberAndTitle', 'Pick a member and enter a title.'));
      return;
    }
    setFormErr('');
    setSaving(true);
    const assignee = members.find((m) => m._id === form.assignedToMemberId);
    const payload = { ...form, unitLevel: activeLevel, unitId: resolvedUnitId };
    Object.keys(payload).forEach((k) => { if (payload[k] === '') delete payload[k]; });

    try {
      if (!isOnline) {
        throw new Error('OFFLINE_MODE');
      }

      await api.post('/responsibilities', payload);
      setShowCreate(false);
      setForm({ title: '', description: '', dueDate: '', assignedToMemberId: '' });
      setMemberSearch('');
      reload(true);
      toast.success(
        assignee
          ? t('responsibilities.assignedNamedToast', '"{{title}}" assigned to {{name}}.', { title: payload.title, name: assignee.fullName })
          : t('responsibilities.assignedToast', '"{{title}}" assigned.', { title: payload.title })
      );
    } catch (e) {
      if (e.message === 'OFFLINE_MODE' || isNetworkError(e)) {
        const offlineId = `offline_${Date.now()}`;
        const offlineRecord = {
          ...payload,
          _id: offlineId,
          state: 'PENDING',
          assignedToMemberId: assignee || { _id: form.assignedToMemberId, fullName: 'Assigned Member' },
          createdAt: new Date().toISOString(),
          _isOffline: true,
        };

        await enqueueOfflineAction({
          entityType: 'RESPONSIBILITY',
          action: 'CREATE',
          endpoint: '/responsibilities',
          method: 'POST',
          payload,
          displayTitle: `Responsibility: "${payload.title}"`,
          localRecord: offlineRecord,
        });

        setItems((prev) => [offlineRecord, ...prev]);
        setShowCreate(false);
        setForm({ title: '', description: '', dueDate: '', assignedToMemberId: '' });
        setMemberSearch('');
        toast.success(t('responsibilities.offlineSavedToast', 'Offline: "{{title}}" saved locally. Will sync when online.', { title: payload.title }));
      } else {
        setFormErr(errorMessage(e));
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdateState(id, patch) {
    try {
      if (!isOnline || String(id).startsWith('offline_')) {
        throw new Error('OFFLINE_MODE');
      }
      await api.patch(`/responsibilities/${id}`, patch);
      reload(true);
      const stateLabel = patch.state ? (STATE_CONFIG[patch.state]?.label || patch.state) : 'Updated';
      toast.success(patch.state ? t('responsibilities.markedStateToast', 'Marked {{state}}.', { state: stateLabel.toLowerCase() }) : t('responsibilities.updatedToast', 'Responsibility updated.'));
    } catch (e) {
      if (e.message === 'OFFLINE_MODE' || isNetworkError(e)) {
        await enqueueOfflineAction({
          entityType: 'RESPONSIBILITY',
          action: 'UPDATE',
          endpoint: `/responsibilities/${id}`,
          method: 'PATCH',
          payload: patch,
          displayTitle: `Update Responsibility: ${patch.state || 'Edit'}`,
        });
        setItems((prev) =>
          prev.map((item) => (item._id === id ? { ...item, ...patch } : item))
        );
        const stateLabel = patch.state ? (STATE_CONFIG[patch.state]?.label || patch.state) : 'Updated';
        toast.success(t('responsibilities.offlineMarkedToast', 'Offline: Marked {{state}}. Will sync when online.', { state: stateLabel.toLowerCase() }));
      } else {
        toast.error(errorMessage(e));
      }
    }
  }

  async function handleCompleteSubmit() {
    if (!completeItem) return;
    setCompleting(true);
    const patch = {
      state: 'COMPLETED',
      completionNote: completionNote.trim() || undefined,
    };
    try {
      if (!isOnline || String(completeItem._id).startsWith('offline_')) {
        throw new Error('OFFLINE_MODE');
      }
      await api.patch(`/responsibilities/${completeItem._id}`, patch);
      toast.success(t('responsibilities.markedDoneToast', 'Marked completed.'));
      setCompleteItem(null);
      setCompletionNote('');
      reload(true);
    } catch (e) {
      if (e.message === 'OFFLINE_MODE' || isNetworkError(e)) {
        await enqueueOfflineAction({
          entityType: 'RESPONSIBILITY',
          action: 'UPDATE',
          endpoint: `/responsibilities/${completeItem._id}`,
          method: 'PATCH',
          payload: patch,
          displayTitle: `Complete Responsibility: "${completeItem.title}"`,
        });
        setItems((prev) =>
          prev.map((item) => (item._id === completeItem._id ? { ...item, ...patch } : item))
        );
        toast.success(t('responsibilities.offlineMarkedDoneToast', 'Offline: Marked completed. Will sync when online.'));
        setCompleteItem(null);
        setCompletionNote('');
      } else {
        toast.error(errorMessage(e));
      }
    } finally {
      setCompleting(false);
    }
  }

  async function handleDelete(item) {
    confirmAction(
      t('responsibilities.deleteConfirmTitle', 'Delete Responsibility'),
      t('responsibilities.deleteConfirmMessage', 'Delete "{{title}}"? This cannot be undone.', { title: item.title }),
      async () => {
        try {
          if (!isOnline || String(item._id).startsWith('offline_')) {
            throw new Error('OFFLINE_MODE');
          }
          await api.delete(`/responsibilities/${item._id}`);
          toast.success(t('responsibilities.deletedToast', 'Responsibility deleted.'));
          reload(true);
        } catch (e) {
          if (e.message === 'OFFLINE_MODE' || isNetworkError(e)) {
            await enqueueOfflineAction({
              entityType: 'RESPONSIBILITY',
              action: 'DELETE',
              endpoint: `/responsibilities/${item._id}`,
              method: 'DELETE',
              displayTitle: `Delete Responsibility: "${item.title}"`,
            });
            setItems((prev) => prev.filter((i) => i._id !== item._id));
            toast.success(t('responsibilities.deletedOfflineToast', 'Offline: Deleted locally. Will sync when online.'));
          } else {
            toast.error(errorMessage(e));
          }
        }
      },
      { confirmText: t('common.delete', 'Delete'), destructive: true }
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
    const stateLabel = r.state === 'PENDING' ? t('common.pending', 'Pending')
      : r.state === 'IN_PROGRESS' ? t('responsibilities.inProgress', 'In Progress')
      : r.state === 'COMPLETED' ? t('common.completed', 'Completed')
      : r.state === 'CANCELLED' ? t('common.cancelled', 'Cancelled')
      : stateInfo.label;

    return (
      <Card style={styles.card}>
        <View style={[styles.cardHeader, isRTL && { flexDirection: 'row-reverse' }]}>
          <View style={{ flex: 1 }}>
            <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 6 }, isRTL && { flexDirection: 'row-reverse' }]}>
              <Text style={[styles.cardTitle, { flex: 1 }, isRTL && { textAlign: 'right' }]}>{r.title}</Text>
              {r._isOffline && (
                <Badge label={t('common.offline', 'OFFLINE')} color={Colors.warning} bg="rgba(217, 119, 6, 0.15)" />
              )}
            </View>
            {r.description ? (
              <Text style={[styles.cardDesc, isRTL && { textAlign: 'right' }]} numberOfLines={3}>{r.description}</Text>
            ) : null}
          </View>
          <Badge label={stateLabel} color={stateInfo.color} bg={stateInfo.bg} />
        </View>

        <View style={styles.cardDivider} />

        <View style={[styles.cardMetaRow, isRTL && { flexDirection: 'row-reverse' }]}>
          <View style={[styles.assigneeBox, isRTL && { flexDirection: 'row-reverse' }]}>
            <Avatar name={assignee?.fullName || '?'} size={36} />
            <View style={[{ flex: 1 }, isRTL ? { marginRight: Spacing.sm } : { marginLeft: Spacing.sm }]}>
              <Text style={[styles.assigneeName, isRTL && { textAlign: 'right' }]}>{assignee?.fullName || '—'}</Text>
              {assignee?.roleText ? (
                <Text style={[styles.assigneeRole, isRTL && { textAlign: 'right' }]}>{assignee.roleText}</Text>
              ) : null}
              {assignee?.unitText ? (
                <Text style={[styles.assigneeUnit, isRTL && { textAlign: 'right' }]} numberOfLines={1}>{assignee.unitText}</Text>
              ) : null}
            </View>
          </View>

          <View style={[styles.dueBox, isRTL && { flexDirection: 'row-reverse' }]}>
            <Ionicons name="calendar-outline" size={14} color={Colors.textMuted} style={isRTL ? { marginLeft: 4 } : { marginRight: 4 }} />
            <Text style={styles.dueText}>
              {r.dueDate ? shortDate(r.dueDate) : t('responsibilities.noDueDate', 'No due date')}
            </Text>
          </View>
        </View>

        {canManage && (
          <View style={[styles.actionsRow, isRTL && { flexDirection: 'row-reverse' }]}>
            {r.state === 'PENDING' && (
              <TouchableOpacity
                style={[styles.btnSecondary, isRTL && { flexDirection: 'row-reverse' }]}
                onPress={() => handleUpdateState(r._id, { state: 'IN_PROGRESS' })}
              >
                <Ionicons name="play" size={12} color={Colors.primary} style={isRTL ? { marginLeft: 4 } : { marginRight: 4 }} />
                <Text style={styles.btnSecondaryText}>{t('responsibilities.start', 'Start')}</Text>
              </TouchableOpacity>
            )}

            {r.state !== 'COMPLETED' && r.state !== 'CANCELLED' && (
              <TouchableOpacity
                style={[styles.btnPrimarySmall, isRTL && { flexDirection: 'row-reverse' }]}
                onPress={() => {
                  setCompleteItem(r);
                  setCompletionNote('');
                }}
              >
                <Ionicons name="checkmark-done" size={13} color="#fff" style={isRTL ? { marginLeft: 4 } : { marginRight: 4 }} />
                <Text style={styles.btnPrimarySmallText}>{t('responsibilities.markDone', 'Mark Done')}</Text>
              </TouchableOpacity>
            )}

            {r.state !== 'CANCELLED' && r.state !== 'COMPLETED' && (
              <TouchableOpacity
                style={styles.btnDanger}
                onPress={() => handleUpdateState(r._id, { state: 'CANCELLED' })}
              >
                <Text style={styles.btnDangerText}>{t('common.cancel', 'Cancel')}</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity style={[styles.btnGhost, isRTL ? { marginRight: 'auto', marginLeft: 0 } : { marginLeft: 'auto' }]} onPress={() => handleDelete(r)}>
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
        <View style={[styles.headerTop, isRTL && { flexDirection: 'row-reverse' }]}>
          <View style={{ flex: 1 }}>
            <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }, isRTL && { flexDirection: 'row-reverse' }]}>
              <Text style={[styles.headerScope, isRTL && { textAlign: 'right' }]}>
                {activeLevel ? `${activeLevel.replace('_', ' ')} ${t('responsibilities.responsibilitiesUpper', 'RESPONSIBILITIES')}` : t('responsibilities.responsibilitiesUpper', 'RESPONSIBILITIES')}
              </Text>
              {!isOnline && (
                <View style={{ backgroundColor: '#FEE2E2', borderColor: '#FCA5A5', borderWidth: 1, borderRadius: 10, paddingHorizontal: 6, paddingVertical: 1 }}>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: '#DC2626' }}>{t('common.offlineCached', 'Offline (Cached)')}</Text>
                </View>
              )}
            </View>
            <Text style={[styles.pageTitle, isRTL && { textAlign: 'right' }]}>{t('responsibilities.responsibilities', 'Responsibilities')} · {resolvedUnitName}</Text>
          </View>

          {!!canManage && (
            <TouchableOpacity style={[styles.btnPrimary, isRTL && { flexDirection: 'row-reverse' }]} onPress={() => setShowCreate(true)}>
              <Ionicons name="add" size={16} color="#fff" style={isRTL ? { marginLeft: 4 } : { marginRight: 4 }} />
              <Text style={styles.btnPrimaryText}>{t('responsibilities.assignResponsibility', '+ Assign Responsibility')}</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* State Filter Chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.filterScroll, isRTL && { flexDirection: 'row-reverse' }]}>
          {filters.map((f) => {
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
              title={t('responsibilities.noResponsibilities', 'No responsibilities yet')}
              message={
                filterState
                  ? t('responsibilities.noTasksForFilter', 'No tasks found for this filter state.')
                  : t('responsibilities.assignHint', 'Tap "+ Assign" to allocate a task or responsibility to a member.')
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
            <View style={[styles.modalHeader, isRTL && { flexDirection: 'row-reverse' }]}>
              <View>
                <Text style={[styles.modalTitle, isRTL && { textAlign: 'right' }]}>{t('responsibilities.assignModalTitle', 'Assign a responsibility')}</Text>
                <Text style={[styles.modalSub, isRTL && { textAlign: 'right' }]}>{resolvedUnitName}</Text>
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
                <View style={[styles.errorBanner, isRTL && { flexDirection: 'row-reverse' }]}>
                  <Ionicons name="alert-circle" size={16} color={Colors.error} style={isRTL ? { marginLeft: 6 } : { marginRight: 6 }} />
                  <Text style={[styles.errorText, isRTL && { textAlign: 'right' }]}>{formErr}</Text>
                </View>
              ) : null}

              <View style={styles.field}>
                <Text style={[styles.label, isRTL && { textAlign: 'right' }]}>{t('common.title', 'Title')} *</Text>
                <TextInput
                  style={[styles.input, isRTL && { textAlign: 'right' }]}
                  value={form.title}
                  onChangeText={(v) => setForm((f) => ({ ...f, title: v }))}
                  placeholder={t('responsibilities.titlePlaceholder', 'e.g. Mobilize voters in Block 4')}
                  placeholderTextColor={Colors.textLight}
                />
              </View>

              <View style={styles.field}>
                <Text style={[styles.label, isRTL && { textAlign: 'right' }]}>{t('responsibilities.assignToMember', 'Assign to Member')} *</Text>
                <TextInput
                  style={[styles.input, { marginBottom: Spacing.xs }, isRTL && { textAlign: 'right' }]}
                  value={memberSearch}
                  onChangeText={setMemberSearch}
                  placeholder={t('responsibilities.filterMemberPlaceholder', 'Filter member by name, ID, or phone...')}
                  placeholderTextColor={Colors.textLight}
                  autoCapitalize="none"
                />
                <ScrollView style={styles.memberList} nestedScrollEnabled>
                  {filteredMembers.length === 0 ? (
                    <View style={{ padding: 16, alignItems: 'center' }}>
                      <Text style={{ color: Colors.textMuted, fontSize: FontSize.xs }}>
                        {t('responsibilities.noEligibleMembers', 'No eligible members found')}
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
                            isRTL && { flexDirection: 'row-reverse' },
                            isSelected && styles.memberOptionActive,
                          ]}
                          onPress={() => setForm((f) => ({ ...f, assignedToMemberId: m._id }))}
                        >
                          <Avatar name={m.fullName || '?'} size={32} />
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.memberNameText, isSelected && { color: Colors.primary }, isRTL && { textAlign: 'right' }]}>
                              {m.fullName} {m.memberId ? `(${m.memberId})` : ''}
                            </Text>
                            {meta ? <Text style={[styles.memberMetaText, isRTL && { textAlign: 'right' }]}>{meta}</Text> : null}
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
                label={t('responsibilities.dueDate', 'Due Date')}
                value={form.dueDate}
                onChange={(d) => setForm((f) => ({ ...f, dueDate: d }))}
                placeholder={t('responsibilities.selectDueDate', 'Select due date')}
              />

              <View style={styles.field}>
                <Text style={[styles.label, isRTL && { textAlign: 'right' }]}>{t('common.description', 'Description')}</Text>
                <TextInput
                  style={[styles.input, styles.multiline, isRTL && { textAlign: 'right' }]}
                  value={form.description}
                  onChangeText={(v) => setForm((f) => ({ ...f, description: v }))}
                  placeholder={t('responsibilities.descPlaceholder', 'Details and instructions...')}
                  placeholderTextColor={Colors.textLight}
                  multiline
                  numberOfLines={3}
                />
              </View>
            </ScrollView>

            <View style={[styles.modalFooter, isRTL && { flexDirection: 'row-reverse' }]}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => { if (!saving) setShowCreate(false); }}
                disabled={saving}
              >
                <Text style={styles.cancelText}>{t('common.cancel', 'Cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, saving && { opacity: 0.7 }]}
                onPress={handleCreate}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.saveText}>{t('responsibilities.assignBtn', 'Assign Responsibility')}</Text>
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
            <Text style={[styles.promptTitle, isRTL && { textAlign: 'right' }]}>{t('responsibilities.markCompleted', 'Mark Completed')}</Text>
            <Text style={[styles.promptSubtitle, isRTL && { textAlign: 'right' }]}>"{completeItem?.title}"</Text>

            <Text style={[styles.label, { marginTop: Spacing.md }, isRTL && { textAlign: 'right' }]}>{t('responsibilities.completionNoteOptional', 'Completion note (optional):')}</Text>
            <TextInput
              style={[styles.input, styles.multiline, { height: 80 }, isRTL && { textAlign: 'right' }]}
              value={completionNote}
              onChangeText={setCompletionNote}
              placeholder={t('responsibilities.completionNotePlaceholder', 'e.g. All attendees confirmed and venue booked.')}
              placeholderTextColor={Colors.textLight}
              multiline
              numberOfLines={3}
            />

            <View style={[styles.promptActions, isRTL && { flexDirection: 'row-reverse', justifyContent: 'flex-start' }]}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setCompleteItem(null)}
                disabled={completing}
              >
                <Text style={styles.cancelText}>{t('common.cancel', 'Cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.saveBtn}
                onPress={handleCompleteSubmit}
                disabled={completing}
              >
                {completing ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.saveText}>{t('responsibilities.markDone', 'Mark Done')}</Text>
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
    ...Platform.select({
      web: {
        boxShadow: '0 4px 10px rgba(0, 0, 0, 0.2)',
      },
      default: {
        elevation: 8,
        shadowColor: '#000',
        shadowOpacity: 0.2,
        shadowRadius: 10,
      },
    }),
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
