import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, FlatList, Modal, SafeAreaView,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { api, errorMessage } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { hasPermission } from '../utils/permissions';
import { confirmAction } from '../utils/dialog';
import { useToast } from './Toast';
import Card from './Card';
import Badge from './Badge';
import EmptyState from './EmptyState';
import { Colors, FontSize, Spacing } from '../constants/colors';

// Shared component used by both meetings.jsx and activities.jsx
export function EventTypeList({ entity, title, icon }) {
  const { user } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const canWrite = hasPermission(user, 'MANAGE_EVENT_CONFIG');

  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ code: '', label: '', description: '' });
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const r = await api.get('/admin/events/types', { params: { entity } });
      setTypes(r.data?.data || []);
    } catch (e) { toast.error(errorMessage(e)); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [entity]);

  const sorted = useMemo(() => {
    return [...types].sort((a, b) => {
      if (a.isSystem !== b.isSystem) return a.isSystem ? -1 : 1;
      if (a.sortOrder !== b.sortOrder) return (a.sortOrder || 0) - (b.sortOrder || 0);
      return (a.label || '').localeCompare(b.label || '');
    });
  }, [types]);

  async function handleCreate() {
    if (!form.code.trim() || !form.label.trim()) {
      toast.error('Code and label are required.'); return;
    }
    setSaving(true);
    try {
      await api.post('/admin/events/types', { ...form, entity });
      toast.success('Type created.');
      setCreateOpen(false);
      setForm({ code: '', label: '', description: '' });
      load();
    } catch (e) { toast.error(errorMessage(e)); }
    finally { setSaving(false); }
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
        } catch (e) { toast.error(errorMessage(e)); }
      },
      { confirmText: 'Delete', destructive: true }
    );
  }

  function renderItem({ item: t }) {
    return (
      <Card style={styles.typeCard}>
        <View style={styles.typeRow}>
          <View style={{ flex: 1 }}>
            <View style={styles.typeNameRow}>
              <Text style={styles.typeName}>{t.label}</Text>
              {!t.isSystem && <Badge label="Custom" color="#7c3aed" bg="#f3e8ff" />}
              {!t.isActive && <Badge label="Inactive" color={Colors.textMuted} bg={Colors.borderLight} />}
            </View>
            <Text style={styles.typeCode}>{t.code}</Text>
            {t.description ? <Text style={styles.typeDesc} numberOfLines={2}>{t.description}</Text> : null}
          </View>
          <View style={styles.typeActions}>
            {(hasPermission(user, 'VIEW_EVENT_CONFIG') || canWrite) && (
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => router.push(`/admin/event-types/${t._id}`)}
              >
                <Text style={styles.actionText}>✎ Edit</Text>
              </TouchableOpacity>
            )}
            {canWrite && !t.isSystem && (
              <TouchableOpacity
                style={[styles.actionBtn, styles.actionDanger]}
                onPress={() => handleDelete(t)}
              >
                <Text style={[styles.actionText, { color: Colors.error }]}>🗑</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Card>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{icon} {title}</Text>
        {canWrite && (
          <TouchableOpacity style={styles.createBtn} onPress={() => setCreateOpen(true)}>
            <Text style={styles.createBtnText}>＋ New</Text>
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={sorted}
        renderItem={renderItem}
        keyExtractor={(t) => t._id}
        contentContainerStyle={styles.list}
        onRefresh={load}
        refreshing={loading}
        ListEmptyComponent={!loading && <EmptyState icon={icon} title={`No ${title.toLowerCase()} yet`} />}
      />

      <Modal visible={createOpen} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>New {entity === 'MEETING' ? 'Meeting' : 'Activity'} Type</Text>
            <TouchableOpacity onPress={() => { setCreateOpen(false); setForm({ code: '', label: '', description: '' }); }}>
              <Text style={styles.modalClose}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.modalBody}>
            <Text style={styles.fieldLabel}>Type Code *</Text>
            <TextInput
              style={styles.input}
              value={form.code}
              onChangeText={(v) => setForm((p) => ({ ...p, code: v.toUpperCase().replace(/[^A-Z0-9_]/g, '') }))}
              placeholder="e.g. EMERGENCY_MEETING"
              autoCapitalize="characters"
            />
            <Text style={styles.fieldLabel}>Display Label *</Text>
            <TextInput
              style={styles.input}
              value={form.label}
              onChangeText={(v) => setForm((p) => ({ ...p, label: v }))}
              placeholder="e.g. Emergency Meeting"
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
          </ScrollView>
          <View style={styles.modalFooter}>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => { setCreateOpen(false); setForm({ code: '', label: '', description: '' }); }}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.saveBtn} onPress={handleCreate} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Create</Text>}
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
  headerTitle: { flex: 1, fontSize: FontSize.lg, fontWeight: '800', color: Colors.text },
  createBtn: { backgroundColor: Colors.primary, borderRadius: 8, paddingHorizontal: Spacing.md, paddingVertical: 8 },
  createBtnText: { color: '#fff', fontWeight: '700', fontSize: FontSize.sm },
  list: { padding: Spacing.md },
  typeCard: { marginBottom: Spacing.sm },
  typeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  typeNameRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginBottom: 2 },
  typeName: { fontSize: FontSize.base, fontWeight: '700', color: Colors.text },
  typeCode: { fontSize: FontSize.xs, color: Colors.textMuted, fontFamily: 'monospace', marginBottom: 2 },
  typeDesc: { fontSize: FontSize.xs, color: Colors.textLight, lineHeight: 16 },
  typeActions: { gap: 6 },
  actionBtn: { backgroundColor: Colors.background, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: Colors.border },
  actionDanger: { borderColor: Colors.error + '40' },
  actionText: { fontSize: FontSize.xs, color: Colors.primary, fontWeight: '600' },
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
  cancelBtn: { flex: 1, borderRadius: 10, paddingVertical: 12, alignItems: 'center', backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  cancelText: { color: Colors.text, fontWeight: '600' },
  saveBtn: { flex: 2, borderRadius: 10, paddingVertical: 12, alignItems: 'center', backgroundColor: Colors.primary },
  saveText: { color: '#fff', fontWeight: '700', fontSize: FontSize.base },
});

export default function Shared() {
  return null;
}
