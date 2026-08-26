import { useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, Modal, SafeAreaView,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { api, errorMessage } from '../../../../src/api/client';
import { useAuth } from '../../../../src/context/AuthContext';
import { isSuperAdmin, isHigherAdmin } from '../../../../src/utils/permissions';
import { useToast } from '../../../../src/components/Toast';
import Card from '../../../../src/components/Card';
import Badge from '../../../../src/components/Badge';
import Avatar from '../../../../src/components/Avatar';
import EmptyState from '../../../../src/components/EmptyState';
import { Colors, FontSize, Spacing } from '../../../../src/constants/colors';

const ROLE_OPTIONS = [
  'SUPER_ADMIN', 'CENTRAL_ADMIN', 'PROVINCE_ADMIN', 'DISTRICT_ADMIN', 'AREA_ADMIN',
  'SECRETARY', 'SENIOR_MAWIN', 'FINANCE_SECRETARY',
  'PRESS_SECRETARY', 'CULTURE_SECRETARY', 'SPORTS_SECRETARY',
  'PRESIDENT', 'SR_VICE_PRESIDENT', 'VICE_PRESIDENT', 'GENERAL_SECRETARY',
  'CHAIRMAN', 'CO_CHAIRMAN', 'SR_VICE_CHAIRMAN', 'VICE_CHAIRMAN', 'FIRST_SECRETARY',
  'OTHER', 'MEMBER',
];

const STATUS_OPTIONS = [
  { label: 'All', value: '' },
  { label: 'Active', value: 'true' },
  { label: 'Inactive', value: 'false' },
];

const PAGE_SIZE = 20;

export default function UsersScreen() {
  const { user: viewer } = useAuth();
  const toast = useToast();
  const canWrite = isSuperAdmin(viewer);

  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [q, setQ] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selected, setSelected] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ fullName: '', email: '', phone: '', password: '', role: 'MEMBER' });
  const [saving, setSaving] = useState(false);

  async function load(pg = 1, refresh = false) {
    if (loading && !refresh) return;
    setLoading(true);
    try {
      const params = { page: pg, limit: PAGE_SIZE };
      if (q.trim()) params.q = q.trim();
      if (roleFilter) params.role = roleFilter;
      if (statusFilter !== '') params.isActive = statusFilter;
      const r = await api.get('/admin/users', { params });
      const data = r.data.data || [];
      const tot = r.data.meta?.total || data.length;
      if (refresh || pg === 1) setItems(data);
      else setItems((prev) => [...prev, ...data]);
      setTotal(tot);
      setHasMore(data.length === PAGE_SIZE);
    } catch (e) { toast.error(errorMessage(e)); }
    finally { setLoading(false); setRefreshing(false); }
  }

  useEffect(() => { setPage(1); load(1, true); }, [q, roleFilter, statusFilter]);

  function onLoadMore() {
    if (!hasMore || loading) return;
    const next = page + 1;
    setPage(next);
    load(next);
  }

  async function handleCreate() {
    if (!form.fullName.trim() || !form.password) {
      toast.error('Full name and password are required.'); return;
    }
    setSaving(true);
    try {
      await api.post('/admin/users', form);
      toast.success('User created.');
      setCreateOpen(false);
      setForm({ fullName: '', email: '', phone: '', password: '', role: 'MEMBER' });
      load(1, true);
    } catch (e) { toast.error(errorMessage(e)); }
    finally { setSaving(false); }
  }

  async function toggleActive(u) {
    const endpoint = u.isActive ? `/admin/users/${u._id}/deactivate` : `/admin/users/${u._id}/activate`;
    try {
      await api.post(endpoint);
      toast.success(u.isActive ? 'User deactivated.' : 'User activated.');
      setSelected(null);
      load(1, true);
    } catch (e) { toast.error(errorMessage(e)); }
  }

  function renderItem({ item: u }) {
    const initial = (u.fullName || u.email || '?').charAt(0).toUpperCase();
    return (
      <TouchableOpacity onPress={() => setSelected(u)}>
        <Card style={styles.userCard}>
          <View style={styles.userRow}>
            <Avatar name={u.fullName || u.email} size={44} color={u.isActive ? Colors.primary : Colors.textMuted} />
            <View style={styles.userMeta}>
              <Text style={styles.userName}>{u.fullName || '—'}</Text>
              <Text style={styles.userEmail}>{u.email || u.phone || '—'}</Text>
              <View style={styles.userRoles}>
                {(u.roles || []).slice(0, 3).map((r) => (
                  <Badge key={r} label={r.replace(/_/g, ' ')} color={Colors.primary} bg="#eff6ff" />
                ))}
                {(u.roles || []).length > 3 && (
                  <Badge label={`+${u.roles.length - 3}`} color={Colors.textMuted} bg={Colors.borderLight} />
                )}
              </View>
            </View>
            <Badge
              label={u.isActive ? 'Active' : 'Inactive'}
              color={u.isActive ? Colors.success : Colors.error}
              bg={u.isActive ? Colors.successBg : Colors.errorBg}
            />
          </View>
        </Card>
      </TouchableOpacity>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      {/* Search bar */}
      <View style={styles.searchBar}>
        <TextInput
          style={styles.searchInput}
          value={q}
          onChangeText={setQ}
          placeholder="Search by name, email, phone…"
          clearButtonMode="while-editing"
        />
        {canWrite && (
          <TouchableOpacity style={styles.createBtn} onPress={() => setCreateOpen(true)}>
            <Text style={styles.createBtnText}>＋</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Status filter */}
      <View style={styles.filterRow}>
        {STATUS_OPTIONS.map((s) => (
          <TouchableOpacity
            key={s.value}
            style={[styles.filterPill, statusFilter === s.value && styles.filterPillActive]}
            onPress={() => setStatusFilter(s.value)}
          >
            <Text style={[styles.filterText, statusFilter === s.value && styles.filterTextActive]}>{s.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={items}
        renderItem={renderItem}
        keyExtractor={(u) => u._id}
        contentContainerStyle={styles.list}
        onRefresh={() => { setRefreshing(true); load(1, true); }}
        refreshing={refreshing}
        onEndReached={onLoadMore}
        onEndReachedThreshold={0.3}
        ListEmptyComponent={!loading && <EmptyState icon="👤" title="No users found" />}
        ListFooterComponent={loading && !refreshing ? <ActivityIndicator style={{ padding: 16 }} color={Colors.primary} /> : null}
      />

      {/* User Detail Bottom Sheet */}
      <Modal visible={!!selected} animationType="slide" presentationStyle="pageSheet">
        {selected && (
          <SafeAreaView style={styles.modal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>User Detail</Text>
              <TouchableOpacity onPress={() => setSelected(null)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalBody}>
              <View style={styles.userDetailHeader}>
                <Avatar name={selected.fullName || selected.email} size={64} color={Colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.detailName}>{selected.fullName || '—'}</Text>
                  <Text style={styles.detailEmail}>{selected.email || selected.phone || '—'}</Text>
                  <Badge
                    label={selected.isActive ? 'Active' : 'Inactive'}
                    color={selected.isActive ? Colors.success : Colors.error}
                    bg={selected.isActive ? Colors.successBg : Colors.errorBg}
                  />
                </View>
              </View>
              <Text style={styles.fieldLabel}>Roles</Text>
              <View style={styles.roleGrid}>
                {(selected.roles || []).map((r) => (
                  <Badge key={r} label={r.replace(/_/g, ' ')} color={Colors.primary} bg="#eff6ff" />
                ))}
              </View>
              {selected.scope && (
                <>
                  <Text style={styles.fieldLabel}>Scope</Text>
                  {selected.scope.provinceName && <Text style={styles.scopeRow}>Province: {selected.scope.provinceName}</Text>}
                  {selected.scope.districtName && <Text style={styles.scopeRow}>District: {selected.scope.districtName}</Text>}
                  {selected.scope.areaName && <Text style={styles.scopeRow}>Area: {selected.scope.areaName}</Text>}
                </>
              )}
            </ScrollView>
            {canWrite && (
              <View style={styles.modalFooter}>
                <TouchableOpacity
                  style={[styles.actionLargeBtn, { backgroundColor: selected.isActive ? Colors.error : Colors.success }]}
                  onPress={() => toggleActive(selected)}
                >
                  <Text style={styles.actionLargeBtnText}>
                    {selected.isActive ? 'Deactivate User' : 'Activate User'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </SafeAreaView>
        )}
      </Modal>

      {/* Create User Modal */}
      <Modal visible={createOpen} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Create User</Text>
            <TouchableOpacity onPress={() => { setCreateOpen(false); }}>
              <Text style={styles.modalClose}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.modalBody}>
            <Text style={styles.fieldLabel}>Full Name *</Text>
            <TextInput style={styles.input} value={form.fullName} onChangeText={(v) => setForm((p) => ({ ...p, fullName: v }))} placeholder="Full Name" />
            <Text style={styles.fieldLabel}>Email</Text>
            <TextInput style={styles.input} value={form.email} onChangeText={(v) => setForm((p) => ({ ...p, email: v }))} placeholder="Email" keyboardType="email-address" autoCapitalize="none" />
            <Text style={styles.fieldLabel}>Phone</Text>
            <TextInput style={styles.input} value={form.phone} onChangeText={(v) => setForm((p) => ({ ...p, phone: v }))} placeholder="Phone" keyboardType="phone-pad" />
            <Text style={styles.fieldLabel}>Password *</Text>
            <TextInput style={styles.input} value={form.password} onChangeText={(v) => setForm((p) => ({ ...p, password: v }))} placeholder="Password" secureTextEntry />
            <Text style={styles.fieldLabel}>Role</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: Spacing.md }}>
              {ROLE_OPTIONS.map((r) => (
                <TouchableOpacity
                  key={r}
                  style={[styles.rolePill, form.role === r && styles.rolePillActive]}
                  onPress={() => setForm((p) => ({ ...p, role: r }))}
                >
                  <Text style={[styles.rolePillText, form.role === r && styles.rolePillTextActive]}>
                    {r.replace(/_/g, ' ')}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </ScrollView>
          <View style={styles.modalFooter}>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setCreateOpen(false)}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.saveBtn} onPress={handleCreate} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Create User</Text>}
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  searchBar: { flexDirection: 'row', gap: Spacing.sm, padding: Spacing.md, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
  searchInput: { flex: 1, backgroundColor: Colors.background, borderRadius: 10, paddingHorizontal: Spacing.md, paddingVertical: 8, fontSize: FontSize.sm, color: Colors.text, borderWidth: 1, borderColor: Colors.border },
  createBtn: { backgroundColor: Colors.primary, borderRadius: 10, width: 40, alignItems: 'center', justifyContent: 'center' },
  createBtnText: { color: '#fff', fontSize: 20, fontWeight: '700' },
  filterRow: { flexDirection: 'row', gap: Spacing.sm, padding: Spacing.md, backgroundColor: Colors.surface },
  filterPill: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.background },
  filterPillActive: { borderColor: Colors.primary, backgroundColor: '#eff6ff' },
  filterText: { fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: '600' },
  filterTextActive: { color: Colors.primary },
  list: { padding: Spacing.md },
  userCard: { marginBottom: Spacing.sm },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  userMeta: { flex: 1 },
  userName: { fontSize: FontSize.base, fontWeight: '700', color: Colors.text },
  userEmail: { fontSize: FontSize.xs, color: Colors.textMuted, marginBottom: 4 },
  userRoles: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  // Detail modal
  modal: { flex: 1, backgroundColor: Colors.background },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: Spacing.lg, borderBottomWidth: 1, borderBottomColor: Colors.border },
  modalTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.text },
  modalClose: { fontSize: 20, color: Colors.textMuted, padding: 4 },
  modalBody: { flex: 1, padding: Spacing.lg },
  modalFooter: { padding: Spacing.lg, borderTopWidth: 1, borderTopColor: Colors.border },
  userDetailHeader: { flexDirection: 'row', gap: Spacing.lg, alignItems: 'flex-start', marginBottom: Spacing.lg },
  detailName: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.text, marginBottom: 4 },
  detailEmail: { fontSize: FontSize.sm, color: Colors.textMuted, marginBottom: 8 },
  fieldLabel: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.text, marginBottom: 8, marginTop: Spacing.md },
  roleGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  scopeRow: { fontSize: FontSize.sm, color: Colors.text, paddingVertical: 4 },
  actionLargeBtn: { borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  actionLargeBtnText: { color: '#fff', fontWeight: '700', fontSize: FontSize.base },
  input: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: 10, paddingHorizontal: Spacing.md, paddingVertical: 10, fontSize: FontSize.sm, color: Colors.text, marginBottom: 4 },
  cancelBtn: { flex: 1, borderRadius: 10, paddingVertical: 12, alignItems: 'center', backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  cancelText: { color: Colors.text, fontWeight: '600' },
  saveBtn: { flex: 2, borderRadius: 10, paddingVertical: 12, alignItems: 'center', backgroundColor: Colors.primary },
  saveText: { color: '#fff', fontWeight: '700', fontSize: FontSize.base },
  rolePill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: Colors.border, marginRight: 6, backgroundColor: Colors.background },
  rolePillActive: { borderColor: Colors.primary, backgroundColor: Colors.primary },
  rolePillText: { fontSize: FontSize.xs, color: Colors.textMuted },
  rolePillTextActive: { color: '#fff', fontWeight: '700' },
});
