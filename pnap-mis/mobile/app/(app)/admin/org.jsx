import { useEffect, useState } from 'react';
import {
  ActivityIndicator, FlatList, Modal, SafeAreaView,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { api, errorMessage } from '../../../src/api/client';
import { useAuth } from '../../../src/context/AuthContext';
import { isSuperAdmin, isHigherAdmin, isAreaAdmin } from '../../../src/utils/permissions';
import { confirmAction } from '../../../src/utils/dialog';
import { useToast } from '../../../src/components/Toast';
import Card from '../../../src/components/Card';
import EmptyState from '../../../src/components/EmptyState';
import { Colors, FontSize, Spacing } from '../../../src/constants/colors';

// Role-aware tier map
const TIER_CONFIG = {
  CENTRAL_ADMIN:   { title: 'Provinces', singular: 'Province',  listEP: '/org/provinces',  createEP: '/org/provinces',  deleteEP: null, canDelete: false },
  PROVINCE_ADMIN:  { title: 'Districts', singular: 'District',  listEP: '/org/districts',  createEP: '/org/districts',  deleteEP: null, canDelete: false },
  DISTRICT_ADMIN:  { title: 'Areas',     singular: 'Area',      listEP: '/org/areas',      createEP: '/org/areas',      deleteEP: null, canDelete: false },
  AREA_ADMIN:      { title: 'Basic Units', singular: 'Basic Unit', listEP: '/org/basic-units', createEP: '/org/basic-units', deleteEP: null, canDelete: false },
};

const SUPER_LEVELS = [
  { level: 'PROVINCE', title: 'Provinces', singular: 'Province', listEP: '/org/provinces', createEP: '/org/provinces', deleteEP: (id) => `/org/provinces/${id}`, canDelete: true, parentParam: null },
  { level: 'DISTRICT', title: 'Districts', singular: 'District', listEP: '/org/districts', createEP: '/org/districts', deleteEP: (id) => `/org/districts/${id}`, canDelete: true, parentParam: 'provinceId' },
  { level: 'AREA', title: 'Areas', singular: 'Area', listEP: '/org/areas', createEP: '/org/areas', deleteEP: (id) => `/org/areas/${id}`, canDelete: true, parentParam: 'districtId' },
  { level: 'BASIC_UNIT', title: 'Basic Units', singular: 'Basic Unit', listEP: '/org/basic-units', createEP: '/org/basic-units', deleteEP: (id) => `/org/basic-units/${id}`, canDelete: true, parentParam: 'areaId' }
];

function detectTier(user) {
  if (user?.roles?.includes('SUPER_ADMIN')) return 'SUPER_ADMIN';
  if (user?.roles?.includes('CENTRAL_ADMIN')) return 'CENTRAL_ADMIN';
  if (user?.roles?.includes('PROVINCE_ADMIN')) return 'PROVINCE_ADMIN';
  if (user?.roles?.includes('DISTRICT_ADMIN')) return 'DISTRICT_ADMIN';
  if (user?.roles?.includes('AREA_ADMIN')) return 'AREA_ADMIN';
  return null;
}

function scopeParams(user, tier, trail = []) {
  if (tier === 'SUPER_ADMIN') {
    const p = SUPER_LEVELS[trail.length]?.parentParam;
    return p && trail.length > 0 ? { [p]: trail[trail.length - 1]._id } : {};
  }
  const s = user?.scope || {};
  if (tier === 'PROVINCE_ADMIN') return { provinceId: s.provinceId };
  if (tier === 'DISTRICT_ADMIN') return { districtId: s.districtId };
  if (tier === 'AREA_ADMIN') return { areaId: s.areaId };
  return {};
}

export default function OrgScreen() {
  const { user } = useAuth();
  const toast = useToast();
  const tier = detectTier(user);

  const [trail, setTrail] = useState([]); // [{ _id, name }, ...]
  const config = tier === 'SUPER_ADMIN' ? SUPER_LEVELS[trail.length] : TIER_CONFIG[tier];
  const canDrill = tier === 'SUPER_ADMIN' && trail.length < SUPER_LEVELS.length - 1;

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [saving, setSaving] = useState(false);

  async function load() {
    if (!config) { setLoading(false); return; }
    setLoading(true);
    try {
      const r = await api.get(config.listEP, { params: scopeParams(user, tier, trail) });
      setItems(r.data?.data || []);
    } catch (e) { toast.error(errorMessage(e)); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [tier, trail.length]);

  async function handleCreate() {
    if (!name.trim()) { toast.error('Name is required.'); return; }
    setSaving(true);
    try {
      const body = {
        name: name.trim(),
        ...(code.trim() ? { code: code.trim().toUpperCase() } : {}),
        ...scopeParams(user, tier, trail),
      };
      await api.post(config.createEP, body);
      toast.success(`${config.singular} created successfully.`);
      setCreateOpen(false);
      setName('');
      setCode('');
      load();
    } catch (e) { toast.error(errorMessage(e)); }
    finally { setSaving(false); }
  }

  async function handleDelete(item) {
    if (!config?.canDelete || !config.deleteEP) return;
    confirmAction(
      `Delete ${config.singular}`,
      `Delete "${item.name}"? This will fail if any data still depends on this unit.`,
      async () => {
        try {
          await api.delete(config.deleteEP(item._id));
          toast.success(`${config.singular} deleted.`);
          load();
        } catch (e) { toast.error(errorMessage(e)); }
      },
      { confirmText: 'Delete', destructive: true }
    );
  }

  if (!config) {
    return (
      <SafeAreaView style={styles.safe}>
        <EmptyState icon="🏢" title="No org management available for your role." />
      </SafeAreaView>
    );
  }

  function renderItem({ item }) {
    return (
      <Card style={styles.itemCard}>
        <View style={styles.itemRow}>
          <TouchableOpacity 
            style={{ flex: 1 }} 
            onPress={() => { if (canDrill) setTrail([...trail, item]); }}
            disabled={!canDrill}
          >
            <Text style={styles.itemName}>{item.name}</Text>
            {item.code && <Text style={styles.itemCode}>{item.code}</Text>}
            {canDrill && <Text style={styles.drillHint}>View {SUPER_LEVELS[trail.length + 1]?.title.toLowerCase()} ›</Text>}
          </TouchableOpacity>
          {config.canDelete && (
            <TouchableOpacity onPress={() => handleDelete(item)} style={styles.deleteBtn}>
              <Text style={styles.deleteIcon}>🗑</Text>
            </TouchableOpacity>
          )}
        </View>
      </Card>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>🏢 {config.title}</Text>
          <Text style={styles.headerSub}>
            {tier.replace(/_/g, ' ')} · {items.length} {config.title.toLowerCase()}
          </Text>
        </View>
        <TouchableOpacity style={styles.createBtn} onPress={() => setCreateOpen(true)}>
          <Text style={styles.createBtnText}>＋ New</Text>
        </TouchableOpacity>
      </View>

      {trail.length > 0 && (
        <View style={styles.trailBar}>
          <TouchableOpacity onPress={() => setTrail(trail.slice(0, -1))} style={styles.backBtn}>
            <Text style={styles.backBtnText}>‹ Back</Text>
          </TouchableOpacity>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.trailScroll}>
            <Text style={styles.trailText}>
              {trail.map((t) => t.name).join(' › ')}
            </Text>
          </ScrollView>
        </View>
      )}

      <FlatList
        data={items}
        renderItem={renderItem}
        keyExtractor={(i) => i._id}
        contentContainerStyle={styles.list}
        onRefresh={load}
        refreshing={loading}
        ListEmptyComponent={!loading && <EmptyState icon="🏢" title={`No ${config.title.toLowerCase()} yet`} />}
      />

      <Modal visible={createOpen} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>New {config.singular}</Text>
            <TouchableOpacity onPress={() => { setCreateOpen(false); setName(''); }}>
              <Text style={styles.modalClose}>✕</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.modalBody}>
            <Text style={styles.fieldLabel}>Name *</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder={`${config.singular} name`}
              autoFocus
            />
            <Text style={styles.fieldLabel}>Code (optional)</Text>
            <TextInput
              style={styles.input}
              value={code}
              onChangeText={(v) => setCode(v.toUpperCase())}
              placeholder="e.g. QIL, PES, BL"
              autoCapitalize="characters"
            />
          </View>
          <View style={styles.modalFooter}>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => { setCreateOpen(false); setName(''); setCode(''); }}>
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
  headerTitle: { fontSize: FontSize.lg, fontWeight: '800', color: Colors.text },
  headerSub: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  createBtn: { backgroundColor: Colors.primary, borderRadius: 8, paddingHorizontal: Spacing.md, paddingVertical: 8 },
  createBtnText: { color: '#fff', fontWeight: '700', fontSize: FontSize.sm },
  list: { padding: Spacing.md },
  itemCard: { marginBottom: Spacing.sm },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  itemName: { fontSize: FontSize.base, fontWeight: '600', color: Colors.text },
  itemCode: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  deleteIcon: { fontSize: 18, color: Colors.error, padding: Spacing.sm },
  modal: { flex: 1, backgroundColor: Colors.background },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: Spacing.lg, borderBottomWidth: 1, borderBottomColor: Colors.border },
  modalTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.text },
  modalClose: { fontSize: 20, color: Colors.textMuted, padding: 4 },
  modalBody: { flex: 1, padding: Spacing.lg },
  modalFooter: { flexDirection: 'row', gap: Spacing.md, padding: Spacing.lg, borderTopWidth: 1, borderTopColor: Colors.border },
  fieldLabel: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.text, marginBottom: 6 },
  input: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: 10, paddingHorizontal: Spacing.md, paddingVertical: 12, fontSize: FontSize.base, color: Colors.text, marginBottom: Spacing.md },
  cancelBtn: { flex: 1, borderRadius: 10, paddingVertical: 12, alignItems: 'center', backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  cancelText: { color: Colors.text, fontWeight: '600' },
  saveBtn: { flex: 2, borderRadius: 10, paddingVertical: 12, alignItems: 'center', backgroundColor: Colors.primary },
  saveText: { color: '#fff', fontWeight: '700', fontSize: FontSize.base },
  drillHint: { fontSize: FontSize.xs, color: Colors.primary, fontWeight: '600', marginTop: 4 },
  deleteBtn: { padding: Spacing.sm },
  trailBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.border },
  backBtn: { marginRight: Spacing.md, paddingVertical: 4, paddingHorizontal: 8, backgroundColor: Colors.background, borderRadius: 6, borderWidth: 1, borderColor: Colors.border },
  backBtnText: { fontSize: FontSize.xs, fontWeight: '600', color: Colors.text },
  trailScroll: { alignItems: 'center' },
  trailText: { fontSize: FontSize.sm, fontWeight: '500', color: Colors.textMuted },
});
