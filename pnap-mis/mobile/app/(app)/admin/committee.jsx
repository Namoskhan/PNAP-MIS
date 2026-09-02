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
  useWindowDimensions,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Picker } from '@react-native-picker/picker';
import { Ionicons } from '@expo/vector-icons';

import { useUnit } from '../../../src/context/UnitContext';
import { useAuth } from '../../../src/context/AuthContext';
import { api, errorMessage } from '../../../src/api/client';
import { useToast } from '../../../src/components/Toast';
import { canManageFinance, hasPermission } from '../../../src/utils/permissions';
import Card from '../../../src/components/Card';
import Badge from '../../../src/components/Badge';
import Avatar from '../../../src/components/Avatar';
import EmptyState from '../../../src/components/EmptyState';
import { Colors, FontSize, Radius, Spacing, Shadow } from '../../../src/constants/colors';

const COMMITTEE_LABEL = {
  AREA: 'Elaqayi Committee',
  DISTRICT: 'Zilla Committee',
  PROVINCE: 'Sobayi Committee',
  CENTRAL: 'Central Committee',
};

const SUB_HEADING = {
  AREA: 'Basic Unit Secretaries & Senior Mawin Secretaries',
  DISTRICT: 'Area Secretaries & Senior Mawin Secretaries',
  PROVINCE: 'District Secretaries & Senior Mawin Secretaries',
  CENTRAL: 'Provincial Presidents & General/First Secretaries',
};

const OWN_HEADING = {
  AREA: 'Elaqayi Executive Cabinet',
  DISTRICT: 'Zilla Cabinet (District Executive)',
  PROVINCE: 'Sobayi Cabinet (Province Executive)',
  CENTRAL: 'Central Executive Cabinet',
};

export default function CommitteeScreen() {
  const params = useLocalSearchParams();
  const { ctx, provinces } = useUnit();
  const { user } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const { width } = useWindowDimensions();

  const isSmall = width < 480;
  const isTablet = width >= 768;

  // Resolve which unit/level this committee belongs to.
  // Committees exist only at AREA, DISTRICT, PROVINCE, and CENTRAL.
  const [resolved, setResolved] = useState(null);

  const isBasicUnit = (params.unitLevel || ctx?.unitLevel) === 'BASIC_UNIT';

  useEffect(() => {
    if (isBasicUnit) {
      setResolved(null);
      setLoading(false);
      return;
    }

    if (params.unitLevel && params.unitId) {
      if (params.unitLevel === 'CENTRAL') {
        api.get('/org/central').then((r) => {
          setResolved({ unitLevel: 'CENTRAL', unitId: r.data?.data?._id || 'CENTRAL', unitName: 'PKNAP Central' });
        }).catch(() => {
          setResolved({ unitLevel: 'CENTRAL', unitId: params.unitId, unitName: 'PKNAP Central' });
        });
      } else {
        setResolved({ unitLevel: params.unitLevel, unitId: params.unitId, unitName: params.unitName || params.unitLevel });
      }
      return;
    }

    if (!ctx || ctx.unitLevel === 'BASIC_UNIT') {
      setResolved(null);
      setLoading(false);
      return;
    }

    if (ctx.unitLevel === 'CENTRAL') {
      api.get('/org/central').then((r) => {
        setResolved({ unitLevel: 'CENTRAL', unitId: r.data?.data?._id || ctx.unitId, unitName: ctx.unitName || 'PKNAP Central' });
      }).catch(() => {
        setResolved({ unitLevel: 'CENTRAL', unitId: ctx.unitId, unitName: ctx.unitName || 'PKNAP Central' });
      });
    } else {
      setResolved({ unitLevel: ctx.unitLevel, unitId: ctx.unitId, unitName: ctx.unitName });
    }
  }, [ctx, params.unitLevel, params.unitId, isBasicUnit]);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState('');
  const [search, setSearch] = useState('');

  // Nominate Selective Member state
  const [nominateOpen, setNominateOpen] = useState(false);
  const [members, setMembers] = useState([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [memberId, setMemberId] = useState('');
  const [note, setNote] = useState('');
  const [nominating, setNominating] = useState(false);
  const [nominateErr, setNominateErr] = useState('');

  const fetchIdRef = useRef(0);

  async function reload(silent = false) {
    if (!resolved?.unitLevel || !resolved?.unitId) {
      setLoading(false);
      setRefreshing(false);
      return;
    }
    const myId = ++fetchIdRef.current;
    if (!silent) setLoading(true);
    setRefreshing(true);
    setErr('');
    try {
      let targetId = resolved.unitId;
      if (resolved.unitLevel === 'CENTRAL' && targetId === 'CENTRAL') {
        const c = await api.get('/org/central');
        targetId = c.data?.data?._id || 'CENTRAL';
      }
      const r = await api.get('/committee/composition', {
        params: { unitLevel: resolved.unitLevel, unitId: targetId },
      });
      if (myId === fetchIdRef.current) {
        setData(r.data.data);
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
  }, [resolved]);

  // Load eligible members for nomination
  useEffect(() => {
    if (!nominateOpen || !resolved) return;
    setMembersLoading(true);
    const p = { status: 'ACTIVE', limit: 500 };
    if (resolved.unitLevel === 'AREA') p.areaId = resolved.unitId;
    if (resolved.unitLevel === 'DISTRICT') p.districtId = resolved.unitId;
    if (resolved.unitLevel === 'PROVINCE') p.provinceId = resolved.unitId;
    if (resolved.unitLevel === 'CENTRAL') p.scope = 'all';

    api.get('/members', { params: p })
      .then((r) => setMembers(r.data.data || []))
      .catch(() => setMembers([]))
      .finally(() => setMembersLoading(false));
  }, [nominateOpen, resolved]);

  const alreadyInBody = useMemo(() => {
    if (!data) return new Set();
    const ids = new Set();
    (data.ownCabinet || []).forEach((c) => c.memberId?._id && ids.add(String(c.memberId._id)));
    (data.subordinates || []).forEach((s) => s.roles.forEach((r) => r.memberId?._id && ids.add(String(r.memberId._id))));
    (data.permanentMembers || []).forEach((p) => p.memberId?._id && ids.add(String(p.memberId._id)));
    return ids;
  }, [data]);

  const eligibleMembers = useMemo(() => {
    return members.filter((m) => !alreadyInBody.has(String(m._id)));
  }, [members, alreadyInBody]);

  async function handleNominate() {
    setNominateErr('');
    if (!memberId) {
      setNominateErr('Please select a member to nominate.');
      return;
    }
    setNominating(true);
    try {
      const nominee = members.find((m) => String(m._id) === String(memberId));
      await api.post('/committee/permanent', {
        unitLevel: resolved.unitLevel,
        unitId: resolved.unitId,
        memberId,
        nominationNote: note.trim() || undefined,
      });
      setMemberId('');
      setNote('');
      setNominateOpen(false);
      reload(true);
      toast.success(
        nominee ? `${nominee.fullName} nominated as selective member.` : 'Selective member nominated.'
      );
    } catch (e) {
      setNominateErr(errorMessage(e));
      toast.error(errorMessage(e));
    } finally {
      setNominating(false);
    }
  }

  function handleRemovePermanent(p) {
    const memberName = p.memberId?.fullName || 'this selective member';
    const action = async () => {
      try {
        await api.post(`/committee/permanent/${p._id}/remove`);
        reload(true);
        toast.success(`${memberName} removed from committee.`);
      } catch (e) {
        toast.error(errorMessage(e));
      }
    };

    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm(`Remove ${memberName} from selective membership?`)) {
        action();
      }
    } else {
      Alert.alert(
        'Remove Selective Member',
        `Remove "${memberName}" from the committee? This will revoke their consultative voting seat.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Remove', style: 'destructive', onPress: action },
        ]
      );
    }
  }

  // Filter lists based on search query
  const q = search.trim().toLowerCase();

  const filteredCabinet = useMemo(() => {
    if (!data?.ownCabinet) return [];
    if (!q) return data.ownCabinet;
    return data.ownCabinet.filter((c) => {
      const name = (c.memberId?.fullName || '').toLowerCase();
      const code = (c.roleCode || '').toLowerCase();
      const phone = (c.memberId?.phone || '').toLowerCase();
      const id = (c.memberId?.memberId || '').toLowerCase();
      return name.includes(q) || code.includes(q) || phone.includes(q) || id.includes(q);
    });
  }, [data?.ownCabinet, q]);

  const filteredSubordinates = useMemo(() => {
    if (!data?.subordinates) return [];
    if (!q) return data.subordinates;
    return data.subordinates.map((s) => {
      const unitMatches = (s.unit.name || '').toLowerCase().includes(q) || (s.unit.code || '').toLowerCase().includes(q);
      if (unitMatches) return s;
      const matchedRoles = s.roles.filter((r) => {
        const name = (r.memberId?.fullName || '').toLowerCase();
        const code = (r.roleCode || '').toLowerCase();
        const phone = (r.memberId?.phone || '').toLowerCase();
        return name.includes(q) || code.includes(q) || phone.includes(q);
      });
      return { ...s, roles: matchedRoles };
    }).filter((s) => s.roles.length > 0);
  }, [data?.subordinates, q]);

  const filteredPermanents = useMemo(() => {
    if (!data?.permanentMembers) return [];
    if (!q) return data.permanentMembers;
    return data.permanentMembers.filter((p) => {
      const name = (p.memberId?.fullName || '').toLowerCase();
      const phone = (p.memberId?.phone || '').toLowerCase();
      const noteStr = (p.nominationNote || '').toLowerCase();
      return name.includes(q) || phone.includes(q) || noteStr.includes(q);
    });
  }, [data?.permanentMembers, q]);

  const totalMembers = data
    ? (data.ownCabinet?.length || 0)
      + (data.subordinates || []).reduce((a, s) => a + (s.roles?.length || 0), 0)
      + (data.permanentMembers?.length || 0)
    : 0;

  const canManage = Boolean(data?.canManage);
  const committeeTitle = resolved ? (COMMITTEE_LABEL[resolved.unitLevel] || 'Committee') : 'Committee';
  const canFinance = canManageFinance(user);

  if (isBasicUnit) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.emptyContainer}>
          <Ionicons name="information-circle-outline" size={48} color={Colors.textMuted} />
          <Text style={styles.emptyTitle}>No Committee at Basic Unit</Text>
          <Text style={styles.emptySubtitle}>
            Basic Units have only an Executive Cabinet. Consultative committees are organized at Area (Elaqayi), District (Zilla), Province (Sobayi), and Central tiers.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!resolved && !loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.emptyContainer}>
          <Ionicons name="business-outline" size={48} color={Colors.textMuted} />
          <Text style={styles.emptyTitle}>Select a Unit Context</Text>
          <Text style={styles.emptySubtitle}>
            Please select an Area, District, Province, or Central unit to view its consultative committee composition.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => reload(true)} tintColor={Colors.primary} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.mainWrapper, isTablet && styles.mainWrapperTablet]}>

          {/* Top Header Card */}
          <View style={[styles.header, isSmall && styles.headerSmall]}>
            <View style={styles.headerTitleWrap}>
              <View style={styles.badgeRow}>
                <View style={styles.unitLevelBadge}>
                  <Text style={styles.unitLevelBadgeText}>{resolved?.unitLevel?.replace('_', ' ') || 'UNIT'}</Text>
                </View>
                <View style={styles.committeeBadge}>
                  <Ionicons name="people" size={12} color="#0369a1" style={{ marginRight: 4 }} />
                  <Text style={styles.committeeBadgeText}>Consultative Assembly</Text>
                </View>
              </View>
              <Text style={styles.pageTitle}>
                {committeeTitle} · {resolved?.unitName}
              </Text>
              <Text style={styles.pageSubtitle}>
                {OWN_HEADING[resolved?.unitLevel]} + Subordinate Key Roles + Selective Members
              </Text>
            </View>
          </View>

          {/* Overview Breakdown KPI Card */}
          {data && (
            <Card style={styles.statsCard}>
              <View style={styles.statsRow}>
                <View style={styles.statBox}>
                  <Text style={styles.statVal}>{totalMembers}</Text>
                  <Text style={styles.statLabel}>Total Members</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statBox}>
                  <Text style={[styles.statVal, { color: '#0369a1' }]}>{data.ownCabinet?.length || 0}</Text>
                  <Text style={styles.statLabel}>Exec Cabinet</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statBox}>
                  <Text style={[styles.statVal, { color: '#15803d' }]}>
                    {(data.subordinates || []).reduce((a, s) => a + (s.roles?.length || 0), 0)}
                  </Text>
                  <Text style={styles.statLabel}>Subordinates</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statBox}>
                  <Text style={[styles.statVal, { color: '#7c3aed' }]}>{data.permanentMembers?.length || 0}</Text>
                  <Text style={styles.statLabel}>Selective</Text>
                </View>
              </View>
            </Card>
          )}

          {/* Committee Hub Quick Actions Navigation */}
          <Card style={styles.quickNavCard}>
            <Text style={styles.quickNavTitle}>Committee Services & Modules</Text>
            <View style={styles.quickNavGrid}>
              <TouchableOpacity
                style={styles.quickNavBtn}
                onPress={() => router.push({
                  pathname: '/meetings',
                  params: { body: 'COMMITTEE', unitLevel: resolved?.unitLevel, unitId: resolved?.unitId }
                })}
              >
                <View style={[styles.quickNavIconBox, { backgroundColor: '#eff6ff' }]}>
                  <Ionicons name="calendar-outline" size={20} color={Colors.primary} />
                </View>
                <Text style={styles.quickNavBtnText}>Meetings</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.quickNavBtn}
                onPress={() => router.push({
                  pathname: '/activities',
                  params: { body: 'COMMITTEE', unitLevel: resolved?.unitLevel, unitId: resolved?.unitId }
                })}
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
                    onPress={() => router.push({
                      pathname: '/finance',
                      params: { body: 'COMMITTEE', unitLevel: resolved?.unitLevel, unitId: resolved?.unitId }
                    })}
                  >
                    <View style={[styles.quickNavIconBox, { backgroundColor: '#fef3c7' }]}>
                      <Ionicons name="cash-outline" size={20} color="#b45309" />
                    </View>
                    <Text style={styles.quickNavBtnText}>Finance</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.quickNavBtn}
                    onPress={() => router.push({
                      pathname: '/finance/transfers',
                      params: { body: 'COMMITTEE', unitLevel: resolved?.unitLevel, unitId: resolved?.unitId }
                    })}
                  >
                    <View style={[styles.quickNavIconBox, { backgroundColor: '#f3e8ff' }]}>
                      <Ionicons name="swap-horizontal-outline" size={20} color="#7c3aed" />
                    </View>
                    <Text style={styles.quickNavBtnText}>Transfers</Text>
                  </TouchableOpacity>
                </>
              )}

              <TouchableOpacity
                style={styles.quickNavBtn}
                onPress={() => router.push({
                  pathname: '/admin/reports',
                  params: { body: 'COMMITTEE', unitLevel: resolved?.unitLevel, unitId: resolved?.unitId }
                })}
              >
                <View style={[styles.quickNavIconBox, { backgroundColor: '#f1f5f9' }]}>
                  <Ionicons name="document-text-outline" size={20} color="#475569" />
                </View>
                <Text style={styles.quickNavBtnText}>Reports</Text>
              </TouchableOpacity>
            </View>
          </Card>

          {/* Search bar */}
          <View style={styles.searchBarWrap}>
            <Ionicons name="search-outline" size={18} color={Colors.textMuted} style={{ marginRight: 8 }} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search roster by name, role, phone, or member ID…"
              placeholderTextColor={Colors.textMuted}
              value={search}
              onChangeText={setSearch}
              clearButtonMode="while-editing"
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch('')}>
                <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>

          {loading && !data ? (
            <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: 40 }} />
          ) : data ? (
            <>
              {/* SECTION 1: Own Executive Cabinet */}
              <Card style={styles.rosterSectionCard}>
                <View style={styles.sectionHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sectionTitle}>{OWN_HEADING[resolved?.unitLevel]}</Text>
                    <Text style={styles.sectionSub}>Primary office-holders with executive decision mandates</Text>
                  </View>
                  <Badge label={`${filteredCabinet.length} office-holders`} color="#0369a1" bg="#e0f2fe" />
                </View>

                {filteredCabinet.length === 0 ? (
                  <Text style={styles.emptyText}>
                    {search ? 'No executive cabinet members matching your search.' : 'Executive cabinet not formed yet.'}
                  </Text>
                ) : (
                  <View style={styles.memberList}>
                    {filteredCabinet.map((c) => (
                      <View key={c._id} style={styles.memberRow}>
                        <Avatar name={c.memberId?.fullName || c.roleCode} size={42} color={Colors.primary} />
                        <View style={{ flex: 1, marginLeft: 12 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                            <Text style={styles.memberName}>{c.memberId?.fullName || 'Vacant'}</Text>
                            <Badge label={c.roleCode?.replace(/_/g, ' ')} color="#0369a1" bg="#e0f2fe" />
                          </View>
                          {c.customRoleName && (
                            <Text style={styles.memberRoleCustom}>{c.customRoleName}</Text>
                          )}
                          <View style={styles.memberMetaRow}>
                            {c.memberId?.memberId && (
                              <Text style={styles.memberMetaText}>ID: {c.memberId.memberId}</Text>
                            )}
                            {c.memberId?.phone && (
                              <Text style={styles.memberMetaText}>📞 {c.memberId.phone}</Text>
                            )}
                          </View>
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </Card>

              {/* SECTION 2: Subordinate Key Office-Holders */}
              <Card style={styles.rosterSectionCard}>
                <View style={styles.sectionHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sectionTitle}>{SUB_HEADING[resolved?.unitLevel]}</Text>
                    <Text style={styles.sectionSub}>Ex-officio members representing subordinate units</Text>
                  </View>
                </View>

                {filteredSubordinates.length === 0 ? (
                  <Text style={styles.emptyText}>
                    {search ? 'No subordinate members matching your search.' : 'No subordinate units configured yet.'}
                  </Text>
                ) : (
                  filteredSubordinates.map((s) => (
                    <View key={s.unit._id} style={styles.subordinateUnitBox}>
                      <View style={styles.subordinateUnitHeader}>
                        <Ionicons name="business-outline" size={16} color={Colors.primary} style={{ marginRight: 6 }} />
                        <Text style={styles.subordinateUnitName}>
                          {s.unit.name}
                        </Text>
                        <Badge label={s.unit.level?.replace('_', ' ')} color="#475569" bg="#f1f5f9" />
                      </View>

                      {s.roles.length === 0 ? (
                        <Text style={[styles.emptyText, { paddingVertical: 8 }]}>No key office-holders assigned in this unit.</Text>
                      ) : (
                        <View style={styles.subordinateMemberList}>
                          {s.roles.map((r) => (
                            <View key={r._id} style={styles.subordinateMemberRow}>
                              <Avatar name={r.memberId?.fullName || r.roleCode} size={36} color="#15803d" />
                              <View style={{ flex: 1, marginLeft: 10 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                                  <Text style={styles.memberName}>{r.memberId?.fullName || 'Assigned'}</Text>
                                  <Badge label={r.roleCode?.replace(/_/g, ' ')} color="#15803d" bg="#dcfce7" />
                                </View>
                                {r.memberId?.phone && (
                                  <Text style={styles.memberMetaText}>📞 {r.memberId.phone}</Text>
                                )}
                              </View>
                            </View>
                          ))}
                        </View>
                      )}
                    </View>
                  ))
                )}
              </Card>

              {/* SECTION 3: Selective Members */}
              <Card style={styles.rosterSectionCard}>
                <View style={styles.sectionHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sectionTitle}>Selective Members</Text>
                    <Text style={styles.sectionSub}>Permanent nominated members appointed for advisory council</Text>
                  </View>
                  {canManage && (
                    <TouchableOpacity style={styles.btnNominate} onPress={() => setNominateOpen(true)}>
                      <Ionicons name="add" size={16} color="#fff" style={{ marginRight: 2 }} />
                      <Text style={styles.btnNominateText}>Nominate</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {filteredPermanents.length === 0 ? (
                  <Text style={styles.emptyText}>
                    {search ? 'No selective members matching your search.' : 'No selective members nominated yet.'}
                  </Text>
                ) : (
                  <View style={styles.memberList}>
                    {filteredPermanents.map((p) => (
                      <View key={p._id} style={styles.memberRow}>
                        <Avatar name={p.memberId?.fullName || 'Selective'} size={42} color="#7c3aed" />
                        <View style={{ flex: 1, marginLeft: 12 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                            <Text style={styles.memberName}>{p.memberId?.fullName || 'Nominee'}</Text>
                            {canManage && (
                              <TouchableOpacity
                                style={styles.btnRemovePerm}
                                onPress={() => handleRemovePermanent(p)}
                              >
                                <Ionicons name="trash-outline" size={14} color={Colors.error} />
                                <Text style={styles.btnRemovePermText}>Remove</Text>
                              </TouchableOpacity>
                            )}
                          </View>
                          <View style={styles.memberMetaRow}>
                            {p.memberId?.phone && (
                              <Text style={styles.memberMetaText}>📞 {p.memberId.phone}</Text>
                            )}
                            {p.nominationNote ? (
                              <Text style={[styles.memberMetaText, { fontStyle: 'italic', color: '#64748b' }]}>
                                Note: {p.nominationNote}
                              </Text>
                            ) : null}
                          </View>
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </Card>
            </>
          ) : null}

        </View>
      </ScrollView>

      {/* Nominate Selective Member Modal */}
      {nominateOpen && (
        <Modal
          visible={nominateOpen}
          transparent
          animationType="fade"
          onRequestClose={() => !nominating && setNominateOpen(false)}
        >
          <View style={styles.modalBackdrop}>
            <View style={[styles.modalCard, isTablet && styles.modalCardTablet]}>
              <View style={styles.modalHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalTitle}>Nominate Selective Member</Text>
                  <Text style={styles.modalSub}>
                    Appoint an active member to {committeeTitle}.
                  </Text>
                </View>
                <TouchableOpacity onPress={() => !nominating && setNominateOpen(false)}>
                  <Ionicons name="close" size={24} color={Colors.text} />
                </TouchableOpacity>
              </View>

              <ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
                {nominateErr ? (
                  <View style={styles.alertError}>
                    <Ionicons name="alert-circle" size={18} color={Colors.error} style={{ marginRight: 6 }} />
                    <Text style={styles.alertErrorText}>{nominateErr}</Text>
                  </View>
                ) : null}

                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>Select Member <Text style={{ color: Colors.error }}>*</Text></Text>
                  {membersLoading ? (
                    <ActivityIndicator size="small" color={Colors.primary} style={{ marginVertical: 10 }} />
                  ) : (
                    <View style={styles.pickerWrapper}>
                      <Picker
                        selectedValue={memberId}
                        onValueChange={(val) => {
                          setMemberId(val);
                          if (nominateErr) setNominateErr('');
                        }}
                      >
                        <Picker.Item label="— Choose from registered active members —" value="" />
                        {eligibleMembers.map((m) => (
                          <Picker.Item
                            key={m._id}
                            label={`${m.fullName} · ${m.memberId || m.cnic || ''}`}
                            value={m._id}
                          />
                        ))}
                      </Picker>
                    </View>
                  )}
                  <Text style={styles.fieldHint}>
                    Only active members not already seated in this committee appear in the list.
                  </Text>
                </View>

                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>Nomination Note (Optional)</Text>
                  <TextInput
                    style={[styles.fieldInput, { height: 70, textAlignVertical: 'top' }]}
                    placeholder="e.g. Appointed as senior elder advisor for youth engagement"
                    placeholderTextColor={Colors.textMuted}
                    multiline
                    value={note}
                    onChangeText={setNote}
                  />
                </View>
              </ScrollView>

              <View style={styles.modalFooter}>
                <TouchableOpacity
                  style={styles.btnSecondary}
                  disabled={nominating}
                  onPress={() => setNominateOpen(false)}
                >
                  <Text style={styles.btnSecondaryText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.btnPrimary, { opacity: !memberId || nominating ? 0.6 : 1 }]}
                  disabled={!memberId || nominating}
                  onPress={handleNominate}
                >
                  {nominating && <ActivityIndicator size="small" color="#fff" style={{ marginRight: 6 }} />}
                  <Text style={styles.btnPrimaryText}>{nominating ? 'Nominating…' : 'Nominate Member'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f8fafc' },
  scrollContent: { padding: Spacing.md, paddingBottom: 60 },
  mainWrapper: { width: '100%' },
  mainWrapperTablet: { maxWidth: 1100, alignSelf: 'center' },

  header: {
    padding: Spacing.lg,
    backgroundColor: '#ffffff',
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.md,
    ...Shadow.sm,
  },
  headerSmall: {
    padding: Spacing.md,
  },
  headerTitleWrap: { flex: 1 },
  badgeRow: { flexDirection: 'row', gap: 6, marginBottom: 6, alignItems: 'center' },
  unitLevelBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  unitLevelBadgeText: { fontSize: 10, fontWeight: '700', color: '#475569', textTransform: 'uppercase' },
  committeeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: '#e0f2fe',
    borderWidth: 1,
    borderColor: '#bae6fd',
  },
  committeeBadgeText: { fontSize: 10, fontWeight: '700', color: '#0369a1' },

  pageTitle: { fontSize: 19, fontWeight: '800', color: '#0f172a', letterSpacing: -0.3 },
  pageSubtitle: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 3 },

  alertNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#eff6ff',
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    padding: 12,
    marginBottom: Spacing.md,
  },
  alertNoticeText: { flex: 1, fontSize: 12, color: '#1e40af', lineHeight: 18 },

  // Stats Card
  statsCard: {
    padding: Spacing.md,
    borderRadius: Radius.xl,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.md,
    ...Shadow.sm,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  statBox: { alignItems: 'center', flex: 1 },
  statVal: { fontSize: 18, fontWeight: '800', color: '#0f172a' },
  statLabel: { fontSize: 10, fontWeight: '600', color: Colors.textMuted, marginTop: 2, textTransform: 'uppercase' },
  statDivider: { width: 1, height: 28, backgroundColor: '#e2e8f0' },

  // Quick Nav Card
  quickNavCard: {
    padding: Spacing.md,
    borderRadius: Radius.xl,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.md,
    ...Shadow.sm,
  },
  quickNavTitle: { fontSize: 12, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', marginBottom: 10, letterSpacing: 0.3 },
  quickNavGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  quickNavBtn: {
    flex: 1,
    minWidth: 80,
    alignItems: 'center',
    paddingVertical: 10,
    backgroundColor: '#f8fafc',
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  quickNavIconBox: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  quickNavBtnText: { fontSize: 11, fontWeight: '700', color: '#334155' },

  // Search Bar
  searchBarWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: Spacing.md,
    ...Shadow.sm,
  },
  searchInput: { flex: 1, fontSize: 13, color: Colors.text, paddingVertical: 4 },

  // Roster Section Cards
  rosterSectionCard: {
    padding: Spacing.lg,
    borderRadius: Radius.xl,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.md,
    ...Shadow.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
    flexWrap: 'wrap',
    gap: 8,
  },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: '#0f172a' },
  sectionSub: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },

  btnNominate: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.md,
  },
  btnNominateText: { color: '#ffffff', fontSize: 12, fontWeight: '700' },

  memberList: { gap: 10 },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    backgroundColor: '#f8fafc',
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  memberName: { fontSize: 14, fontWeight: '700', color: Colors.text },
  memberRoleCustom: { fontSize: 11, color: Colors.primary, fontWeight: '600', marginTop: 1 },
  memberMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4 },
  memberMetaText: { fontSize: 11, color: Colors.textMuted },

  subordinateUnitBox: {
    backgroundColor: '#f8fafc',
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 12,
    marginBottom: 10,
  },
  subordinateUnitHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    paddingBottom: 6,
  },
  subordinateUnitName: { flex: 1, fontSize: 13, fontWeight: '700', color: '#0f172a' },
  subordinateMemberList: { gap: 8 },
  subordinateMemberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    padding: 8,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },

  btnRemovePerm: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#fee2e2',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.sm,
  },
  btnRemovePermText: { fontSize: 10, fontWeight: '700', color: Colors.error },

  emptyText: {
    fontSize: 12,
    color: Colors.textMuted,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 16,
  },

  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: Colors.text, marginTop: 12 },
  emptySubtitle: { fontSize: 12, color: Colors.textMuted, textAlign: 'center', marginTop: 4, maxWidth: 280 },

  // Modal Styles
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 16 },
  modalCard: { width: '100%', maxWidth: 540, backgroundColor: '#ffffff', borderRadius: Radius.xl, overflow: 'hidden', ...Shadow.lg },
  modalCardTablet: { maxWidth: 580 },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: '#f8fafc',
  },
  modalTitle: { fontSize: 16, fontWeight: '800', color: '#0f172a' },
  modalSub: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  modalBody: { padding: Spacing.lg },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: '#f8fafc',
  },

  field: { marginBottom: 14 },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: '#334155', marginBottom: 6 },
  fieldHint: { fontSize: 11, color: Colors.textMuted, marginTop: 4 },
  fieldInput: {
    borderWidth: 1.5,
    borderColor: '#cbd5e1',
    borderRadius: Radius.md,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
    backgroundColor: '#f8fafc',
    color: '#0f172a',
  },
  pickerWrapper: {
    borderWidth: 1.5,
    borderColor: '#cbd5e1',
    borderRadius: Radius.md,
    backgroundColor: '#f8fafc',
    overflow: 'hidden',
  },

  btnSecondary: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: Radius.md,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  btnSecondaryText: { fontSize: 13, fontWeight: '600', color: '#475569' },
  btnPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: Radius.md,
    backgroundColor: Colors.primary,
  },
  btnPrimaryText: { fontSize: 13, fontWeight: '700', color: '#ffffff' },

  alertError: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fee2e2',
    borderWidth: 1,
    borderColor: '#fca5a5',
    padding: 10,
    borderRadius: Radius.md,
    marginBottom: 12,
  },
  alertErrorText: { color: Colors.error, fontSize: 12, fontWeight: '600', flex: 1 },
});
