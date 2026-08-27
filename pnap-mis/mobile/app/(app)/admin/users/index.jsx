import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
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
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api, errorMessage } from '../../../../src/api/client';
import { useAuth } from '../../../../src/context/AuthContext';
import { isSuperAdmin } from '../../../../src/utils/permissions';
import { useToast } from '../../../../src/components/Toast';
import Card from '../../../../src/components/Card';
import Badge from '../../../../src/components/Badge';
import EmptyState from '../../../../src/components/EmptyState';
import { Colors, FontSize, Radius, Spacing } from '../../../../src/constants/colors';

const ROLE_OPTIONS = [
  'SUPER_ADMIN', 'CENTRAL_ADMIN', 'PROVINCE_ADMIN', 'DISTRICT_ADMIN', 'AREA_ADMIN',
  'SECRETARY', 'SENIOR_MAWIN', 'FINANCE_SECRETARY',
  'PRESS_SECRETARY', 'CULTURE_SECRETARY', 'SPORTS_SECRETARY',
  'PRESIDENT', 'SR_VICE_PRESIDENT', 'VICE_PRESIDENT', 'GENERAL_SECRETARY',
  'CHAIRMAN', 'CO_CHAIRMAN', 'SR_VICE_CHAIRMAN', 'VICE_CHAIRMAN', 'FIRST_SECRETARY',
  'OTHER', 'MEMBER',
];

const STATUS_OPTIONS = [
  { label: 'All Status', value: '' },
  { label: 'Active', value: 'true' },
  { label: 'Inactive', value: 'false' },
];

const PAGE_SIZE = 20;

// Deterministic avatar color palette matching web
const AVATAR_COLORS = ['#1e3a8a', '#1e40af', '#2563eb', '#172554', '#1d4ed8', '#0284c7'];
function getAvatarColor(name) {
  if (!name) return AVATAR_COLORS[0];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

export default function UsersScreen() {
  const { user: viewer } = useAuth();
  const toast = useToast();
  const canWrite = isSuperAdmin(viewer);
  const params = useLocalSearchParams();
  const isCentralAdminView = params?.role === 'CENTRAL_ADMIN';

  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [q, setQ] = useState('');
  const [roleFilter, setRoleFilter] = useState(params?.role || '');
  const [statusFilter, setStatusFilter] = useState('');

  // Modals & Dialogs
  const [selectedUser, setSelectedUser] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [resetPwdOpen, setResetPwdOpen] = useState(false);
  const [targetUser, setTargetUser] = useState(null);
  const [newPassword, setNewPassword] = useState('123456');

  // Deactivate / Activate Confirmation Dialog State
  const [confirmToggleUser, setConfirmToggleUser] = useState(null);
  const [toggling, setToggling] = useState(false);

  // Edit User State
  const [editOpen, setEditOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [editForm, setEditForm] = useState({
    fullName: '',
    username: '',
    email: '',
    cnic: '',
    roles: [],
    isActive: true,
  });
  const [editSaving, setEditSaving] = useState(false);

  // Create Form State
  const [createForm, setCreateForm] = useState({
    fullName: '',
    username: '',
    email: '',
    password: '',
    passwordConfirm: '',
    role: isCentralAdminView ? 'CENTRAL_ADMIN' : 'MEMBER',
  });
  const [saving, setSaving] = useState(false);

  async function load(pg = 1, refresh = false) {
    if (loading && !refresh) return;
    setLoading(true);
    try {
      const apiParams = { page: pg, limit: PAGE_SIZE };
      if (q.trim()) apiParams.q = q.trim();
      if (roleFilter) apiParams.role = roleFilter;
      if (statusFilter !== '') apiParams.isActive = statusFilter;

      const r = await api.get('/admin/users', { params: apiParams });
      const resData = r.data?.data;
      const userList = Array.isArray(resData) ? resData : (resData?.items || []);
      const tot = resData?.total ?? userList.length;

      if (refresh || pg === 1) setItems(userList);
      else setItems((prev) => [...prev, ...userList]);

      setTotal(tot);
      setHasMore(userList.length === PAGE_SIZE);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    if (params?.role) {
      setRoleFilter(params.role);
    }
  }, [params?.role]);

  useEffect(() => {
    setPage(1);
    load(1, true);
  }, [q, roleFilter, statusFilter]);

  function onLoadMore() {
    if (!hasMore || loading) return;
    const next = page + 1;
    setPage(next);
    load(next);
  }

  // ─── Create User ──────────────────────────────────────────────────
  async function handleCreate() {
    if (!createForm.fullName.trim()) {
      toast.error('Full name is required.');
      return;
    }
    if (!createForm.email.trim()) {
      toast.error('Email is required.');
      return;
    }
    if (createForm.password.length < 6) {
      toast.error('Password must be at least 6 characters.');
      return;
    }
    if (createForm.password !== createForm.passwordConfirm) {
      toast.error('Passwords do not match.');
      return;
    }

    setSaving(true);
    try {
      const body = {
        fullName: createForm.fullName.trim(),
        email: createForm.email.trim(),
        password: createForm.password,
        role: createForm.role || (isCentralAdminView ? 'CENTRAL_ADMIN' : 'MEMBER'),
      };
      if (createForm.username.trim()) body.username = createForm.username.trim();

      await api.post('/admin/users', body);
      toast.success(isCentralAdminView ? 'Central Admin created successfully.' : 'User created successfully.');
      setCreateOpen(false);
      setCreateForm({
        fullName: '',
        username: '',
        email: '',
        password: '',
        passwordConfirm: '',
        role: isCentralAdminView ? 'CENTRAL_ADMIN' : 'MEMBER',
      });
      load(1, true);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  // ─── Activate / Deactivate ─────────────────────────────────────────
  function requestToggleActive(u) {
    if (!canWrite) return;
    setConfirmToggleUser(u);
  }

  async function handleConfirmToggle() {
    if (!confirmToggleUser || toggling) return;
    const u = confirmToggleUser;
    const next = !u.isActive;
    setToggling(true);

    // Optimistic UI update
    setItems((prev) => prev.map((x) => (x._id === u._id ? { ...x, isActive: next } : x)));
    if (selectedUser?._id === u._id) {
      setSelectedUser((prev) => ({ ...prev, isActive: next }));
    }

    try {
      await api.post(`/admin/users/${u._id}/${u.isActive ? 'deactivate' : 'activate'}`);
      toast.success(`${u.fullName} is now ${next ? 'active' : 'inactive'}.`);
      setConfirmToggleUser(null);
    } catch (e) {
      // Revert on failure
      setItems((prev) => prev.map((x) => (x._id === u._id ? { ...x, isActive: u.isActive } : x)));
      if (selectedUser?._id === u._id) {
        setSelectedUser((prev) => ({ ...prev, isActive: u.isActive }));
      }
      toast.error(errorMessage(e));
    } finally {
      setToggling(false);
    }
  }

  // ─── Edit User ─────────────────────────────────────────────────────
  function openEditUser(u) {
    setEditingUser(u);
    setEditForm({
      fullName: u.fullName || '',
      username: u.username || '',
      email: u.email || '',
      cnic: u.cnic || '',
      roles: u.roles || [],
      isActive: u.isActive !== false,
    });
    setEditOpen(true);
  }

  function toggleRoleSelection(r) {
    setEditForm((prev) => {
      const exists = prev.roles.includes(r);
      const nextRoles = exists ? prev.roles.filter((x) => x !== r) : [...prev.roles, r];
      return { ...prev, roles: nextRoles };
    });
  }

  async function handleSaveEdit() {
    if (!editingUser || editSaving) return;
    if (!editForm.fullName.trim()) {
      toast.error('Full name is required.');
      return;
    }
    if (!editForm.email.trim()) {
      toast.error('Email address is required.');
      return;
    }

    setEditSaving(true);
    try {
      const payload = {
        fullName: editForm.fullName.trim(),
        username: editForm.username.trim() || undefined,
        email: editForm.email.trim(),
        cnic: editForm.cnic.trim() || undefined,
        roles: editForm.roles,
        isActive: editForm.isActive,
      };

      const res = await api.patch(`/admin/users/${editingUser._id}`, payload);
      const updated = res.data?.data || { ...editingUser, ...payload };

      setItems((prev) => prev.map((x) => (x._id === editingUser._id ? { ...x, ...updated } : x)));
      if (selectedUser?._id === editingUser._id) {
        setSelectedUser((prev) => ({ ...prev, ...updated }));
      }

      toast.success(`User ${editForm.fullName} updated successfully.`);
      setEditOpen(false);
      setEditingUser(null);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setEditSaving(false);
    }
  }

  // ─── Reset Password ────────────────────────────────────────────────
  async function handleResetPassword() {
    if (!targetUser || !newPassword) return;
    setSaving(true);
    try {
      await api.post(`/admin/users/${targetUser._id}/reset-password`, { newPassword });
      toast.success(`Password reset for ${targetUser.fullName}.`);
      setResetPwdOpen(false);
      setTargetUser(null);
      setNewPassword('123456');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  function getTierLabel(u) {
    if (u.scope?.basicUnitId) return 'BASIC UNIT';
    if (u.scope?.areaId) return 'AREA';
    if (u.scope?.districtId) return 'DISTRICT';
    if (u.scope?.provinceId) return 'PROVINCE';
    return 'CENTRAL';
  }

  function renderUserCard({ item: u }) {
    const tier = getTierLabel(u);
    const initial = (u.fullName || u.email || '?').charAt(0).toUpperCase();
    const avatarBg = getAvatarColor(u.fullName);

    return (
      <Card style={styles.userCard}>
        {/* Top Header Row */}
        <View style={styles.userCardHeader}>
          <View style={[styles.avatar, { backgroundColor: avatarBg }]}>
            <Text style={styles.avatarText}>{initial}</Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={styles.nameRow}>
              <Text style={styles.userName} numberOfLines={1}>{u.fullName || '—'}</Text>
              <View style={[styles.tierBadge, { backgroundColor: '#eff6ff' }]}>
                <Text style={styles.tierBadgeText}>{tier}</Text>
              </View>
            </View>
            <View style={styles.metaRow}>
              {u.username ? <Text style={styles.userUsername}>@{u.username} · </Text> : null}
              <Text style={styles.userEmail} numberOfLines={1}>{u.email || u.phone || 'No email'}</Text>
            </View>
          </View>

          {/* Status Badge */}
          <TouchableOpacity
            style={[styles.statusPill, u.isActive ? styles.statusActive : styles.statusInactive]}
            onPress={() => requestToggleActive(u)}
            activeOpacity={0.7}
          >
            <View style={[styles.statusDot, { backgroundColor: u.isActive ? Colors.success : Colors.textMuted }]} />
            <Text style={[styles.statusPillText, { color: u.isActive ? Colors.success : Colors.textMuted }]}>
              {u.isActive ? 'Active' : 'Inactive'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Roles Badges */}
        <View style={styles.rolesRow}>
          {(u.roles || []).map((r) => (
            <View key={r} style={styles.roleTag}>
              <Text style={styles.roleTagText}>{r.replace(/_/g, ' ')}</Text>
            </View>
          ))}
          {u.cnic ? (
            <View style={[styles.roleTag, { backgroundColor: '#f8fafc' }]}>
              <Text style={[styles.roleTagText, { color: Colors.textMuted }]}>CNIC: {u.cnic}</Text>
            </View>
          ) : null}
        </View>

        {/* Action Buttons Toolbar */}
        {canWrite && (
          <View style={styles.cardActions}>
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => openEditUser(u)}
            >
              <Ionicons name="pencil" size={13} color={Colors.primary} />
              <Text style={[styles.actionBtnText, { color: Colors.primary }]}>Edit</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => {
                setTargetUser(u);
                setResetPwdOpen(true);
              }}
            >
              <Text style={styles.actionBtnIcon}>🔑</Text>
              <Text style={styles.actionBtnText}>Reset Pwd</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionBtn, { borderColor: u.isActive ? '#fee2e2' : '#dcfce7' }]}
              onPress={() => requestToggleActive(u)}
            >
              <Text style={styles.actionBtnIcon}>{u.isActive ? '⏻' : '✓'}</Text>
              <Text style={[styles.actionBtnText, { color: u.isActive ? Colors.error : Colors.success }]}>
                {u.isActive ? 'Deactivate' : 'Activate'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionBtn, styles.actionBtnPrimary]}
              onPress={() => setSelectedUser(u)}
            >
              <Ionicons name="eye-outline" size={13} color={Colors.text} />
              <Text style={styles.actionBtnText}>Details</Text>
            </TouchableOpacity>
          </View>
        )}
      </Card>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      {/* ─── Hero Banner (Matches Web) ─── */}
      <View style={styles.hero}>
        <View style={styles.heroTop}>
          <View style={styles.heroIconBox}>
            <Text style={styles.heroIcon}>{isCentralAdminView ? '🏛️' : '👥'}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroTitle}>
              {isCentralAdminView ? 'Central Admins' : 'Users & Credentials'}
            </Text>
            <Text style={styles.heroSub} numberOfLines={2}>
              {isCentralAdminView
                ? 'Central Admins structure Provinces and administer Province Admins.'
                : 'Search, filter, and manage every user account in the system.'}
            </Text>
          </View>
        </View>

        {/* Hero Quick Action Buttons */}
        <View style={styles.heroActions}>
          {canWrite && (
            <TouchableOpacity
              style={styles.heroPrimaryBtn}
              onPress={() => {
                setCreateForm({
                  fullName: '',
                  username: '',
                  email: '',
                  password: '',
                  passwordConfirm: '',
                  role: isCentralAdminView ? 'CENTRAL_ADMIN' : 'MEMBER',
                });
                setCreateOpen(true);
              }}
            >
              <Text style={styles.heroPrimaryBtnText}>
                {isCentralAdminView ? '＋ Create Central Admin' : '＋ Create User'}
              </Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.heroSecondaryBtn}
            onPress={() => {
              setRefreshing(true);
              load(1, true);
            }}
          >
            <Text style={styles.heroSecondaryBtnText}>⟳ Refresh</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ─── Search & Filters Bar ─── */}
      <View style={styles.toolbar}>
        <View style={styles.searchBox}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            value={q}
            onChangeText={setQ}
            placeholder="Search by name, email, username…"
            placeholderTextColor={Colors.textLight}
            clearButtonMode="while-editing"
          />
          {q.length > 0 && (
            <TouchableOpacity onPress={() => setQ('')} style={styles.clearSearchBtn}>
              <Text style={styles.clearSearchText}>✕</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Filter Pills Scroll */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
          {roleFilter ? (
            <TouchableOpacity
              style={styles.activeRoleChip}
              onPress={() => setRoleFilter('')}
            >
              <Text style={styles.activeRoleChipText}>
                Role: {roleFilter.replace(/_/g, ' ')} ✕
              </Text>
            </TouchableOpacity>
          ) : null}

          {!isCentralAdminView && (
            <TouchableOpacity
              style={[styles.filterChip, roleFilter === 'CENTRAL_ADMIN' && styles.filterChipActive]}
              onPress={() => setRoleFilter((prev) => (prev === 'CENTRAL_ADMIN' ? '' : 'CENTRAL_ADMIN'))}
            >
              <Text style={[styles.filterChipText, roleFilter === 'CENTRAL_ADMIN' && styles.filterChipTextActive]}>
                Central Admins
              </Text>
            </TouchableOpacity>
          )}

          {STATUS_OPTIONS.map((s) => (
            <TouchableOpacity
              key={s.value}
              style={[styles.filterChip, statusFilter === s.value && styles.filterChipActive]}
              onPress={() => setStatusFilter(s.value)}
            >
              <Text style={[styles.filterChipText, statusFilter === s.value && styles.filterChipTextActive]}>
                {s.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* ─── Results Counter Bar ─── */}
      <View style={styles.countBar}>
        <Text style={styles.countText}>
          {total} {total === 1 ? 'ACCOUNT' : 'ACCOUNTS'} ON RECORD
        </Text>
        {loading && <ActivityIndicator size="small" color={Colors.primary} />}
      </View>

      {/* ─── User Cards List ─── */}
      <FlatList
        data={items}
        renderItem={renderUserCard}
        keyExtractor={(u) => u._id}
        contentContainerStyle={styles.list}
        onRefresh={() => {
          setRefreshing(true);
          load(1, true);
        }}
        refreshing={refreshing}
        onEndReached={onLoadMore}
        onEndReachedThreshold={0.4}
        ListEmptyComponent={
          !loading && (
            <EmptyState
              icon="👥"
              title="No users found"
              message={q || roleFilter || statusFilter ? 'Try adjusting your search or active filters.' : 'No user credentials registered.'}
            />
          )
        }
      />

      {/* ─── Create User Modal ─── */}
      <Modal visible={createOpen} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.modalSafe}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {isCentralAdminView ? 'Create Central Admin' : 'Create User'}
            </Text>
            <TouchableOpacity onPress={() => setCreateOpen(false)} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled">
            <View style={styles.infoBanner}>
              <Text style={styles.infoBannerTitle}>
                {isCentralAdminView ? 'Central Administrator' : 'User Account Provisioning'}
              </Text>
              <Text style={styles.infoBannerText}>
                {isCentralAdminView
                  ? 'Central Admins have global authority over provinces, regional administrators, and nationwide reporting.'
                  : 'Provision initial login credentials and specify role assignments for the system.'}
              </Text>
            </View>

            <Text style={styles.inputLabel}>Full Name <Text style={{ color: Colors.error }}>*</Text></Text>
            <TextInput
              style={styles.modalInput}
              value={createForm.fullName}
              onChangeText={(v) => setCreateForm((p) => ({ ...p, fullName: v }))}
              placeholder="e.g. Aslam Khan"
              placeholderTextColor={Colors.textLight}
            />

            <Text style={styles.inputLabel}>Username <Text style={styles.optionalText}>(Optional)</Text></Text>
            <TextInput
              style={styles.modalInput}
              value={createForm.username}
              onChangeText={(v) => setCreateForm((p) => ({ ...p, username: v }))}
              placeholder="e.g. aslam_central"
              placeholderTextColor={Colors.textLight}
              autoCapitalize="none"
            />

            <Text style={styles.inputLabel}>Email Address <Text style={{ color: Colors.error }}>*</Text></Text>
            <TextInput
              style={styles.modalInput}
              value={createForm.email}
              onChangeText={(v) => setCreateForm((p) => ({ ...p, email: v }))}
              placeholder="e.g. admin@pknap.org"
              placeholderTextColor={Colors.textLight}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <Text style={styles.inputHint}>
              Email is used for login identification, notifications, and password recovery.
            </Text>

            <Text style={styles.inputLabel}>Password <Text style={{ color: Colors.error }}>*</Text></Text>
            <TextInput
              style={styles.modalInput}
              value={createForm.password}
              onChangeText={(v) => setCreateForm((p) => ({ ...p, password: v }))}
              placeholder="At least 6 characters"
              placeholderTextColor={Colors.textLight}
              secureTextEntry
            />

            <Text style={styles.inputLabel}>Confirm Password <Text style={{ color: Colors.error }}>*</Text></Text>
            <TextInput
              style={[
                styles.modalInput,
                createForm.passwordConfirm.length > 0 &&
                  createForm.password !== createForm.passwordConfirm && {
                    borderColor: Colors.error,
                  },
              ]}
              value={createForm.passwordConfirm}
              onChangeText={(v) => setCreateForm((p) => ({ ...p, passwordConfirm: v }))}
              placeholder="Re-enter password"
              placeholderTextColor={Colors.textLight}
              secureTextEntry
            />
            {createForm.passwordConfirm.length > 0 &&
              createForm.password !== createForm.passwordConfirm && (
                <Text style={styles.errorText}>Passwords do not match.</Text>
              )}

            {!isCentralAdminView && (
              <>
                <Text style={styles.inputLabel}>Assign Role</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
                  {ROLE_OPTIONS.map((r) => (
                    <TouchableOpacity
                      key={r}
                      style={[styles.roleSelectChip, createForm.role === r && styles.roleSelectChipActive]}
                      onPress={() => setCreateForm((p) => ({ ...p, role: r }))}
                    >
                      <Text style={[styles.roleSelectText, createForm.role === r && styles.roleSelectTextActive]}>
                        {r.replace(/_/g, ' ')}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </>
            )}
          </ScrollView>

          <View style={styles.modalFooter}>
            <TouchableOpacity style={styles.footerCancelBtn} onPress={() => setCreateOpen(false)}>
              <Text style={styles.footerCancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.footerSaveBtn,
                (!createForm.fullName || !createForm.email || createForm.password.length < 6 || saving) && {
                  opacity: 0.6,
                },
              ]}
              onPress={handleCreate}
              disabled={!createForm.fullName || !createForm.email || createForm.password.length < 6 || saving}
            >
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.footerSaveText}>
                  {isCentralAdminView ? 'Create Central Admin' : 'Create User'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>

      {/* ─── Edit User Modal (Matches Web Edit Dialog) ─── */}
      <Modal visible={editOpen} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.modalSafe}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Edit User</Text>
                <Text style={styles.modalSub}>{editingUser?.fullName || 'User Profile'}</Text>
              </View>
              <TouchableOpacity onPress={() => setEditOpen(false)} style={styles.closeBtn}>
                <Text style={styles.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled">
              <Text style={styles.inputLabel}>Full Name <Text style={{ color: Colors.error }}>*</Text></Text>
              <TextInput
                style={styles.modalInput}
                value={editForm.fullName}
                onChangeText={(v) => setEditForm((p) => ({ ...p, fullName: v }))}
                placeholder="Full name"
                placeholderTextColor={Colors.textLight}
              />

              <Text style={styles.inputLabel}>Username</Text>
              <TextInput
                style={styles.modalInput}
                value={editForm.username}
                onChangeText={(v) => setEditForm((p) => ({ ...p, username: v }))}
                placeholder="Username (optional)"
                placeholderTextColor={Colors.textLight}
                autoCapitalize="none"
              />

              <Text style={styles.inputLabel}>Email Address <Text style={{ color: Colors.error }}>*</Text></Text>
              <TextInput
                style={styles.modalInput}
                value={editForm.email}
                onChangeText={(v) => setEditForm((p) => ({ ...p, email: v }))}
                placeholder="Email address"
                placeholderTextColor={Colors.textLight}
                keyboardType="email-address"
                autoCapitalize="none"
              />

              <Text style={styles.inputLabel}>CNIC</Text>
              <TextInput
                style={styles.modalInput}
                value={editForm.cnic}
                onChangeText={(v) => setEditForm((p) => ({ ...p, cnic: v }))}
                placeholder="XXXXX-XXXXXXX-X"
                placeholderTextColor={Colors.textLight}
                keyboardType="numeric"
              />

              <Text style={styles.inputLabel}>Roles Assignment</Text>
              <View style={styles.rolePillGrid}>
                {ROLE_OPTIONS.map((r) => {
                  const selected = editForm.roles.includes(r);
                  return (
                    <TouchableOpacity
                      key={r}
                      style={[styles.roleGridPill, selected && styles.roleGridPillActive]}
                      onPress={() => toggleRoleSelection(r)}
                    >
                      <Ionicons
                        name={selected ? 'checkbox' : 'square-outline'}
                        size={14}
                        color={selected ? '#fff' : Colors.textMuted}
                        style={{ marginRight: 4 }}
                      />
                      <Text style={[styles.roleGridPillText, selected && styles.roleGridPillTextActive]}>
                        {r.replace(/_/g, ' ')}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={styles.accountActiveRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.accountActiveTitle}>Account Active Status</Text>
                  <Text style={styles.accountActiveSub}>
                    {editForm.isActive ? 'User can log in and access authorized features.' : 'User account is deactivated.'}
                  </Text>
                </View>
                <Switch
                  value={editForm.isActive}
                  onValueChange={(val) => setEditForm((p) => ({ ...p, isActive: val }))}
                  trackColor={{ false: Colors.border, true: '#93c5fd' }}
                  thumbColor={editForm.isActive ? Colors.primary : '#f4f3f4'}
                />
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.footerCancelBtn}
                onPress={() => setEditOpen(false)}
                disabled={editSaving}
              >
                <Text style={styles.footerCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.footerSaveBtn, editSaving && { opacity: 0.6 }]}
                onPress={handleSaveEdit}
                disabled={editSaving}
              >
                {editSaving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.footerSaveText}>Save Changes</Text>
                )}
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {/* ─── Deactivate / Activate Confirmation Dialog ─── */}
      <Modal visible={!!confirmToggleUser} animationType="fade" transparent>
        <View style={styles.overlayBackdrop}>
          <View style={styles.dialogCard}>
            <Text style={styles.dialogTitle}>
              {confirmToggleUser?.isActive ? 'Deactivate User Account' : 'Activate User Account'}
            </Text>
            <Text style={styles.dialogSub}>
              Are you sure you want to {confirmToggleUser?.isActive ? 'deactivate' : 'activate'}{' '}
              <Text style={{ fontWeight: '700', color: Colors.text }}>{confirmToggleUser?.fullName}</Text>?
              {confirmToggleUser?.isActive ? ' The user will lose access to system login.' : ' The user will regain login access.'}
            </Text>

            <View style={styles.dialogButtons}>
              <TouchableOpacity
                style={styles.dialogCancelBtn}
                onPress={() => setConfirmToggleUser(null)}
                disabled={toggling}
              >
                <Text style={styles.dialogCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.dialogConfirmBtn,
                  { backgroundColor: confirmToggleUser?.isActive ? Colors.error : Colors.success },
                ]}
                onPress={handleConfirmToggle}
                disabled={toggling}
              >
                {toggling ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.dialogConfirmText}>
                    {confirmToggleUser?.isActive ? 'Deactivate' : 'Activate'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ─── Reset Password Modal ─── */}
      <Modal visible={resetPwdOpen} animationType="fade" transparent>
        <View style={styles.overlayBackdrop}>
          <View style={styles.dialogCard}>
            <Text style={styles.dialogTitle}>Reset Password</Text>
            <Text style={styles.dialogSub}>
              Set a new login password for <Text style={{ fontWeight: '700' }}>{targetUser?.fullName}</Text>:
            </Text>

            <TextInput
              style={styles.dialogInput}
              value={newPassword}
              onChangeText={setNewPassword}
              placeholder="Enter new password"
              placeholderTextColor={Colors.textLight}
              secureTextEntry={false}
            />

            <View style={styles.dialogButtons}>
              <TouchableOpacity
                style={styles.dialogCancelBtn}
                onPress={() => {
                  setResetPwdOpen(false);
                  setTargetUser(null);
                }}
              >
                <Text style={styles.dialogCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.dialogConfirmBtn}
                onPress={handleResetPassword}
                disabled={saving || !newPassword}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.dialogConfirmText}>Save Password</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ─── User Details Modal ─── */}
      <Modal visible={!!selectedUser} animationType="slide" presentationStyle="pageSheet">
        {selectedUser && (
          <SafeAreaView style={styles.modalSafe}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>User Account Profile</Text>
              <TouchableOpacity onPress={() => setSelectedUser(null)} style={styles.closeBtn}>
                <Text style={styles.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              <View style={styles.detailHero}>
                <View style={[styles.largeAvatar, { backgroundColor: getAvatarColor(selectedUser.fullName) }]}>
                  <Text style={styles.largeAvatarText}>
                    {(selectedUser.fullName || '?').charAt(0).toUpperCase()}
                  </Text>
                </View>
                <Text style={styles.detailName}>{selectedUser.fullName || '—'}</Text>
                {selectedUser.username ? <Text style={styles.detailUsername}>@{selectedUser.username}</Text> : null}
                <View style={{ marginTop: 8 }}>
                  <Badge
                    label={selectedUser.isActive ? 'Active Account' : 'Inactive Account'}
                    color={selectedUser.isActive ? Colors.success : Colors.error}
                    bg={selectedUser.isActive ? Colors.successBg : Colors.errorBg}
                  />
                </View>
              </View>

              <Card style={{ padding: Spacing.md, gap: Spacing.sm, marginBottom: Spacing.md }}>
                <Text style={styles.sectionHeading}>Contact & Credentials</Text>
                <View style={styles.infoRow}>
                  <Text style={styles.infoKey}>Email</Text>
                  <Text style={styles.infoVal}>{selectedUser.email || '—'}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoKey}>Phone</Text>
                  <Text style={styles.infoVal}>{selectedUser.phone || '—'}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoKey}>CNIC</Text>
                  <Text style={styles.infoVal}>{selectedUser.cnic || '—'}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoKey}>Territorial Tier</Text>
                  <Text style={[styles.infoVal, { fontWeight: '700', color: Colors.primary }]}>
                    {getTierLabel(selectedUser)}
                  </Text>
                </View>
              </Card>

              <Card style={{ padding: Spacing.md, gap: Spacing.sm }}>
                <Text style={styles.sectionHeading}>Assigned Roles</Text>
                <View style={styles.rolesGrid}>
                  {(selectedUser.roles || []).map((r) => (
                    <Badge key={r} label={r.replace(/_/g, ' ')} color={Colors.primary} bg="#eff6ff" />
                  ))}
                </View>
              </Card>
            </ScrollView>

            {canWrite && (
              <View style={[styles.modalFooter, { flexDirection: 'column', gap: 8 }]}>
                <TouchableOpacity
                  style={[styles.actionLargeBtn, { backgroundColor: Colors.primary }]}
                  onPress={() => {
                    const u = selectedUser;
                    setSelectedUser(null);
                    openEditUser(u);
                  }}
                >
                  <Text style={styles.actionLargeBtnText}>✎ Edit User Account</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.actionLargeBtn,
                    { backgroundColor: selectedUser.isActive ? Colors.error : Colors.success },
                  ]}
                  onPress={() => {
                    const u = selectedUser;
                    requestToggleActive(u);
                  }}
                >
                  <Text style={styles.actionLargeBtnText}>
                    {selectedUser.isActive ? '⏻ Deactivate User Account' : '✓ Activate User Account'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </SafeAreaView>
        )}
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },

  // ─── Hero ───
  hero: {
    backgroundColor: Colors.primary,
    padding: Spacing.lg,
    paddingTop: Spacing.md,
    borderBottomLeftRadius: Radius.xl,
    borderBottomRightRadius: Radius.xl,
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  heroIconBox: {
    width: 48,
    height: 48,
    borderRadius: Radius.md,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroIcon: { fontSize: 26 },
  heroTitle: { fontSize: FontSize.xl, fontWeight: '800', color: '#fff' },
  heroSub: { fontSize: FontSize.xs, color: 'rgba(255, 255, 255, 0.85)', marginTop: 2, lineHeight: 16 },
  heroActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    alignItems: 'center',
  },
  heroPrimaryBtn: {
    flex: 1,
    backgroundColor: '#fff',
    paddingVertical: 10,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroPrimaryBtnText: { color: Colors.primary, fontWeight: '700', fontSize: FontSize.sm },
  heroSecondaryBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingVertical: 10,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.4)',
  },
  heroSecondaryBtnText: { color: '#fff', fontWeight: '600', fontSize: FontSize.sm },

  // ─── Toolbar ───
  toolbar: {
    backgroundColor: Colors.surface,
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: Spacing.sm,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceAlt,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    height: 42,
  },
  searchIcon: { fontSize: 14, marginRight: Spacing.xs },
  searchInput: { flex: 1, fontSize: FontSize.sm, color: Colors.text },
  clearSearchBtn: { padding: 4 },
  clearSearchText: { fontSize: 14, color: Colors.textMuted },
  filterScroll: { flexDirection: 'row' },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.pill,
    backgroundColor: Colors.surfaceAlt,
    borderWidth: 1,
    borderColor: Colors.border,
    marginRight: 6,
  },
  filterChipActive: {
    backgroundColor: '#eff6ff',
    borderColor: Colors.primary,
  },
  filterChipText: { fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: '600' },
  filterChipTextActive: { color: Colors.primary },
  activeRoleChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.pill,
    backgroundColor: Colors.primary,
    marginRight: 6,
  },
  activeRoleChipText: { fontSize: FontSize.xs, color: '#fff', fontWeight: '700' },

  countBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: 8,
    backgroundColor: Colors.background,
  },
  countText: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.textMuted, letterSpacing: 0.5 },

  // ─── Cards ───
  list: { padding: Spacing.md, paddingBottom: 40 },
  userCard: {
    marginBottom: Spacing.md,
    padding: Spacing.md,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  userCardHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontSize: FontSize.lg, fontWeight: '800' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  userName: { fontSize: FontSize.base, fontWeight: '700', color: Colors.text },
  tierBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  tierBadgeText: { fontSize: 10, fontWeight: '700', color: Colors.primaryDark },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  userUsername: { fontSize: FontSize.xs, color: Colors.primary, fontWeight: '600' },
  userEmail: { fontSize: FontSize.xs, color: Colors.textMuted, flex: 1 },

  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.pill,
    borderWidth: 1,
  },
  statusActive: { backgroundColor: Colors.successBg, borderColor: '#bbf7d0' },
  statusInactive: { backgroundColor: Colors.surfaceAlt, borderColor: Colors.border },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusPillText: { fontSize: 10, fontWeight: '700' },

  rolesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: Spacing.md },
  roleTag: {
    backgroundColor: '#eff6ff',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  roleTagText: { fontSize: FontSize.xs - 1, fontWeight: '600', color: Colors.primary },

  cardActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.md,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 7,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceAlt,
  },
  actionBtnPrimary: {
    backgroundColor: '#eff6ff',
    borderColor: '#bfdbfe',
  },
  actionBtnIcon: { fontSize: 12 },
  actionBtnText: { fontSize: FontSize.xs, fontWeight: '600', color: Colors.text },

  // ─── Modal styles ───
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
  modalTitle: { fontSize: FontSize.lg, fontWeight: '800', color: Colors.text },
  modalSub: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  closeBtn: { padding: 4 },
  closeBtnText: { fontSize: 18, color: Colors.textMuted, fontWeight: '700' },
  modalBody: { flex: 1, padding: Spacing.lg },
  infoBanner: {
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  infoBannerTitle: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.primaryDark, marginBottom: 2 },
  infoBannerText: { fontSize: FontSize.xs, color: Colors.text, lineHeight: 16 },
  inputLabel: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.text, marginTop: Spacing.md, marginBottom: 4 },
  optionalText: { fontSize: FontSize.xs, fontWeight: '400', color: Colors.textMuted },
  modalInput: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    fontSize: FontSize.sm,
    color: Colors.text,
  },
  inputHint: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 4, lineHeight: 15 },
  errorText: { fontSize: FontSize.xs, color: Colors.error, marginTop: 4, fontWeight: '600' },
  roleSelectChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Radius.pill,
    backgroundColor: Colors.surfaceAlt,
    borderWidth: 1,
    borderColor: Colors.border,
    marginRight: 8,
  },
  roleSelectChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  roleSelectText: { fontSize: FontSize.xs, color: Colors.text, fontWeight: '500' },
  roleSelectTextActive: { color: '#fff', fontWeight: '700' },

  // Role Pill Grid for Edit Modal
  rolePillGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 6,
    marginBottom: Spacing.md,
  },
  roleGridPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceAlt,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  roleGridPillActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  roleGridPillText: {
    fontSize: FontSize.xs,
    color: Colors.text,
    fontWeight: '500',
  },
  roleGridPillTextActive: {
    color: '#fff',
    fontWeight: '700',
  },

  accountActiveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginTop: Spacing.md,
    marginBottom: Spacing.xl,
  },
  accountActiveTitle: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.text },
  accountActiveSub: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },

  modalFooter: {
    flexDirection: 'row',
    padding: Spacing.lg,
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    gap: Spacing.md,
  },
  footerCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surfaceAlt,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  footerCancelText: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.text },
  footerSaveBtn: {
    flex: 2,
    paddingVertical: 12,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
  },
  footerSaveText: { fontSize: FontSize.sm, fontWeight: '700', color: '#fff' },

  // ─── Dialogs ───
  overlayBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  dialogCard: {
    width: '100%',
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.xl,
    elevation: 8,
  },
  dialogTitle: { fontSize: FontSize.lg, fontWeight: '800', color: Colors.text, marginBottom: 4 },
  dialogSub: { fontSize: FontSize.sm, color: Colors.textMuted, marginBottom: Spacing.md },
  dialogInput: {
    backgroundColor: Colors.surfaceAlt,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    fontSize: FontSize.sm,
    color: Colors.text,
    marginBottom: Spacing.lg,
  },
  dialogButtons: { flexDirection: 'row', gap: Spacing.md },
  dialogCancelBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: Radius.md,
    alignItems: 'center',
    backgroundColor: Colors.surfaceAlt,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  dialogCancelText: { fontSize: FontSize.sm, color: Colors.text, fontWeight: '600' },
  dialogConfirmBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: Radius.md,
    alignItems: 'center',
    backgroundColor: Colors.primary,
  },
  dialogConfirmText: { fontSize: FontSize.sm, color: '#fff', fontWeight: '700' },

  // ─── Details Modal ───
  detailHero: {
    alignItems: 'center',
    paddingVertical: Spacing.lg,
  },
  largeAvatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  largeAvatarText: { color: '#fff', fontSize: FontSize.xxl, fontWeight: '800' },
  detailName: { fontSize: FontSize.xl, fontWeight: '800', color: Colors.text },
  detailUsername: { fontSize: FontSize.sm, color: Colors.primary, fontWeight: '600', marginTop: 2 },
  sectionHeading: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  infoKey: { fontSize: FontSize.sm, color: Colors.textMuted },
  infoVal: { fontSize: FontSize.sm, color: Colors.text, fontWeight: '500' },
  rolesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  actionLargeBtn: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLargeBtnText: { color: '#fff', fontWeight: '700', fontSize: FontSize.base },
});
