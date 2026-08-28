import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api, errorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { hasPermission } from '../../utils/permissions';
import { confirmAction } from '../../utils/dialog';
import { useToast } from '../Toast';
import Card from '../Card';
import Badge from '../Badge';
import EmptyState from '../EmptyState';
import { Colors, FontSize, Radius, Spacing } from '../../constants/colors';

// Shared component used by both meetings.jsx and activities.jsx
export function EventTypeList({ entity, title, icon }) {
  const { user } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isSmall = width < 480;
  const isTablet = width >= 768;
  const canWrite = hasPermission(user, 'MANAGE_EVENT_CONFIG');

  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ code: '', label: '', description: '' });
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');

  async function load() {
    setLoading(true);
    try {
      const r = await api.get('/admin/events/types', { params: { entity } });
      setTypes(r.data?.data || []);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [entity]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = types;
    if (q) {
      list = list.filter(
        (t) =>
          (t.label || '').toLowerCase().includes(q) ||
          (t.code || '').toLowerCase().includes(q) ||
          (t.description || '').toLowerCase().includes(q)
      );
    }
    return [...list].sort((a, b) => {
      if (a.isSystem !== b.isSystem) return a.isSystem ? -1 : 1;
      if (a.sortOrder !== b.sortOrder) return (a.sortOrder || 0) - (b.sortOrder || 0);
      return (a.label || '').localeCompare(b.label || '');
    });
  }, [types, search]);

  async function handleCreate() {
    if (!form.code.trim() || !form.label.trim()) {
      toast.error('Code and label are required.');
      return;
    }
    setSaving(true);
    try {
      await api.post('/admin/events/types', { ...form, entity });
      toast.success('Type created.');
      setCreateOpen(false);
      setForm({ code: '', label: '', description: '' });
      load();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(t) {
    confirmAction(
      'Delete Type',
      `Delete "${t.label}" (${t.code})? This cannot be undone.`,
      async () => {
        try {
          await api.delete(`/admin/events/types/${t._id}`);
          toast.success('Type deleted.');
          load();
        } catch (e) {
          toast.error(errorMessage(e));
        }
      },
      { confirmText: 'Delete', destructive: true }
    );
  }

  function renderItem({ item: t }) {
    return (
      <Card style={[styles.typeCard, isSmall && styles.typeCardSmall]}>
        <View style={[styles.typeRow, isSmall && styles.typeRowSmall]}>
          <View style={{ flex: 1, minWidth: 200 }}>
            <View style={styles.typeNameRow}>
              <Text style={styles.typeName}>{t.label}</Text>
              <View style={styles.badgeRow}>
                {t.isSystem ? (
                  <Badge label="System" color="#0369a1" bg="#e0f2fe" />
                ) : (
                  <Badge label="Custom" color="#7c3aed" bg="#f3e8ff" />
                )}
                {!t.isActive && <Badge label="Inactive" color={Colors.textMuted} bg={Colors.borderLight} />}
              </View>
            </View>
            <View style={styles.codePill}>
              <Text style={styles.typeCode}>{t.code}</Text>
            </View>
            {t.description ? (
              <Text style={styles.typeDesc} numberOfLines={isSmall ? 3 : 2}>
                {t.description}
              </Text>
            ) : null}
          </View>

          <View style={[styles.typeActions, isSmall && styles.typeActionsSmall]}>
            {(hasPermission(user, 'VIEW_EVENT_CONFIG') || canWrite) && (
              <TouchableOpacity
                style={[styles.actionBtn, isSmall && styles.actionBtnSmall]}
                onPress={() => router.push(`/admin/event-types/${t._id}`)}
              >
                <Ionicons name="settings-outline" size={14} color={Colors.primary} style={{ marginRight: 4 }} />
                <Text style={styles.actionText}>Configure</Text>
                <Ionicons name="chevron-forward" size={13} color={Colors.primary} style={{ marginLeft: 2 }} />
              </TouchableOpacity>
            )}
            {canWrite && !t.isSystem && (
              <TouchableOpacity
                style={[styles.actionBtn, styles.actionDanger, isSmall && styles.actionDangerSmall]}
                onPress={() => handleDelete(t)}
                accessibilityLabel="Delete type"
              >
                <Ionicons name="trash-outline" size={15} color={Colors.error} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Card>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={[styles.container, isTablet && styles.containerTablet]}>
        {/* Header */}
        <View style={[styles.header, isSmall && styles.headerSmall]}>
          <View style={styles.headerTitleWrap}>
            <Text style={styles.headerTitle}>
              {icon} {title}
            </Text>
            <Text style={styles.headerSubtitle}>
              {types.length} {types.length === 1 ? 'type' : 'types'} configured
            </Text>
          </View>
          {canWrite && (
            <TouchableOpacity style={styles.createBtn} onPress={() => setCreateOpen(true)}>
              <Ionicons name="add" size={18} color="#fff" style={{ marginRight: 2 }} />
              <Text style={styles.createBtnText}>New Type</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Search Bar if multiple types */}
        {types.length > 4 && (
          <View style={styles.searchWrap}>
            <Ionicons name="search-outline" size={18} color={Colors.textMuted} style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder={`Search ${title.toLowerCase()}…`}
              placeholderTextColor={Colors.textMuted}
              value={search}
              onChangeText={setSearch}
              clearButtonMode="while-editing"
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch('')} style={styles.clearBtn}>
                <Ionicons name="close-circle" size={16} color={Colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* List */}
        <FlatList
          data={filtered}
          renderItem={renderItem}
          keyExtractor={(t) => t._id}
          contentContainerStyle={styles.list}
          onRefresh={load}
          refreshing={loading}
          ListEmptyComponent={
            !loading && (
              <EmptyState
                icon={icon}
                title={search ? 'No matching types found' : `No ${title.toLowerCase()} yet`}
                subtitle={search ? 'Try adjusting your search query' : 'Create one using the + New Type button above'}
              />
            )
          }
        />
      </View>

      {/* Create Modal */}
      <Modal visible={createOpen} animationType="slide" transparent onRequestClose={() => setCreateOpen(false)}>
        <SafeAreaView style={styles.modalOverlay}>
          <View style={[styles.modalContainer, isTablet && styles.modalContainerTablet]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>New {entity === 'MEETING' ? 'Meeting' : 'Activity'} Type</Text>
              <TouchableOpacity
                onPress={() => {
                  setCreateOpen(false);
                  setForm({ code: '', label: '', description: '' });
                }}
                style={styles.closeBtn}
              >
                <Ionicons name="close" size={22} color={Colors.text} />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
              <Text style={styles.fieldLabel}>Type Code *</Text>
              <TextInput
                style={styles.input}
                value={form.code}
                onChangeText={(v) => setForm((p) => ({ ...p, code: v.toUpperCase().replace(/[^A-Z0-9_]/g, '') }))}
                placeholder="e.g. EMERGENCY_MEETING"
                placeholderTextColor={Colors.textMuted}
                autoCapitalize="characters"
              />
              <Text style={styles.fieldHint}>Uppercase letters, numbers, and underscores only</Text>

              <Text style={styles.fieldLabel}>Display Label *</Text>
              <TextInput
                style={styles.input}
                value={form.label}
                onChangeText={(v) => setForm((p) => ({ ...p, label: v }))}
                placeholder="e.g. Emergency Meeting"
                placeholderTextColor={Colors.textMuted}
              />

              <Text style={styles.fieldLabel}>Description</Text>
              <TextInput
                style={[styles.input, styles.multiline]}
                value={form.description}
                onChangeText={(v) => setForm((p) => ({ ...p, description: v }))}
                placeholder="Brief description of when this type is used"
                placeholderTextColor={Colors.textMuted}
                multiline
                numberOfLines={3}
              />
            </ScrollView>
            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => {
                  setCreateOpen(false);
                  setForm({ code: '', label: '', description: '' });
                }}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleCreate} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveText}>Create Type</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  container: { flex: 1, width: '100%' },
  containerTablet: { maxWidth: 1000, alignSelf: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8 },
  
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    flexWrap: 'wrap',
    gap: 10,
  },
  headerSmall: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
  },
  headerTitleWrap: { flex: 1, minWidth: 160 },
  headerTitle: { fontSize: FontSize.lg, fontWeight: '800', color: Colors.text },
  headerSubtitle: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  
  createBtn: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    paddingHorizontal: 14,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 2,
  },
  createBtnText: { color: '#fff', fontWeight: '700', fontSize: FontSize.sm },
  
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingHorizontal: Spacing.lg,
    paddingVertical: 8,
  },
  searchIcon: { marginRight: 8 },
  searchInput: {
    flex: 1,
    fontSize: FontSize.sm,
    color: Colors.text,
    paddingVertical: 6,
  },
  clearBtn: { padding: 4 },

  list: { padding: Spacing.md, paddingBottom: 40 },
  typeCard: {
    marginBottom: Spacing.sm,
    padding: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  typeCardSmall: {
    padding: 12,
  },
  typeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  typeRowSmall: {
    flexDirection: 'column',
    gap: 10,
  },
  typeNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 4,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  typeName: { fontSize: FontSize.base, fontWeight: '700', color: Colors.text },
  codePill: {
    alignSelf: 'flex-start',
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  typeCode: { fontSize: FontSize.xs, color: '#475569', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontWeight: '600' },
  typeDesc: { fontSize: FontSize.xs, color: Colors.textLight, lineHeight: 17 },

  typeActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'center',
  },
  typeActionsSmall: {
    alignSelf: 'flex-end',
    width: '100%',
    justifyContent: 'flex-end',
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    paddingTop: 8,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eff6ff',
    borderRadius: Radius.md,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  actionBtnSmall: {
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  actionDanger: {
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
    paddingHorizontal: 9,
  },
  actionDangerSmall: {
    paddingHorizontal: 8,
  },
  actionText: { fontSize: FontSize.xs, color: Colors.primary, fontWeight: '700' },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.md,
  },
  modalContainer: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    width: '100%',
    maxWidth: 520,
    maxHeight: '90%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 15,
    elevation: 8,
    overflow: 'hidden',
  },
  modalContainerTablet: {
    maxWidth: 560,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: '#f8fafc',
  },
  closeBtn: {
    padding: 4,
  },
  modalTitle: { fontSize: FontSize.base, fontWeight: '800', color: Colors.text },
  modalBody: { padding: Spacing.lg },
  modalFooter: {
    flexDirection: 'row',
    gap: Spacing.md,
    padding: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: '#f8fafc',
  },
  fieldLabel: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.text, marginBottom: 4, marginTop: Spacing.sm, textTransform: 'uppercase', letterSpacing: 0.4 },
  fieldHint: { fontSize: 11, color: Colors.textMuted, marginBottom: 8 },
  input: {
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    fontSize: FontSize.sm,
    color: Colors.text,
  },
  multiline: { height: 84, textAlignVertical: 'top' },
  cancelBtn: { flex: 1, borderRadius: Radius.md, paddingVertical: 11, alignItems: 'center', backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  cancelText: { color: Colors.text, fontWeight: '600', fontSize: FontSize.sm },
  saveBtn: { flex: 2, borderRadius: Radius.md, paddingVertical: 11, alignItems: 'center', backgroundColor: Colors.primary },
  saveText: { color: '#fff', fontWeight: '700', fontSize: FontSize.sm },
});
