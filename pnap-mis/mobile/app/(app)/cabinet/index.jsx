import { useEffect, useMemo, useRef, useState } from 'react';
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
import { useUnit } from '../../../src/context/UnitContext';
import {
  hasRole,
  isHigherAdmin,
  isAreaAdmin,
  canInitiateRole,
  canDecideRole,
  isSecretaryOnly,
  isPresidentPersona,
  isOperatorPersona,
} from '../../../src/utils/permissions';
import { useToast } from '../../../src/components/Toast';
import Card from '../../../src/components/Card';
import Badge from '../../../src/components/Badge';
import Avatar from '../../../src/components/Avatar';
import EmptyState from '../../../src/components/EmptyState';
import { Colors, FontSize, Radius, Spacing } from '../../../src/constants/colors';
import { shortDate } from '../../../src/utils/formatters';

const ROLE_LABEL = {
  SECRETARY: 'Secretary',
  SENIOR_MAWIN: 'Senior Mawin Secretary',
  FINANCE_SECRETARY: 'Finance Secretary',
  PRESS_SECRETARY: 'Press Secretary',
  CULTURE_SECRETARY: 'Culture Secretary',
  SPORTS_SECRETARY: 'Sports Secretary',
  GENERAL_SECRETARY: 'General Secretary (Secretary General)',
  FIRST_SECRETARY: 'First Secretary',
  PRESIDENT: 'President / Saddar',
  VICE_PRESIDENT: 'Vice President',
  SR_VICE_PRESIDENT: 'Senior Vice President',
  CHAIRMAN: 'Chairman',
  CO_CHAIRMAN: 'Co-Chairman',
  VICE_CHAIRMAN: 'Vice Chairman',
  SR_VICE_CHAIRMAN: 'Senior Vice Chairman',
  OTHER: 'Other',
};

const END_REASONS = [
  { value: 'RESIGNED', label: 'Resigned', hint: 'Stepped down of their own accord' },
  { value: 'TERM_ENDED', label: 'Term ended', hint: 'Served the full term' },
  { value: 'TRANSFERRED', label: 'Transferred', hint: 'Moved to another unit' },
  { value: 'REPLACED', label: 'Replaced', hint: 'Someone else has taken the office' },
  { value: 'EXPELLED', label: 'Expelled', hint: 'Removed on disciplinary grounds' },
  { value: 'DECEASED', label: 'Deceased', hint: 'Passed away' },
];

export default function CabinetScreen() {
  const { user } = useAuth();
  const { ctx, setCtx } = useUnit();
  const toast = useToast();

  const [cabinet, setCabinet] = useState([]);
  const [pending, setPending] = useState([]);
  const [members, setMembers] = useState([]);
  const [memberSearch, setMemberSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // Assignment Modal State
  const [assignForRole, setAssignForRole] = useState(null); // row object being assigned
  const [pickedMemberId, setPickedMemberId] = useState('');
  const [assignOpen, setAssignOpen] = useState(false);

  // End Role Modal State
  const [endTarget, setEndTarget] = useState(null); // row object being ended
  const [endReason, setEndReason] = useState('RESIGNED');
  const [endOpen, setEndOpen] = useState(false);

  // Tier Selector Lists
  const [allProvinces, setAllProvinces] = useState([]);
  const [districtsInProvince, setDistrictsInProvince] = useState([]);
  const [areasInDistrict, setAreasInDistrict] = useState([]);
  const [basicUnitsInArea, setBasicUnitsInArea] = useState([]);
  const [centralUnit, setCentralUnit] = useState(null);

  const roles = user?.roles || [];
  const isSuper = roles.includes('SUPER_ADMIN');
  const isCentral = roles.includes('CENTRAL_ADMIN');
  const isProvince = roles.includes('PROVINCE_ADMIN') && !isSuper && !isCentral;
  const isDistrict = roles.includes('DISTRICT_ADMIN') && !isSuper && !isCentral && !isProvince;
  const isArea = roles.includes('AREA_ADMIN') && !isSuper && !isCentral && !isProvince && !isDistrict;

  // 1. Central Admin & Super Admin: Fetch all provinces and Central Unit
  useEffect(() => {
    if (!isCentral && !isSuper) return;
    api.get('/org/provinces')
      .then((r) => setAllProvinces(r.data?.data || []))
      .catch(() => {});
    api.get('/org/central')
      .then((r) => setCentralUnit(r.data?.data || null))
      .catch(() => {});
  }, [user, isCentral, isSuper]);

  // 2. Province Admin: Fetch districts in province
  useEffect(() => {
    if (!isProvince || !user?.scope?.provinceId) return;
    api.get('/org/districts', { params: { provinceId: user.scope.provinceId } })
      .then((r) => setDistrictsInProvince(r.data?.data || []))
      .catch(() => {});
  }, [user, isProvince]);

  // 3. District Admin: Fetch areas in district
  useEffect(() => {
    if (!isDistrict || !user?.scope?.districtId) return;
    api.get('/org/areas', { params: { districtId: user.scope.districtId } })
      .then((r) => setAreasInDistrict(r.data?.data || []))
      .catch(() => {});
  }, [user, isDistrict]);

  // 4. Area Admin: Fetch basic units in area
  useEffect(() => {
    if (!isArea || !user?.scope?.areaId) return;
    api.get('/org/basic-units', { params: { areaId: user.scope.areaId } })
      .then((r) => setBasicUnitsInArea(r.data?.data || []))
      .catch(() => {});
  }, [user, isArea]);

  // Auto-pick the appropriate subordinate unit on first load (matching web logic)
  const autoPicked = useRef(false);
  useEffect(() => {
    if (autoPicked.current) return;

    if (isCentral && allProvinces.length > 0) {
      autoPicked.current = true;
      if (ctx?.unitLevel !== 'PROVINCE') {
        const first = allProvinces[0];
        setCtx({ unitLevel: 'PROVINCE', unitId: first._id, unitName: first.name });
      }
    } else if (isProvince && districtsInProvince.length > 0) {
      autoPicked.current = true;
      if (ctx?.unitLevel !== 'DISTRICT') {
        const first = districtsInProvince[0];
        setCtx({ unitLevel: 'DISTRICT', unitId: first._id, unitName: first.name });
      }
    } else if (isDistrict && areasInDistrict.length > 0) {
      autoPicked.current = true;
      if (ctx?.unitLevel !== 'AREA') {
        const first = areasInDistrict[0];
        setCtx({ unitLevel: 'AREA', unitId: first._id, unitName: first.name });
      }
    } else if (isArea && basicUnitsInArea.length > 0) {
      autoPicked.current = true;
      if (ctx?.unitLevel !== 'BASIC_UNIT') {
        const first = basicUnitsInArea[0];
        setCtx({ unitLevel: 'BASIC_UNIT', unitId: first._id, unitName: first.name });
      }
    }
  }, [isCentral, isProvince, isDistrict, isArea, allProvinces, districtsInProvince, areasInDistrict, basicUnitsInArea]);

  // Fetch Cabinet, Pending Proposals, and Eligible Members for the active unit
  const fetchIdRef = useRef(0);
  async function load() {
    if (!ctx?.unitId) {
      setLoading(false);
      return;
    }
    const myId = ++fetchIdRef.current;
    setLoading(true);
    try {
      let resolvedUnitId = ctx.unitId;
      if (ctx.unitLevel === 'CENTRAL' && ctx.unitId === 'CENTRAL') {
        const cRes = await api.get('/org/central');
        resolvedUnitId = cRes.data?.data?._id;
      }

      const params = { unitLevel: ctx.unitLevel, unitId: resolvedUnitId };

      const memberParams = { status: 'ACTIVE', limit: 250 };
      if (ctx.unitLevel === 'BASIC_UNIT') memberParams.basicUnitId = resolvedUnitId;
      else if (ctx.unitLevel === 'AREA') memberParams.areaId = resolvedUnitId;
      else if (ctx.unitLevel === 'DISTRICT') memberParams.districtId = resolvedUnitId;
      else if (ctx.unitLevel === 'PROVINCE') memberParams.provinceId = resolvedUnitId;
      else if (ctx.unitLevel === 'CENTRAL') memberParams.scope = 'all';

      const [cRes, pRes, mRes] = await Promise.all([
        api.get('/roles/cabinet', { params }),
        api.get('/roles', { params: { ...params, state: 'PROPOSED' } }),
        api.get('/members', { params: memberParams }),
      ]);

      if (myId !== fetchIdRef.current) return;

      setCabinet(cRes.data?.data || []);
      setPending(pRes.data?.data || []);
      setMembers(mRes.data?.data || []);
    } catch (e) {
      toast.error('Could not load cabinet details.');
    } finally {
      if (myId === fetchIdRef.current) setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [ctx?.unitId, ctx?.unitLevel]);

  // Permission flags
  const secretaryReadOnly = isSecretaryOnly(user);
  const isGeneralSec = hasRole(user, 'GENERAL_SECRETARY') && !isHigherAdmin(user) && !hasRole(user, 'AREA_ADMIN');
  const isSeniorMawinAssigner = hasRole(user, 'SENIOR_MAWIN');
  const canAssignDirectly =
    (isHigherAdmin(user) ||
      hasRole(user, 'AREA_ADMIN', 'SECRETARY') ||
      isGeneralSec ||
      isSeniorMawinAssigner) &&
    !secretaryReadOnly;
  const isSeniorMawinOp = isOperatorPersona(user);
  const isPresidentOnly = isPresidentPersona(user);

  // Filter members in the assignment picker
  const filteredMembers = useMemo(() => {
    if (!memberSearch.trim()) return members;
    const q = memberSearch.trim().toLowerCase();
    return members.filter(
      (m) =>
        (m.fullName || '').toLowerCase().includes(q) ||
        (m.cnic || '').toLowerCase().includes(q) ||
        (m.memberId || '').toLowerCase().includes(q) ||
        (m.phone || '').toLowerCase().includes(q)
    );
  }, [members, memberSearch]);

  // Single-shot Assign
  async function handleAssignSubmit() {
    if (!assignForRole || !pickedMemberId) {
      toast.error('Please select a member.');
      return;
    }
    setBusy(true);
    try {
      let resolvedUnitId = ctx.unitId;
      if (ctx.unitLevel === 'CENTRAL' && ctx.unitId === 'CENTRAL') {
        const cRes = await api.get('/org/central');
        resolvedUnitId = cRes.data?.data?._id;
      }

      const r = await api.post('/roles', {
        unitLevel: ctx.unitLevel,
        unitId: resolvedUnitId,
        memberId: pickedMemberId,
        roleCode: assignForRole.roleCode,
      });

      // Auto-approve if admin
      if (canAssignDirectly && r.data?.data?._id) {
        try {
          await api.post(`/roles/${r.data.data._id}/decide`, { decision: 'APPROVED' });
        } catch {
          /* ignore if approval handled */
        }
      }

      toast.success(
        `${ROLE_LABEL[assignForRole.roleCode] || assignForRole.customRoleName || assignForRole.roleCode} assigned successfully.`
      );
      setAssignOpen(false);
      setAssignForRole(null);
      setPickedMemberId('');
      setMemberSearch('');
      load();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  // End Role Assignment
  async function handleEndSubmit() {
    if (!endTarget?.assignment?._id) return;
    setBusy(true);
    try {
      await api.post(`/roles/${endTarget.assignment._id}/end`, { endReason });
      const label = END_REASONS.find((r) => r.value === endReason)?.label || endReason;
      toast.success(`Role ended (${label.toLowerCase()}).`);
      setEndOpen(false);
      setEndTarget(null);
      setEndReason('RESIGNED');
      load();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  // Decide Pending Proposal
  async function handleDecide(proposal, decision) {
    setBusy(true);
    try {
      await api.post(`/roles/${proposal._id}/decide`, { decision });
      toast.success(`Proposal ${decision.toLowerCase()} successfully.`);
      load();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  function renderUnitSwitcher() {
    if (isCentral && allProvinces.length > 0) {
      return (
        <View style={styles.switcherBox}>
          <Text style={styles.switcherLabel}>Assign Province Cabinet for:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.switcherScroll}>
            {allProvinces.map((p) => {
              const active = ctx?.unitLevel === 'PROVINCE' && String(ctx?.unitId) === String(p._id);
              return (
                <TouchableOpacity
                  key={p._id}
                  style={[styles.switcherPill, active && styles.switcherPillActive]}
                  onPress={() => setCtx({ unitLevel: 'PROVINCE', unitId: p._id, unitName: p.name })}
                >
                  <Text style={[styles.switcherPillText, active && styles.switcherPillTextActive]}>
                    {p.name}{p.code ? ` (${p.code})` : ''}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      );
    }

    if (isProvince && districtsInProvince.length > 0) {
      return (
        <View style={styles.switcherBox}>
          <Text style={styles.switcherLabel}>Assign District Cabinet for:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.switcherScroll}>
            {districtsInProvince.map((d) => {
              const active = ctx?.unitLevel === 'DISTRICT' && String(ctx?.unitId) === String(d._id);
              return (
                <TouchableOpacity
                  key={d._id}
                  style={[styles.switcherPill, active && styles.switcherPillActive]}
                  onPress={() => setCtx({ unitLevel: 'DISTRICT', unitId: d._id, unitName: d.name })}
                >
                  <Text style={[styles.switcherPillText, active && styles.switcherPillTextActive]}>
                    {d.name}{d.code ? ` (${d.code})` : ''}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      );
    }

    if (isDistrict && areasInDistrict.length > 0) {
      return (
        <View style={styles.switcherBox}>
          <Text style={styles.switcherLabel}>Assign Area Cabinet for:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.switcherScroll}>
            {areasInDistrict.map((a) => {
              const active = ctx?.unitLevel === 'AREA' && String(ctx?.unitId) === String(a._id);
              return (
                <TouchableOpacity
                  key={a._id}
                  style={[styles.switcherPill, active && styles.switcherPillActive]}
                  onPress={() => setCtx({ unitLevel: 'AREA', unitId: a._id, unitName: a.name })}
                >
                  <Text style={[styles.switcherPillText, active && styles.switcherPillTextActive]}>
                    {a.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      );
    }

    if (isArea && basicUnitsInArea.length > 0) {
      return (
        <View style={styles.switcherBox}>
          <Text style={styles.switcherLabel}>Assign Basic Unit Cabinet for:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.switcherScroll}>
            {basicUnitsInArea.map((b) => {
              const active = ctx?.unitLevel === 'BASIC_UNIT' && String(ctx?.unitId) === String(b._id);
              return (
                <TouchableOpacity
                  key={b._id}
                  style={[styles.switcherPill, active && styles.switcherPillActive]}
                  onPress={() => setCtx({ unitLevel: 'BASIC_UNIT', unitId: b._id, unitName: b.name })}
                >
                  <Text style={[styles.switcherPillText, active && styles.switcherPillTextActive]}>
                    {b.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      );
    }

    return null;
  }

  function renderRoleCard({ item: row }) {
    const isFilled = row.state === 'FILLED';
    const roleName = ROLE_LABEL[row.roleCode] || row.customRoleName || row.roleCode;

    return (
      <Card style={styles.card}>
        <View style={styles.cardTop}>
          <View style={{ flex: 1 }}>
            <View style={styles.roleTitleRow}>
              <Text style={styles.roleTitle}>{roleName}</Text>
              {row.isCustom ? <Badge label="CUSTOM" status="ACTIVE" style={{ paddingVertical: 1 }} /> : null}
            </View>
            <View style={styles.roleBadgeRow}>
              <Badge
                label={row.isMandatory ? 'Required' : 'Optional'}
                status={row.isMandatory ? 'ACTIVE' : 'INACTIVE'}
              />
              <Badge
                label={isFilled ? 'Filled' : 'Vacant'}
                status={isFilled ? 'ACTIVE' : 'PENDING_APPROVAL'}
              />
            </View>
          </View>
        </View>

        <View style={styles.cardDivider} />

        <View style={styles.cardBottom}>
          {isFilled ? (
            <View style={styles.memberInfoRow}>
              <Avatar name={row.member?.fullName || '?'} size={38} />
              <View style={{ flex: 1, marginLeft: Spacing.sm }}>
                <Text style={styles.memberName}>{row.member?.fullName || '—'}</Text>
                <Text style={styles.memberMeta}>
                  {row.member?.phone ? `📞 ${row.member.phone}` : ''}
                  {row.member?.memberId ? ` · ID: ${row.member.memberId}` : ''}
                </Text>
                {row.assignment?.startedAt ? (
                  <Text style={styles.dateMeta}>Since {shortDate(row.assignment.startedAt)}</Text>
                ) : null}
              </View>
              {canAssignDirectly && (
                <TouchableOpacity
                  style={styles.endBtn}
                  onPress={() => {
                    setEndTarget(row);
                    setEndReason('RESIGNED');
                    setEndOpen(true);
                  }}
                >
                  <Text style={styles.endBtnText}>End role</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <View style={styles.vacantRow}>
              <Text style={styles.vacantText}>— vacant position —</Text>
              {canAssignDirectly && (
                <TouchableOpacity
                  style={styles.assignBtn}
                  onPress={() => {
                    setAssignForRole(row);
                    setPickedMemberId('');
                    setMemberSearch('');
                    setAssignOpen(true);
                  }}
                >
                  <Ionicons name="person-add" size={14} color="#fff" style={{ marginRight: 4 }} />
                  <Text style={styles.assignBtnText}>Assign</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      </Card>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerScope}>
            {ctx?.unitLevel ? `${ctx.unitLevel.replace('_', ' ')} CABINET` : 'CABINET'}
          </Text>
          <Text style={styles.headerTitle}>{ctx?.unitName || 'Cabinet'}</Text>
          <Text style={styles.headerSub}>
            {isCentral
              ? 'Assign Sobayi (Provincial) Executive roles for this province.'
              : 'Appoint office-holders and review active cabinet positions.'}
          </Text>
        </View>
      </View>

      {/* Subordinate Unit Switcher */}
      {renderUnitSwitcher()}

      <ScrollView contentContainerStyle={styles.content}>
        {loading && <ActivityIndicator style={{ margin: 20 }} color={Colors.primary} />}

        {/* Pending Proposals Section */}
        {!secretaryReadOnly && !isSeniorMawinOp && !isPresidentOnly && pending.length > 0 && (
          <View style={styles.pendingSection}>
            <Text style={styles.sectionHeader}>Pending Proposals ({pending.length})</Text>
            {pending.map((p) => (
              <Card key={p._id} style={styles.pendingCard}>
                <View style={styles.pendingRow}>
                  <Avatar name={p.memberId?.fullName || '?'} size={38} />
                  <View style={{ flex: 1, marginLeft: Spacing.sm }}>
                    <Text style={styles.memberName}>{p.memberId?.fullName || '—'}</Text>
                    <Text style={styles.pendingRole}>
                      {ROLE_LABEL[p.roleCode] || p.customRoleName || p.roleCode}
                    </Text>
                    {p.initiatedBy?.fullName ? (
                      <Text style={styles.dateMeta}>Proposed by {p.initiatedBy.fullName}</Text>
                    ) : null}
                  </View>
                  <View style={styles.decideActionRow}>
                    <TouchableOpacity
                      style={styles.approveBtn}
                      onPress={() => handleDecide(p, 'APPROVED')}
                      disabled={busy}
                    >
                      <Ionicons name="checkmark" size={16} color="#fff" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.rejectBtn}
                      onPress={() => handleDecide(p, 'REJECTED')}
                      disabled={busy}
                    >
                      <Ionicons name="close" size={16} color="#fff" />
                    </TouchableOpacity>
                  </View>
                </View>
              </Card>
            ))}
          </View>
        )}

        {/* Cabinet Roles List */}
        <Text style={styles.sectionHeader}>Cabinet Roles ({cabinet.length})</Text>
        {cabinet.length === 0 && !loading && (
          <EmptyState
            icon="🏛️"
            title="No cabinet roles"
            message="No cabinet template found for this unit level."
          />
        )}
        {cabinet.map((row) => (
          <View key={row._id}>{renderRoleCard({ item: row })}</View>
        ))}
      </ScrollView>

      {/* Assign Role Modal */}
      <Modal
        visible={assignOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => { if (!busy) setAssignOpen(false); }}
      >
        <SafeAreaView style={styles.modalSafe}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={{ flex: 1 }}
          >
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>
                  Assign {ROLE_LABEL[assignForRole?.roleCode] || assignForRole?.customRoleName || assignForRole?.roleCode}
                </Text>
                <Text style={styles.modalSub}>
                  {ctx?.unitName} ({filteredMembers.length} eligible members)
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => { if (!busy) setAssignOpen(false); }}
                disabled={busy}
                style={{ padding: 4 }}
              >
                <Ionicons name="close" size={22} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalSearchWrap}>
              <Ionicons name="search-outline" size={18} color={Colors.textMuted} style={{ marginRight: 8 }} />
              <TextInput
                style={styles.modalSearchInput}
                value={memberSearch}
                onChangeText={setMemberSearch}
                placeholder="Filter members by name, CNIC or phone…"
                placeholderTextColor={Colors.textLight}
                autoCapitalize="none"
              />
              {memberSearch.length > 0 && (
                <TouchableOpacity onPress={() => setMemberSearch('')}>
                  <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
                </TouchableOpacity>
              )}
            </View>

            <ScrollView contentContainerStyle={styles.memberPickerList} keyboardShouldPersistTaps="handled">
              {filteredMembers.length === 0 && (
                <Text style={styles.noMembersText}>
                  {members.length === 0
                    ? 'No active members registered in this unit yet.'
                    : 'No members match your search.'}
                </Text>
              )}
              {filteredMembers.map((m) => {
                const isSelected = pickedMemberId === m._id;
                return (
                  <TouchableOpacity
                    key={m._id}
                    style={[styles.memberCard, isSelected && styles.memberCardSelected]}
                    onPress={() => setPickedMemberId(m._id)}
                  >
                    <Avatar name={m.fullName} size={40} />
                    <View style={{ flex: 1, marginLeft: Spacing.sm }}>
                      <Text style={[styles.memberPickName, isSelected && { color: Colors.primary }]}>
                        {m.fullName}
                      </Text>
                      <Text style={styles.memberPickMeta}>
                        {m.memberId ? `ID: ${m.memberId} · ` : ''}{m.cnic || 'No CNIC'} · {m.phone || 'No phone'}
                      </Text>
                    </View>
                    <View style={[styles.radioDot, isSelected && styles.radioDotSelected]}>
                      {isSelected && <View style={styles.radioDotInner} />}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => { if (!busy) setAssignOpen(false); }}
                disabled={busy}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, (!pickedMemberId || busy) && { opacity: 0.6 }]}
                onPress={handleAssignSubmit}
                disabled={!pickedMemberId || busy}
              >
                {busy ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.saveText}>Confirm Assignment</Text>
                )}
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {/* End Role Modal */}
      <Modal
        visible={endOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => { if (!busy) setEndOpen(false); }}
      >
        <SafeAreaView style={styles.modalSafe}>
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.modalTitle}>End Role Assignment</Text>
              <Text style={styles.modalSub}>
                {ROLE_LABEL[endTarget?.roleCode] || endTarget?.customRoleName || endTarget?.roleCode} — {endTarget?.member?.fullName}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => { if (!busy) setEndOpen(false); }}
              disabled={busy}
              style={{ padding: 4 }}
            >
              <Ionicons name="close" size={22} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.endModalBody}>
            <Text style={styles.endPrompt}>Why is this member leaving the office?</Text>
            {END_REASONS.map((r) => {
              const isSelected = endReason === r.value;
              return (
                <TouchableOpacity
                  key={r.value}
                  style={[styles.reasonCard, isSelected && styles.reasonCardSelected]}
                  onPress={() => setEndReason(r.value)}
                >
                  <View style={[styles.radioDot, isSelected && styles.radioDotSelected]}>
                    {isSelected && <View style={styles.radioDotInner} />}
                  </View>
                  <View style={{ flex: 1, marginLeft: Spacing.sm }}>
                    <Text style={[styles.reasonLabel, isSelected && { color: Colors.primary }]}>
                      {r.label}
                    </Text>
                    <Text style={styles.reasonHint}>{r.hint}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <View style={styles.modalFooter}>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={() => { if (!busy) setEndOpen(false); }}
              disabled={busy}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveBtn, { backgroundColor: Colors.error }]}
              onPress={handleEndSubmit}
              disabled={busy}
            >
              {busy ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.saveText}>End Role</Text>
              )}
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerScope: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.textMuted,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  headerTitle: { fontSize: FontSize.lg, fontWeight: '800', color: Colors.text, marginTop: 1 },
  headerSub: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  switcherBox: {
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing.lg,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  switcherLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  switcherScroll: {
    gap: 8,
  },
  switcherPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.pill,
    backgroundColor: Colors.surfaceAlt || '#f1f5f9',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  switcherPillActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  switcherPillText: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  switcherPillTextActive: {
    color: '#fff',
    fontWeight: '700',
  },
  content: {
    padding: Spacing.md,
    paddingBottom: 40,
  },
  sectionHeader: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: Spacing.sm,
    marginTop: Spacing.sm,
  },
  card: {
    marginBottom: Spacing.sm,
    padding: Spacing.md,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  roleTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 4,
  },
  roleTitle: {
    fontSize: FontSize.base,
    fontWeight: '700',
    color: Colors.text,
  },
  roleBadgeRow: {
    flexDirection: 'row',
    gap: 6,
  },
  cardDivider: {
    height: 1,
    backgroundColor: Colors.borderLight || '#f1f5f9',
    marginVertical: 10,
  },
  cardBottom: {
    minHeight: 38,
    justifyContent: 'center',
  },
  memberInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  memberName: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.text,
  },
  memberMeta: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: 1,
  },
  dateMeta: {
    fontSize: 10,
    color: Colors.textLight || Colors.textMuted,
    marginTop: 1,
  },
  endBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.sm,
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  endBtnText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.error,
  },
  vacantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  vacantText: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    fontStyle: 'italic',
  },
  assignBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.sm,
    flexDirection: 'row',
    alignItems: 'center',
  },
  assignBtnText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: '#fff',
  },

  // Pending Approvals
  pendingSection: {
    marginBottom: Spacing.md,
  },
  pendingCard: {
    marginBottom: Spacing.sm,
    padding: Spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: '#f59e0b',
  },
  pendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pendingRole: {
    fontSize: FontSize.xs,
    color: '#92400e',
    fontWeight: '600',
  },
  decideActionRow: {
    flexDirection: 'row',
    gap: 8,
    marginLeft: Spacing.sm,
  },
  approveBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rejectBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.error,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Modals
  modalSafe: { flex: 1, backgroundColor: Colors.background },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  modalTitle: { fontSize: FontSize.base, fontWeight: '700', color: Colors.text },
  modalSub: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  modalSearchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  modalSearchInput: {
    flex: 1,
    fontSize: FontSize.sm,
    color: Colors.text,
    paddingVertical: 6,
  },
  memberPickerList: {
    padding: Spacing.md,
    paddingBottom: 30,
  },
  noMembersText: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    textAlign: 'center',
    marginVertical: 20,
  },
  memberCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.sm,
  },
  memberCardSelected: {
    borderColor: Colors.primary,
    backgroundColor: '#f0f9ff',
  },
  memberPickName: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.text },
  memberPickMeta: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  radioDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: Spacing.sm,
  },
  radioDotSelected: {
    borderColor: Colors.primary,
  },
  radioDotInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.primary,
  },
  modalFooter: {
    flexDirection: 'row',
    gap: Spacing.md,
    padding: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.surface,
  },
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

  // End role modal
  endModalBody: {
    padding: Spacing.lg,
  },
  endPrompt: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: Spacing.md,
  },
  reasonCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.sm,
  },
  reasonCardSelected: {
    borderColor: Colors.primary,
    backgroundColor: '#f0f9ff',
  },
  reasonLabel: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.text,
  },
  reasonHint: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: 2,
  },
});
