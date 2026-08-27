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
import { Link, useLocalSearchParams } from 'expo-router';
import { api, errorMessage } from '../../../src/api/client';
import { useAuth } from '../../../src/context/AuthContext';
import { useToast } from '../../../src/components/Toast';
import { formatCnic, isCompleteCnic } from '../../../src/utils/formatters';
import Card from '../../../src/components/Card';
import Badge from '../../../src/components/Badge';
import Avatar from '../../../src/components/Avatar';
import EmptyState from '../../../src/components/EmptyState';
import DatePicker from '../../../src/components/DatePicker';
import { Colors, FontSize, Radius, Spacing } from '../../../src/constants/colors';

const STATUSES = [
  { label: 'All', value: '' },
  { label: 'Active', value: 'ACTIVE' },
  { label: 'Pending', value: 'PENDING_APPROVAL' },
  { label: 'Inactive', value: 'INACTIVE' },
  { label: 'Rejected', value: 'REJECTED' },
];

const GENDERS = [
  { label: 'Male', value: 'MALE' },
  { label: 'Female', value: 'FEMALE' },
  { label: 'Other', value: 'PREFER_NOT_TO_SAY' },
];

const INITIAL_FORM = {
  fullName: '',
  fatherOrHusbandName: '',
  cnic: '',
  phone: '',
  email: '',
  password: '',
  dateOfBirth: '2000-01-01',
  gender: 'MALE',
  address: '',
  basicUnitId: '',
};

export default function MembersScreen() {
  const { user } = useAuth();
  const toast = useToast();
  const { status: initialStatus } = useLocalSearchParams();
  const [items, setItems] = useState([]);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState(initialStatus || '');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Register Modal state
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(INITIAL_FORM);
  const [saving, setSaving] = useState(false);
  const [modalErr, setModalErr] = useState('');

  // Cascading Unit Pickers for Register Modal
  const [provinces, setProvinces] = useState([]);
  const [districts, setDistricts] = useState([]);
  const [areas, setAreas] = useState([]);
  const [units, setUnits] = useState([]);

  const [provinceId, setProvinceId] = useState('');
  const [districtId, setDistrictId] = useState('');
  const [areaId, setAreaId] = useState('');

  const isHigherAdmin = ['SUPER_ADMIN', 'CENTRAL_ADMIN'].some((r) => user?.roles?.includes(r));
  const scopeParams = (() => {
    if (isHigherAdmin) return {};
    if (user?.scope?.areaId) return { areaId: user.scope.areaId };
    if (user?.scope?.districtId) return { districtId: user.scope.districtId };
    if (user?.scope?.provinceId) return { provinceId: user.scope.provinceId };
    return {};
  })();

  async function load(pg = 1, refresh = false) {
    if (loading && !refresh) return;
    setLoading(true);
    try {
      const res = await api.get('/members', {
        params: { q, status, page: pg, limit: 20, scope: 'all', ...scopeParams },
      });
      const newItems = res.data.data || [];
      if (refresh || pg === 1) {
        setItems(newItems);
      } else {
        setItems((prev) => [...prev, ...newItems]);
      }
      setHasMore(pg < (res.data.meta?.totalPages || 1));
      setPage(pg);
    } catch { /* silently ignore */ } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => { load(1, true); }, [q, status]);

  function onRefresh() {
    setRefreshing(true);
    load(1, true);
  }

  function onEndReached() {
    if (hasMore && !loading) load(page + 1);
  }

  // Load Org Hierarchy for registration modal
  useEffect(() => {
    if (!showCreate) return;
    setForm(INITIAL_FORM);
    setModalErr('');
    api.get('/org/provinces')
      .then((r) => setProvinces(r.data?.data || []))
      .catch(() => {});
  }, [showCreate]);

  useEffect(() => {
    if (!provinceId) { setDistricts([]); setDistrictId(''); return; }
    api.get('/org/districts', { params: { provinceId } })
      .then((r) => setDistricts(r.data?.data || []))
      .catch(() => {});
  }, [provinceId]);

  useEffect(() => {
    if (!districtId) { setAreas([]); setAreaId(''); return; }
    api.get('/org/areas', { params: { districtId } })
      .then((r) => setAreas(r.data?.data || []))
      .catch(() => {});
  }, [districtId]);

  useEffect(() => {
    if (!areaId) { setUnits([]); setForm((f) => ({ ...f, basicUnitId: '' })); return; }
    api.get('/org/basic-units', { params: { areaId } })
      .then((r) => setUnits(r.data?.data || []))
      .catch(() => {});
  }, [areaId]);

  async function handleCreateMember() {
    if (!form.fullName.trim() || !form.fatherOrHusbandName.trim() || !form.cnic || !form.phone || !form.email || !form.basicUnitId) {
      setModalErr('Please fill in all required fields (marked *).');
      return;
    }
    if (!isCompleteCnic(form.cnic)) {
      setModalErr('CNIC must be 13 digits (XXXXX-XXXXXXX-X).');
      return;
    }
    if (!form.password || form.password.length < 6) {
      setModalErr('Initial password must be at least 6 characters.');
      return;
    }

    setModalErr('');
    setSaving(true);
    try {
      await api.post('/members', {
        fullName: form.fullName.trim(),
        fatherOrHusbandName: form.fatherOrHusbandName.trim(),
        cnic: form.cnic,
        phone: form.phone.trim(),
        email: form.email.trim(),
        password: form.password,
        dateOfBirth: form.dateOfBirth,
        gender: form.gender,
        address: form.address.trim() || 'Not specified',
        basicUnitId: form.basicUnitId,
      });
      toast.success('Member created successfully!');
      setShowCreate(false);
      load(1, true);
    } catch (e) {
      setModalErr(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  function renderItem({ item: m }) {
    return (
      <Link href={`/members/${m._id}`} asChild>
        <TouchableOpacity>
          <Card style={styles.card}>
            <View style={styles.row}>
              <Avatar name={m.fullName} size={44} />
              <View style={styles.info}>
                <Text style={styles.name} numberOfLines={1}>{m.fullName}</Text>
                <Text style={styles.meta} numberOfLines={1}>
                  {m.memberId || '—'} · {m.basicUnitId?.name || m.areaId?.name || '—'}
                </Text>
              </View>
              <Badge label={m.status?.replace('_', ' ') || '—'} status={m.status} />
            </View>
          </Card>
        </TouchableOpacity>
      </Link>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      {/* Search */}
      <View style={styles.searchBar}>
        <TextInput
          style={styles.searchInput}
          value={q}
          onChangeText={(v) => { setQ(v); }}
          placeholder="Search name, CNIC, phone…"
          placeholderTextColor={Colors.textLight}
          autoCapitalize="none"
          clearButtonMode="while-editing"
        />
      </View>

      {/* Status filter */}
      <View style={styles.filters}>
        {STATUSES.map((s) => (
          <TouchableOpacity
            key={s.value}
            style={[styles.filterPill, status === s.value && styles.filterPillActive]}
            onPress={() => setStatus(s.value)}
          >
            <Text style={[styles.filterText, status === s.value && styles.filterTextActive]}>
              {s.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={items}
        renderItem={renderItem}
        keyExtractor={(m) => m._id}
        contentContainerStyle={styles.list}
        onRefresh={onRefresh}
        refreshing={refreshing}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.3}
        ListEmptyComponent={!loading && <EmptyState icon="👤" title="No members found" subtitle="Try adjusting your search or filter." />}
        ListFooterComponent={loading && !refreshing ? <ActivityIndicator style={{ padding: 16 }} color={Colors.primary} /> : null}
      />

      {/* Floating Action Button to Register / Create Member */}
      <TouchableOpacity style={styles.fab} onPress={() => setShowCreate(true)}>
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>

      {/* Create Member Modal */}
      <Modal visible={showCreate} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowCreate(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setShowCreate(false)}>
                <Text style={styles.modalCancel}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>Register Member</Text>
              <TouchableOpacity onPress={handleCreateMember} disabled={saving}>
                {saving ? <ActivityIndicator color={Colors.primary} /> : <Text style={styles.modalSave}>Save</Text>}
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
              {modalErr ? (
                <View style={styles.errorBanner}>
                  <Text style={styles.errorText}>{modalErr}</Text>
                </View>
              ) : null}

              <Text style={styles.formSection}>Personal Info</Text>

              <View style={styles.field}>
                <Text style={styles.label}>Full Name *</Text>
                <TextInput
                  style={styles.input}
                  value={form.fullName}
                  onChangeText={(v) => setForm((f) => ({ ...f, fullName: v }))}
                  placeholder="Full Name"
                />
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Father / Husband Name *</Text>
                <TextInput
                  style={styles.input}
                  value={form.fatherOrHusbandName}
                  onChangeText={(v) => setForm((f) => ({ ...f, fatherOrHusbandName: v }))}
                  placeholder="Father or Husband Name"
                />
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>CNIC *</Text>
                <TextInput
                  style={styles.input}
                  value={form.cnic}
                  onChangeText={(v) => setForm((f) => ({ ...f, cnic: formatCnic(v) }))}
                  placeholder="XXXXX-XXXXXXX-X"
                  keyboardType="numeric"
                  maxLength={15}
                />
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Phone Number *</Text>
                <TextInput
                  style={styles.input}
                  value={form.phone}
                  onChangeText={(v) => setForm((f) => ({ ...f, phone: v }))}
                  placeholder="03XX-XXXXXXX"
                  keyboardType="phone-pad"
                />
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Email Address *</Text>
                <TextInput
                  style={styles.input}
                  value={form.email}
                  onChangeText={(v) => setForm((f) => ({ ...f, email: v }))}
                  placeholder="name@example.com"
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Initial Password *</Text>
                <TextInput
                  style={styles.input}
                  value={form.password}
                  onChangeText={(v) => setForm((f) => ({ ...f, password: v }))}
                  placeholder="At least 6 characters"
                  secureTextEntry
                />
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Gender</Text>
                <View style={styles.chipRow}>
                  {GENDERS.map((g) => (
                    <TouchableOpacity
                      key={g.value}
                      style={[styles.chip, form.gender === g.value && styles.chipActive]}
                      onPress={() => setForm((f) => ({ ...f, gender: g.value }))}
                    >
                      <Text style={[styles.chipText, form.gender === g.value && styles.chipTextActive]}>
                        {g.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <DatePicker
                label="Date of Birth *"
                value={form.dateOfBirth}
                onChange={(v) => setForm((f) => ({ ...f, dateOfBirth: v }))}
                placeholder="Select birth date"
                maxDate={new Date().toISOString().split('T')[0]}
              />

              <View style={styles.field}>
                <Text style={styles.label}>Address *</Text>
                <TextInput
                  style={[styles.input, styles.multiline]}
                  value={form.address}
                  onChangeText={(v) => setForm((f) => ({ ...f, address: v }))}
                  placeholder="Residential Address"
                  multiline
                  numberOfLines={2}
                />
              </View>

              <Text style={[styles.formSection, { marginTop: Spacing.lg }]}>Unit Hierarchy</Text>

              {/* Province */}
              <View style={styles.field}>
                <Text style={styles.label}>1. Province *</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
                  {provinces.map((p) => (
                    <TouchableOpacity
                      key={p._id}
                      style={[styles.chip, provinceId === p._id && styles.chipActive]}
                      onPress={() => setProvinceId(p._id)}
                    >
                      <Text style={[styles.chipText, provinceId === p._id && styles.chipTextActive]}>{p.name}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              {/* District */}
              {provinceId ? (
                <View style={styles.field}>
                  <Text style={styles.label}>2. District *</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
                    {districts.map((d) => (
                      <TouchableOpacity
                        key={d._id}
                        style={[styles.chip, districtId === d._id && styles.chipActive]}
                        onPress={() => setDistrictId(d._id)}
                      >
                        <Text style={[styles.chipText, districtId === d._id && styles.chipTextActive]}>{d.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              ) : null}

              {/* Area */}
              {districtId ? (
                <View style={styles.field}>
                  <Text style={styles.label}>3. Area *</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
                    {areas.map((a) => (
                      <TouchableOpacity
                        key={a._id}
                        style={[styles.chip, areaId === a._id && styles.chipActive]}
                        onPress={() => setAreaId(a._id)}
                      >
                        <Text style={[styles.chipText, areaId === a._id && styles.chipTextActive]}>{a.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              ) : null}

              {/* Basic Unit */}
              {areaId ? (
                <View style={styles.field}>
                  <Text style={styles.label}>4. Basic Unit *</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
                    {units.map((u) => (
                      <TouchableOpacity
                        key={u._id}
                        style={[styles.chip, form.basicUnitId === u._id && styles.chipActive]}
                        onPress={() => setForm((f) => ({ ...f, basicUnitId: u._id }))}
                      >
                        <Text style={[styles.chipText, form.basicUnitId === u._id && styles.chipTextActive]}>{u.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              ) : null}
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  searchBar: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
  searchInput: {
    backgroundColor: Colors.surfaceAlt, borderRadius: 10, paddingHorizontal: Spacing.md,
    paddingVertical: 9, fontSize: FontSize.base, color: Colors.text, borderWidth: 1, borderColor: Colors.border,
  },
  filters: { flexDirection: 'row', gap: 6, padding: Spacing.md, paddingTop: Spacing.sm, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border, flexWrap: 'wrap' },
  filterPill: { paddingHorizontal: Spacing.sm, paddingVertical: 5, borderRadius: 99, backgroundColor: Colors.surfaceAlt, borderWidth: 1, borderColor: Colors.border },
  filterPillActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  filterText: { fontSize: FontSize.xs, fontWeight: '600', color: Colors.textMuted },
  filterTextActive: { color: '#fff' },
  list: { padding: Spacing.lg, paddingTop: Spacing.md, paddingBottom: 80 },
  card: { marginBottom: Spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  info: { flex: 1 },
  name: { fontSize: FontSize.base, fontWeight: '600', color: Colors.text, marginBottom: 2 },
  meta: { fontSize: FontSize.xs, color: Colors.textMuted },
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
  formSection: { fontSize: FontSize.base, fontWeight: '700', color: Colors.primaryDark, marginBottom: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.borderLight, paddingBottom: 6 },
  field: { marginBottom: Spacing.md },
  label: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.text, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: 10, paddingHorizontal: Spacing.md, paddingVertical: 10, fontSize: FontSize.sm, color: Colors.text },
  multiline: { height: 60, textAlignVertical: 'top' },
  chipRow: { flexDirection: 'row', gap: 8 },
  chipScroll: { flexDirection: 'row', marginBottom: 4 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface, marginRight: 8 },
  chipActive: { borderColor: Colors.primary, backgroundColor: Colors.primary },
  chipText: { fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: '600' },
  chipTextActive: { color: '#fff', fontWeight: '700' },
  errorBanner: { backgroundColor: Colors.errorBg, borderRadius: 8, padding: Spacing.md, marginBottom: Spacing.md, borderWidth: 1, borderColor: Colors.error + '30' },
  errorText: { color: Colors.error, fontSize: FontSize.sm, fontWeight: '500' },
});

