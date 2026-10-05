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
import { useLanguage } from '../../../src/context/LanguageContext';
import { api, errorMessage } from '../../../src/api/client';
import { isHigherAdmin } from '../../../src/utils/permissions';
import { useToast } from '../../../src/components/Toast';
import Card from '../../../src/components/Card';
import Badge from '../../../src/components/Badge';
import Avatar from '../../../src/components/Avatar';
import EmptyState from '../../../src/components/EmptyState';
import { Colors, FontSize, Radius, Spacing } from '../../../src/constants/colors';

const ROLE_OPTIONS = [
  { value: 'ALL', labelKey: 'common.allRoles', fallback: 'All Roles' },
  { value: 'GENERAL_SECRETARY', labelKey: 'roles.GENERAL_SECRETARY', fallback: 'General Secretary' },
  { value: 'PRESIDENT', labelKey: 'roles.PRESIDENT', fallback: 'President / Saddar' },
  { value: 'SECRETARY', labelKey: 'roles.SECRETARY', fallback: 'Secretary' },
  { value: 'SENIOR_MAWIN', labelKey: 'roles.SENIOR_MAWIN', fallback: 'Senior Mawin Secretary' },
  { value: 'FINANCE_SECRETARY', labelKey: 'roles.FINANCE_SECRETARY', fallback: 'Finance Secretary' },
  { value: 'SR_VICE_PRESIDENT', labelKey: 'roles.SR_VICE_PRESIDENT', fallback: 'Sr. Vice President' },
  { value: 'VICE_PRESIDENT', labelKey: 'roles.VICE_PRESIDENT', fallback: 'Vice President' },
  { value: 'CHAIRMAN', labelKey: 'roles.CHAIRMAN', fallback: 'Chairman' },
  { value: 'CO_CHAIRMAN', labelKey: 'roles.CO_CHAIRMAN', fallback: 'Co-Chairman' },
  { value: 'FIRST_SECRETARY', labelKey: 'roles.FIRST_SECRETARY', fallback: 'First Secretary' },
  { value: 'OTHER', labelKey: 'roles.OTHER', fallback: 'Other Cabinet Roles' },
  { value: 'NO_ROLE', labelKey: 'roles.NO_ROLE', fallback: 'General Workers (No Role)' },
];

const UNIT_LEVEL_OPTIONS = [
  { value: 'ALL', labelKey: 'units.allTiers', fallback: 'All Tiers' },
  { value: 'CENTRAL', labelKey: 'units.centralTier', fallback: 'Central Tier' },
  { value: 'PROVINCE', labelKey: 'units.provinceTier', fallback: 'Province Tier' },
  { value: 'DISTRICT', labelKey: 'units.districtTier', fallback: 'District Tier' },
  { value: 'AREA', labelKey: 'units.areaTier', fallback: 'Area Tier' },
  { value: 'BASIC_UNIT', labelKey: 'units.basicUnitTier', fallback: 'Basic Unit Tier' },
];

export default function CongressScreen() {
  const { t, isRTL } = useLanguage();
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
      setModalError(t('congress.pickMemberErr', 'Please pick a member to assign.'));
      return;
    }
    if (selectedMember.isAssignedToCongress) {
      setModalError(t('congress.alreadyAssignedErr', `${selectedMember.fullName} is already assigned to National Congress.`, { name: selectedMember.fullName }));
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
      toast.success(t('congress.assignedSuccess', `${selectedMember.fullName} successfully assigned to Congress.`, { name: selectedMember.fullName }));
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
    const msg = t('congress.removeConfirmMsg', `Are you sure you want to remove ${memberName || 'this member'} from Congress?`, { name: memberName || t('congress.thisMember', 'this member') });
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm(msg)) {
        api.post(`/congress/members/${recordId}/remove`)
          .then(() => {
            toast.success(t('congress.removedSuccess', 'Member removed from Congress.'));
            reload();
          })
          .catch((e) => toast.error(errorMessage(e)));
      }
      return;
    }
    Alert.alert(t('congress.removeConfirmTitle', 'Remove Member'), msg, [
      { text: t('common.cancel', 'Cancel'), style: 'cancel' },
      { 
        text: t('common.remove', 'Remove'), 
        style: 'destructive', 
        onPress: async () => {
          try {
            await api.post(`/congress/members/${recordId}/remove`);
            toast.success(t('congress.removedSuccess', 'Member removed from Congress.'));
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
        <View style={[styles.header, isRTL && { alignItems: 'flex-end' }]}>
          <Text style={[styles.headerTitle, isRTL && { textAlign: 'right' }]}>{t('units.nationalCongress', 'National Congress · قومي کانګرس')}</Text>
          <Text style={[styles.headerSub, isRTL && { textAlign: 'right' }]}>{t('congress.subtitle', 'Central Supreme Consultative & Representative Assembly')}</Text>
        </View>

        <ScrollView contentContainerStyle={{ padding: Spacing.lg }}>
          <View style={styles.guidanceCard}>
            <View style={styles.guidanceIconBox}>
              <Ionicons name="people-outline" size={40} color={Colors.primary} />
            </View>
            <Text style={[styles.guidanceTitle, isRTL && { textAlign: 'right' }]}>{t('congress.centralOnlyTitle', 'National Congress operates exclusively at the Central Level')}</Text>
            <Text style={[styles.guidanceText, isRTL && { textAlign: 'right' }]}>
              {t('congress.centralOnlyText', 'Under the PKNAP constitution, the National Congress (قومي کانګرس) is the supreme representative assembly operating at the Central tier. Lower tiers operate via Sobayi Jirga (Province) and Zilla & Elaqayi Committees (District & Area).')}
            </Text>

            <View style={styles.guidanceBtnCol}>
              <TouchableOpacity
                style={[styles.guidanceBtnPrimary, isRTL && { flexDirection: 'row-reverse' }]}
                onPress={() => {
                  setCtx({ unitLevel: 'CENTRAL', unitId: 'CENTRAL', unitName: 'PKNAP Central' });
                }}
              >
                <Ionicons name="globe-outline" size={18} color="#fff" style={isRTL ? { marginLeft: 6 } : { marginRight: 6 }} />
                <Text style={styles.guidanceBtnPrimaryText}>{t('congress.switchToCentral', 'Switch to Central Unit Context →')}</Text>
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
      <View style={[styles.header, isRTL && { alignItems: 'flex-end' }]}>
        <Text style={[styles.headerTitle, isRTL && { textAlign: 'right' }]}>{t('units.nationalCongress', 'National Congress · قومي کانګرس')}</Text>
        <Text style={[styles.headerSub, isRTL && { textAlign: 'right' }]}>{t('congress.subtitle', 'Central Supreme Consultative & Representative Assembly')}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {err ? <Text style={[styles.errorText, isRTL && { textAlign: 'right' }]}>{err}</Text> : null}

        {/* Quick Navigation Hub Card */}
        <Card style={styles.quickNavCard}>
          <View style={[styles.quickNavHeader, isRTL && { flexDirection: 'row-reverse' }]}>
            <Ionicons name="apps-outline" size={18} color={Colors.primary} />
            <Text style={[styles.quickNavTitle, isRTL && { textAlign: 'right' }]}>{t('congress.assemblyHub', 'Congress Assembly Hub')}</Text>
          </View>
          <View style={[styles.quickNavGrid, isRTL && { flexDirection: 'row-reverse' }]}>
            <TouchableOpacity
              style={[styles.quickNavBtn, isRTL && { flexDirection: 'row-reverse' }]}
              onPress={() => router.push('/meetings?body=CONGRESS&unitLevel=CENTRAL&unitId=CENTRAL')}
            >
              <Ionicons name="calendar-outline" size={16} color={Colors.primary} />
              <Text style={styles.quickNavBtnText}>{t('nav.meetings', 'Meetings')}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.quickNavBtn, isRTL && { flexDirection: 'row-reverse' }]}
              onPress={() => router.push('/activities?body=CONGRESS&unitLevel=CENTRAL&unitId=CENTRAL')}
            >
              <Ionicons name="flag-outline" size={16} color={Colors.primary} />
              <Text style={styles.quickNavBtnText}>{t('nav.activities', 'Activities')}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.quickNavBtn, isRTL && { flexDirection: 'row-reverse' }]}
              onPress={() => router.push('/finance?body=CONGRESS&unitLevel=CENTRAL&unitId=CENTRAL')}
            >
              <Ionicons name="cash-outline" size={16} color={Colors.primary} />
              <Text style={styles.quickNavBtnText}>{t('nav.finance', 'Finance')}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.quickNavBtn, isRTL && { flexDirection: 'row-reverse' }]}
              onPress={() => router.push('/admin/reports?body=CONGRESS&unitLevel=CENTRAL&unitId=CENTRAL')}
            >
              <Ionicons name="stats-chart-outline" size={16} color={Colors.primary} />
              <Text style={styles.quickNavBtnText}>{t('nav.reports', 'Reports')}</Text>
            </TouchableOpacity>
          </View>
        </Card>

        {/* KPI Stats */}
        <View style={[styles.kpiGrid, isRTL && { flexDirection: 'row-reverse' }]}>
          <Card style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>{t('congress.totalMembers', 'Total Members')}</Text>
            <Text style={styles.kpiValue}>{loading ? '…' : stats.total}</Text>
          </Card>
          <Card style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>{t('congress.officeHolders', 'Office Holders')}</Text>
            <Text style={styles.kpiValue}>{loading ? '…' : stats.officeHolders}</Text>
          </Card>
          <Card style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>{t('congress.generalWorkers', 'General Workers')}</Text>
            <Text style={styles.kpiValue}>{loading ? '…' : stats.workers}</Text>
          </Card>
          <Card style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>{t('congress.provinces', 'Provinces')}</Text>
            <Text style={styles.kpiValue}>{loading ? '…' : stats.provinces}</Text>
          </Card>
        </View>

        {loading ? (
          <ActivityIndicator style={{ marginTop: Spacing.lg }} color={Colors.primary} />
        ) : (
          <>
            <View style={[styles.toolbarRow, isRTL && { flexDirection: 'row-reverse' }]}>
              <TextInput
                style={[styles.searchInput, isRTL && { textAlign: 'right' }]}
                placeholder={t('congress.searchPlaceholder', 'Search member, CNIC, phone...')}
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

            <View style={[styles.pickerRow, isRTL && { flexDirection: 'row-reverse' }]}>
              <View style={styles.pickerContainer}>
                <Picker
                  selectedValue={rosterProvFilter}
                  onValueChange={(v) => setRosterProvFilter(v)}
                  style={styles.picker}
                >
                  <Picker.Item label={t('common.allProvinces', 'All Provinces')} value="ALL" />
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
                    <Picker.Item key={opt.value} label={t(opt.labelKey, opt.fallback)} value={opt.value} />
                  ))}
                </Picker>
              </View>
            </View>

            <View style={styles.rosterList}>
              {filteredRoster.length === 0 ? (
                <EmptyState
                  icon="👥"
                  title={t('congress.noMembersFound', 'No members found')}
                  subtitle={t('congress.noMembersSubtitle', 'No Congress members match your search or filters.')}
                />
              ) : (
                filteredRoster.map((m) => {
                  const roles = m.activeRoles || [];
                  const recordId = m.congressRecordId;
                  return (
                    <Card key={m._id} style={styles.memberCard}>
                      <View style={[styles.memberHeaderRow, isRTL && { flexDirection: 'row-reverse' }]}>
                        <Avatar name={m.fullName} size={42} color={Colors.primary} />
                        <View style={[styles.memberMeta, isRTL && { alignItems: 'flex-end' }]}>
                          <Text style={[styles.memberName, isRTL && { textAlign: 'right' }]}>{m.fullName}</Text>
                          <Text style={[styles.memberSub, isRTL && { textAlign: 'right' }]}>
                            {m.memberId || 'ID —'} · {m.cnic} · {m.phone || t('common.noPhone', 'No phone')}
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
                        <View style={[styles.detailRow, isRTL && { flexDirection: 'row-reverse' }]}>
                          <Text style={[styles.detailLabel, isRTL && { textAlign: 'right' }]}>{t('common.role', 'Role:')}</Text>
                          <View style={[styles.detailValue, isRTL && { alignItems: 'flex-end' }]}>
                            {roles.length > 0 ? (
                              roles.map((r, idx) => (
                                <View key={r._id} style={[{ flexDirection: 'row', alignItems: 'center', marginBottom: idx !== roles.length - 1 ? 4 : 0 }, isRTL && { flexDirection: 'row-reverse' }]}>
                                  <Badge label={r.customRoleName || t('roles.' + r.roleCode, r.roleCode.replace(/_/g, ' '))} color="#166534" bg="#dcfce7" />
                                  <Text style={styles.unitText}>· {r.unitName}{r.unitLevel ? ` (${t('units.' + r.unitLevel, r.unitLevel.replace(/_/g, ' '))})` : ''}</Text>
                                </View>
                              ))
                            ) : m.assignedRoleSnapshot?.roleCode ? (
                              <View style={[{ flexDirection: 'row', alignItems: 'center' }, isRTL && { flexDirection: 'row-reverse' }]}>
                                <Badge label={m.assignedRoleSnapshot.customRoleName || t('roles.' + m.assignedRoleSnapshot.roleCode, m.assignedRoleSnapshot.roleCode.replace(/_/g, ' '))} color="#166534" bg="#dcfce7" />
                                <Text style={styles.unitText}>· {m.assignedRoleSnapshot.unitName}{m.assignedRoleSnapshot.unitLevel ? ` (${t('units.' + m.assignedRoleSnapshot.unitLevel, m.assignedRoleSnapshot.unitLevel.replace(/_/g, ' '))})` : ''}</Text>
                              </View>
                            ) : (
                              <Text style={[styles.noRoleText, isRTL && { textAlign: 'right' }]}>{t('congress.generalPartyWorker', 'General Party Worker')}</Text>
                            )}
                          </View>
                        </View>

                        {/* Hierarchy */}
                        <View style={[styles.detailRow, isRTL && { flexDirection: 'row-reverse' }]}>
                          <Text style={[styles.detailLabel, isRTL && { textAlign: 'right' }]}>{t('congress.home', 'Home:')}</Text>
                          <View style={[styles.detailValue, isRTL && { alignItems: 'flex-end' }]}>
                            <Text style={[styles.hierarchyText, isRTL && { textAlign: 'right' }]}>
                              {[
                                m.homeUnit?.provinceName && `${t('units.province', 'Prov')}: ${m.homeUnit.provinceName}`,
                                m.homeUnit?.districtName && `${t('units.district', 'Dist')}: ${m.homeUnit.districtName}`,
                                m.homeUnit?.areaName && `${t('units.area', 'Area')}: ${m.homeUnit.areaName}`,
                                m.homeUnit?.basicUnitName && `${t('units.basicUnit', 'BU')}: ${m.homeUnit.basicUnitName}`
                              ].filter(Boolean).join(', ') || '—'}
                            </Text>
                          </View>
                        </View>

                        {/* Appointed Date */}
                        <View style={[styles.detailRow, isRTL && { flexDirection: 'row-reverse' }]}>
                          <Text style={[styles.detailLabel, isRTL && { textAlign: 'right' }]}>{t('congress.appointed', 'Appointed:')}</Text>
                          <View style={[styles.detailValue, isRTL && { alignItems: 'flex-end' }]}>
                            <Text style={[styles.footerLabel, isRTL && { textAlign: 'right' }]}>
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
          <View style={[styles.modalHeader, isRTL && { flexDirection: 'row-reverse' }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.modalTitle, isRTL && { textAlign: 'right' }]}>{t('congress.assignTitle', 'Assign to National Congress')}</Text>
              <Text style={[styles.modalSubtitle, isRTL && { textAlign: 'right' }]}>{t('congress.assignSubtitle', 'Appoint party member to National Congress (Central)')}</Text>
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
              <View style={[styles.modalSearchWrap, isRTL && { flexDirection: 'row-reverse' }]}>
                <Ionicons name="search" size={16} color={Colors.textMuted} style={isRTL ? { marginLeft: 6 } : { marginRight: 6 }} />
                <TextInput
                  style={[styles.modalSearchInput, isRTL && { textAlign: 'right' }]}
                  placeholder={t('congress.candidateSearchPlaceholder', 'Search candidate by name, CNIC, phone…')}
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
              <Text style={[styles.modalFilterLabel, isRTL && { textAlign: 'right' }]}>{t('congress.filterByTier', 'FILTER BY TIER')}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.horizFilterScroll, isRTL && { flexDirection: 'row-reverse' }]}>
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
                      {t(opt.labelKey, opt.fallback)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Role Filters */}
              <Text style={[styles.modalFilterLabel, isRTL && { textAlign: 'right' }]}>{t('congress.filterByRole', 'FILTER BY ROLE')}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.horizFilterScroll, isRTL && { flexDirection: 'row-reverse' }]}>
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
                      {t(opt.labelKey, opt.fallback)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* District Filter if province selected */}
              {districtsList.length > 0 && (
                <>
                  <Text style={[styles.modalFilterLabel, isRTL && { textAlign: 'right' }]}>{t('congress.filterByDistrict', 'FILTER BY DISTRICT')}</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.horizFilterScroll, isRTL && { flexDirection: 'row-reverse' }]}>
                    <TouchableOpacity
                      style={[styles.filterChip, candidateDistId === '' && styles.filterChipActive]}
                      onPress={() => setCandidateDistId('')}
                    >
                      <Text style={[styles.filterChipText, candidateDistId === '' && styles.filterChipTextActive]}>
                        {t('congress.allDistricts', 'All Districts')}
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
                <View style={[styles.modalErrBox, isRTL && { flexDirection: 'row-reverse' }]}>
                  <Ionicons name="alert-circle" size={18} color={Colors.error} />
                  <Text style={[styles.modalErrText, isRTL && { textAlign: 'right' }]}>{modalError}</Text>
                </View>
              ) : null}

              {/* Candidate List */}
              <Text style={[styles.modalFilterLabel, isRTL && { textAlign: 'right' }]}>
                {t('congress.selectCandidateCount', `SELECT CANDIDATE (${candidates.length})`, { count: candidates.length })}
              </Text>
              {candidatesLoading ? (
                <View style={styles.loaderWrap}>
                  <ActivityIndicator size="small" color={Colors.primary} />
                  <Text style={styles.loaderText}>{t('congress.searchingCandidates', 'Searching eligible candidates…')}</Text>
                </View>
              ) : candidates.length === 0 ? (
                <View style={styles.emptyCandidate}>
                  <Text style={styles.emptyCandidateText}>{t('congress.noCandidatesFound', 'No eligible candidates found matching filters.')}</Text>
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
                            isRTL && { flexDirection: 'row-reverse' },
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
                          <View style={[{ flex: 1 }, isRTL && { alignItems: 'flex-end' }]}>
                            <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }, isRTL && { flexDirection: 'row-reverse' }]}>
                              <Text style={[styles.candidateName, isAssigned && { color: Colors.textMuted }]}>
                                {c.fullName}
                              </Text>
                              {isAssigned && (
                                <View style={styles.alreadyAssignedBadge}>
                                  <Text style={styles.alreadyAssignedBadgeText}>{t('congress.inCongress', 'In Congress')}</Text>
                                </View>
                              )}
                            </View>
                            <Text style={[styles.candidateMeta, isRTL && { textAlign: 'right' }]}>
                              {c.memberId || 'ID —'} · {c.cnic || 'CNIC —'}
                            </Text>
                            {c.activeRoles && c.activeRoles.length > 0 ? (
                              <Text style={[styles.candidateRole, isRTL && { textAlign: 'right' }]}>
                                {c.activeRoles[0].customRoleName || t('roles.' + c.activeRoles[0].roleCode, c.activeRoles[0].roleCode?.replace(/_/g, ' '))} ({c.activeRoles[0].unitName || 'Unit'})
                              </Text>
                            ) : (c.primaryRole ? (
                              <Text style={[styles.candidateRole, isRTL && { textAlign: 'right' }]}>
                                {t('roles.' + c.primaryRole.roleCode, c.primaryRole.roleCode?.replace(/_/g, ' '))} ({c.primaryRole.unitName || 'Unit'})
                              </Text>
                            ) : (
                              <Text style={[styles.candidateWorker, isRTL && { textAlign: 'right' }]}>
                                {t('congress.partyWorker', 'Party Worker')} · {c.homeUnit?.provinceName || c.districtName || t('common.general', 'General')}
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
                  <Text style={[styles.modalFilterLabel, isRTL && { textAlign: 'right' }]}>
                    {t('congress.nominationRemarks', 'NOMINATION REMARKS / TERMS (OPTIONAL)')}
                  </Text>
                  <TextInput
                    style={[styles.textArea, isRTL && { textAlign: 'right' }]}
                    placeholder={t('congress.remarksPlaceholder', 'Enter appointment remarks, terms, or delegate notes…')}
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
                        {t('congress.assignMemberAction', `Assign ${selectedMember.fullName} to Congress →`, { name: selectedMember.fullName })}
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
