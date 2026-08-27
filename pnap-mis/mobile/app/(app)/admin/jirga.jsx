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
import { useLocalSearchParams } from 'expo-router';
import { useUnit } from '../../../src/context/UnitContext';
import { useAuth } from '../../../src/context/AuthContext';
import { api, errorMessage } from '../../../src/api/client';
import { useToast } from '../../../src/components/Toast';
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
  const params = useLocalSearchParams();
  const { ctx, setCtx, provinces } = useUnit();
  const { user } = useAuth();
  const toast = useToast();

  // Active Jirga Unit Context resolution
  const resolvedLevel = params.unitLevel || (ctx?.unitLevel === 'PROVINCE' || ctx?.unitLevel === 'CENTRAL' ? ctx.unitLevel : (user?.scope?.provinceId ? 'PROVINCE' : 'CENTRAL'));
  const resolvedUnitId = params.unitId || (ctx?.unitLevel === resolvedLevel ? ctx.unitId : (resolvedLevel === 'PROVINCE' ? (user?.scope?.provinceId || (provinces?.[0]?._id)) : 'CENTRAL'));

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

  // Load Jirga Composition
  async function reload(silent = false) {
    if (!resolvedLevel || !resolvedUnitId) {
      setLoading(false);
      setRefreshing(false);
      return;
    }
    const myId = ++fetchIdRef.current;
    if (!silent) setLoading(true);
    setRefreshing(true);
    setErr('');
    try {
      let targetId = resolvedUnitId;
      if (resolvedLevel === 'CENTRAL' && (!targetId || targetId === 'CENTRAL')) {
        const cRes = await api.get('/org/central');
        targetId = cRes.data?.data?._id || 'CENTRAL';
      }

      const res = await api.get('/jirga/composition', {
        params: { unitLevel: resolvedLevel, unitId: targetId },
      });
      if (myId === fetchIdRef.current) {
        setData(res.data.data);
      }
    } catch (e) {
      if (myId === fetchIdRef.current) {
        setErr(errorMessage(e));
        toast.error(errorMessage(e));
      }
    } finally {
      if (myId === fetchIdRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }

  useEffect(() => {
    reload(false);
  }, [resolvedLevel, resolvedUnitId]);

  // Load districts for nomination filter
  useEffect(() => {
    const provId = resolvedLevel === 'PROVINCE' ? resolvedUnitId : (user?.scope?.provinceId || (provinces?.[0]?._id));
    if (!provId) {
      setDistrictsList([]);
      return;
    }
    api.get('/org/districts', { params: { provinceId: provId } })
      .then((res) => setDistrictsList(res.data.data || []))
      .catch(() => setDistrictsList([]));
  }, [resolvedLevel, resolvedUnitId, user?.scope?.provinceId, provinces]);

  // Load eligible candidates
  useEffect(() => {
    if (!assignOpen) return;
    let active = true;
    setCandidatesLoading(true);

    const paramsQuery = {
      unitLevel: resolvedLevel,
      unitId: resolvedUnitId,
      search: candidateSearch.trim() || undefined,
      roleCode: candidateRole !== 'ALL' ? candidateRole : undefined,
      filterUnitLevel: candidateUnitLevel !== 'ALL' ? candidateUnitLevel : undefined,
      provinceId: resolvedLevel === 'PROVINCE' ? resolvedUnitId : undefined,
      districtId: candidateDistId || undefined,
      limit: 100,
    };

    api.get('/jirga/eligible-members', { params: paramsQuery })
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
    resolvedLevel,
    resolvedUnitId,
    candidateSearch,
    candidateRole,
    candidateUnitLevel,
    candidateDistId,
  ]);

  // Assign Member to Jirga
  async function handleAssign() {
    if (!selectedMember) {
      toast.error('Please pick a member to assign.');
      return;
    }
    setAssigning(true);
    try {
      await api.post('/jirga/members', {
        unitLevel: resolvedLevel,
        unitId: resolvedUnitId,
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
    Alert.alert(
      'Remove Jirga Member',
      `Are you sure you want to remove ${memberName || 'this member'} from the Jirga?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.post(`/jirga/members/${jirgaRecordId}/remove`);
              toast.success(`${memberName || 'Member'} removed from Jirga.`);
              reload(true);
            } catch (e) {
              toast.error(errorMessage(e));
            }
          },
        },
      ]
    );
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

  const jirgaTitle = data?.unit?.jirgaTitle || (resolvedLevel === 'CENTRAL' ? 'National / Qomi Jirga' : 'Sobayi Jirga · صوبايي جرګه');
  const unitSubtitle = resolvedLevel === 'CENTRAL'
    ? 'Central Supreme Consultative & Legislative Body'
    : `Provincial Legislative & Consultative Assembly · ${data?.unit?.unitName || ctx?.unitName || 'Khyber Pakhtunkhwa'}`;
  const canManage = Boolean(data?.canManage);

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
                <Text style={styles.eyebrowText}>
                  {resolvedLevel === 'CENTRAL' ? 'NATIONAL ASSEMBLY' : 'PROVINCIAL ASSEMBLY'}
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

                      {/* Notes / Remarks */}
                      {m.nominationNote ? (
                        <View style={styles.noteBox}>
                          <Text style={styles.noteText}>📝 {m.nominationNote}</Text>
                        </View>
                      ) : null}
                    </View>

                    {/* Actions */}
                    {canManage && (
                      <TouchableOpacity
                        style={styles.removeBtn}
                        onPress={() => confirmRemove(m.jirgaRecordId || m._id, m.fullName)}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="trash-outline" size={18} color={Colors.error} />
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })}
            </View>
          )}
        </Card>
      </ScrollView>

      {/* ─── Nominate / Assign Modal ─── */}
      <Modal visible={assignOpen} animationType="slide" transparent onRequestClose={() => setAssignOpen(false)}>
        <SafeAreaView style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Nominate Jirga Member</Text>
                <Text style={styles.modalSub}>Select eligible worker or cabinet member</Text>
              </View>
              <TouchableOpacity onPress={() => setAssignOpen(false)} style={styles.modalCloseBtn}>
                <Ionicons name="close" size={22} color={Colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalScrollContent} showsVerticalScrollIndicator={false}>
              {/* Candidate Search */}
              <View style={styles.modalSearchWrap}>
                <Ionicons name="search" size={16} color={Colors.textMuted} style={styles.searchIcon} />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search candidate by name, CNIC, phone…"
                  placeholderTextColor={Colors.textMuted}
                  value={candidateSearch}
                  onChangeText={setCandidateSearch}
                />
              </View>

              {/* Tier Filters */}
              <Text style={styles.modalFilterLabel}>FILTER BY TIER</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizFilterScroll}>
                {UNIT_LEVEL_OPTIONS.map((opt) => (
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
    gap: 8,
  },
  eyebrowBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: Radius.sm,
    alignSelf: 'flex-start',
    marginBottom: 6,
  },
  eyebrowText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 1.2,
  },
  heroTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.3,
  },
  heroSubtitle: {
    fontSize: FontSize.xs,
    color: 'rgba(255, 255, 255, 0.85)',
    fontWeight: '600',
    marginTop: 2,
  },
  assignBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },
  assignBtnText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: '#fff',
  },

  errBox: {
    backgroundColor: Colors.errorBg,
    padding: 10,
    borderRadius: Radius.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.error,
  },
  errText: {
    color: Colors.error,
    fontSize: FontSize.xs,
    fontWeight: '600',
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
    minWidth: '45%',
    backgroundColor: Colors.surface,
    padding: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    ...Shadow.sm,
  },
  kpiVal: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.text,
    fontVariant: ['tabular-nums'],
  },
  kpiLabel: {
    fontSize: 10,
    color: Colors.textMuted,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginTop: 2,
    textAlign: 'center',
  },

  // Roster Card
  rosterCard: {
    padding: Spacing.md,
    borderRadius: Radius.lg,
  },
  rosterHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  cardTitle: {
    fontSize: FontSize.base,
    fontWeight: '800',
    color: Colors.text,
  },
  cardSub: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 1,
  },

  // Search and Filters
  searchFilterRow: {
    marginBottom: Spacing.md,
    gap: 8,
  },
  searchInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceAlt,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: 10,
    height: 38,
  },
  searchIcon: {
    marginRight: 6,
  },
  searchInput: {
    flex: 1,
    fontSize: FontSize.xs,
    color: Colors.text,
    paddingVertical: 0,
  },
  roleChipsScroll: {
    gap: 6,
    paddingVertical: 2,
  },
  roleChip: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: Radius.pill,
    backgroundColor: Colors.surfaceAlt,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  roleChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  roleChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.text,
  },
  roleChipTextActive: {
    color: '#fff',
  },

  // Members List
  membersList: {
    gap: 8,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: Colors.surfaceAlt,
    padding: 10,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 10,
  },
  memberInfo: {
    flex: 1,
  },
  memberName: {
    fontSize: FontSize.sm,
    fontWeight: '800',
    color: Colors.text,
  },
  memberMeta: {
    fontSize: 10,
    color: Colors.textMuted,
    marginTop: 1,
  },
  roleBadgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 4,
  },
  roleBadge: {
    backgroundColor: 'rgba(30, 64, 175, 0.1)',
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: Radius.sm,
  },
  roleBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.primary,
  },
  generalWorkerBadge: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: Radius.sm,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  generalWorkerText: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  homeLocationRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  homeLocationText: {
    fontSize: 10,
    color: Colors.textMuted,
    fontWeight: '500',
  },
  appointedText: {
    fontSize: 9,
    color: Colors.textMuted,
  },
  noteBox: {
    backgroundColor: '#fff',
    padding: 4,
    borderRadius: Radius.sm,
    marginTop: 4,
    borderLeftWidth: 2,
    borderLeftColor: Colors.primary,
  },
  noteText: {
    fontSize: 10,
    color: Colors.textMuted,
    fontStyle: 'italic',
  },
  removeBtn: {
    padding: 6,
  },

  loaderWrap: {
    padding: Spacing.lg,
    alignItems: 'center',
    gap: 6,
  },
  loaderText: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    maxHeight: '90%',
    padding: Spacing.md,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingBottom: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  modalTitle: {
    fontSize: FontSize.base,
    fontWeight: '800',
    color: Colors.text,
  },
  modalSub: {
    fontSize: 11,
    color: Colors.textMuted,
  },
  modalCloseBtn: {
    padding: 4,
  },
  modalScroll: {
    flexGrow: 0,
  },
  modalScrollContent: {
    paddingBottom: 20,
  },
  modalSearchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceAlt,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: 10,
    height: 38,
    marginBottom: 10,
  },
  modalFilterLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.textMuted,
    marginBottom: 6,
    marginTop: 4,
    letterSpacing: 0.6,
  },
  horizFilterScroll: {
    gap: 6,
    marginBottom: 10,
  },
  filterChip: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: Radius.pill,
    backgroundColor: Colors.surfaceAlt,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  filterChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.text,
  },
  filterChipTextActive: {
    color: '#fff',
  },
  candidateList: {
    maxHeight: 220,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    overflow: 'hidden',
    marginBottom: 10,
  },
  candidateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 8,
  },
  candidateRowSelected: {
    backgroundColor: '#eff6ff',
  },
  candidateName: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.text,
  },
  candidateMeta: {
    fontSize: 9,
    color: Colors.textMuted,
  },
  candidateRole: {
    fontSize: 9,
    fontWeight: '700',
    color: Colors.primary,
    marginTop: 1,
  },
  candidateWorker: {
    fontSize: 9,
    color: Colors.textMuted,
    marginTop: 1,
  },
  emptyCandidate: {
    padding: 16,
    alignItems: 'center',
  },
  emptyCandidateText: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
  },
  nominationForm: {
    marginTop: 6,
  },
  textArea: {
    backgroundColor: Colors.surfaceAlt,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    padding: 8,
    fontSize: FontSize.xs,
    color: Colors.text,
    textAlignVertical: 'top',
    minHeight: 60,
    marginBottom: 12,
  },
  submitAssignBtn: {
    backgroundColor: Colors.primary,
    paddingVertical: 12,
    borderRadius: Radius.md,
    alignItems: 'center',
  },
  submitAssignBtnText: {
    color: '#fff',
    fontSize: FontSize.sm,
    fontWeight: '800',
  },
});
