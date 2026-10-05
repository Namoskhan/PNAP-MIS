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
import { Ionicons } from '@expo/vector-icons';
import { api, errorMessage } from '../../../src/api/client';
import { useAuth } from '../../../src/context/AuthContext';
import { confirmAction } from '../../../src/utils/dialog';
import { useToast } from '../../../src/components/Toast';
import Badge from '../../../src/components/Badge';
import Card from '../../../src/components/Card';
import EmptyState from '../../../src/components/EmptyState';
import { Colors, FontSize, Spacing, Radius } from '../../../src/constants/colors';
import { useLanguage } from '../../../src/context/LanguageContext';

const TIER_CONFIG = {
  SUPER_ADMIN: {
    level: 'PROVINCE',
    title: 'Manage Provinces',
    subtitle: 'You can create and delete provinces. Central Admins manage everything within them.',
    childLabel: 'Province',
    childPlural: 'Provinces',
    listEndpoint: '/org/provinces',
    createEndpoint: '/org/provinces',
    deleteEndpoint: '/org/provinces',
    childAdminRole: 'PROVINCE_ADMIN',
    parentLabel: null,
    showCreateAdmin: true,
  },
  CENTRAL_ADMIN: {
    level: 'PROVINCE',
    title: 'Manage Provinces',
    subtitle: 'You can create provinces and assign Province Admins.',
    childLabel: 'Province',
    childPlural: 'Provinces',
    listEndpoint: '/org/provinces',
    createEndpoint: '/org/provinces',
    deleteEndpoint: null,
    childAdminRole: 'PROVINCE_ADMIN',
    parentLabel: null,
    showCreateAdmin: true,
  },
  PROVINCE_ADMIN: {
    level: 'DISTRICT',
    title: 'Manage Districts',
    subtitle: 'You can create districts and assign District Admins.',
    childLabel: 'District',
    childPlural: 'Districts',
    listEndpoint: '/org/districts',
    createEndpoint: '/org/districts',
    deleteEndpoint: null,
    childAdminRole: 'DISTRICT_ADMIN',
    parentLabel: 'Province',
    parentScopeKey: 'provinceId',
    showCreateAdmin: true,
  },
  DISTRICT_ADMIN: {
    level: 'AREA',
    title: 'Manage Areas',
    subtitle: 'You can create areas and assign Area Admins.',
    childLabel: 'Area',
    childPlural: 'Areas',
    listEndpoint: '/org/areas',
    createEndpoint: '/org/areas',
    deleteEndpoint: null,
    childAdminRole: 'AREA_ADMIN',
    parentLabel: 'District',
    parentScopeKey: 'districtId',
    showCreateAdmin: true,
  },
  AREA_ADMIN: {
    level: 'BASIC_UNIT',
    title: 'Manage Basic Units',
    subtitle: 'You can create basic units within your area.',
    childLabel: 'Basic Unit',
    childPlural: 'Basic Units',
    listEndpoint: '/org/basic-units',
    createEndpoint: '/org/basic-units',
    deleteEndpoint: null,
    childAdminRole: null,
    parentLabel: 'Area',
    parentScopeKey: 'areaId',
    showCreateAdmin: false,
  },
};

const SUPER_LEVELS = [
  {
    level: 'PROVINCE',
    title: 'Manage Provinces',
    subtitle: 'Open a province to see its districts, then its areas, then its basic units.',
    childLabel: 'Province',
    childPlural: 'Provinces',
    listEndpoint: '/org/provinces',
    createEndpoint: '/org/provinces',
    deleteEndpoint: '/org/provinces',
    parentParam: null,
    childAdminRole: 'PROVINCE_ADMIN',
    showCreateAdmin: true,
  },
  {
    level: 'DISTRICT',
    title: 'Manage Districts',
    subtitle: 'Manage districts inside the selected province.',
    childLabel: 'District',
    childPlural: 'Districts',
    listEndpoint: '/org/districts',
    createEndpoint: '/org/districts',
    deleteEndpoint: '/org/districts',
    parentParam: 'provinceId',
    childAdminRole: 'DISTRICT_ADMIN',
    showCreateAdmin: true,
  },
  {
    level: 'AREA',
    title: 'Manage Areas',
    subtitle: 'Manage areas inside the selected district.',
    childLabel: 'Area',
    childPlural: 'Areas',
    listEndpoint: '/org/areas',
    createEndpoint: '/org/areas',
    deleteEndpoint: '/org/areas',
    parentParam: 'districtId',
    childAdminRole: 'AREA_ADMIN',
    showCreateAdmin: true,
  },
  {
    level: 'BASIC_UNIT',
    title: 'Manage Basic Units',
    subtitle: 'Manage basic units inside the selected area.',
    childLabel: 'Basic Unit',
    childPlural: 'Basic Units',
    listEndpoint: '/org/basic-units',
    createEndpoint: '/org/basic-units',
    deleteEndpoint: '/org/basic-units',
    parentParam: 'areaId',
    childAdminRole: null,
    showCreateAdmin: false,
  },
];

function pickTier(roles = []) {
  if (roles.includes('SUPER_ADMIN')) return TIER_CONFIG.SUPER_ADMIN;
  if (roles.includes('CENTRAL_ADMIN')) return TIER_CONFIG.CENTRAL_ADMIN;
  if (roles.includes('PROVINCE_ADMIN')) return TIER_CONFIG.PROVINCE_ADMIN;
  if (roles.includes('DISTRICT_ADMIN')) return TIER_CONFIG.DISTRICT_ADMIN;
  if (roles.includes('AREA_ADMIN')) return TIER_CONFIG.AREA_ADMIN;
  return null;
}

export default function OrgScreen() {
  const { user } = useAuth();
  const toast = useToast();
  const { t, isRTL } = useLanguage();
  const isSuper = (user?.roles || []).includes('SUPER_ADMIN');

  const getChildLabel = (level) => {
    if (level === 'PROVINCE') return t('admin.province') || 'Province';
    if (level === 'DISTRICT') return t('admin.district') || 'District';
    if (level === 'AREA') return t('admin.area') || 'Area';
    if (level === 'BASIC_UNIT') return t('admin.basicUnit') || 'Basic Unit';
    return 'Unit';
  };
  const getChildPlural = (level) => {
    if (level === 'PROVINCE') return t('admin.provinces') || 'Provinces';
    if (level === 'DISTRICT') return t('admin.districts') || 'Districts';
    if (level === 'AREA') return t('admin.areas') || 'Areas';
    if (level === 'BASIC_UNIT') return t('admin.basicUnits') || 'Basic Units';
    return 'Units';
  };
  const getTierTitle = (level) => {
    if (level === 'PROVINCE') return t('admin.manageProvinces') || 'Manage Provinces';
    if (level === 'DISTRICT') return t('admin.manageDistricts') || 'Manage Districts';
    if (level === 'AREA') return t('admin.manageAreas') || 'Manage Areas';
    if (level === 'BASIC_UNIT') return t('admin.manageBasicUnits') || 'Manage Basic Units';
    return t('admin.units.title') || 'Manage Units';
  };

  const [trail, setTrail] = useState([]); // [{ id, name, level }, ...]
  const tier = isSuper
    ? SUPER_LEVELS[Math.min(trail.length, SUPER_LEVELS.length - 1)]
    : pickTier(user?.roles || []);

  const parent = trail[trail.length - 1] || null;
  const canDrill = isSuper && trail.length < SUPER_LEVELS.length - 1;
  const childNoun = canDrill ? getChildLabel(SUPER_LEVELS[trail.length + 1].level) : '';

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  // Form state
  const [form, setForm] = useState({ name: '', code: '' });
  const [admin, setAdmin] = useState({
    fullName: '',
    username: '',
    email: '',
    password: '',
    passwordConfirm: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formErr, setFormErr] = useState('');

  async function load() {
    if (!tier) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const params = {};
      if (isSuper) {
        if (tier.parentParam && parent) {
          params[tier.parentParam] = parent.id;
        }
      } else {
        if (tier.parentScopeKey === 'provinceId' && user?.scope?.provinceId) {
          params.provinceId = user.scope.provinceId;
        }
        if (tier.parentScopeKey === 'districtId' && user?.scope?.districtId) {
          params.districtId = user.scope.districtId;
        }
        if (tier.parentScopeKey === 'areaId' && user?.scope?.areaId) {
          params.areaId = user.scope.areaId;
        }
      }
      const r = await api.get(tier.listEndpoint, { params });
      setItems(r.data?.data || []);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [user?.id, trail.length]);

  function handleOpenCreate() {
    setForm({ name: '', code: '' });
    setAdmin({
      fullName: '',
      username: '',
      email: '',
      password: '',
      passwordConfirm: '',
    });
    setFormErr('');
    setShowPassword(false);
    setOpen(true);
  }

  async function handleCreateSubmit() {
    setFormErr('');
    if (!form.name.trim()) {
      setFormErr(`${tier.childLabel} name is required`);
      return;
    }
    if (tier.showCreateAdmin) {
      if (!admin.fullName.trim()) {
        setFormErr('Admin full name is required');
        return;
      }
      if (!admin.email.trim()) {
        setFormErr('Admin email is required');
        return;
      }
      if (!admin.password || admin.password.length < 6) {
        setFormErr('Admin password must be at least 6 characters');
        return;
      }
      if (admin.password !== admin.passwordConfirm) {
        setFormErr('Password and confirmation do not match.');
        return;
      }
    }

    setBusy(true);
    try {
      // 1. Create the child unit
      const body = { name: form.name.trim() };
      if (form.code.trim()) body.code = form.code.trim().toUpperCase();

      const parentKey = tier.parentScopeKey || tier.parentParam;
      if (parentKey) {
        body[parentKey] = isSuper ? parent?.id : user?.scope?.[parentKey];
      }

      const childRes = await api.post(tier.createEndpoint, body);
      const child = childRes.data?.data;

      // 2. Create the admin user (if applicable)
      if (tier.showCreateAdmin && tier.childAdminRole && child?._id) {
        const scope = {};
        if (tier.childAdminRole === 'PROVINCE_ADMIN') scope.provinceId = child._id;
        if (tier.childAdminRole === 'DISTRICT_ADMIN') scope.districtId = child._id;
        if (tier.childAdminRole === 'AREA_ADMIN') scope.areaId = child._id;

        const adminBody = {
          fullName: admin.fullName.trim(),
          password: admin.password,
          role: tier.childAdminRole,
          scope,
          email: admin.email.trim(),
        };
        if (admin.username.trim()) adminBody.username = admin.username.trim();

        try {
          await api.post('/admin/users', adminBody);
        } catch (adminErr) {
          toast.error(
            `${tier.childLabel} created, but admin creation failed: ${errorMessage(adminErr)}`,
            { duration: 7000 }
          );
          setOpen(false);
          load();
          return;
        }
      }

      toast.success(`${child?.name || tier.childLabel} created successfully.`);
      setOpen(false);
      load();
    } catch (e) {
      toast.error(errorMessage(e), { duration: 7000 });
      setFormErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(item) {
    if (!isSuper || !tier.deleteEndpoint) return;
    const noun = tier.childLabel.toLowerCase();

    confirmAction(
      `Delete ${tier.childLabel}`,
      `Delete the ${noun} "${item.name}"?\n\nIts admin account will be deleted along with it. This cannot be undone.`,
      async () => {
        setDeletingId(item._id);
        try {
          const res = await api.delete(`${tier.deleteEndpoint}/${item._id}`);
          const removed = res.data?.data?.removedAdmins || 0;
          toast.success(
            removed
              ? `${item.name} deleted, along with ${removed} admin account${removed === 1 ? '' : 's'}.`
              : `${item.name} deleted.`
          );
          load();
        } catch (e) {
          toast.error(errorMessage(e), { duration: 8000 });
        } finally {
          setDeletingId(null);
        }
      },
      { confirmText: 'Delete', destructive: true }
    );
  }

  if (!tier) {
    return (
      <SafeAreaView style={styles.safe}>
        <EmptyState icon="🚫" title="No org-management access" message="Your role does not have permission to create units." />
      </SafeAreaView>
    );
  }

  const headerScopeText = isSuper
    ? (parent ? `${t('admin.inside') || 'Inside'} ${parent.name}` : (t('admin.systemWide') || 'System-wide'))
    : (tier.parentLabel ? `${t('admin.withinYour') || 'Within your'} ${tier.parentLabel.toLowerCase()}` : (t('admin.systemWide') || 'System-wide'));

  function renderItem({ item }) {
    const isDeleting = deletingId === item._id;

    return (
      <Card style={styles.itemCard}>
        <TouchableOpacity
          style={[styles.itemRow, isRTL && { flexDirection: 'row-reverse' }]}
          onPress={() => {
            if (canDrill) {
              setTrail([...trail, { id: item._id, name: item.name, level: tier.level }]);
            }
          }}
          disabled={!canDrill}
          activeOpacity={canDrill ? 0.7 : 1}
        >
          <View style={{ flex: 1 }}>
            <View style={[styles.titleRow, isRTL && { flexDirection: 'row-reverse' }]}>
              <Text style={[styles.itemName, isRTL && { textAlign: 'right' }]}>{item.name}</Text>
              <Badge label={getChildLabel(tier.level)} status="ACTIVE" style={styles.typeBadge} />
              {item.code ? (
                <View style={styles.codeBadge}>
                  <Text style={styles.codeBadgeText}>{item.code}</Text>
                </View>
              ) : null}
            </View>

            <View style={[styles.metaRow, isRTL && { flexDirection: 'row-reverse' }]}>
              <Badge
                label={item.isActive === false ? (t('admin.inactiveStatus') || 'Inactive') : (t('admin.activeStatus') || 'Active')}
                status={item.isActive === false ? 'INACTIVE' : 'ACTIVE'}
              />
              {canDrill && (
                <View style={[styles.drillBox, isRTL && { flexDirection: 'row-reverse' }]}>
                  <Text style={styles.drillText}>
                    {t('admin.showSubUnits') || 'Show'} {getChildPlural(tier.level).toLowerCase()}
                  </Text>
                  <Ionicons name={isRTL ? "chevron-back" : "chevron-forward"} size={14} color={Colors.primary} />
                </View>
              )}
            </View>
          </View>

          {isSuper && (
            <TouchableOpacity
              onPress={() => handleDelete(item)}
              style={[styles.deleteBtn, isRTL && { marginRight: Spacing.sm, marginLeft: 0 }]}
              disabled={isDeleting}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              {isDeleting ? (
                <ActivityIndicator size="small" color={Colors.error} />
              ) : (
                <Ionicons name="trash-outline" size={18} color={Colors.error} />
              )}
            </TouchableOpacity>
          )}
        </TouchableOpacity>
      </Card>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={[styles.header, isRTL && { flexDirection: 'row-reverse' }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.scopeHeader, isRTL && { textAlign: 'right' }]}>{headerScopeText}</Text>
          <Text style={[styles.headerTitle, isRTL && { textAlign: 'right' }]}>
            {isSuper ? (t('admin.units.title') || 'Manage Units') : getTierTitle(tier.level)}
          </Text>
          {tier.subtitle && !parent && (
            <Text style={[styles.headerSub, isRTL && { textAlign: 'right' }]}>{tier.subtitle}</Text>
          )}
        </View>

        <TouchableOpacity
          style={[styles.createBtn, isRTL && { flexDirection: 'row-reverse' }]}
          onPress={handleOpenCreate}
        >
          <Ionicons name="add" size={18} color="#fff" style={isRTL ? { marginLeft: 4 } : { marginRight: 4 }} />
          <Text style={styles.createBtnText}>
            {t('admin.create') || 'Create'} {getChildLabel(tier.level)}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Super Admin Breadcrumb Trail */}
      {isSuper && trail.length > 0 && (
        <View style={[styles.trailBar, isRTL && { flexDirection: 'row-reverse' }]}>
          <TouchableOpacity
            onPress={() => setTrail(trail.slice(0, -1))}
            style={[styles.backBtn, isRTL && { flexDirection: 'row-reverse', marginLeft: Spacing.md, marginRight: 0 }]}
          >
            <Ionicons name={isRTL ? "chevron-forward" : "chevron-back"} size={16} color={Colors.text} />
            <Text style={styles.backBtnText}>{t('common.back') || 'Back'}</Text>
          </TouchableOpacity>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.trailScroll, isRTL && { flexDirection: 'row-reverse' }]}>
            <TouchableOpacity onPress={() => setTrail([])}>
              <Text style={styles.crumbRoot}>{t('admin.country') || 'Pakistan'}</Text>
            </TouchableOpacity>
            {trail.map((tItem, i) => (
              <View key={tItem.id} style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center' }}>
                <Text style={styles.crumbSep}>/</Text>
                <TouchableOpacity
                  onPress={() => setTrail(trail.slice(0, i + 1))}
                  disabled={i === trail.length - 1}
                >
                  <Text style={[styles.crumbText, i === trail.length - 1 && styles.crumbTextActive]}>
                    {tItem.name}
                  </Text>
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Unit List */}
      <FlatList
        data={items}
        renderItem={renderItem}
        keyExtractor={(i) => i._id}
        contentContainerStyle={styles.list}
        onRefresh={load}
        refreshing={loading}
        ListEmptyComponent={
          !loading && (
            <EmptyState
              icon="📂"
              title={`${t('admin.noUnitsYet') || 'No units yet'}`}
              message={`${t('admin.tapToCreateFirstUnit') || 'Tap to create the first one.'}`}
            />
          )
        }
      />

      {/* Create Modal */}
      <Modal
        visible={open}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => { if (!busy) setOpen(false); }}
      >
        <SafeAreaView style={styles.modalSafe}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={{ flex: 1 }}
          >
            <View style={[styles.modalHeader, isRTL && { flexDirection: 'row-reverse' }]}>
              <Text style={styles.modalTitle}>
                {t('admin.create') || 'Create'} {getChildLabel(tier.level)}
              </Text>
              <TouchableOpacity
                onPress={() => { if (!busy) setOpen(false); }}
                disabled={busy}
                style={styles.modalCloseBtn}
              >
                <Ionicons name="close" size={22} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
              {formErr ? (
                <View style={[styles.errorAlert, isRTL && { flexDirection: 'row-reverse' }]}>
                  <Ionicons name="alert-circle" size={16} color={Colors.error} style={isRTL ? { marginLeft: 6 } : { marginRight: 6 }} />
                  <Text style={[styles.errorAlertText, isRTL && { textAlign: 'right' }]}>{formErr}</Text>
                </View>
              ) : null}

              {/* Section 1: Unit details */}
              <Text style={[styles.sectionHeader, isRTL && { textAlign: 'right' }]}>
                {getChildLabel(tier.level)} {t('admin.unitDetails') || 'details'}
              </Text>
              <View style={styles.fieldBox}>
                <Text style={[styles.fieldLabel, isRTL && { textAlign: 'right' }]}>
                  {getChildLabel(tier.level)} {t('admin.unitName') || 'name'} *
                </Text>
                <TextInput
                  style={[styles.input, isRTL && { textAlign: 'right' }]}
                  value={form.name}
                  onChangeText={(v) => setForm((f) => ({ ...f, name: v }))}
                  placeholder={`e.g. ${tier.level === 'PROVINCE' ? 'Punjab' : (tier.level === 'DISTRICT' ? 'Lahore' : 'Gulberg')}`}
                  placeholderTextColor={Colors.textLight}
                />
              </View>

              <View style={styles.fieldBox}>
                <Text style={[styles.fieldLabel, isRTL && { textAlign: 'right' }]}>
                  {t('admin.unitCode') || 'Code'} ({t('admin.optional') || 'optional'})
                </Text>
                <TextInput
                  style={[styles.input, isRTL && { textAlign: 'right' }]}
                  value={form.code}
                  onChangeText={(v) => setForm((f) => ({ ...f, code: v.toUpperCase() }))}
                  placeholder="e.g. PB-04, LHR"
                  placeholderTextColor={Colors.textLight}
                  autoCapitalize="characters"
                />
              </View>

              {/* Section 2: Admin Account details (if applicable) */}
              {tier.showCreateAdmin && (
                <>
                  <View style={styles.divider} />
                  <Text style={[styles.sectionHeader, isRTL && { textAlign: 'right' }]}>
                    {getChildLabel(tier.level)} {t('admin.adminAccount') || 'admin account'}
                  </Text>
                  <Text style={[styles.sectionSub, isRTL && { textAlign: 'right' }]}>
                    This {tier.childAdminRole.replace('_', ' ').toLowerCase()} will manage all units below.
                  </Text>

                  <View style={styles.fieldBox}>
                    <Text style={[styles.fieldLabel, isRTL && { textAlign: 'right' }]}>
                      {t('admin.fullName') || 'Admin full name'} *
                    </Text>
                    <TextInput
                      style={[styles.input, isRTL && { textAlign: 'right' }]}
                      value={admin.fullName}
                      onChangeText={(v) => setAdmin((a) => ({ ...a, fullName: v }))}
                      placeholder="e.g. Ahmad Khan"
                      placeholderTextColor={Colors.textLight}
                    />
                  </View>

                  <View style={styles.fieldBox}>
                    <Text style={[styles.fieldLabel, isRTL && { textAlign: 'right' }]}>
                      {t('admin.username') || 'Username'} ({t('admin.optional') || 'optional'})
                    </Text>
                    <TextInput
                      style={[styles.input, isRTL && { textAlign: 'right' }]}
                      value={admin.username}
                      onChangeText={(v) => setAdmin((a) => ({ ...a, username: v }))}
                      placeholder="e.g. punjab-admin"
                      placeholderTextColor={Colors.textLight}
                      autoCapitalize="none"
                    />
                  </View>

                  <View style={styles.fieldBox}>
                    <Text style={[styles.fieldLabel, isRTL && { textAlign: 'right' }]}>
                      {t('admin.email') || 'Email'} *
                    </Text>
                    <TextInput
                      style={[styles.input, isRTL && { textAlign: 'right' }]}
                      value={admin.email}
                      onChangeText={(v) => setAdmin((a) => ({ ...a, email: v }))}
                      placeholder="admin@pknap.org"
                      placeholderTextColor={Colors.textLight}
                      keyboardType="email-address"
                      autoCapitalize="none"
                    />
                  </View>

                  <View style={styles.fieldBox}>
                    <Text style={[styles.fieldLabel, isRTL && { textAlign: 'right' }]}>
                      {t('admin.passwordMin6') || 'Password * (min 6 chars)'}
                    </Text>
                    <View style={[styles.passwordWrap, isRTL && { flexDirection: 'row-reverse' }]}>
                      {isRTL ? (
                        <>
                          <TouchableOpacity
                            style={styles.eyeBtn}
                            onPress={() => setShowPassword(!showPassword)}
                          >
                            <Ionicons
                              name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                              size={18}
                              color={Colors.textMuted}
                            />
                          </TouchableOpacity>
                          <TextInput
                            style={[styles.passwordInput, { textAlign: 'right' }]}
                            value={admin.password}
                            onChangeText={(v) => setAdmin((a) => ({ ...a, password: v }))}
                            placeholder="••••••••"
                            placeholderTextColor={Colors.textLight}
                            secureTextEntry={!showPassword}
                            autoCapitalize="none"
                          />
                        </>
                      ) : (
                        <>
                          <TextInput
                            style={styles.passwordInput}
                            value={admin.password}
                            onChangeText={(v) => setAdmin((a) => ({ ...a, password: v }))}
                            placeholder="••••••••"
                            placeholderTextColor={Colors.textLight}
                            secureTextEntry={!showPassword}
                            autoCapitalize="none"
                          />
                          <TouchableOpacity
                            style={styles.eyeBtn}
                            onPress={() => setShowPassword(!showPassword)}
                          >
                            <Ionicons
                              name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                              size={18}
                              color={Colors.textMuted}
                            />
                          </TouchableOpacity>
                        </>
                      )}
                    </View>
                  </View>

                  <View style={styles.fieldBox}>
                    <Text style={[styles.fieldLabel, isRTL && { textAlign: 'right' }]}>
                      {t('admin.confirmPassword') || 'Confirm Password *'}
                    </Text>
                    <View style={[styles.passwordWrap, isRTL && { flexDirection: 'row-reverse' }]}>
                      <TextInput
                        style={[styles.passwordInput, isRTL && { textAlign: 'right' }]}
                        value={admin.passwordConfirm}
                        onChangeText={(v) => setAdmin((a) => ({ ...a, passwordConfirm: v }))}
                        placeholder={t('admin.reenterPassword') || 'Re-enter password'}
                        placeholderTextColor={Colors.textLight}
                        secureTextEntry={!showPassword}
                        autoCapitalize="none"
                      />
                    </View>
                    {admin.passwordConfirm && admin.password !== admin.passwordConfirm ? (
                      <Text style={[styles.errorText, isRTL && { textAlign: 'right' }]}>
                        {t('admin.passwordsDontMatch') || 'Password and confirmation do not match.'}
                      </Text>
                    ) : null}
                  </View>

                  <View style={[styles.infoBox, isRTL && { flexDirection: 'row-reverse' }]}>
                    <Ionicons name="information-circle-outline" size={18} color="#0284c7" style={isRTL ? { marginLeft: 6 } : { marginRight: 6 }} />
                    <Text style={[styles.infoText, isRTL && { textAlign: 'right' }]}>
                      {t('admin.emailLoginHint') || 'Email is the login identifier and receives verification and password-reset mail.'}
                    </Text>
                  </View>
                </>
              )}
            </ScrollView>

            <View style={[styles.modalFooter, isRTL && { flexDirection: 'row-reverse' }]}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => { if (!busy) setOpen(false); }}
                disabled={busy}
              >
                <Text style={styles.cancelText}>{t('common.cancel') || 'Cancel'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, busy && { opacity: 0.7 }]}
                onPress={handleCreateSubmit}
                disabled={busy}
              >
                {busy ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.saveText}>
                    {t('admin.create') || 'Create'} {getChildLabel(tier.level)}{tier.showCreateAdmin ? ' + Admin' : ''}
                  </Text>
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
    padding: Spacing.lg,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  scopeHeader: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.textMuted,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  headerTitle: { fontSize: FontSize.lg, fontWeight: '800', color: Colors.text, marginTop: 1 },
  headerSub: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  createBtn: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  createBtnText: { color: '#fff', fontWeight: '700', fontSize: FontSize.sm },
  list: { padding: Spacing.md },
  itemCard: { marginBottom: Spacing.sm, padding: Spacing.md },
  itemRow: { flexDirection: 'row', alignItems: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginBottom: 4 },
  itemName: { fontSize: FontSize.base, fontWeight: '700', color: Colors.text },
  typeBadge: { alignSelf: 'center' },
  codeBadge: {
    backgroundColor: Colors.surfaceAlt || '#f1f5f9',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  codeBadgeText: { fontSize: 10, fontWeight: '700', color: Colors.textMuted },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  drillBox: { flexDirection: 'row', alignItems: 'center', marginLeft: 4 },
  drillText: { fontSize: FontSize.xs, color: Colors.primary, fontWeight: '600', marginRight: 2 },
  deleteBtn: { padding: Spacing.sm, marginLeft: Spacing.sm },
  trailBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: Spacing.md,
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: Colors.background,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  backBtnText: { fontSize: FontSize.xs, fontWeight: '600', color: Colors.text },
  trailScroll: { alignItems: 'center' },
  crumbRoot: { fontSize: FontSize.xs, fontWeight: '600', color: Colors.primary },
  crumbSep: { fontSize: FontSize.xs, color: Colors.textMuted, marginHorizontal: 4 },
  crumbText: { fontSize: FontSize.xs, fontWeight: '500', color: Colors.primary },
  crumbTextActive: { color: Colors.text, fontWeight: '700' },

  // Modal styles
  modalSafe: { flex: 1, backgroundColor: Colors.background },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  modalTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.text },
  modalCloseBtn: { padding: 4 },
  modalBody: { padding: Spacing.lg },
  modalFooter: {
    flexDirection: 'row',
    gap: Spacing.md,
    padding: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  sectionHeader: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.text,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  sectionSub: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginBottom: Spacing.md,
  },
  fieldBox: { marginBottom: Spacing.md },
  fieldLabel: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.text, marginBottom: 6 },
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
  passwordWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    fontSize: FontSize.sm,
    color: Colors.text,
  },
  eyeBtn: { padding: 10 },
  errorText: { fontSize: FontSize.xs, color: Colors.error, marginTop: 4 },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: Spacing.lg,
  },
  infoBox: {
    flexDirection: 'row',
    backgroundColor: '#f0f9ff',
    borderWidth: 1,
    borderColor: '#bae6fd',
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginTop: 4,
  },
  infoText: { flex: 1, fontSize: FontSize.xs, color: '#0369a1', lineHeight: 18 },
  errorAlert: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  errorAlertText: { flex: 1, fontSize: FontSize.xs, color: Colors.error, fontWeight: '500' },
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
});
