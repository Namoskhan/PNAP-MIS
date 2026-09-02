import React, { useEffect, useState, useMemo } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api, errorMessage } from '../../src/api/client';
import { useAuth } from '../../src/context/AuthContext';
import { useUnit } from '../../src/context/UnitContext';
import { canPostAnnouncement } from '../../src/utils/permissions';
import { useToast } from '../../src/components/Toast';
import Card from '../../src/components/Card';
import Badge from '../../src/components/Badge';
import Avatar from '../../src/components/Avatar';
import EmptyState from '../../src/components/EmptyState';
import DatePicker from '../../src/components/DatePicker';
import { Colors, FontSize, Radius, Spacing } from '../../src/constants/colors';

const AUDIENCE_MODES = [
  {
    value: 'PERSON',
    icon: 'person-outline',
    label: 'A specific person',
    help: 'Direct message — only that member will see it.',
  },
  {
    value: 'OWN',
    icon: 'business-outline',
    label: 'This unit only',
    help: "Visible to everyone in the unit you're posting from.",
  },
  {
    value: 'SUBTREE',
    icon: 'git-network-outline',
    label: 'This unit + below',
    help: 'Cascades down to every sub-unit beneath you.',
  },
  {
    value: 'GLOBAL',
    icon: 'globe-outline',
    label: 'Everyone (org-wide)',
    help: 'Visible to every member in PKNAP.',
  },
];

export default function AnnouncementsScreen() {
  const { user } = useAuth();
  const { ctx } = useUnit();
  const toast = useToast();

  const canPost = canPostAnnouncement(user);

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState('');

  // Compose Modal State
  const [composeOpen, setComposeOpen] = useState(false);
  const [form, setForm] = useState({
    title: '',
    body: '',
    mode: 'OWN',
    pinned: false,
    expiresAt: '',
    targetMemberId: '',
    targetMemberLabel: '',
  });
  const [submitting, setSubmitting] = useState(false);

  // Member Search State (for Direct Message)
  const [members, setMembers] = useState([]);
  const [memberQuery, setMemberQuery] = useState('');
  const [membersLoading, setMembersLoading] = useState(false);

  // Live timer for expiry filter
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  async function load(silent = false) {
    if (!silent) setLoading(true);
    setErr('');
    try {
      const res = await api.get('/announcements');
      setItems(res.data.data || []);
    } catch (e) {
      if (!silent) setErr(errorMessage(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  // Filter out expired items
  const visibleItems = useMemo(() => {
    return (items || []).filter((a) => {
      if (!a.expiresAt) return true;
      return new Date(a.expiresAt).getTime() > now;
    });
  }, [items, now]);

  // Load members when PERSON mode is selected
  useEffect(() => {
    if (!composeOpen || form.mode !== 'PERSON' || members.length > 0 || membersLoading) return;
    setMembersLoading(true);
    api
      .get('/members', { params: { status: 'ACTIVE', limit: 500, scope: 'all' } })
      .then((r) => setMembers(r.data.data || []))
      .catch(() => setMembers([]))
      .finally(() => setMembersLoading(false));
  }, [composeOpen, form.mode]);

  const filteredMembers = useMemo(() => {
    const q = memberQuery.trim().toLowerCase();
    if (!q) return members.slice(0, 30);
    return members
      .filter((m) => {
        return (
          (m.fullName || '').toLowerCase().includes(q) ||
          (m.cnic || '').includes(q) ||
          (m.memberId || '').toLowerCase().includes(q) ||
          (m.phone || '').includes(q)
        );
      })
      .slice(0, 30);
  }, [members, memberQuery]);

  function openCompose() {
    setForm({
      title: '',
      body: '',
      mode: 'OWN',
      pinned: false,
      expiresAt: '',
      targetMemberId: '',
      targetMemberLabel: '',
    });
    setMemberQuery('');
    setComposeOpen(true);
  }

  function pickMember(m) {
    setForm((f) => ({
      ...f,
      targetMemberId: m._id,
      targetMemberLabel: `${m.fullName} · ${m.memberId || m.cnic}`,
    }));
  }

  async function submit() {
    if (!form.title.trim() || !form.body.trim()) {
      toast.error('Title and body are required.');
      return;
    }
    if (form.mode === 'PERSON' && !form.targetMemberId) {
      toast.error('Please pick a member to send the message to.');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        title: form.title.trim(),
        body: form.body.trim(),
        pinned: !!form.pinned,
        ...(form.expiresAt ? { expiresAt: new Date(form.expiresAt).toISOString() } : {}),
      };

      if (form.mode === 'PERSON') {
        payload.targetMemberId = form.targetMemberId;
      } else {
        payload.scope = form.mode; // OWN | SUBTREE | GLOBAL
        if (ctx?.unitLevel && ctx?.unitId && form.mode !== 'GLOBAL') {
          payload.unitLevel = ctx.unitLevel;
          payload.unitId = ctx.unitId;
        } else {
          payload.unitLevel = 'CENTRAL';
          if (form.mode === 'OWN') payload.scope = 'GLOBAL';
        }
      }

      await api.post('/announcements', payload);
      toast.success(form.mode === 'PERSON' ? 'Direct message sent.' : 'Announcement posted.');
      setComposeOpen(false);
      load(true);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSubmitting(false);
    }
  }

  function removeAnnouncement(id, title) {
    Alert.alert(
      'Delete Announcement',
      `Are you sure you want to delete "${title || 'this announcement'}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.delete(`/announcements/${id}`);
              toast.success('Announcement deleted.');
              load(true);
            } catch (e) {
              toast.error(errorMessage(e));
            }
          },
        },
      ]
    );
  }

  function renderItem({ item: a }) {
    const isDirect = !!a.targetMemberId;
    const targetLabel = a.targetMemberId?.fullName
      ? `${a.targetMemberId.fullName}${a.targetMemberId.memberId ? ` · ${a.targetMemberId.memberId}` : ''}`
      : 'a member';

    const canDelete =
      canPost &&
      (String(a.authorUserId) === String(user?._id) || user?.roles?.includes('SUPER_ADMIN'));

    return (
      <Card style={[styles.annCard, a.pinned && styles.annCardPinned, isDirect && styles.annCardDirect]}>
        {a.pinned && (
          <View style={styles.pinBadge}>
            <Ionicons name="pin" size={13} color="#b45309" />
            <Text style={styles.pinText}>Pinned Announcement</Text>
          </View>
        )}

        <View style={styles.cardHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.annTitle}>{a.title}</Text>
            <View style={styles.metaRow}>
              {isDirect ? (
                <>
                  <Badge label="Direct message" color="#0369a1" bg="#e0f2fe" />
                  <Text style={styles.metaText}>to {targetLabel}</Text>
                </>
              ) : (
                <>
                  <Badge label={a.unitLevel || 'CENTRAL'} color="#15803d" bg="#dcfce7" />
                  <Badge label={a.scope || 'GLOBAL'} color="#475569" bg="#f1f5f9" />
                </>
              )}
              <Text style={styles.metaDate}>
                {new Date(a.createdAt).toLocaleDateString()} · {new Date(a.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </View>
          </View>

          {canDelete && (
            <TouchableOpacity
              style={styles.deleteBtn}
              onPress={() => removeAnnouncement(a._id, a.title)}
            >
              <Ionicons name="trash-outline" size={18} color={Colors.error} />
            </TouchableOpacity>
          )}
        </View>

        <Text style={styles.annBody}>{a.body}</Text>

        <View style={styles.cardFooter}>
          <View style={styles.authorRow}>
            <Ionicons name="person-circle-outline" size={16} color={Colors.textMuted} />
            <Text style={styles.authorText}>By {a.authorName || 'Admin'}</Text>
          </View>

          {a.expiresAt && (
            <View style={styles.expiryRow}>
              <Ionicons name="time-outline" size={14} color={Colors.textMuted} />
              <Text style={styles.expiryText}>Expires: {new Date(a.expiresAt).toLocaleDateString()}</Text>
            </View>
          )}
        </View>
      </Card>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Announcements · اعلانات</Text>
          <Text style={styles.headerSub}>
            Broadcasts from your unit, tiers above, and direct messages.
          </Text>
        </View>

        {canPost && (
          <TouchableOpacity style={styles.composeBtn} onPress={openCompose}>
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={styles.composeBtnText}>New</Text>
          </TouchableOpacity>
        )}
      </View>

      {err ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{err}</Text>
        </View>
      ) : null}

      <FlatList
        data={visibleItems}
        renderItem={renderItem}
        keyExtractor={(item) => item._id}
        contentContainerStyle={styles.listContainer}
        onRefresh={() => {
          setRefreshing(true);
          load(true);
        }}
        refreshing={refreshing}
        ListEmptyComponent={
          !loading && (
            <EmptyState
              icon="📣"
              title="No announcements"
              subtitle="Broadcasts and important updates will appear here."
            />
          )
        }
        ListFooterComponent={
          loading && !refreshing ? (
            <ActivityIndicator style={{ padding: Spacing.xl }} color={Colors.primary} />
          ) : null
        }
      />

      {/* Compose Modal */}
      <Modal visible={composeOpen} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.modalSafe}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {form.mode === 'PERSON' ? 'Send Direct Message' : 'Post Announcement'}
            </Text>
            <TouchableOpacity onPress={() => setComposeOpen(false)} style={styles.modalClose}>
              <Ionicons name="close" size={24} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalBody} contentContainerStyle={{ paddingBottom: 40 }}>
            {/* Audience Modes */}
            <Text style={styles.fieldLabel}>Audience</Text>
            <View style={styles.audienceGrid}>
              {AUDIENCE_MODES.map((m) => {
                const isSelected = form.mode === m.value;
                return (
                  <TouchableOpacity
                    key={m.value}
                    style={[styles.audienceTile, isSelected && styles.audienceTileActive]}
                    onPress={() => setForm((f) => ({ ...f, mode: m.value }))}
                  >
                    <Ionicons
                      name={m.icon}
                      size={20}
                      color={isSelected ? Colors.primary : Colors.textMuted}
                      style={{ marginBottom: 4 }}
                    />
                    <Text style={[styles.audienceTileLabel, isSelected && styles.audienceTileLabelActive]}>
                      {m.label}
                    </Text>
                    <Text style={styles.audienceTileHelp}>{m.help}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {form.mode !== 'PERSON' && (
              <View style={styles.postingFromHint}>
                <Ionicons name="location-outline" size={14} color={Colors.primary} />
                <Text style={styles.postingFromText}>
                  {ctx?.unitLevel
                    ? `Posting from: ${ctx.unitLevel.replace('_', ' ')} · ${ctx.unitName || ''}`
                    : 'Posting at Central tier.'}
                </Text>
              </View>
            )}

            {/* Recipient Picker for Direct Message */}
            {form.mode === 'PERSON' && (
              <View style={styles.recipientSection}>
                <Text style={styles.fieldLabel}>Recipient Member</Text>
                {form.targetMemberId ? (
                  <View style={styles.pickedMemberBox}>
                    <Avatar name={form.targetMemberLabel} size={32} color={Colors.primary} />
                    <Text style={styles.pickedMemberText}>{form.targetMemberLabel}</Text>
                    <TouchableOpacity
                      style={styles.changeRecipientBtn}
                      onPress={() =>
                        setForm((f) => ({ ...f, targetMemberId: '', targetMemberLabel: '' }))
                      }
                    >
                      <Text style={styles.changeRecipientText}>Change</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View>
                    <TextInput
                      style={styles.input}
                      placeholder={membersLoading ? 'Loading members…' : 'Search by name, ID, CNIC or phone...'}
                      value={memberQuery}
                      onChangeText={setMemberQuery}
                      disabled={membersLoading}
                      clearButtonMode="while-editing"
                    />

                    {membersLoading ? (
                      <ActivityIndicator style={{ marginVertical: 12 }} color={Colors.primary} />
                    ) : (
                      <ScrollView style={styles.memberResultsList} nestedScrollEnabled>
                        {filteredMembers.length === 0 ? (
                          <Text style={styles.noMembersText}>No matching active members.</Text>
                        ) : (
                          filteredMembers.map((m) => (
                            <TouchableOpacity
                              key={m._id}
                              style={styles.memberResultRow}
                              onPress={() => pickMember(m)}
                            >
                              <Avatar name={m.fullName} size={30} color={Colors.textMuted} />
                              <View style={{ flex: 1, marginLeft: 8 }}>
                                <Text style={styles.memberResultName}>{m.fullName}</Text>
                                <Text style={styles.memberResultSub}>
                                  {m.memberId || m.cnic}
                                  {m.phone ? ` · ${m.phone}` : ''}
                                </Text>
                              </View>
                              <Ionicons name="chevron-forward" size={16} color={Colors.textLight} />
                            </TouchableOpacity>
                          ))
                        )}
                      </ScrollView>
                    )}
                  </View>
                )}
              </View>
            )}

            {/* Title */}
            <Text style={styles.fieldLabel}>Title</Text>
            <TextInput
              style={styles.input}
              placeholder={
                form.mode === 'PERSON'
                  ? "e.g., Reminder about Friday's meeting"
                  : 'e.g., Quarterly Review on Friday'
              }
              value={form.title}
              onChangeText={(text) => setForm((f) => ({ ...f, title: text }))}
              maxLength={140}
            />

            {/* Body */}
            <Text style={styles.fieldLabel}>Body / Content</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Details, announcement message, agenda, action items…"
              value={form.body}
              onChangeText={(text) => setForm((f) => ({ ...f, body: text }))}
              multiline
              numberOfLines={5}
              maxLength={4000}
            />

            {/* Expires At */}
            <DatePicker
              label="Expiry Date (optional)"
              value={form.expiresAt}
              onChange={(val) => setForm((f) => ({ ...f, expiresAt: val }))}
              placeholder="Select expiry date"
            />

            {/* Pin to Top */}
            <View style={styles.switchRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.switchLabel}>Pin to Top</Text>
                <Text style={styles.switchSub}>Keep this announcement highlighted at the top of the feed.</Text>
              </View>
              <Switch
                value={form.pinned}
                onValueChange={(val) => setForm((f) => ({ ...f, pinned: val }))}
                trackColor={{ false: Colors.border, true: Colors.primary }}
              />
            </View>
          </ScrollView>

          {/* Modal Footer */}
          <View style={styles.modalFooter}>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setComposeOpen(false)}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.submitBtn}
              onPress={submit}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.submitBtnText}>
                  {form.mode === 'PERSON' ? 'Send Message' : 'Post Announcement'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: { fontSize: FontSize.lg, fontWeight: '800', color: Colors.text },
  headerSub: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  composeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Radius.md,
  },
  composeBtnText: { color: '#fff', fontWeight: '700', fontSize: FontSize.sm },

  errorBanner: {
    backgroundColor: '#fee2e2',
    padding: Spacing.md,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.md,
    borderRadius: Radius.md,
  },
  errorText: { color: Colors.error, fontSize: FontSize.sm },

  listContainer: { padding: Spacing.lg, gap: Spacing.md },
  annCard: {
    padding: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  annCardPinned: {
    borderColor: '#f59e0b',
    borderLeftWidth: 4,
    borderLeftColor: '#f59e0b',
    backgroundColor: '#fffbeb',
  },
  annCardDirect: {
    borderLeftWidth: 4,
    borderLeftColor: '#0284c7',
  },
  pinBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 6,
  },
  pinText: { fontSize: FontSize.xs, fontWeight: '700', color: '#b45309' },

  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.sm,
  },
  annTitle: { fontSize: FontSize.base, fontWeight: '700', color: Colors.text, marginBottom: 4 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  metaText: { fontSize: FontSize.xs, color: Colors.textMuted },
  metaDate: { fontSize: FontSize.xs, color: Colors.textLight, marginLeft: 2 },
  deleteBtn: { padding: 4 },

  annBody: {
    fontSize: FontSize.sm,
    color: Colors.text,
    lineHeight: 20,
    marginVertical: Spacing.xs,
  },

  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.sm,
    paddingTop: Spacing.xs,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  authorText: { fontSize: FontSize.xs, color: Colors.textMuted },
  expiryRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  expiryText: { fontSize: FontSize.xs, color: Colors.textMuted },

  // Compose Modal
  modalSafe: { flex: 1, backgroundColor: Colors.background },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.lg,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  modalTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.text },
  modalClose: { padding: 4 },
  modalBody: { flex: 1, padding: Spacing.lg },

  fieldLabel: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 6,
    marginTop: Spacing.sm,
  },
  audienceGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  audienceTile: {
    flex: 1,
    minWidth: '47%',
    padding: Spacing.md,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
  },
  audienceTileActive: {
    borderColor: Colors.primary,
    backgroundColor: '#eff6ff',
  },
  audienceTileLabel: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 2,
  },
  audienceTileLabelActive: { color: Colors.primary },
  audienceTileHelp: { fontSize: FontSize.xs, color: Colors.textMuted, lineHeight: 14 },

  postingFromHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
    marginBottom: Spacing.sm,
  },
  postingFromText: { fontSize: FontSize.xs, color: Colors.primary, fontWeight: '600' },

  recipientSection: { marginBottom: Spacing.sm },
  pickedMemberBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.md,
    backgroundColor: '#eff6ff',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  pickedMemberText: { flex: 1, fontSize: FontSize.sm, fontWeight: '700', color: Colors.text },
  changeRecipientBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: Colors.surface,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  changeRecipientText: { fontSize: FontSize.xs, color: Colors.primary, fontWeight: '600' },

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
  textArea: { height: 100, textAlignVertical: 'top' },

  memberResultsList: {
    maxHeight: 180,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    marginTop: 4,
  },
  memberResultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  memberResultName: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.text },
  memberResultSub: { fontSize: FontSize.xs, color: Colors.textMuted },
  noMembersText: { padding: Spacing.md, fontSize: FontSize.xs, color: Colors.textMuted, textAlign: 'center' },

  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  switchLabel: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.text },
  switchSub: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },

  modalFooter: {
    flexDirection: 'row',
    gap: Spacing.md,
    padding: Spacing.lg,
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: Colors.surfaceAlt,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cancelBtnText: { color: Colors.text, fontWeight: '600', fontSize: FontSize.sm },
  submitBtn: {
    flex: 2,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
  },
  submitBtnText: { color: '#fff', fontWeight: '700', fontSize: FontSize.sm },
});
