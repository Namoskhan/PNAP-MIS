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
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api, errorMessage } from '../../../src/api/client';
import { useAuth } from '../../../src/context/AuthContext';
import { useToast } from '../../../src/components/Toast';
import { formatCnic, isCompleteCnic } from '../../../src/utils/formatters';
import { hasPermission } from '../../../src/utils/permissions';
import Card from '../../../src/components/Card';
import Badge from '../../../src/components/Badge';
import Avatar from '../../../src/components/Avatar';
import EmptyState from '../../../src/components/EmptyState';
import DatePicker from '../../../src/components/DatePicker';
import { Colors, FontSize, Radius, Spacing } from '../../../src/constants/colors';

const STATUS_FILTERS = [
  { label: 'All', value: '' },
  { label: 'Pending', value: 'PENDING_APPROVAL' },
  { label: 'Active', value: 'ACTIVE' },
  { label: 'Rejected', value: 'REJECTED' },
  { label: 'Inactive', value: 'INACTIVE' },
  { label: 'Suspended', value: 'SUSPENDED' },
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
  const [items, setItems] = useState([]);
  const [meta, setMeta] = useState({ page: 1, totalPages: 1, total: 0 });
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
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

  // Super and Central are the two unbounded tiers — mirrors server hierarchy
  const isSuper = (user?.roles || []).includes('SUPER_ADMIN');
  const isCentral = (user?.roles || []).includes('CENTRAL_ADMIN');
  const isHigherAdmin = isSuper || isCentral;

  const scopeParams = (() => {
    if (isHigherAdmin) return {};
    if (user?.scope?.areaId) return { areaId: user.scope.areaId };
    if (user?.scope?.districtId) return { districtId: user.scope.districtId };
    if (user?.scope?.provinceId) return { provinceId: user.scope.provinceId };
    return {};
  })();

  const showRegisterButton = hasPermission(user, 'REGISTER_MEMBER');

  async function load(pg = 1, refresh = false) {
    if (loading && !refresh) return;
    setLoading(true);
    try {
      const res = await api.get('/members', {
        params: {
          q: q.trim(),
          status,
          page: pg,
          limit: 20,
          scope: 'all',
          ...scopeParams,
        },
      });
      const newItems = res.data?.data || [];
      const newMeta = res.data?.meta || { page: pg, totalPages: 1, total: newItems.length };
      setMeta(newMeta);

      if (refresh || pg === 1) {
        setItems(newItems);
      } else {
        setItems((prev) => [...prev, ...newItems]);
      }
      setPage(pg);
    } catch (e) {
      toast.error('Could not load members. Please retry.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    load(1, true);
  }, [status]);

  function handleSearchSubmit() {
    load(1, true);
  }

  function onRefresh() {
    setRefreshing(true);
    load(1, true);
  }

  function onEndReached() {
    if (page < meta.totalPages && !loading) {
      load(page + 1);
    }
  }

  // Load Org Hierarchy for registration modal
  useEffect(() => {
    if (!showCreate) return;
    setForm(INITIAL_FORM);
    setModalErr('');
    setProvinceId(user?.scope?.provinceId || '');
    setDistrictId(user?.scope?.districtId || '');
    setAreaId(user?.scope?.areaId || '');

    api.get('/org/provinces')
      .then((r) => setProvinces(r.data?.data || []))
      .catch(() => {});
  }, [showCreate]);

  useEffect(() => {
    if (!provinceId) {
      setDistricts([]);
      setDistrictId('');
      return;
    }
    api.get('/org/districts', { params: { provinceId } })
      .then((r) => setDistricts(r.data?.data || []))
      .catch(() => {});
  }, [provinceId]);

  useEffect(() => {
    if (!districtId) {
      setAreas([]);
      setAreaId('');
      return;
    }
    api.get('/org/areas', { params: { districtId } })
      .then((r) => setAreas(r.data?.data || []))
      .catch(() => {});
  }, [districtId]);

  useEffect(() => {
    if (!areaId) {
      setUnits([]);
      setForm((f) => ({ ...f, basicUnitId: '' }));
      return;
    }
    api.get('/org/basic-units', { params: { areaId } })
      .then((r) => setUnits(r.data?.data || []))
      .catch(() => {});
  }, [areaId]);

  async function handleCreateMember() {
    if (
      !form.fullName.trim() ||
      !form.fatherOrHusbandName.trim() ||
      !form.cnic ||
      !form.phone ||
      !form.email ||
      !form.basicUnitId
    ) {
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
      toast.success('Member registered successfully!');
      setShowCreate(false);
      load(1, true);
    } catch (e) {
      setModalErr(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  const pageTitle = isCentral
    ? 'Province Members'
    : (isHigherAdmin ? 'Members' : (user?.scope?.areaId ? 'Members in your area' : 'Members'));

  function renderItem({ item: m }) {
    const unitName = m.basicUnitId?.name || '';
    const districtName = m.districtId?.name || m.basicUnitId?.areaId?.districtId?.name || '';
    const provinceName = m.provinceId?.name || '';
    const locationParts = [unitName, districtName, provinceName].filter(Boolean);
    const locationText = locationParts.length > 0 ? locationParts.join(' · ') : '—';

    return (
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => router.push(`/members/${m._id}`)}
      >
        <Card style={styles.card}>
          <View style={styles.cardHeader}>
            <Avatar name={m.fullName} size={42} />
            <View style={styles.cardHeaderInfo}>
              <View style={styles.nameRow}>
                <Text style={styles.name} numberOfLines={1}>{m.fullName}</Text>
                {m.memberId ? (
                  <View style={styles.idPill}>
                    <Text style={styles.idText}>{m.memberId}</Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.cnicText}>{m.cnic || 'No CNIC'} · {m.phone || 'No Phone'}</Text>
            </View>
            <Badge label={m.status?.replace('_', ' ') || '—'} status={m.status} />
          </View>

          <View style={styles.cardFooter}>
            <View style={styles.locationBox}>
              <Ionicons name="location-outline" size={13} color={Colors.textMuted} style={{ marginRight: 4 }} />
              <Text style={styles.locationText} numberOfLines={1}>{locationText}</Text>
            </View>
            <View style={styles.viewLink}>
              <Text style={styles.viewLinkText}>View</Text>
              <Ionicons name="chevron-forward" size={14} color={Colors.primary} />
            </View>
          </View>
        </Card>
      </TouchableOpacity>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>{pageTitle}</Text>
          <Text style={styles.headerSub}>
            {meta.total} {meta.total === 1 ? 'member' : 'members'} total
          </Text>
        </View>

        {showRegisterButton && (
          <TouchableOpacity style={styles.registerBtn} onPress={() => setShowCreate(true)}>
            <Ionicons name="person-add" size={16} color="#fff" style={{ marginRight: 5 }} />
            <Text style={styles.registerBtnText}>Register Member</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Search Toolbar */}
      <View style={styles.searchBar}>
        <View style={styles.searchInputWrap}>
          <Ionicons name="search-outline" size={18} color={Colors.textMuted} style={{ marginRight: 8 }} />
          <TextInput
            style={styles.searchInput}
            value={q}
            onChangeText={setQ}
            onSubmitEditing={handleSearchSubmit}
            returnKeyType="search"
            placeholder="Search by name, CNIC, phone, member ID"
            placeholderTextColor={Colors.textLight}
            autoCapitalize="none"
          />
          {q.length > 0 && (
            <TouchableOpacity onPress={() => { setQ(''); load(1, true); }}>
              <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity style={styles.searchActionBtn} onPress={handleSearchSubmit}>
          <Text style={styles.searchActionBtnText}>Search</Text>
        </TouchableOpacity>
      </View>

      {/* Status filter tabs */}
      <View style={styles.filterWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
          {STATUS_FILTERS.map((s) => {
            const active = status === s.value;
            return (
              <TouchableOpacity
                key={s.value}
                style={[styles.filterPill, active && styles.filterPillActive]}
                onPress={() => setStatus(s.value)}
              >
                <Text style={[styles.filterText, active && styles.filterTextActive]}>
                  {s.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Member list */}
      <FlatList
        data={items}
        renderItem={renderItem}
        keyExtractor={(m) => m._id}
        contentContainerStyle={styles.list}
        onRefresh={onRefresh}
        refreshing={refreshing}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.3}
        ListEmptyComponent={
          !loading && (
            <EmptyState
              icon="🔍"
              title="No members found"
              message={q || status ? 'Try adjusting your search or filters.' : 'Be the first to register a member.'}
            />
          )
        }
        ListFooterComponent={
          loading && !refreshing ? (
            <ActivityIndicator style={{ padding: 16 }} color={Colors.primary} />
          ) : null
        }
      />

      {/* Register Member Modal */}
      <Modal
        visible={showCreate}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => { if (!saving) setShowCreate(false); }}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={{ flex: 1 }}
          >
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Register Member</Text>
              <TouchableOpacity
                onPress={() => { if (!saving) setShowCreate(false); }}
                disabled={saving}
                style={{ padding: 4 }}
              >
                <Ionicons name="close" size={22} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
              {modalErr ? (
                <View style={styles.errorBanner}>
                  <Ionicons name="alert-circle" size={16} color={Colors.error} style={{ marginRight: 6 }} />
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
                  placeholder="e.g. Tariq Mehmood"
                  placeholderTextColor={Colors.textLight}
                />
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Father / Husband Name *</Text>
                <TextInput
                  style={styles.input}
                  value={form.fatherOrHusbandName}
                  onChangeText={(v) => setForm((f) => ({ ...f, fatherOrHusbandName: v }))}
                  placeholder="e.g. Mehmood Khan"
                  placeholderTextColor={Colors.textLight}
                />
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>CNIC * (13 digits)</Text>
                <TextInput
                  style={styles.input}
                  value={form.cnic}
                  onChangeText={(v) => setForm((f) => ({ ...f, cnic: formatCnic(v) }))}
                  placeholder="XXXXX-XXXXXXX-X"
                  placeholderTextColor={Colors.textLight}
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
                  placeholderTextColor={Colors.textLight}
                  keyboardType="phone-pad"
                />
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Email Address *</Text>
                <TextInput
                  style={styles.input}
                  value={form.email}
                  onChangeText={(v) => setForm((f) => ({ ...f, email: v }))}
                  placeholder="member@example.com"
                  placeholderTextColor={Colors.textLight}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Initial Password * (min 6 chars)</Text>
                <TextInput
                  style={styles.input}
                  value={form.password}
                  onChangeText={(v) => setForm((f) => ({ ...f, password: v }))}
                  placeholder="••••••••"
                  placeholderTextColor={Colors.textLight}
                  secureTextEntry
                  autoCapitalize="none"
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
                <Text style={styles.label}>Residential Address *</Text>
                <TextInput
                  style={[styles.input, styles.multiline]}
                  value={form.address}
                  onChangeText={(v) => setForm((f) => ({ ...f, address: v }))}
                  placeholder="Street address, city/village"
                  placeholderTextColor={Colors.textLight}
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

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => { if (!saving) setShowCreate(false); }}
                disabled={saving}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSaveBtn, saving && { opacity: 0.7 }]}
                onPress={handleCreateMember}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.modalSaveText}>Register Member</Text>
                )}
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
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
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: { fontSize: FontSize.lg, fontWeight: '800', color: Colors.text },
  headerSub: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  registerBtn: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
  },
  registerBtnText: { color: '#fff', fontWeight: '700', fontSize: FontSize.sm },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  searchInputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceAlt || '#f8fafc',
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 9,
    fontSize: FontSize.sm,
    color: Colors.text,
  },
  searchActionBtn: {
    backgroundColor: Colors.surfaceAlt || '#f1f5f9',
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    paddingVertical: 9,
    borderRadius: Radius.md,
  },
  searchActionBtnText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.text,
  },
  filterWrap: {
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingVertical: 8,
  },
  filterScroll: {
    paddingHorizontal: Spacing.lg,
    gap: 8,
  },
  filterPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.pill,
    backgroundColor: Colors.surfaceAlt || '#f1f5f9',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterPillActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  filterText: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  filterTextActive: {
    color: '#fff',
  },
  list: {
    padding: Spacing.md,
    paddingBottom: 40,
  },
  card: {
    marginBottom: Spacing.sm,
    padding: Spacing.md,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  cardHeaderInfo: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
    flexWrap: 'wrap',
  },
  name: {
    fontSize: FontSize.base,
    fontWeight: '700',
    color: Colors.text,
  },
  idPill: {
    backgroundColor: Colors.surfaceAlt || '#f1f5f9',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  idText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.textMuted,
  },
  cnicText: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight || '#f1f5f9',
  },
  locationBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  locationText: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
  },
  viewLink: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: Spacing.sm,
  },
  viewLinkText: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    color: Colors.primary,
    marginRight: 2,
  },

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
  modalTitle: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.text,
  },
  modalBody: {
    padding: Spacing.lg,
    paddingBottom: 40,
  },
  formSection: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.text,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingBottom: 6,
  },
  field: {
    marginBottom: Spacing.md,
  },
  label: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
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
  multiline: {
    height: 60,
    textAlignVertical: 'top',
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
  },
  chipScroll: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    marginRight: 8,
  },
  chipActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary,
  },
  chipText: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontWeight: '600',
  },
  chipTextActive: {
    color: '#fff',
    fontWeight: '700',
  },
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
  errorText: {
    color: Colors.error,
    fontSize: FontSize.xs,
    fontWeight: '500',
    flex: 1,
  },
  modalFooter: {
    flexDirection: 'row',
    gap: Spacing.md,
    padding: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  modalCancelBtn: {
    flex: 1,
    borderRadius: Radius.md,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  modalCancelText: {
    color: Colors.text,
    fontWeight: '600',
    fontSize: FontSize.sm,
  },
  modalSaveBtn: {
    flex: 2,
    borderRadius: Radius.md,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: Colors.primary,
  },
  modalSaveText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: FontSize.sm,
  },
});
