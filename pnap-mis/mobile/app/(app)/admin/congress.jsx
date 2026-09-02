import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  Platform,
  SafeAreaView,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../../src/context/AuthContext';
import { useUnit } from '../../../src/context/UnitContext';
import { api, errorMessage } from '../../../src/api/client';
import { isHigherAdmin } from '../../../src/utils/permissions';
import { useToast } from '../../../src/components/Toast';
import Card from '../../../src/components/Card';
import Badge from '../../../src/components/Badge';
import Avatar from '../../../src/components/Avatar';
import EmptyState from '../../../src/components/EmptyState';
import { Colors, FontSize, Radius, Spacing } from '../../../src/constants/colors';

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

export default function CongressScreen() {
  const { ctx, provinces, setCtx } = useUnit();
  const { user } = useAuth();
  const toast = useToast();
  const router = useRouter();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  // Roster filters
  const [rosterSearch, setRosterSearch] = useState('');
  const [rosterRoleFilter, setRosterRoleFilter] = useState('ALL');
  const [rosterProvFilter, setRosterProvFilter] = useState('ALL');

  // Assign modal
  const [assignOpen, setAssignOpen] = useState(false);
  const [candidates, setCandidates] = useState([]);
  const [candidatesLoading, setCandidatesLoading] = useState(false);
  const [candidateSearch, setCandidateSearch] = useState('');
  const [candidateRole, setCandidateRole] = useState('ALL');
  const [candidateUnitLevel, setCandidateUnitLevel] = useState('ALL');
  const [candidateProvId, setCandidateProvId] = useState('');
  const [candidateDistId, setCandidateDistId] = useState('');
  const [districtsList, setDistrictsList] = useState([]);
  const [selectedMember, setSelectedMember] = useState(null);
  const [nominationNote, setNominationNote] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [modalError, setModalError] = useState('');

  const fetchIdRef = useRef(0);

  async function getResolvedUnitId() {
    if (ctx?.unitLevel === 'CENTRAL' && (!ctx?.unitId || ctx?.unitId === 'CENTRAL')) {
      try {
        const res = await api.get('/org/central');
        return res.data?.data?._id;
      } catch {}
    }
    return ctx?.unitId;
  }

  async function reload() {
    const myId = ++fetchIdRef.current;
    setLoading(true);
    setErr('');
    try {
      const resolvedUnitId = await getResolvedUnitId();
      const res = await api.get('/congress/composition', {
        params: { unitLevel: 'CENTRAL', unitId: resolvedUnitId },
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
      }
    }
  }

  useEffect(() => {
    reload();
  }, [ctx?.unitLevel, ctx?.unitId]);

  // Load districts when candidate province changes
  useEffect(() => {
    if (!candidateProvId) {
      setDistrictsList([]);
      setCandidateDistId('');
      return;
    }
    api.get('/org/districts', { params: { provinceId: candidateProvId } })
      .then((res) => setDistrictsList(res.data.data || []))
      .catch(() => setDistrictsList([]));
  }, [candidateProvId]);

  useEffect(() => {
    if (!assignOpen) return;
    let active = true;
    setCandidatesLoading(true);
    
    getResolvedUnitId().then((resolvedUnitId) => {
      if (!active) return;
      const params = {
        unitLevel: 'CENTRAL',
        unitId: resolvedUnitId,
        search: candidateSearch.trim() || undefined,
        roleCode: candidateRole !== 'ALL' ? candidateRole : undefined,
        filterUnitLevel: candidateUnitLevel !== 'ALL' ? candidateUnitLevel : undefined,
        provinceId: candidateProvId || undefined,
        districtId: candidateDistId || undefined,
        limit: 100,
      };
      return api.get('/congress/eligible-members', { params });
    })
    .then((res) => {
      if (active) setCandidates(res?.data?.data?.candidates || []);
    })
    .catch((e) => {
      if (active) toast.error(errorMessage(e));
    })
    .finally(() => {
      if (active) setCandidatesLoading(false);
    });

    return () => { active = false; };
  }, [
    assignOpen,
    candidateSearch,
    candidateRole,
    candidateUnitLevel,
    candidateProvId,
    candidateDistId,
    ctx?.unitLevel,
    ctx?.unitId,
  ]);

  async function handleAssign() {
    if (!selectedMember) {
      setModalError('Please pick a member to assign.');
      return;
    }
    if (selectedMember.isAssignedToCongress) {
      setModalError(`${selectedMember.fullName} is already assigned to National Congress.`);
      return;
    }
    setAssigning(true);
    setModalError('');
    try {
      const resolvedUnitId = await getResolvedUnitId();
      await api.post('/congress/members', {
        unitLevel: 'CENTRAL',
        unitId: data?.unit?.unitId || resolvedUnitId,
        memberId: selectedMember._id,
        nominationNote: nominationNote.trim() || undefined,
      });
      toast.success(`${selectedMember.fullName} successfully assigned to Congress.`);
      setSelectedMember(null);
      setNominationNote('');
      setModalError('');
      setAssignOpen(false);
      reload();
    } catch (e) {
      const msg = errorMessage(e);
      setModalError(msg);
    } finally {
      setAssigning(false);
    }
  }

  function handleRemove(recordId, memberName) {
    const msg = `Are you sure you want to remove ${memberName || 'this member'} from Congress?`;
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm(msg)) {
        api.post(`/congress/members/${recordId}/remove`)
          .then(() => {
            toast.success('Member removed from Congress.');
            reload();
          })
          .catch((e) => toast.error(errorMessage(e)));
      }
      return;
    }
    Alert.alert('Remove Member', msg, [
      { text: 'Cancel', style: 'cancel' },
      { 
        text: 'Remove', 
        style: 'destructive', 
        onPress: async () => {
          try {
            await api.post(`/congress/members/${recordId}/remove`);
            toast.success('Member removed from Congress.');
            reload();
          } catch (e) {
            toast.error(errorMessage(e));
          }
        }
      },
    ]);
  }

  const filteredRoster = useMemo(() => {
    if (!data?.members) return [];
    return data.members.filter((m) => {
      if (rosterSearch.trim()) {
        const q = rosterSearch.trim().toLowerCase();
        const matchName = m.fullName?.toLowerCase().includes(q);
        const matchCnic = m.cnic?.toLowerCase().includes(q);
        const matchPhone = m.phone?.toLowerCase().includes(q);
        const matchId = m.memberId?.toLowerCase().includes(q);
        if (!matchName && !matchCnic && !matchPhone && !matchId) return false;
      }
      if (rosterRoleFilter !== 'ALL') {
        if (rosterRoleFilter === 'NO_ROLE') {
          if (m.activeRoles && m.activeRoles.length > 0) return false;
        } else {
          const hasRole = m.activeRoles?.some((r) => r.roleCode === rosterRoleFilter);
          if (!hasRole) return false;
        }
      }
      if (rosterProvFilter !== 'ALL') {
        if (m.homeUnit?.provinceName !== rosterProvFilter) return false;
      }
      return true;
    });
  }, [data?.members, rosterSearch, rosterRoleFilter, rosterProvFilter]);

  const stats = useMemo(() => {
    if (!data?.members) return { total: 0, officeHolders: 0, workers: 0, provinces: 0, districts: 0 };
    const total = data.members.length;
    let officeHolders = 0;
    let workers = 0;
    const provSet = new Set();
    const distSet = new Set();
    data.members.forEach((m) => {
      if (m.activeRoles && m.activeRoles.length > 0) officeHolders++;
      else workers++;
      if (m.homeUnit?.provinceName) provSet.add(m.homeUnit.provinceName);
      if (m.homeUnit?.districtName) distSet.add(m.homeUnit.districtName);
    });
    return { total, officeHolders, workers, provinces: provSet.size, districts: distSet.size };
  }, [data?.members]);

  // If user opened Congress from lower unit level, show guidance card
  if (ctx?.unitLevel !== 'CENTRAL') {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>National Congress · قومي کانګرس</Text>
          <Text style={styles.headerSub}>Central Supreme Consultative & Representative Assembly</Text>
        </View>

        <ScrollView contentContainerStyle={{ padding: Spacing.lg }}>
          <View style={styles.guidanceCard}>
            <View style={styles.guidanceIconBox}>
              <Ionicons name="people-outline" size={40} color={Colors.primary} />
            </View>
            <Text style={styles.guidanceTitle}>National Congress operates exclusively at the Central Level</Text>
            <Text style={styles.guidanceText}>
              Under the PKNAP constitution, the <Text style={{ fontWeight: '700' }}>National Congress (قومي کانګرس)</Text> is the supreme representative assembly operating at the Central tier. Lower tiers operate via <Text style={{ fontWeight: '700' }}>Sobayi Jirga</Text> (Province) and <Text style={{ fontWeight: '700' }}>Zilla & Elaqayi Committees</Text> (District & Area).
            </Text>

            <View style={styles.guidanceBtnCol}>
              <TouchableOpacity
                style={styles.guidanceBtnPrimary}
                onPress={() => {
                  setCtx({ unitLevel: 'CENTRAL', unitId: 'CENTRAL', unitName: 'PKNAP Central' });
                }}
              >
                <Ionicons name="globe-outline" size={18} color="#fff" style={{ marginRight: 6 }} />
                <Text style={styles.guidanceBtnPrimaryText}>Switch to Central Unit Context →</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </View>
    );
  }

  const canManage = Boolean(data?.canManage);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>National Congress · قومي کانګرس</Text>
        <Text style={styles.headerSub}>Central Supreme Consultative & Representative Assembly</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {err ? <Text style={styles.errorText}>{err}</Text> : null}

        {/* Quick Navigation Hub Card */}
        <Card style={styles.quickNavCard}>
          <View style={styles.quickNavHeader}>
            <Ionicons name="apps-outline" size={18} color={Colors.primary} />
            <Text style={styles.quickNavTitle}>Congress Assembly Hub</Text>
          </View>
          <View style={styles.quickNavGrid}>
            <TouchableOpacity
              style={styles.quickNavBtn}
              onPress={() => router.push('/meetings?body=CONGRESS&unitLevel=CENTRAL&unitId=CENTRAL')}
            >
              <Ionicons name="calendar-outline" size={16} color={Colors.primary} />
              <Text style={styles.quickNavBtnText}>Meetings</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.quickNavBtn}
              onPress={() => router.push('/activities?body=CONGRESS&unitLevel=CENTRAL&unitId=CENTRAL')}
            >
              <Ionicons name="flag-outline" size={16} color={Colors.primary} />
              <Text style={styles.quickNavBtnText}>Activities</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.quickNavBtn}
              onPress={() => router.push('/finance?body=CONGRESS&unitLevel=CENTRAL&unitId=CENTRAL')}
            >
              <Ionicons name="cash-outline" size={16} color={Colors.primary} />
              <Text style={styles.quickNavBtnText}>Finance</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.quickNavBtn}
              onPress={() => router.push('/admin/reports?body=CONGRESS&unitLevel=CENTRAL&unitId=CENTRAL')}
            >
              <Ionicons name="stats-chart-outline" size={16} color={Colors.primary} />
              <Text style={styles.quickNavBtnText}>Reports</Text>
            </TouchableOpacity>
          </View>
        </Card>

        {/* KPI Stats */}
        <View style={styles.kpiGrid}>
          <Card style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Total Members</Text>
            <Text style={styles.kpiValue}>{loading ? '…' : stats.total}</Text>
          </Card>
          <Card style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Office Holders</Text>
            <Text style={styles.kpiValue}>{loading ? '…' : stats.officeHolders}</Text>
          </Card>
          <Card style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>General Workers</Text>
            <Text style={styles.kpiValue}>{loading ? '…' : stats.workers}</Text>
          </Card>
          <Card style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Provinces</Text>
            <Text style={styles.kpiValue}>{loading ? '…' : stats.provinces}</Text>
          </Card>
        </View>

        {loading ? (
          <ActivityIndicator style={{ marginTop: Spacing.lg }} color={Colors.primary} />
        ) : (
          <>
            <View style={styles.toolbarRow}>
              <TextInput
                style={styles.searchInput}
                placeholder="Search member, CNIC, phone..."
                value={rosterSearch}
                onChangeText={setRosterSearch}
                clearButtonMode="while-editing"
              />
              {canManage && (
                <TouchableOpacity
                  style={styles.addBtn}
                  onPress={() => {
                    setCandidateSearch('');
                    setCandidateRole('ALL');
                    setCandidateUnitLevel('ALL');
                    setCandidateProvId('');
                    setCandidateDistId('');
                    setSelectedMember(null);
                    setNominationNote('');
                    setAssignOpen(true);
                  }}
                >
                  <Ionicons name="add" size={20} color="#fff" />
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.pickerRow}>
              <View style={styles.pickerContainer}>
                <Picker
                  selectedValue={rosterProvFilter}
                  onValueChange={(v) => setRosterProvFilter(v)}
                  style={styles.picker}
                >
                  <Picker.Item label="All Provinces" value="ALL" />
                  {Array.from(new Set((data?.members || []).map(m => m.homeUnit?.provinceName).filter(Boolean))).map((prov) => (
                    <Picker.Item key={prov} label={prov} value={prov} />
                  ))}
                </Picker>
              </View>

              <View style={styles.pickerContainer}>
                <Picker
                  selectedValue={rosterRoleFilter}
                  onValueChange={(v) => setRosterRoleFilter(v)}
                  style={styles.picker}
                >
                  {ROLE_OPTIONS.map((opt) => (
                    <Picker.Item key={opt.value} label={opt.label} value={opt.value} />
                  ))}
                </Picker>
              </View>
            </View>

            <View style={styles.rosterList}>
              {filteredRoster.length === 0 ? (
                <EmptyState icon="👥" title="No members found" subtitle="No Congress members match your search or filters." />
              ) : (
                filteredRoster.map((m) => {
                  const roles = m.activeRoles || [];
                  const recordId = m.congressRecordId;
                  return (
                    <Card key={m._id} style={styles.memberCard}>
                      <View style={styles.memberHeaderRow}>
                        <Avatar name={m.fullName} size={42} color={Colors.primary} />
                        <View style={styles.memberMeta}>
                          <Text style={styles.memberName}>{m.fullName}</Text>
                          <Text style={styles.memberSub}>
                            {m.memberId || 'ID —'} · {m.cnic} · {m.phone || 'No phone'}
                          </Text>
                        </View>
                        {canManage && (
                          <TouchableOpacity style={styles.removeBtn} onPress={() => handleRemove(recordId, m.fullName)}>
                            <Ionicons name="trash-outline" size={18} color={Colors.error} />
                          </TouchableOpacity>
                        )}
                      </View>

                      <View style={styles.detailsBlock}>
                        {/* Active Roles */}
                        <View style={styles.detailRow}>
                          <Text style={styles.detailLabel}>Role:</Text>
                          <View style={styles.detailValue}>
                            {roles.length > 0 ? (
                              roles.map((r, idx) => (
                                <View key={r._id} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: idx !== roles.length - 1 ? 4 : 0 }}>
                                  <Badge label={r.customRoleName || r.roleCode.replace(/_/g, ' ')} color="#166534" bg="#dcfce7" />
                                  <Text style={styles.unitText}>· {r.unitName}</Text>
                                </View>
                              ))
                            ) : m.assignedRoleSnapshot?.roleCode ? (
                              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                <Badge label={m.assignedRoleSnapshot.customRoleName || m.assignedRoleSnapshot.roleCode.replace(/_/g, ' ')} color="#166534" bg="#dcfce7" />
                                <Text style={styles.unitText}>· {m.assignedRoleSnapshot.unitName}</Text>
                              </View>
                            ) : (
                              <Text style={styles.noRoleText}>General Party Worker</Text>
                            )}
                          </View>
                        </View>

                        {/* Hierarchy */}
                        <View style={styles.detailRow}>
                          <Text style={styles.detailLabel}>Home:</Text>
                          <View style={styles.detailValue}>
                            <Text style={styles.hierarchyText}>
                              {[
                                m.homeUnit?.provinceName && `Prov: ${m.homeUnit.provinceName}`,
                                m.homeUnit?.districtName && `Dist: ${m.homeUnit.districtName}`,
                                m.homeUnit?.areaName && `Area: ${m.homeUnit.areaName}`,
                                m.homeUnit?.basicUnitName && `BU: ${m.homeUnit.basicUnitName}`
                              ].filter(Boolean).join(', ') || '—'}
                            </Text>
                          </View>
                        </View>

                        {/* Appointed Date */}
                        <View style={styles.detailRow}>
                          <Text style={styles.detailLabel}>Appointed:</Text>
                          <View style={styles.detailValue}>
                            <Text style={styles.footerLabel}>
                              {m.assignedAt ? new Date(m.assignedAt).toLocaleDateString() : '—'}
                            </Text>
                          </View>
                        </View>
                      </View>
                    </Card>
                  );
                })
              )}
            </View>
          </>
        )}
      </ScrollView>

      {/* ─── Assign to National Congress Modal ─── */}
      <Modal
        visible={assignOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => {
          setAssignOpen(false);
          setModalError('');
        }}
      >
        <SafeAreaView style={styles.modalSafe}>
          <View style={styles.modalHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.modalTitle}>Assign to National Congress</Text>
              <Text style={styles.modalSubtitle}>Appoint party member to National Congress (Central)</Text>
            </View>
            <TouchableOpacity
              onPress={() => {
                setAssignOpen(false);
                setModalError('');
              }}
              style={styles.closeBtn}
            >
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
                  onChangeText={(t) => {
                    setCandidateSearch(t);
                    setModalError('');
                  }}
                  clearButtonMode="while-editing"
                />
              </View>

              {/* Tier Filters */}
              <Text style={styles.modalFilterLabel}>FILTER BY TIER</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizFilterScroll}>
                {UNIT_LEVEL_OPTIONS.map((opt) => (
                  <TouchableOpacity
                    key={opt.value}
                    style={[styles.filterChip, candidateUnitLevel === opt.value && styles.filterChipActive]}
                    onPress={() => {
                      setCandidateUnitLevel(opt.value);
                      setModalError('');
                    }}
                  >
                    <Text style={[styles.filterChipText, candidateUnitLevel === opt.value && styles.filterChipTextActive]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Role Filters */}
              <Text style={styles.modalFilterLabel}>FILTER BY ROLE</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizFilterScroll}>
                {ROLE_OPTIONS.slice(0, 8).map((opt) => (
                  <TouchableOpacity
                    key={opt.value}
                    style={[styles.filterChip, candidateRole === opt.value && styles.filterChipActive]}
                    onPress={() => {
                      setCandidateRole(opt.value);
                      setModalError('');
                    }}
                  >
                    <Text style={[styles.filterChipText, candidateRole === opt.value && styles.filterChipTextActive]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* District Filter if province selected */}
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

              {/* Inline Error Banner */}
              {modalError ? (
                <View style={styles.modalErrBox}>
                  <Ionicons name="alert-circle" size={18} color={Colors.error} />
                  <Text style={styles.modalErrText}>{modalError}</Text>
                </View>
              ) : null}

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
                      const isAssigned = Boolean(c.isAssignedToCongress);
                      return (
                        <TouchableOpacity
                          key={c._id}
                          style={[
                            styles.candidateRow,
                            isSelected && styles.candidateRowSelected,
                            isAssigned && styles.candidateRowDisabled,
                          ]}
                          onPress={() => {
                            if (isAssigned) return;
                            setSelectedMember(c);
                            setModalError('');
                          }}
                          disabled={isAssigned}
                          activeOpacity={isAssigned ? 1 : 0.7}
                        >
                          <Avatar name={c.fullName} url={c.photoUrl} size={36} />
                          <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                              <Text style={[styles.candidateName, isAssigned && { color: Colors.textMuted }]}>
                                {c.fullName}
                              </Text>
                              {isAssigned && (
                                <View style={styles.alreadyAssignedBadge}>
                                  <Text style={styles.alreadyAssignedBadgeText}>In Congress</Text>
                                </View>
                              )}
                            </View>
                            <Text style={styles.candidateMeta}>
                              {c.memberId || 'ID —'} · {c.cnic || 'CNIC —'}
                            </Text>
                            {c.activeRoles && c.activeRoles.length > 0 ? (
                              <Text style={styles.candidateRole}>
                                {c.activeRoles[0].customRoleName || c.activeRoles[0].roleCode?.replace(/_/g, ' ')} ({c.activeRoles[0].unitName || 'Unit'})
                              </Text>
                            ) : (c.primaryRole ? (
                              <Text style={styles.candidateRole}>
                                {c.primaryRole.roleCode?.replace(/_/g, ' ')} ({c.primaryRole.unitName || 'Unit'})
                              </Text>
                            ) : (
                              <Text style={styles.candidateWorker}>
                                Party Worker · {c.homeUnit?.provinceName || c.districtName || 'General'}
                              </Text>
                            ))}
                          </View>
                          <Ionicons
                            name={isSelected ? 'radio-button-on' : 'radio-button-off'}
                            size={22}
                            color={isAssigned ? '#cbd5e1' : (isSelected ? Colors.primary : Colors.textMuted)}
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
                  <Text style={styles.modalFilterLabel}>NOMINATION REMARKS / TERMS (OPTIONAL)</Text>
                  <TextInput
                    style={styles.textArea}
                    placeholder="Enter appointment remarks, terms, or delegate notes…"
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
                        Assign {selectedMember.fullName} to Congress →
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              )}
            </ScrollView>
          </View>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { padding: Spacing.lg, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
  headerTitle: { fontSize: FontSize.lg, fontWeight: '800', color: Colors.text },
  headerSub: { fontSize: FontSize.sm, color: Colors.textMuted, marginTop: 2 },
  content: { padding: Spacing.md, paddingBottom: 60 },
  errorText: { color: Colors.error, marginBottom: Spacing.md },
  
  // Quick Nav Card
  quickNavCard: { marginBottom: Spacing.md, padding: Spacing.md, backgroundColor: '#fff' },
  quickNavHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  quickNavTitle: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.text },
  quickNavGrid: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  quickNavBtn: {
    flex: 1,
    minWidth: '22%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: Radius.md,
  },
  quickNavBtnText: { fontSize: 12, fontWeight: '700', color: Colors.primary },

  kpiGrid: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md, flexWrap: 'wrap' },
  kpiCard: { flex: 1, minWidth: '45%', padding: Spacing.md, backgroundColor: '#fff', alignItems: 'center' },
  kpiLabel: { fontSize: FontSize.xs, color: Colors.textMuted, textAlign: 'center', marginBottom: 4 },
  kpiValue: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.primary },

  toolbarRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md },
  searchInput: { flex: 1, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: 10, paddingHorizontal: Spacing.md, paddingVertical: 10, fontSize: FontSize.sm },
  addBtn: { width: 44, height: 44, alignItems: 'center', backgroundColor: Colors.primary, borderRadius: 10, justifyContent: 'center' },
  
  pickerRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.sm },
  pickerContainer: { flex: 1, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: 10, overflow: 'hidden' },
  picker: { height: 44 },
  
  rosterList: { gap: Spacing.sm },
  memberCard: { padding: Spacing.md },
  memberHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginBottom: Spacing.sm },
  memberMeta: { flex: 1, gap: 2 },
  memberName: { fontSize: FontSize.base, fontWeight: '700', color: Colors.text },
  memberSub: { fontSize: FontSize.xs, color: Colors.textMuted },
  removeBtn: { padding: 8 },

  detailsBlock: { marginTop: Spacing.sm, paddingTop: Spacing.sm, borderTopWidth: 1, borderTopColor: Colors.border, gap: 6 },
  detailRow: { flexDirection: 'row', alignItems: 'flex-start' },
  detailLabel: { width: 75, fontSize: FontSize.xs, fontWeight: '600', color: Colors.textMuted, marginTop: 2 },
  detailValue: { flex: 1, justifyContent: 'center' },
  unitText: { fontSize: FontSize.xs, color: Colors.text, marginLeft: 4 },
  noRoleText: { fontSize: FontSize.xs, color: Colors.textLight, fontStyle: 'italic', marginTop: 2 },
  hierarchyText: { fontSize: FontSize.xs, color: Colors.text, lineHeight: 18, marginTop: 2 },
  footerLabel: { fontSize: FontSize.xs, color: Colors.text, marginTop: 2 },

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
  searchIcon: {
    marginRight: 6,
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
  candidateRowDisabled: {
    opacity: 0.55,
    backgroundColor: '#f8fafc',
  },
  alreadyAssignedBadge: {
    backgroundColor: '#e2e8f0',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radius.full,
  },
  alreadyAssignedBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.textMuted,
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
  modalErrBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    padding: Spacing.sm,
    borderRadius: Radius.md,
    marginVertical: 4,
  },
  modalErrText: {
    flex: 1,
    fontSize: 12,
    color: Colors.error,
    fontWeight: '600',
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

  // Guidance Card
  guidanceCard: {
    backgroundColor: '#fff',
    borderRadius: Radius.xl,
    padding: Spacing.xl,
    alignItems: 'center',
    textAlign: 'center',
    marginVertical: Spacing.lg,
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
});
