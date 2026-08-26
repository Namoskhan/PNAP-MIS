import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, Modal, SafeAreaView,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { api, errorMessage } from '../../../../src/api/client';
import { useAuth } from '../../../../src/context/AuthContext';
import { isSuperAdmin } from '../../../../src/utils/permissions';
import { confirmAction } from '../../../../src/utils/dialog';
import { useToast } from '../../../../src/components/Toast';
import Card from '../../../../src/components/Card';
import Badge from '../../../../src/components/Badge';
import EmptyState from '../../../../src/components/EmptyState';
import { Colors, FontSize, Spacing } from '../../../../src/constants/colors';

const CREATABLE_CATEGORIES = [
  { value: 'CUSTOM', label: 'Custom (general)' },
  { value: 'BU_AREA_DISTRICT', label: 'Below-Province Cabinet' },
  { value: 'PROVINCE', label: 'Province Cabinet' },
  { value: 'CENTRAL', label: 'Central Cabinet' },
];

const EMPTY_FORM = { code: '', label: '', description: '', category: 'CUSTOM' };

export default function RolesScreen() {
  const { user } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const canWrite = isSuperAdmin(user);

  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const r = await api.get('/admin/roles');
      const data = r.data.data;
      setRoles(Array.isArray(data) ? data : (data?.roles || []));
    } catch (e) { toast.error(errorMessage(e)); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  const sorted = useMemo(() => {
    return [...roles].sort((a, b) => {
      if (a.isSystem !== b.isSystem) return a.isSystem ? -1 : 1;
      if (a.sortOrder !== b.sortOrder) return (a.sortOrder || 0) - (b.sortOrder || 0);
      return (a.label || '').localeCompare(b.label || '');
    });
  }, [roles]);

  async function handleCreate() {
    if (!form.code.trim() || !form.label.trim()) {
      toast.error('Code and label are required.'); return;
    }
    setSaving(true);
    try {
      await api.post('/admin/roles', form);
      toast.success('Custom role created.');
      setCreateOpen(false);
      setForm(EMPTY_FORM);
      load();
    } catch (e) { toast.error(errorMessage(e)); }
    finally { setSaving(false); }
  }

  async function handleEdit() {
    if (!editForm.label?.trim()) { toast.error('Label is required.'); return; }
    setSaving(true);
    try {
      await api.patch(`/admin/roles/${editing._id}`, editForm);
      toast.success('Role updated.');
      setEditing(null);
      load();
    } catch (e) { toast.error(errorMessage(e)); }
    finally { setSaving(false); }
  }

  async function handleDelete(role) {
    confirmAction(
      'Delete Role',
      `Delete custom role "${role.label}" (${role.code})? This cannot be undone.`,
      async () => {
        try {
          await api.delete(`/admin/roles/${role._id}`);
          toast.success('Role deleted.');
          load();
        } catch (e) { toast.error(errorMessage(e)); }
      },
      { confirmText: 'Delete', destructive: true }
    );
  }

  function openEdit(role) {
    setEditForm({ label: role.label, description: role.description || '', category: role.category || 'CUSTOM', isActive: role.isActive !== false });
    setEditing(role);
  }

  function renderItem({ item: r }) {
    const locked = r.code === 'SUPER_ADMIN';
    const initial = (r.label || r.code || '?').charAt(0).toUpperCase();
    const permCount = (r.permissions || []).length;
    return (
      <Card style={styles.roleCard}>
        <View style={styles.roleRow}>
          <View style={[styles.avatar, { backgroundColor: locked ? '#94a3b8' : Colors.primary }]}>
            <Text style={styles.avatarText}>{initial}</Text>
          </View>
          <View style={styles.roleMeta}>
            <View style={styles.roleNameRow}>
              <Text style={styles.roleName}>{r.label}</Text>
              {!r.isSystem && <Badge label="Custom" color="#7c3aed" bg="#f3e8ff" />}
              {!r.isActive && <Badge label="Inactive" color={Colors.textMuted} bg={Colors.borderLight} />}
            </View>
            <Text style={styles.roleCode}>{r.code}</Text>
            <Text style={styles.rolePerms}>
              {permCount === 0 && r.code !== 'SUPER_ADMIN'
                ? '⚠️ No permissions granted'
                : r.code === 'SUPER_ADMIN' ? 'All permissions' : `${permCount} permissions`}
            </Text>
          </View>
        </View>

        {!locked && (
          <View style={styles.roleActions}>
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => router.push(`/admin/roles/${r._id}`)}
            >
              <Text style={styles.actionText}>🔐 Permissions</Text>
            </TouchableOpacity>
            {canWrite && (
              <>
                <TouchableOpacity style={styles.actionBtn} onPress={() => openEdit(r)}>
                  <Text style={styles.actionText}>✎ Edit</Text>
                </TouchableOpacity>
                {!r.isSystem && (
                  <TouchableOpacity style={[styles.actionBtn, styles.actionDanger]} onPress={() => handleDelete(r)}>
                    <Text style={[styles.actionText, { color: Colors.error }]}>🗑</Text>
                  </TouchableOpacity>
                )}
              </>
            )}
          </View>
        )}
        {locked && (
          <Text style={styles.lockedLabel}>🔒 Built-in — locked</Text>
        )}
      </Card>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>🛡️ Roles Management</Text>
          <Text style={styles.headerSub}>Manage system roles and permissions</Text>
        </View>
        {canWrite && (
          <TouchableOpacity style={styles.createBtn} onPress={() => setCreateOpen(true)}>
            <Text style={styles.createBtnText}>＋ New</Text>
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={sorted}
        renderItem={renderItem}
        keyExtractor={(r) => r._id}
        contentContainerStyle={styles.list}
        onRefresh={load}
        refreshing={loading}
        ListEmptyComponent={!loading && <EmptyState icon="🛡️" title="No roles found" />}
      />

      {/* Create Modal */}
      <Modal visible={createOpen} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Create Custom Role</Text>
            <TouchableOpacity onPress={() => { setCreateOpen(false); setForm(EMPTY_FORM); }}>
              <Text style={styles.modalClose}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.modalBody}>
            <Text style={styles.fieldLabel}>Role Code *</Text>
            <TextInput
              style={styles.input}
              value={form.code}
              onChangeText={(v) => setForm((p) => ({ ...p, code: v.toUpperCase().replace(/[^A-Z0-9_]/g, '') }))}
              placeholder="e.g. YOUTH_LEADER"
              autoCapitalize="characters"
            />
            <Text style={styles.fieldLabel}>Display Label *</Text>
            <TextInput
              style={styles.input}
              value={form.label}
              onChangeText={(v) => setForm((p) => ({ ...p, label: v }))}
              placeholder="e.g. Youth Leader"
            />
            <Text style={styles.fieldLabel}>Description</Text>
            <TextInput
              style={[styles.input, styles.multiline]}
              value={form.description}
              onChangeText={(v) => setForm((p) => ({ ...p, description: v }))}
              placeholder="Optional description"
              multiline
              numberOfLines={3}
            />
            <Text style={styles.fieldLabel}>Category</Text>
            {CREATABLE_CATEGORIES.map((c) => (
              <TouchableOpacity
                key={c.value}
                style={[styles.optionRow, form.category === c.value && styles.optionRowActive]}
                onPress={() => setForm((p) => ({ ...p, category: c.value }))}
              >
                <View style={[styles.optionDot, form.category === c.value && styles.optionDotActive]} />
                <Text style={styles.optionLabel}>{c.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <View style={styles.modalFooter}>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => { setCreateOpen(false); setForm(EMPTY_FORM); }}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.saveBtn} onPress={handleCreate} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Create Role</Text>}
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>

      {/* Edit Modal */}
      <Modal visible={!!editing} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Edit Role</Text>
            <TouchableOpacity onPress={() => setEditing(null)}>
              <Text style={styles.modalClose}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.modalBody}>
            <Text style={styles.fieldLabel}>Display Label *</Text>
            <TextInput
              style={styles.input}
              value={editForm.label || ''}
              onChangeText={(v) => setEditForm((p) => ({ ...p, label: v }))}
            />
            <Text style={styles.fieldLabel}>Description</Text>
            <TextInput
              style={[styles.input, styles.multiline]}
              value={editForm.description || ''}
              onChangeText={(v) => setEditForm((p) => ({ ...p, description: v }))}
              multiline
              numberOfLines={3}
            />
            <TouchableOpacity
              style={[styles.optionRow, { marginTop: Spacing.md }]}
              onPress={() => setEditForm((p) => ({ ...p, isActive: !p.isActive }))}
            >
              <View style={[styles.optionDot, editForm.isActive && styles.optionDotActive]} />
              <Text style={styles.optionLabel}>Active (visible and assignable)</Text>
            </TouchableOpacity>
          </ScrollView>
          <View style={styles.modalFooter}>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setEditing(null)}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.saveBtn} onPress={handleEdit} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Save Changes</Text>}
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', alignItems: 'center', padding: Spacing.lg, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
  headerTitle: { fontSize: FontSize.lg, fontWeight: '800', color: Colors.text },
  headerSub: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  createBtn: { backgroundColor: Colors.primary, borderRadius: 8, paddingHorizontal: Spacing.md, paddingVertical: 8 },
  createBtnText: { color: '#fff', fontWeight: '700', fontSize: FontSize.sm },
  list: { padding: Spacing.md },
  roleCard: { marginBottom: Spacing.sm },
  roleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontWeight: '700', fontSize: FontSize.base },
  roleMeta: { flex: 1 },
  roleNameRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginBottom: 2 },
  roleName: { fontSize: FontSize.base, fontWeight: '700', color: Colors.text },
  roleCode: { fontSize: FontSize.xs, color: Colors.textMuted, fontFamily: 'monospace', marginBottom: 2 },
  rolePerms: { fontSize: FontSize.xs, color: Colors.textLight },
  roleActions: { flexDirection: 'row', gap: 8, marginTop: Spacing.sm, flexWrap: 'wrap' },
  actionBtn: { backgroundColor: Colors.background, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: Colors.border },
  actionDanger: { borderColor: Colors.error + '40' },
  actionText: { fontSize: FontSize.xs, color: Colors.primary, fontWeight: '600' },
  lockedLabel: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: Spacing.sm },
  // Modal
  modal: { flex: 1, backgroundColor: Colors.background },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: Spacing.lg, borderBottomWidth: 1, borderBottomColor: Colors.border },
  modalTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.text },
  modalClose: { fontSize: 20, color: Colors.textMuted, padding: 4 },
  modalBody: { flex: 1, padding: Spacing.lg },
  modalFooter: { flexDirection: 'row', gap: Spacing.md, padding: Spacing.lg, borderTopWidth: 1, borderTopColor: Colors.border },
  fieldLabel: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.text, marginBottom: 6, marginTop: Spacing.sm },
  input: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: 10, paddingHorizontal: Spacing.md, paddingVertical: 10, fontSize: FontSize.sm, color: Colors.text },
  multiline: { height: 80, textAlignVertical: 'top' },
  optionRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 10, paddingHorizontal: Spacing.sm, borderRadius: 8, borderWidth: 1, borderColor: Colors.border, marginBottom: 8 },
  optionRowActive: { borderColor: Colors.primary, backgroundColor: '#eff6ff' },
  optionDot: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: Colors.border },
  optionDotActive: { borderColor: Colors.primary, backgroundColor: Colors.primary },
  optionLabel: { fontSize: FontSize.sm, color: Colors.text },
  cancelBtn: { flex: 1, borderRadius: 10, paddingVertical: 12, alignItems: 'center', backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  cancelText: { color: Colors.text, fontWeight: '600' },
  saveBtn: { flex: 2, borderRadius: 10, paddingVertical: 12, alignItems: 'center', backgroundColor: Colors.primary },
  saveText: { color: '#fff', fontWeight: '700', fontSize: FontSize.base },
});
