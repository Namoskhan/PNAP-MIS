import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useUnit } from '../../../src/context/UnitContext';
import { useAuth } from '../../../src/context/AuthContext';
import { api, errorMessage } from '../../../src/api/client';
import { useToast } from '../../../src/components/Toast';
import { canManageFinance, isHigherAdmin } from '../../../src/utils/permissions';
import Card from '../../../src/components/Card';
import Badge from '../../../src/components/Badge';
import Avatar from '../../../src/components/Avatar';
import EmptyState from '../../../src/components/EmptyState';
import { Colors, FontSize, Radius, Spacing, Shadow } from '../../../src/constants/colors';
import { Ionicons } from '@expo/vector-icons';

const ROLE_OPTIONS = [
  { value: 'ALL', label: 'All Roles' },
  { value: 'GENERAL_SECRETARY', label: 'General Secretary' },
  { value: 'PRESIDENT', label: 'President / Saddar' },
  { value: 'SECRETARY', label: 'Secretary' },
  { value: 'SENIOR_MAWIN', label: 'Senior Mawin Secretary' },
  { value: 'FINANCE_SECRETARY', label: 'Finance Secretary' },
  { value: 'SR_VICE_PRESIDENT', label: 'Sr. Vice President' },
  { value: 'VICE_PRESIDENT', label: 'Vice President' },
  { value: 'CHAIRMAN', label: 'Chairman' },
  { value: 'CO_CHAIRMAN', label: 'Co-Chairman' },
  { value: 'FIRST_SECRETARY', label: 'First Secretary' },
  { value: 'OTHER', label: 'Other Cabinet Roles' },
  { value: 'NO_ROLE', label: 'General Workers (No Role)' },
];

const UNIT_LEVEL_OPTIONS = [
  { value: 'ALL', label: 'All Tiers' },
  { value: 'CENTRAL', label: 'Central Tier' },
  { value: 'PROVINCE', label: 'Province Tier' },
  { value: 'DISTRICT', label: 'District Tier' },
  { value: 'AREA', label: 'Area Tier' },
  { value: 'BASIC_UNIT', label: 'Basic Unit Tier' },
];

export default function JirgaScreen() {
  const { ctx, setCtx, provinces } = useUnit();
  const { user } = useAuth();
  const router = useRouter();
  const toast = useToast();

  const isCentralOrProvince = ctx && (ctx.unitLevel === 'CENTRAL' || ctx.unitLevel === 'PROVINCE');

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState('');

  // Roster Filters
  const [rosterSearch, setRosterSearch] = useState('');
  const [rosterRoleFilter, setRosterRoleFilter] = useState('ALL');

  // Assign Modal State
  const [assignOpen, setAssignOpen] = useState(false);
  const [candidates, setCandidates] = useState([]);
  const [candidatesLoading, setCandidatesLoading] = useState(false);
  const [candidateSearch, setCandidateSearch] = useState('');
  const [candidateRole, setCandidateRole] = useState('ALL');
  const [candidateUnitLevel, setCandidateUnitLevel] = useState('ALL');
  const [candidateDistId, setCandidateDistId] = useState('');
  const [districtsList, setDistrictsList] = useState([]);
  const [selectedMember, setSelectedMember] = useState(null);
  const [nominationNote, setNominationNote] = useState('');
  const [assigning, setAssigning] = useState(false);

  const fetchIdRef = useRef(0);

  // Filter candidate tier options: remove Central tier when on Provincial Jirga (matching web)
  const candidateTierOptions = useMemo(() => {
    if (ctx?.unitLevel === 'PROVINCE') {
      return UNIT_LEVEL_OPTIONS.filter((opt) => opt.value !== 'CENTRAL');
    }
    return UNIT_LEVEL_OPTIONS;
  }, [ctx?.unitLevel]);

  // Load Jirga Composition
  async function reload(silent = false) {
    if (!ctx || !isCentralOrProvince) {
      setLoading(false);
      setRefreshing(false);
      return;
    }
    const myId = ++fetchIdRef.current;
    if (!silent) setLoading(true);
    setRefreshing(true);
    setErr('');
    try {
      let targetId = ctx.unitId;
      if (ctx.unitLevel === 'CENTRAL' && (!targetId || targetId === 'CENTRAL')) {
        const cRes = await api.get('/org/central');
        targetId = cRes.data?.data?._id || 'CENTRAL';
      }

      const res = await api.get('/jirga/composition', {
        params: { unitLevel: ctx.unitLevel, unitId: targetId },
      });
      if (myId === fetchIdRef.current) {
        setData(res.data.data);
      }
    } catch (e) {
      if (myId === fetchIdRef.current) {
        setErr(errorMessage(e));
      }
    } finally {
      if (myId === fetchIdRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }

  useEffect(() => {
    reload();
  }, [ctx?.unitLevel, ctx?.unitId]);

  // Load candidates when modal opens
  useEffect(() => {
    if (!assignOpen || !ctx || !isCentralOrProvince) return;
    let active = true;
    setCandidatesLoading(true);

    let targetId = ctx.unitId;
    const params = {
      unitLevel: ctx.unitLevel,
      unitId: targetId,
      search: candidateSearch.trim() || undefined,
      roleCode: candidateRole !== 'ALL' ? candidateRole : undefined,
      filterUnitLevel: candidateUnitLevel !== 'ALL' ? candidateUnitLevel : undefined,
      provinceId: ctx.unitLevel === 'PROVINCE' ? ctx.unitId : undefined,
      districtId: candidateDistId || undefined,
      limit: 100,
    };

    api.get('/jirga/eligible-members', { params })
      .then((res) => {
        if (active) {
          setCandidates(res.data.data?.candidates || []);
        }
      })
      .catch((e) => {
        if (active) {
          toast.error(errorMessage(e));
        }
      })
      .finally(() => {
        if (active) setCandidatesLoading(false);
      });

    return () => {
      active = false;
    };
  }, [
    assignOpen,
    ctx?.unitLevel,
    ctx?.unitId,
    candidateSearch,
    candidateRole,
    candidateUnitLevel,
    candidateDistId,
  ]);

  // Load districts when province is active
  useEffect(() => {
    if (!ctx) return;
    const provId = ctx.unitLevel === 'PROVINCE' ? ctx.unitId : '';
    if (!provId) {
      setDistrictsList([]);
      setCandidateDistId('');
      return;
    }
    api.get('/org/districts', { params: { provinceId: provId } })
      .then((res) => setDistrictsList(res.data.data || []))
      .catch(() => setDistrictsList([]));
  }, [ctx?.unitLevel, ctx?.unitId]);

  // Assign Member to Jirga
  async function handleAssign() {
    if (!selectedMember) {
      toast.error('Please pick a member to assign.');
      return;
    }
    setAssigning(true);
    try {
      await api.post('/jirga/members', {
        unitLevel: ctx.unitLevel,
        unitId: ctx.unitId,
        memberId: selectedMember._id,
        nominationNote: nominationNote.trim() || undefined,
      });

      toast.success(`${selectedMember.fullName} successfully assigned to ${data?.unit?.jirgaTitle || 'Jirga'}.`);
      setSelectedMember(null);
      setNominationNote('');
      setAssignOpen(false);
      reload(true);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setAssigning(false);
    }
  }

  // Remove Member from Jirga
  function confirmRemove(jirgaRecordId, memberName) {
    if (!jirgaRecordId) {
      toast.error('Cannot remove member: missing record ID');
      return;
    }
    const doRemove = async () => {
      try {
        await api.post(`/jirga/members/${jirgaRecordId}/remove`);
        toast.success(`${memberName || 'Member'} removed from Jirga.`);
        reload(true);
      } catch (e) {
        toast.error(errorMessage(e));
      }
    };

    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm(`Are you sure you want to remove ${memberName || 'this member'} from the Jirga?`)) {
        doRemove();
      }
    } else {
      Alert.alert(
        'Remove Jirga Member',
        `Are you sure you want to remove ${memberName || 'this member'} from the Jirga?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Remove', style: 'destructive', onPress: doRemove },
        ]
      );
    }
  }

  // Filtered Roster
  const filteredRoster = useMemo(() => {
    if (!data?.members) return [];
    return data.members.filter((m) => {
      if (rosterSearch.trim()) {
        const q = rosterSearch.trim().toLowerCase();
        const matchName = m.fullName?.toLowerCase().includes(q);
        const matchCnic = m.cnic?.toLowerCase().includes(q);
        const matchPhone = m.phone?.toLowerCase().includes(q);
        const matchId = m.memberId?.toLowerCase().includes(q);
        const matchDist = (m.homeUnit?.districtName || '').toLowerCase().includes(q);
        const matchRole = (m.primaryRole?.roleCode || '').toLowerCase().includes(q);
        if (!matchName && !matchCnic && !matchPhone && !matchId && !matchDist && !matchRole) return false;
      }
      if (rosterRoleFilter !== 'ALL') {
        if (rosterRoleFilter === 'NO_ROLE') {
          if (m.activeRoles && m.activeRoles.length > 0) return false;
        } else {
          const hasR = m.activeRoles?.some((r) => r.roleCode === rosterRoleFilter);
          if (!hasR) return false;
        }
      }
      return true;
    });
  }, [data?.members, rosterSearch, rosterRoleFilter]);

  // Statistics
  const stats = useMemo(() => {
    if (!data?.members) return { total: 0, officeHolders: 0, workers: 0, districts: 0 };
    const total = data.members.length;
    let officeHolders = 0;
    let workers = 0;
    const distSet = new Set();

    data.members.forEach((m) => {
      if (m.activeRoles && m.activeRoles.length > 0) {
        officeHolders++;
      } else {
        workers++;
      }
      if (m.homeUnit?.districtName) distSet.add(m.homeUnit.districtName);
    });

    return { total, officeHolders, workers, districts: distSet.size };
  }, [data?.members]);

  const canFinance = canManageFinance(user);
  const canManage = Boolean(data?.canManage);

  // If user is at District, Area, or Basic Unit context, show informational guidance screen (matching web React)
  if (!isCentralOrProvince) {
    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.guidanceCard}>
            <View style={styles.guidanceIconBox}>
              <Ionicons name="people-outline" size={40} color={Colors.primary} />
            </View>
            <Text style={styles.guidanceTitle}>Jirga is only available at Provincial and Central tiers</Text>
            <Text style={styles.guidanceText}>
              Under the party constitution, the <Text style={{ fontWeight: '700' }}>Sobayi Jirga (صوبايي جرګه)</Text> operates at the Province level, and the <Text style={{ fontWeight: '700' }}>Qomi Jirga / National Jirga (قومي جرګه)</Text> operates at the Central level. District and Area units operate via <Text style={{ fontWeight: '700' }}>Zilla & Elaqayi Committees</Text>.
            </Text>

            <View style={styles.guidanceBtnCol}>
              {isHigherAdmin(user) && (
                <TouchableOpacity
                  style={styles.guidanceBtnPrimary}
                  onPress={() => {
                    setCtx({ unitLevel: 'CENTRAL', unitId: 'CENTRAL', unitName: 'PKNAP Central' });
                  }}
                >
                  <Ionicons name="globe-outline" size={18} color="#fff" style={{ marginRight: 6 }} />
                  <Text style={styles.guidanceBtnPrimaryText}>Open Qomi Jirga (Central)</Text>
                </TouchableOpacity>
              )}

              {user?.scope?.provinceId && (
                <TouchableOpacity
                  style={styles.guidanceBtnSecondary}
                  onPress={() => {
                    setCtx({ unitLevel: 'PROVINCE', unitId: user.scope.provinceId, unitName: user.scope.provinceName || 'Province' });
                  }}
                >
                  <Ionicons name="location-outline" size={18} color={Colors.primary} style={{ marginRight: 6 }} />
                  <Text style={styles.guidanceBtnSecondaryText}>Open My Sobayi Jirga</Text>
                </TouchableOpacity>
              )}

              {isHigherAdmin(user) && provinces && provinces.length > 0 && (
                <View style={{ marginTop: 12 }}>
                  <Text style={styles.guidanceSubHead}>OR SWITCH TO PROVINCIAL SOBAYI JIRGA:</Text>
                  <View style={styles.provGrid}>
                    {provinces.map((prov) => (
                      <TouchableOpacity
                        key={prov._id}
                        style={styles.provPillBtn}
                        onPress={() => setCtx({ unitLevel: 'PROVINCE', unitId: prov._id, unitName: prov.name })}
                      >
                        <Text style={styles.provPillBtnText}>{prov.name} Sobayi Jirga →</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  const jirgaTitle = data?.unit?.jirgaTitle || (ctx.unitLevel === 'CENTRAL' ? 'National / Qomi Jirga' : 'Sobayi Jirga · صوبايي جرګه');
  const unitSubtitle = ctx.unitLevel === 'CENTRAL'
    ? 'Central Supreme Consultative & Legislative Body'
    : `Provincial Legislative & Consultative Assembly · ${data?.unit?.unitName || ctx.unitName || 'Province'}`;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => reload(true)} tintColor={Colors.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {/* ─── Hero Header ─── */}
        <View style={styles.heroBanner}>
          <View style={styles.heroTop}>
            <View style={{ flex: 1 }}>
              <View style={styles.eyebrowBadge}>
                <Ionicons name="shield-checkmark" size={12} color="#fff" style={{ marginRight: 4 }} />
                <Text style={styles.eyebrowText}>
                  {ctx.unitLevel === 'CENTRAL' ? 'NATIONAL ASSEMBLY' : 'PROVINCIAL ASSEMBLY'}
                </Text>
              </View>
              <Text style={styles.heroTitle}>{jirgaTitle}</Text>
              <Text style={styles.heroSubtitle}>{unitSubtitle}</Text>
            </View>
            {canManage && (
              <TouchableOpacity
                style={styles.assignBtn}
                onPress={() => {
                  setSelectedMember(null);
                  setNominationNote('');
                  setAssignOpen(true);
                }}
                activeOpacity={0.8}
              >
                <Ionicons name="person-add" size={16} color="#fff" />
                <Text style={styles.assignBtnText}>+ Nominate</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* ─── Jirga Services & Sub-Navigation Card ─── */}
        <Card style={styles.quickNavCard}>
          <Text style={styles.quickNavTitle}>Jirga Services & Assembly Modules</Text>
          <View style={styles.quickNavGrid}>
            <TouchableOpacity
              style={[styles.quickNavBtn, styles.quickNavBtnActive]}
              activeOpacity={0.9}
            >
              <View style={[styles.quickNavIconBox, { backgroundColor: '#eff6ff' }]}>
                <Ionicons name="people" size={20} color={Colors.primary} />
              </View>
              <Text style={[styles.quickNavBtnText, { color: Colors.primary, fontWeight: '700' }]}>Roster</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.quickNavBtn}
              onPress={() => router.push({ pathname: '/meetings', params: { body: 'JIRGA' } })}
            >
              <View style={[styles.quickNavIconBox, { backgroundColor: '#f5f3ff' }]}>
                <Ionicons name="calendar-outline" size={20} color="#7c3aed" />
              </View>
              <Text style={styles.quickNavBtnText}>Meetings</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.quickNavBtn}
              onPress={() => router.push({ pathname: '/activities', params: { body: 'JIRGA' } })}
            >
              <View style={[styles.quickNavIconBox, { backgroundColor: '#f0fdf4' }]}>
                <Ionicons name="flag-outline" size={20} color="#15803d" />
              </View>
              <Text style={styles.quickNavBtnText}>Activities</Text>
            </TouchableOpacity>

            {canFinance && (
              <>
                <TouchableOpacity
                  style={styles.quickNavBtn}
                  onPress={() => router.push({ pathname: '/finance', params: { body: 'JIRGA' } })}
                >
                  <View style={[styles.quickNavIconBox, { backgroundColor: '#fefce8' }]}>
                    <Ionicons name="cash-outline" size={20} color="#ca8a04" />
                  </View>
                  <Text style={styles.quickNavBtnText}>Finance</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.quickNavBtn}
                  onPress={() => router.push({ pathname: '/finance/transfers', params: { body: 'JIRGA' } })}
                >
                  <View style={[styles.quickNavIconBox, { backgroundColor: '#fdf4ff' }]}>
                    <Ionicons name="swap-horizontal-outline" size={20} color="#c026d3" />
                  </View>
                  <Text style={styles.quickNavBtnText}>Transfers</Text>
                </TouchableOpacity>
              </>
            )}

            <TouchableOpacity
              style={styles.quickNavBtn}
              onPress={() => router.push({ pathname: '/admin/reports', params: { body: 'JIRGA' } })}
            >
              <View style={[styles.quickNavIconBox, { backgroundColor: '#f8fafc' }]}>
                <Ionicons name="bar-chart-outline" size={20} color={Colors.textMuted} />
              </View>
              <Text style={styles.quickNavBtnText}>Reports</Text>
            </TouchableOpacity>
          </View>
        </Card>

        {err ? (
          <View style={styles.errBox}>
            <Text style={styles.errText}>{err}</Text>
          </View>
        ) : null}

        {/* ─── KPI Stats Grid ─── */}
        <View style={styles.kpiGrid}>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiVal}>{loading ? '…' : stats.total}</Text>
            <Text style={styles.kpiLabel}>Total Assembly Members</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={[styles.kpiVal, { color: Colors.primary }]}>{loading ? '…' : stats.officeHolders}</Text>
            <Text style={styles.kpiLabel}>Cabinet / Office-Holders</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={[styles.kpiVal, { color: Colors.success }]}>{loading ? '…' : stats.workers}</Text>
            <Text style={styles.kpiLabel}>General Party Workers</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={[styles.kpiVal, { color: '#d97706' }]}>{loading ? '…' : stats.districts}</Text>
            <Text style={styles.kpiLabel}>Districts Represented</Text>
          </View>
        </View>

        {/* ─── Roster Section ─── */}
        <Card style={styles.rosterCard}>
          <View style={styles.rosterHeader}>
            <View>
              <Text style={styles.cardTitle}>Active Jirga Roster</Text>
              <Text style={styles.cardSub}>{filteredRoster.length} member{filteredRoster.length === 1 ? '' : 's'} listed</Text>
            </View>
          </View>

          {/* Search & Filter Bar */}
          <View style={styles.searchFilterRow}>
            <View style={styles.searchInputWrap}>
              <Ionicons name="search" size={16} color={Colors.textMuted} style={styles.searchIcon} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search by name, CNIC, phone, district…"
                placeholderTextColor={Colors.textMuted}
                value={rosterSearch}
                onChangeText={setRosterSearch}
              />
              {rosterSearch ? (
                <TouchableOpacity onPress={() => setRosterSearch('')}>
                  <Ionicons name="close-circle" size={16} color={Colors.textMuted} />
                </TouchableOpacity>
              ) : null}
            </View>

            {/* Role Filter Chips */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.roleChipsScroll}>
              {ROLE_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt.value}
                  style={[styles.roleChip, rosterRoleFilter === opt.value && styles.roleChipActive]}
                  onPress={() => setRosterRoleFilter(opt.value)}
                >
                  <Text style={[styles.roleChipText, rosterRoleFilter === opt.value && styles.roleChipTextActive]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* Members List */}
          {loading ? (
            <View style={styles.loaderWrap}>
              <ActivityIndicator size="small" color={Colors.primary} />
              <Text style={styles.loaderText}>Loading Jirga assembly roster…</Text>
            </View>
          ) : filteredRoster.length === 0 ? (
            <EmptyState
              icon="people-outline"
              title="No Jirga members found"
              message={
                data?.members?.length === 0
                  ? 'No members have been assigned to this Jirga assembly yet.'
                  : 'No members match your active search or role filter.'
              }
            />
          ) : (
            <View style={styles.membersList}>
              {filteredRoster.map((m, idx) => {
                const hasRoles = m.activeRoles && m.activeRoles.length > 0;
                return (
                  <View key={m.jirgaRecordId || m._id || idx} style={styles.memberRow}>
                    <Avatar name={m.fullName} url={m.photoUrl} size={42} />
                    <View style={styles.memberInfo}>
                      <Text style={styles.memberName}>{m.fullName}</Text>
                      <Text style={styles.memberMeta}>
                        {m.memberId || 'ID —'} · {m.cnic || 'CNIC —'} · {m.phone || 'Phone —'}
                      </Text>

                      {/* Active Roles & Units */}
                      {hasRoles ? (
                        <View style={styles.roleBadgesRow}>
                          {m.activeRoles.map((r, rIdx) => (
                            <View key={r._id || rIdx} style={styles.roleBadge}>
                              <Text style={styles.roleBadgeText}>
                                {r.customRoleName || r.roleCode?.replace(/_/g, ' ')} · {r.unitName}
                              </Text>
                            </View>
                          ))}
                        </View>
                      ) : (
                        <View style={styles.generalWorkerBadge}>
                          <Text style={styles.generalWorkerText}>General Party Worker</Text>
                        </View>
                      )}

                      {/* Home Location & Appointed Date */}
                      <View style={styles.homeLocationRow}>
                        <Text style={styles.homeLocationText}>
                          📍 {m.homeUnit?.districtName ? `${m.homeUnit.districtName} (${m.homeUnit.provinceName || 'Province'})` : 'Home Unit —'}
                        </Text>
                        {m.appointedAt ? (
                          <Text style={styles.appointedText}>
                            Appointed: {new Date(m.appointedAt).toLocaleDateString()}
                          </Text>
                        ) : null}
                      </View>

                      {/* Nomination Notes */}
                      {m.nominationNote ? (
                        <View style={styles.notesBox}>
                          <Text style={styles.notesLabel}>Notes:</Text>
                          <Text style={styles.notesText}>{m.nominationNote}</Text>
                        </View>
                      ) : null}
                    </View>

                    {/* Actions */}
                    {canManage && (
                      <TouchableOpacity
                        style={styles.removeBtn}
                        onPress={() => confirmRemove(m.jirgaRecordId, m.fullName)}
                      >
                        <Ionicons name="trash-outline" size={16} color={Colors.danger} />
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })}
            </View>
          )}
        </Card>
      </ScrollView>

      {/* ─── Nomination Modal ─── */}
      <Modal
        visible={assignOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setAssignOpen(false)}
      >
        <SafeAreaView style={styles.modalSafe}>
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.modalTitle}>Nominate Jirga Member</Text>
              <Text style={styles.modalSubtitle}>Assign party member to {jirgaTitle}</Text>
            </View>
            <TouchableOpacity onPress={() => setAssignOpen(false)} style={styles.closeBtn}>
              <Ionicons name="close" size={24} color={Colors.text} />
            </TouchableOpacity>
          </View>

          <View style={{ flex: 1 }}>
            <ScrollView contentContainerStyle={styles.modalContent} showsVerticalScrollIndicator={false}>
              {/* Search Bar */}
              <View style={styles.modalSearchWrap}>
                <Ionicons name="search" size={16} color={Colors.textMuted} style={styles.searchIcon} />
                <TextInput
                  style={styles.modalSearchInput}
                  placeholder="Search candidate by name, CNIC, phone…"
                  placeholderTextColor={Colors.textMuted}
                  value={candidateSearch}
                  onChangeText={setCandidateSearch}
                />
              </View>

              {/* Tier Filters */}
              <Text style={styles.modalFilterLabel}>FILTER BY TIER</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizFilterScroll}>
                {candidateTierOptions.map((opt) => (
                  <TouchableOpacity
                    key={opt.value}
                    style={[styles.filterChip, candidateUnitLevel === opt.value && styles.filterChipActive]}
                    onPress={() => setCandidateUnitLevel(opt.value)}
                  >
                    <Text style={[styles.filterChipText, candidateUnitLevel === opt.value && styles.filterChipTextActive]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* District Filter */}
              {districtsList.length > 0 && (
                <>
                  <Text style={styles.modalFilterLabel}>FILTER BY DISTRICT</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizFilterScroll}>
                    <TouchableOpacity
                      style={[styles.filterChip, candidateDistId === '' && styles.filterChipActive]}
                      onPress={() => setCandidateDistId('')}
                    >
                      <Text style={[styles.filterChipText, candidateDistId === '' && styles.filterChipTextActive]}>
                        All Districts
                      </Text>
                    </TouchableOpacity>
                    {districtsList.map((d) => (
                      <TouchableOpacity
                        key={d._id}
                        style={[styles.filterChip, candidateDistId === d._id && styles.filterChipActive]}
                        onPress={() => setCandidateDistId(d._id)}
                      >
                        <Text style={[styles.filterChipText, candidateDistId === d._id && styles.filterChipTextActive]}>
                          {d.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </>
              )}

              {/* Candidate List */}
              <Text style={styles.modalFilterLabel}>SELECT CANDIDATE ({candidates.length})</Text>
              {candidatesLoading ? (
                <View style={styles.loaderWrap}>
                  <ActivityIndicator size="small" color={Colors.primary} />
                  <Text style={styles.loaderText}>Searching eligible candidates…</Text>
                </View>
              ) : candidates.length === 0 ? (
                <View style={styles.emptyCandidate}>
                  <Text style={styles.emptyCandidateText}>No eligible candidates found matching filters.</Text>
                </View>
              ) : (
                <ScrollView
                  style={styles.candidateScrollBox}
                  nestedScrollEnabled
                  showsVerticalScrollIndicator={true}
                >
                  <View style={styles.candidateList}>
                    {candidates.map((c) => {
                      const isSelected = selectedMember?._id === c._id;
                      return (
                        <TouchableOpacity
                          key={c._id}
                          style={[styles.candidateRow, isSelected && styles.candidateRowSelected]}
                          onPress={() => setSelectedMember(c)}
                          activeOpacity={0.7}
                        >
                          <Avatar name={c.fullName} url={c.photoUrl} size={36} />
                          <View style={{ flex: 1 }}>
                            <Text style={styles.candidateName}>{c.fullName}</Text>
                            <Text style={styles.candidateMeta}>
                              {c.memberId || 'ID —'} · {c.cnic || 'CNIC —'}
                            </Text>
                            {c.primaryRole ? (
                              <Text style={styles.candidateRole}>
                                {c.primaryRole.roleCode?.replace(/_/g, ' ')} ({c.primaryRole.unitName})
                              </Text>
                            ) : (
                              <Text style={styles.candidateWorker}>General Member · {c.districtName || 'District'}</Text>
                            )}
                          </View>
                          <Ionicons
                            name={isSelected ? 'radio-button-on' : 'radio-button-off'}
                            size={22}
                            color={isSelected ? Colors.primary : Colors.textMuted}
                          />
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </ScrollView>
              )}

              {/* Nomination Notes */}
              {selectedMember && (
                <View style={styles.nominationForm}>
                  <Text style={styles.modalFilterLabel}>NOMINATION REMARKS / JUSTIFICATION (OPTIONAL)</Text>
                  <TextInput
                    style={styles.textArea}
                    placeholder="Enter appointment reasoning, elder credentials, background…"
                    placeholderTextColor={Colors.textMuted}
                    value={nominationNote}
                    onChangeText={setNominationNote}
                    multiline
                    numberOfLines={3}
                  />

                  {/* Submit Button */}
                  <TouchableOpacity
                    style={styles.submitAssignBtn}
                    onPress={handleAssign}
                    disabled={assigning}
                    activeOpacity={0.8}
                  >
                    {assigning ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.submitAssignBtnText}>
                        Assign {selectedMember.fullName} to Jirga →
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              )}
            </ScrollView>
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  scroll: { flex: 1 },
  content: { padding: Spacing.md, paddingBottom: 40 },

  // Guidance Card (when on lower tier context)
  guidanceCard: {
    backgroundColor: '#fff',
    borderRadius: Radius.xl,
    padding: Spacing.xl,
    alignItems: 'center',
    textAlign: 'center',
    marginVertical: Spacing.lg,
    ...Shadow.md,
  },
  guidanceIconBox: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#eff6ff',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  guidanceTitle: {
    fontSize: FontSize.lg,
    fontWeight: '800',
    color: Colors.text,
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  guidanceText: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: Spacing.lg,
  },
  guidanceBtnCol: {
    width: '100%',
    gap: 10,
  },
  guidanceBtnPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    paddingVertical: 12,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.md,
  },
  guidanceBtnPrimaryText: {
    color: '#fff',
    fontSize: FontSize.md,
    fontWeight: '700',
  },
  guidanceBtnSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: Colors.primary,
    paddingVertical: 12,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.md,
  },
  guidanceBtnSecondaryText: {
    color: Colors.primary,
    fontSize: FontSize.md,
    fontWeight: '700',
  },
  guidanceSubHead: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textMuted,
    letterSpacing: 0.5,
    marginBottom: 8,
    textAlign: 'center',
  },
  provGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
  },
  provPillBtn: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: Radius.full,
  },
  provPillBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.text,
  },

  // Hero Banner matching web
  heroBanner: {
    backgroundColor: '#1e3a8a',
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    shadowColor: '#1e3a8a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  eyebrowBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.full,
    marginBottom: 6,
  },
  eyebrowText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  heroTitle: {
    fontSize: FontSize.xl,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 4,
  },
  heroSubtitle: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.85)',
    lineHeight: 18,
  },
  assignBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#2563eb',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  assignBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },

  // Tier Switcher Pills
  tierPillsWrapper: {
    marginBottom: Spacing.md,
  },
  tierPillsScroll: {
    gap: 8,
    paddingRight: Spacing.md,
  },
  tierPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  tierPillActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  tierPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.text,
  },
  tierPillTextActive: {
    color: '#fff',
  },

  // Quick Navigation Card & Grid
  quickNavCard: {
    padding: Spacing.md,
    marginBottom: Spacing.md,
    backgroundColor: '#fff',
  },
  quickNavTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textMuted,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: Spacing.sm,
  },
  quickNavGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  quickNavBtn: {
    flex: 1,
    minWidth: '28%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 6,
    backgroundColor: '#f8fafc',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  quickNavBtnActive: {
    backgroundColor: '#eff6ff',
    borderColor: Colors.primary,
  },
  quickNavIconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  quickNavBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.text,
    textAlign: 'center',
  },

  // Error Box
  errBox: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    padding: Spacing.md,
    borderRadius: Radius.md,
    marginBottom: Spacing.md,
  },
  errText: {
    color: Colors.danger,
    fontSize: 13,
  },

  // KPI Grid
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: Spacing.md,
  },
  kpiCard: {
    flex: 1,
    minWidth: '47%',
    backgroundColor: '#fff',
    padding: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    ...Shadow.sm,
  },
  kpiVal: {
    fontSize: FontSize.xl,
    fontWeight: '800',
    color: Colors.text,
    marginBottom: 2,
  },
  kpiLabel: {
    fontSize: 11,
    color: Colors.textMuted,
    fontWeight: '500',
  },

  // Roster Card
  rosterCard: {
    padding: Spacing.md,
    backgroundColor: '#fff',
  },
  rosterHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  cardTitle: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.text,
  },
  cardSub: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
  },

  // Search & Filter
  searchFilterRow: {
    marginBottom: Spacing.md,
    gap: 8,
  },
  searchInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: Radius.md,
    paddingHorizontal: 10,
    height: 40,
  },
  searchIcon: {
    marginRight: 6,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: Colors.text,
    paddingVertical: 0,
  },
  roleChipsScroll: {
    gap: 6,
    paddingVertical: 2,
  },
  roleChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radius.full,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  roleChipActive: {
    backgroundColor: '#eff6ff',
    borderColor: Colors.primary,
  },
  roleChipText: {
    fontSize: 11,
    fontWeight: '500',
    color: Colors.textMuted,
  },
  roleChipTextActive: {
    color: Colors.primary,
    fontWeight: '700',
  },

  // Member Rows
  membersList: {
    gap: 12,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    gap: 12,
  },
  memberInfo: {
    flex: 1,
  },
  memberName: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text,
  },
  memberMeta: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
  },
  roleBadgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 6,
  },
  roleBadge: {
    backgroundColor: '#eff6ff',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  roleBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.primary,
  },
  generalWorkerBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#f8fafc',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 4,
  },
  generalWorkerText: {
    fontSize: 10,
    color: Colors.textMuted,
    fontStyle: 'italic',
  },
  homeLocationRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  homeLocationText: {
    fontSize: 11,
    color: '#475569',
    fontWeight: '500',
  },
  appointedText: {
    fontSize: 10,
    color: Colors.textMuted,
  },
  notesBox: {
    marginTop: 6,
    backgroundColor: '#f8fafc',
    padding: 6,
    borderRadius: 4,
    borderLeftWidth: 2,
    borderLeftColor: Colors.primary,
  },
  notesLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: Colors.textMuted,
  },
  notesText: {
    fontSize: 11,
    color: Colors.text,
  },
  removeBtn: {
    padding: 8,
    borderRadius: Radius.sm,
    backgroundColor: '#fef2f2',
  },

  // Modal
  modalSafe: { flex: 1, backgroundColor: Colors.background },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    backgroundColor: '#fff',
  },
  modalTitle: {
    fontSize: FontSize.lg,
    fontWeight: '800',
    color: Colors.text,
  },
  modalSubtitle: {
    fontSize: 11,
    color: Colors.textMuted,
  },
  closeBtn: {
    padding: 4,
  },
  modalContent: {
    padding: Spacing.md,
    paddingBottom: 40,
    gap: 12,
  },
  modalSearchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: Radius.md,
    paddingHorizontal: 10,
    height: 42,
  },
  modalSearchInput: {
    flex: 1,
    fontSize: 13,
    color: Colors.text,
  },
  modalFilterLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textMuted,
    letterSpacing: 0.5,
    marginTop: 4,
  },
  horizFilterScroll: {
    gap: 6,
    paddingVertical: 4,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.full,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  filterChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.text,
  },
  filterChipTextActive: {
    color: '#fff',
  },
  candidateScrollBox: {
    maxHeight: 280,
    backgroundColor: '#fff',
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    overflow: 'hidden',
  },
  candidateList: {
    backgroundColor: '#fff',
  },
  candidateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    gap: 10,
  },
  candidateRowSelected: {
    backgroundColor: '#eff6ff',
  },
  candidateName: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text,
  },
  candidateMeta: {
    fontSize: 11,
    color: Colors.textMuted,
  },
  candidateRole: {
    fontSize: 10,
    color: Colors.primary,
    fontWeight: '600',
    marginTop: 2,
  },
  candidateWorker: {
    fontSize: 10,
    color: Colors.textMuted,
    fontStyle: 'italic',
    marginTop: 2,
  },
  emptyCandidate: {
    padding: 24,
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: Radius.md,
  },
  emptyCandidateText: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  nominationForm: {
    backgroundColor: '#fff',
    padding: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    gap: 8,
    marginTop: 8,
  },
  textArea: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: Radius.md,
    padding: 10,
    fontSize: 13,
    color: Colors.text,
    minHeight: 60,
    textAlignVertical: 'top',
  },
  submitAssignBtn: {
    backgroundColor: Colors.primary,
    paddingVertical: 12,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  submitAssignBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  loaderWrap: {
    padding: 24,
    alignItems: 'center',
    gap: 8,
  },
  loaderText: {
    fontSize: 12,
    color: Colors.textMuted,
  },
});
