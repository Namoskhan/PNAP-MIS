import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
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
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
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
  { label: 'Prefer not to say', value: 'PREFER_NOT_TO_SAY' },
];

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const PHONE_RX = /^(\+92|0)?3\d{2}[- ]?\d{7}$/;

const INITIAL_FORM = {
  fullName: '',
  fatherOrHusbandName: '',
  cnic: '',
  phone: '',
  email: '',
  password: '',
  passwordConfirm: '',
  dateOfBirth: '2000-01-01',
  gender: 'MALE',
  bloodGroup: '',
  education: '',
  occupation: '',
  address: '',
  basicUnitId: '',
};

export default function MembersScreen() {
  const { user } = useAuth();
  const toast = useToast();
  const { status: initialStatus } = useLocalSearchParams();
  const [items, setItems] = useState([]);
  const [meta, setMeta] = useState({ page: 1, totalPages: 1, total: 0 });
  const [q, setQ] = useState('');
  const [status, setStatus] = useState(initialStatus || '');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Register Modal state
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(INITIAL_FORM);
  const [photo, setPhoto] = useState(null);
  const [saving, setSaving] = useState(false);
  const [modalErr, setModalErr] = useState('');
  const [cnicTaken, setCnicTaken] = useState(null);

  // Cascading Unit Pickers for Register Modal
  const [provinces, setProvinces] = useState([]);
  const [districts, setDistricts] = useState([]);
  const [areas, setAreas] = useState([]);
  const [units, setUnits] = useState([]);

  const [provinceId, setProvinceId] = useState('');
  const [districtId, setDistrictId] = useState('');
  const [areaId, setAreaId] = useState('');

  // Super and Central are the two unbounded tiers
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
      toast.error(errorMessage(e));
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

  // Live duplicate check once all 13 digits are typed
  useEffect(() => {
    if (!isCompleteCnic(form.cnic)) {
      setCnicTaken(null);
      return;
    }
    let stale = false;
    api.get('/members', { params: { q: form.cnic, limit: 1 } })
      .then((r) => {
        if (stale) return;
        const memberList = r.data?.data || [];
        setCnicTaken(memberList.some((m) => m.cnic === form.cnic));
      })
      .catch(() => {
        if (!stale) setCnicTaken(null);
      });
    return () => { stale = true; };
  }, [form.cnic]);

  // Load Org Hierarchy for registration modal
  useEffect(() => {
    if (!showCreate) return;
    setForm(INITIAL_FORM);
    setPhoto(null);
    setModalErr('');
    setCnicTaken(null);
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

  async function pickPhoto() {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        toast.error('Permission is required to access your photo gallery.');
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
      });
      if (!res.canceled && res.assets?.[0]) {
        setPhoto(res.assets[0]);
      }
    } catch (e) {
      toast.error('Could not pick photo: ' + errorMessage(e));
    }
  }

  async function handleCreateMember() {
    setModalErr('');
    if (!form.fullName.trim()) {
      setModalErr('Full name is required (min 3 characters).');
      return;
    }
    if (!form.fatherOrHusbandName.trim()) {
      setModalErr('Father / Husband name is required.');
      return;
    }
    if (!isCompleteCnic(form.cnic)) {
      setModalErr('CNIC must be 13 digits (XXXXX-XXXXXXX-X).');
      return;
    }
    if (cnicTaken) {
      setModalErr('A member with this CNIC already exists.');
      return;
    }
    if (!form.phone.trim() || !PHONE_RX.test(form.phone.trim())) {
      setModalErr('Enter a valid Pakistan mobile number (03XX-XXXXXXX).');
      return;
    }
    if (!form.email.trim()) {
      setModalErr('Email address is required.');
      return;
    }
    if (!form.password || form.password.length < 6) {
      setModalErr('Password must be at least 6 characters.');
      return;
    }
    if (form.password !== form.passwordConfirm) {
      setModalErr('Password and confirmation do not match.');
      return;
    }
    if (!form.dateOfBirth) {
      setModalErr('Date of birth is required.');
      return;
    }
    if (!form.address.trim() || form.address.trim().length < 5) {
      setModalErr('Residential address must be at least 5 characters.');
      return;
    }
    if (!form.basicUnitId) {
      setModalErr('Please select a Basic Unit in the hierarchy.');
      return;
    }

    setSaving(true);
    try {
      const fd = new FormData();
      fd.append('fullName', form.fullName.trim());
      fd.append('fatherOrHusbandName', form.fatherOrHusbandName.trim());
      fd.append('cnic', form.cnic);
      fd.append('phone', form.phone.trim());
      fd.append('email', form.email.trim());
      fd.append('password', form.password);
      fd.append('dateOfBirth', form.dateOfBirth);
      fd.append('gender', form.gender);
      fd.append('address', form.address.trim());
      fd.append('basicUnitId', form.basicUnitId);

      if (form.bloodGroup) fd.append('bloodGroup', form.bloodGroup);
      if (form.education?.trim()) fd.append('education', form.education.trim());
      if (form.occupation?.trim()) fd.append('occupation', form.occupation.trim());

      if (photo) {
        if (Platform.OS === 'web' && photo.file) {
          fd.append('photo', photo.file);
        } else {
          const uri = photo.uri;
          const name = photo.fileName || uri.split('/').pop() || 'photo.jpg';
          const match = /\.(\w+)$/.exec(name);
          const type = photo.mimeType || (match ? `image/${match[1]}` : 'image/jpeg');
          fd.append('photo', { uri, name, type });
        }
      }

      await api.post('/members', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast.success('Member submitted for approval successfully!');
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
    const districtName = m.districtId?.name || '';
    const areaName = m.areaId?.name || '';
    const locationParts = [unitName, areaName, districtName].filter(Boolean);

    return (
      <Card style={styles.card}>
        <View style={styles.cardHeader}>
          <Avatar name={m.fullName} photoUrl={m.photoUrl} size={42} />
          <View style={styles.cardHeaderInfo}>
            <View style={styles.nameRow}>
              <Text style={styles.name}>{m.fullName}</Text>
              {m.memberId ? (
                <View style={styles.idPill}>
                  <Text style={styles.idText}>ID: {m.memberId}</Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.cnicText}>{formatCnic(m.cnic)}</Text>
          </View>
          <Badge label={m.status?.replace(/_/g, ' ') || '—'} status={m.status} />
        </View>

        <View style={styles.cardFooter}>
          <View style={styles.locationBox}>
            <Ionicons name="location-outline" size={13} color={Colors.textMuted} style={{ marginRight: 3 }} />
            <Text style={styles.locationText} numberOfLines={1}>
              {locationParts.length ? locationParts.join(' · ') : '—'}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.viewLink}
            onPress={() => router.push(`/members/${m._id}`)}
          >
            <Text style={styles.viewLinkText}>View</Text>
            <Ionicons name="chevron-forward" size={14} color={Colors.primary} />
          </TouchableOpacity>
        </View>
      </Card>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      {/* Search and Action Bar */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>{pageTitle}</Text>
          <Text style={styles.headerSub}>
            {meta.total ? `${meta.total} registered members` : 'Manage and search members'}
          </Text>
        </View>
        {showRegisterButton && (
          <TouchableOpacity
            style={styles.registerBtn}
            onPress={() => setShowCreate(true)}
          >
            <Ionicons name="person-add-outline" size={16} color="#fff" style={{ marginRight: 6 }} />
            <Text style={styles.registerBtnText}>Register</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.searchBar}>
        <View style={styles.searchInputWrap}>
          <Ionicons name="search" size={16} color={Colors.textMuted} style={{ marginRight: 8 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by name, CNIC, or ID..."
            placeholderTextColor={Colors.textMuted}
            value={q}
            onChangeText={setQ}
            onSubmitEditing={handleSearchSubmit}
            returnKeyType="search"
          />
          {q ? (
            <TouchableOpacity onPress={() => { setQ(''); load(1, true); }}>
              <Ionicons name="close-circle" size={16} color={Colors.textMuted} />
            </TouchableOpacity>
          ) : null}
        </View>
        <TouchableOpacity style={styles.searchActionBtn} onPress={handleSearchSubmit}>
          <Text style={styles.searchActionBtnText}>Filter</Text>
        </TouchableOpacity>
      </View>

      {/* Filter Chips */}
      <View style={styles.filterWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
          {STATUS_FILTERS.map((f) => (
            <TouchableOpacity
              key={f.value}
              style={[styles.filterPill, status === f.value && styles.filterPillActive]}
              onPress={() => setStatus(f.value)}
            >
              <Text style={[styles.filterText, status === f.value && styles.filterTextActive]}>
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* List */}
      <FlatList
        data={items}
        keyExtractor={(item) => item._id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.3}
        refreshing={refreshing}
        onRefresh={onRefresh}
        ListEmptyComponent={
          !loading && (
            <EmptyState
              icon="👥"
              title="No members found"
              subtitle={q ? `No results matching "${q}"` : 'No members found in this status filter.'}
            />
          )
        }
        ListFooterComponent={
          loading && !refreshing ? (
            <ActivityIndicator size="small" color={Colors.primary} style={{ marginVertical: 20 }} />
          ) : null
        }
      />

      {/* ─── REGISTER MEMBER MODAL ─── */}
      <Modal visible={showCreate} animationType="slide" transparent>
        <SafeAreaView style={styles.modalOverlay}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.modalContainer}
          >
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Register Member</Text>
              <TouchableOpacity onPress={() => !saving && setShowCreate(false)} disabled={saving}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.modalBody}>
              {modalErr ? (
                <View style={styles.errorBanner}>
                  <Ionicons name="alert-circle" size={18} color={Colors.error} style={{ marginRight: 6 }} />
                  <Text style={styles.errorText}>{modalErr}</Text>
                </View>
              ) : null}

              {/* Photo Upload Section */}
              <View style={styles.photoUploadRow}>
                {photo ? (
                  <Image source={{ uri: photo.uri }} style={styles.avatarPreview} />
                ) : (
                  <View style={styles.avatarPlaceholder}>
                    <Ionicons name="person" size={32} color={Colors.textMuted} />
                  </View>
                )}
                <View style={{ flex: 1, marginLeft: Spacing.md }}>
                  <Text style={styles.photoHeading}>Member Photo</Text>
                  <Text style={styles.photoSub}>Optional. Square photo (max 5 MB)</Text>
                  <TouchableOpacity style={styles.pickPhotoBtn} onPress={pickPhoto}>
                    <Ionicons name="camera-outline" size={16} color={Colors.primary} style={{ marginRight: 5 }} />
                    <Text style={styles.pickPhotoBtnText}>{photo ? 'Change Photo' : 'Upload Photo'}</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <Text style={styles.formSection}>Personal Details</Text>

              <View style={styles.field}>
                <Text style={styles.label}>Full Name *</Text>
                <TextInput
                  style={styles.input}
                  value={form.fullName}
                  onChangeText={(v) => setForm((f) => ({ ...f, fullName: v }))}
                  placeholder="e.g. Ahmad Khan"
                  placeholderTextColor={Colors.textMuted}
                />
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Father / Husband Name *</Text>
                <TextInput
                  style={styles.input}
                  value={form.fatherOrHusbandName}
                  onChangeText={(v) => setForm((f) => ({ ...f, fatherOrHusbandName: v }))}
                  placeholder="e.g. Mehmood Khan"
                  placeholderTextColor={Colors.textMuted}
                />
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>CNIC * (13 digits)</Text>
                <TextInput
                  style={styles.input}
                  value={form.cnic}
                  onChangeText={(v) => setForm((f) => ({ ...f, cnic: formatCnic(v) }))}
                  placeholder="XXXXX-XXXXXXX-X"
                  placeholderTextColor={Colors.textMuted}
                  keyboardType="numeric"
                  maxLength={15}
                />
                {cnicTaken ? (
                  <Text style={{ color: Colors.error, fontSize: 11, marginTop: 4 }}>A member with this CNIC already exists.</Text>
                ) : isCompleteCnic(form.cnic) && cnicTaken === false ? (
                  <Text style={{ color: Colors.success, fontSize: 11, marginTop: 4 }}>✓ CNIC available</Text>
                ) : (
                  <Text style={{ color: Colors.textMuted, fontSize: 11, marginTop: 4 }}>Just type digits — dashes are added automatically.</Text>
                )}
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Phone Number *</Text>
                <TextInput
                  style={styles.input}
                  value={form.phone}
                  onChangeText={(v) => setForm((f) => ({ ...f, phone: v }))}
                  placeholder="03XX-XXXXXXX"
                  placeholderTextColor={Colors.textMuted}
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
                  placeholderTextColor={Colors.textMuted}
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
                  placeholderTextColor={Colors.textMuted}
                  secureTextEntry
                  autoCapitalize="none"
                />
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Confirm Password *</Text>
                <TextInput
                  style={styles.input}
                  value={form.passwordConfirm}
                  onChangeText={(v) => setForm((f) => ({ ...f, passwordConfirm: v }))}
                  placeholder="••••••••"
                  placeholderTextColor={Colors.textMuted}
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

              <View style={styles.field}>
                <Text style={styles.label}>Blood Group</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
                  {BLOOD_GROUPS.map((bg) => (
                    <TouchableOpacity
                      key={bg}
                      style={[styles.chip, form.bloodGroup === bg && styles.chipActive]}
                      onPress={() => setForm((f) => ({ ...f, bloodGroup: f.bloodGroup === bg ? '' : bg }))}
                    >
                      <Text style={[styles.chipText, form.bloodGroup === bg && styles.chipTextActive]}>
                        {bg}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
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
                  placeholderTextColor={Colors.textMuted}
                  multiline
                  numberOfLines={2}
                />
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Education</Text>
                <TextInput
                  style={styles.input}
                  value={form.education}
                  onChangeText={(v) => setForm((f) => ({ ...f, education: v }))}
                  placeholder="e.g. Master's in Political Science"
                  placeholderTextColor={Colors.textMuted}
                />
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Occupation</Text>
                <TextInput
                  style={styles.input}
                  value={form.occupation}
                  onChangeText={(v) => setForm((f) => ({ ...f, occupation: v }))}
                  placeholder="e.g. Teacher, Advocate, Business"
                  placeholderTextColor={Colors.textMuted}
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
  listAvatarImg: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: Colors.border,
  },

  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: Platform.OS === 'web' ? 'center' : 'flex-end',
    alignItems: Platform.OS === 'web' ? 'center' : 'stretch',
    padding: Platform.OS === 'web' ? Spacing.lg : 0,
  },
  modalContainer: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    ...(Platform.OS === 'web' ? {
      borderRadius: Radius.xl,
      width: '100%',
      maxWidth: 620,
      boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 8px 10px -6px rgba(0, 0, 0, 0.2)',
    } : {}),
    maxHeight: '90%',
    display: 'flex',
    flexDirection: 'column',
  },
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
  photoUploadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceAlt || '#f8fafc',
    padding: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.md,
  },
  avatarPreview: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    borderColor: Colors.primary,
  },
  avatarPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoHeading: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.text,
  },
  photoSub: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: 2,
    marginBottom: 6,
  },
  pickPhotoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    borderRadius: Radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  pickPhotoBtnText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.primary,
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
    height: 65,
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
