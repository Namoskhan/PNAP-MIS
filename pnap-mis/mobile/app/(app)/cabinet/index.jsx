import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, Modal, SafeAreaView,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { api, errorMessage } from '../../../src/api/client';
import { useAuth } from '../../../src/context/AuthContext';
import { useUnit } from '../../../src/context/UnitContext';
import { canInitiateRole, canDecideRole, isHigherAdmin, isAreaAdmin, hasRole } from '../../../src/utils/permissions';
import { useToast } from '../../../src/components/Toast';
import Card from '../../../src/components/Card';
import Badge from '../../../src/components/Badge';
import Avatar from '../../../src/components/Avatar';
import EmptyState from '../../../src/components/EmptyState';
import { Colors, FontSize, Radius, Spacing } from '../../../src/constants/colors';
import { shortDate } from '../../../src/utils/formatters';

// These map to the endReason enum in server/src/validators/unitSchemas.js
const END_REASONS = [
  { value: 'RESIGNED', label: 'Resigned', hint: 'Stepped down voluntarily' },
  { value: 'TERM_ENDED', label: 'Term ended', hint: 'Served the full term' },
  { value: 'TRANSFERRED', label: 'Transferred', hint: 'Moved to another unit' },
  { value: 'REPLACED', label: 'Replaced', hint: 'Someone else has taken the office' },
  { value: 'EXPELLED', label: 'Expelled', hint: 'Removed on disciplinary grounds' },
  { value: 'DECEASED', label: 'Deceased', hint: 'Passed away' },
];

// Core assignable roles (matches web ROLE_LABEL map)
const ASSIGNABLE_ROLES = [
  'SECRETARY', 'SENIOR_MAWIN', 'FINANCE_SECRETARY',
  'PRESS_SECRETARY', 'CULTURE_SECRETARY', 'SPORTS_SECRETARY',
  'PRESIDENT', 'SR_VICE_PRESIDENT', 'VICE_PRESIDENT', 'GENERAL_SECRETARY',
  'CHAIRMAN', 'CO_CHAIRMAN', 'SR_VICE_CHAIRMAN', 'VICE_CHAIRMAN', 'FIRST_SECRETARY',
  'OTHER',
];

const ROLE_LABEL = {
  SECRETARY: 'Secretary', SENIOR_MAWIN: 'Senior Mawin Secretary',
  FINANCE_SECRETARY: 'Finance Secretary', PRESS_SECRETARY: 'Press Secretary',
  CULTURE_SECRETARY: 'Culture Secretary', SPORTS_SECRETARY: 'Sports Secretary',
  PRESIDENT: 'President / Saddar', SR_VICE_PRESIDENT: 'Senior Vice President',
  VICE_PRESIDENT: 'Vice President', GENERAL_SECRETARY: 'General Secretary',
  CHAIRMAN: 'Chairman', CO_CHAIRMAN: 'Co-Chairman',
  SR_VICE_CHAIRMAN: 'Senior Vice Chairman', VICE_CHAIRMAN: 'Vice Chairman',
  FIRST_SECRETARY: 'First Secretary', OTHER: 'Other',
};

export default function CabinetScreen() {
  const { user } = useAuth();
  const { ctx, setCtx } = useUnit();
  const toast = useToast();
  const canInitiate = canInitiateRole(user) || canDecideRole(user) || isHigherAdmin(user) || isAreaAdmin(user);

  const [cabinet, setCabinet] = useState([]);
  const [pending, setPending] = useState([]);
  const [members, setMembers] = useState([]);
  const [subordinates, setSubordinates] = useState([]);
  const [memberSearch, setMemberSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [assignOpen, setAssignOpen] = useState(false);
  const [endOpen, setEndOpen] = useState(null);  // holds the assignment being ended
  const [assignRole, setAssignRole] = useState('');
  const [assignMemberId, setAssignMemberId] = useState('');
  const [endReason, setEndReason] = useState('RESIGNED');
  const [saving, setSaving] = useState(false);

  // Load subordinate units for quick cabinet switching (e.g. Area Admin managing Basic Units)
  useEffect(() => {
    if (!user) return;
    if (hasRole(user, 'AREA_ADMIN') && user?.scope?.areaId) {
      api.get('/org/basic-units', { params: { areaId: user.scope.areaId } })
        .then((r) => setSubordinates(r.data?.data || []))
        .catch(() => {});
    } else if (hasRole(user, 'DISTRICT_ADMIN') && user?.scope?.districtId) {
      api.get('/org/areas', { params: { districtId: user.scope.districtId } })
        .then((r) => setSubordinates(r.data?.data || []))
        .catch(() => {});
    } else if (hasRole(user, 'PROVINCE_ADMIN') && user?.scope?.provinceId) {
      api.get('/org/districts', { params: { provinceId: user.scope.provinceId } })
        .then((r) => setSubordinates(r.data?.data || []))
        .catch(() => {});
    }
  }, [user]);

  async function load() {
    if (!ctx?.unitId) { setLoading(false); return; }
    setLoading(true);
    try {
      let resolvedUnitId = ctx.unitId;
      if (ctx.unitLevel === 'CENTRAL' && ctx.unitId === 'CENTRAL') {
        const cRes = await api.get('/org/central');
        resolvedUnitId = cRes.data?.data?._id;
        if (!resolvedUnitId) throw new Error('Could not resolve central unit');
      }

      const [cRes, pRes, mRes] = await Promise.all([
        api.get('/roles/cabinet', { params: { unitLevel: ctx.unitLevel, unitId: resolvedUnitId } }),
        api.get('/roles', { params: { unitLevel: ctx.unitLevel, unitId: resolvedUnitId, state: 'PROPOSED' } }),
        api.get('/members', {
          params: {
            status: 'ACTIVE',
            unitLevel: ctx.unitLevel,
            unitId: resolvedUnitId,
            ...(ctx.unitLevel === 'BASIC_UNIT' ? { basicUnitId: resolvedUnitId } :
                ctx.unitLevel === 'AREA' ? { areaId: resolvedUnitId } :
                ctx.unitLevel === 'DISTRICT' ? { districtId: resolvedUnitId } :
                ctx.unitLevel === 'PROVINCE' ? { provinceId: resolvedUnitId } : { scope: 'all' }),
            limit: 250,
          },
        }),
      ]);
      setCabinet(cRes.data?.data || []);
      setPending(pRes.data?.data || []);
      setMembers(mRes.data?.data || []);
    } catch { /* fail silently */ }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [ctx?.unitId, ctx?.unitLevel]);

  const filteredMembers = useMemo(() => {
    if (!memberSearch.trim()) return members;
    const q = memberSearch.toLowerCase();
    return members.filter((m) =>
      (m.fullName || '').toLowerCase().includes(q) ||
      (m.cnic || '').toLowerCase().includes(q) ||
      (m.memberId || '').toLowerCase().includes(q) ||
      (m.phone || '').toLowerCase().includes(q)
    );
  }, [members, memberSearch]);

  async function handleAssign() {
    if (!assignRole || !assignMemberId) {
      toast.error('Select a role and a member.'); return;
    }
    setSaving(true);
    try {
      let targetUnitId = ctx.unitId;
      if (ctx.unitLevel === 'CENTRAL' && ctx.unitId === 'CENTRAL') {
        const cRes = await api.get('/org/central');
        targetUnitId = cRes.data?.data?._id;
      }

      const r = await api.post('/roles', {
        roleCode: assignRole,
        memberId: assignMemberId,
        unitLevel: ctx.unitLevel,
        unitId: targetUnitId,
      });

      // Admins auto-approve upon creation
      if (canDecideRole(user) || isHigherAdmin(user) || isAreaAdmin(user)) {
        try {
          await api.post(`/roles/${r.data?.data?._id}/decide`, { decision: 'APPROVED' });
        } catch { /* ignore if already pending */ }
      }

      toast.success('Role assigned successfully.');
      setAssignOpen(false);
      setAssignRole('');
      setAssignMemberId('');
      load();
    } catch (e) { toast.error(errorMessage(e)); }
    finally { setSaving(false); }
  }

  async function handleEnd() {
    if (!endOpen || !endOpen.assignment) return;
    setSaving(true);
    try {
      await api.post(`/roles/${endOpen.assignment._id}/end`, { endReason: endReason });
      toast.success('Role assignment ended.');
      setEndOpen(null);
      setEndReason('RESIGNED');
      load();
    } catch (e) { toast.error(errorMessage(e)); }
    finally { setSaving(false); }
  }

  async function handleDecide(assignment, decision) {
    setSaving(true);
    const validDecision = decision === 'APPROVE' || decision === 'APPROVED' ? 'APPROVED' : 'REJECTED';
    try {
      await api.post(`/roles/${assignment._id}/decide`, { decision: validDecision });
      toast.success(validDecision === 'APPROVED' ? 'Assignment approved.' : 'Assignment rejected.');
      load();
    } catch (e) { toast.error(errorMessage(e)); }
    finally { setSaving(false); }
  }

  function handleSwitchUnit(sub) {
    const level = hasRole(user, 'AREA_ADMIN') ? 'BASIC_UNIT' :
                  hasRole(user, 'DISTRICT_ADMIN') ? 'AREA' : 'DISTRICT';
    setCtx({ unitLevel: level, unitId: sub._id, unitName: sub.name });
  }

  function renderAssignment({ item: a }) {
    const isFilled = a.state === 'FILLED';
    const roleName = ROLE_LABEL[a.roleCode] || a.customRoleName || a.roleCode;
    
    return (
      <Card style={styles.assignCard}>
        <View style={styles.assignRow}>
          {isFilled ? (
            <Avatar name={a.member?.fullName || '?'} size={44} color={Colors.primary} />
          ) : (
            <View style={[styles.avatarPlaceholder, { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' }]}>
              <Text style={{ fontSize: 20, color: Colors.border }}>👤</Text>
            </View>
          )}
          <View style={styles.assignMeta}>
            <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginBottom: 4 }}>
              <Badge label={roleName} color={Colors.text} bg={Colors.surfaceAlt} />
              {a.isMandatory ? <Badge label="Required" color="#166534" bg="#dcfce7" /> : <Badge label="Optional" color={Colors.textMuted} bg={Colors.surfaceAlt} />}
              {isFilled ? <Badge label="Filled" color="#166534" bg="#dcfce7" /> : <Badge label="Vacant" color="#b45309" bg="#fef3c7" />}
            </View>
            <Text style={[styles.assignName, !isFilled && { color: Colors.textMuted }]}>
              {isFilled ? a.member?.fullName || '—' : '— vacant —'}
            </Text>
            {isFilled && a.member?.phone ? (
              <Text style={{ fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 }}>📞 {a.member.phone}</Text>
            ) : null}
            {isFilled && a.assignment?.startedAt && (
              <Text style={styles.assignDate}>Since {shortDate(a.assignment.startedAt)}</Text>
            )}
          </View>
          {canInitiate && (
            isFilled ? (
              <TouchableOpacity onPress={() => { setEndOpen(a); setEndReason('RESIGNED'); }}>
                <Text style={styles.endBtn}>End</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity 
                style={styles.inlineAssignBtn} 
                onPress={() => { setAssignRole(a.roleCode); setAssignMemberId(''); setAssignOpen(true); }}
              >
                <Text style={styles.inlineAssignBtnText}>{canDecideRole(user) || isHigherAdmin(user) || isAreaAdmin(user) ? 'Assign' : 'Propose'}</Text>
              </TouchableOpacity>
            )
          )}
        </View>
      </Card>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>🏛️ Cabinet</Text>
          <Text style={styles.headerSub}>{ctx?.unitName || 'No unit selected'}</Text>
        </View>
      </View>

      {/* Subordinate Unit Switcher for Admins */}
      {subordinates.length > 0 && (
        <View style={styles.subSwitcher}>
          <Text style={styles.subLabel}>Switch Unit Cabinet:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.subList}>
            {subordinates.map((sub) => {
              const isSelected = String(ctx?.unitId) === String(sub._id);
              return (
                <TouchableOpacity
                  key={sub._id}
                  style={[styles.subChip, isSelected && styles.subChipActive]}
                  onPress={() => handleSwitchUnit(sub)}
                >
                  <Text style={[styles.subChipText, isSelected && styles.subChipTextActive]}>
                    {sub.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      <ScrollView contentContainerStyle={styles.content}>
        {loading && <ActivityIndicator style={{ margin: 20 }} color={Colors.primary} />}

        {/* Pending approvals section */}
        {pending.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>Pending Approval ({pending.length})</Text>
            {pending.map((a) => (
              <Card key={a._id} style={[styles.assignCard, styles.pendingCard]}>
                <View style={styles.assignRow}>
                  <Avatar name={a.member?.fullName || '?'} size={40} color="#f59e0b" />
                  <View style={styles.assignMeta}>
                    <Text style={styles.assignName}>{a.member?.fullName || '—'}</Text>
                    <Badge label={ROLE_LABEL[a.roleCode] || a.roleCode} color="#92400e" bg="#fef3c7" />
                  </View>
                  {canDecideRole(user) && (
                    <View style={styles.decideRow}>
                      <TouchableOpacity style={styles.approveBtn} onPress={() => handleDecide(a, 'APPROVE')} disabled={saving}>
                        <Text style={styles.approveBtnText}>✓</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.rejectBtn} onPress={() => handleDecide(a, 'REJECT')} disabled={saving}>
                        <Text style={styles.rejectBtnText}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              </Card>
            ))}
          </>
        )}

        {/* Active assignments */}
        <Text style={styles.sectionLabel}>Active Assignments ({cabinet.length})</Text>
        {cabinet.length === 0 && !loading && (
          <EmptyState icon="🏛️" title="No active assignments" subtitle="Tap '+ Assign' to add an office-holder." />
        )}
        {cabinet.map((a) => (
          <View key={a._id}>
            {renderAssignment({ item: a })}
          </View>
        ))}
      </ScrollView>

      {/* Assign Role Modal */}
      <Modal visible={assignOpen} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Assign Role</Text>
            <TouchableOpacity onPress={() => { setAssignOpen(false); setAssignRole(''); setAssignMemberId(''); }}>
              <Text style={styles.modalClose}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.modalBody}>
            <Text style={styles.fieldLabel}>Role *</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: Spacing.md }}>
              {ASSIGNABLE_ROLES.map((r) => (
                <TouchableOpacity
                  key={r}
                  style={[styles.rolePill, assignRole === r && styles.rolePillActive]}
                  onPress={() => setAssignRole(r)}
                >
                  <Text style={[styles.rolePillText, assignRole === r && styles.rolePillTextActive]}>
                    {ROLE_LABEL[r] || r}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={styles.fieldLabel}>Member *</Text>
            <TextInput
              style={styles.input}
              value={memberSearch}
              onChangeText={setMemberSearch}
              placeholder="Search member by name…"
              clearButtonMode="while-editing"
            />
            {filteredMembers.slice(0, 20).map((m) => (
              <TouchableOpacity
                key={m._id}
                style={[styles.memberRow, assignMemberId === m._id && styles.memberRowActive]}
                onPress={() => setAssignMemberId(m._id)}
              >
                <Avatar name={m.fullName} size={32} color={assignMemberId === m._id ? Colors.primary : Colors.textMuted} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.memberName}>{m.fullName}</Text>
                  {m.memberId && <Text style={styles.memberId}>{m.memberId}</Text>}
                </View>
                {assignMemberId === m._id && <Text style={styles.checkmark}>✓</Text>}
              </TouchableOpacity>
            ))}
          </ScrollView>
          <View style={styles.modalFooter}>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => { setAssignOpen(false); setAssignRole(''); setAssignMemberId(''); }}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.saveBtn} onPress={handleAssign} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>{canDecideRole(user) || isHigherAdmin(user) || isAreaAdmin(user) ? 'Assign Role' : 'Propose Assignment'}</Text>}
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>

      {/* End Assignment Modal */}
      <Modal visible={!!endOpen} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>End Assignment</Text>
            <TouchableOpacity onPress={() => setEndOpen(null)}>
              <Text style={styles.modalClose}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.modalBody}>
            <Text style={styles.endTarget}>
              Ending: {ROLE_LABEL[endOpen?.roleCode] || endOpen?.roleCode} — {endOpen?.member?.fullName}
            </Text>
            <Text style={styles.fieldLabel}>Reason *</Text>
            {END_REASONS.map((r) => (
              <TouchableOpacity
                key={r.value}
                style={[styles.optionRow, endReason === r.value && styles.optionRowActive]}
                onPress={() => setEndReason(r.value)}
              >
                <View style={[styles.optionDot, endReason === r.value && styles.optionDotActive]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.optionLabel}>{r.label}</Text>
                  <Text style={styles.optionHint}>{r.hint}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <View style={styles.modalFooter}>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setEndOpen(null)}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.saveBtn, { backgroundColor: Colors.error }]} onPress={handleEnd} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>End Assignment</Text>}
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', alignItems: 'center', padding: Spacing.lg, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
  headerTitle: { fontSize: FontSize.lg, fontWeight: '800', color: Colors.text },
  headerSub: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  createBtn: { backgroundColor: Colors.primary, borderRadius: 8, paddingHorizontal: Spacing.md, paddingVertical: 8 },
  createBtnText: { color: '#fff', fontWeight: '700', fontSize: FontSize.sm },
  subSwitcher: { backgroundColor: Colors.surfaceAlt, paddingVertical: Spacing.sm, paddingHorizontal: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border },
  subLabel: { fontSize: FontSize.xs - 1, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', marginBottom: 4 },
  subList: { flexDirection: 'row', gap: 6 },
  subChip: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 16, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  subChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  subChipText: { fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: '600' },
  subChipTextActive: { color: '#fff', fontWeight: '700' },
  content: { padding: Spacing.md, paddingBottom: 40 },
  sectionLabel: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: Spacing.sm, marginTop: Spacing.md },
  assignCard: { marginBottom: Spacing.sm },
  pendingCard: { borderLeftWidth: 3, borderLeftColor: '#f59e0b' },
  assignRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  assignMeta: { flex: 1, gap: 4 },
  assignName: { fontSize: FontSize.base, fontWeight: '700', color: Colors.text },
  assignDate: { fontSize: FontSize.xs, color: Colors.textMuted },
  endBtn: { fontSize: FontSize.sm, color: Colors.error, fontWeight: '700', padding: 8 },
  decideRow: { flexDirection: 'row', gap: 8 },
  approveBtn: { backgroundColor: Colors.success, width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  approveBtnText: { color: '#fff', fontWeight: '700' },
  rejectBtn: { backgroundColor: Colors.error, width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  rejectBtnText: { color: '#fff', fontWeight: '700' },
  inlineAssignBtn: { backgroundColor: Colors.primary, paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.sm },
  inlineAssignBtnText: { color: '#fff', fontWeight: '700', fontSize: FontSize.xs },

  // Modals
  modal: { flex: 1, backgroundColor: Colors.background },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: Spacing.lg, borderBottomWidth: 1, borderBottomColor: Colors.border },
  modalTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.text },
  modalClose: { fontSize: 20, color: Colors.textMuted, padding: 4 },
  modalBody: { flex: 1, padding: Spacing.lg },
  modalFooter: { flexDirection: 'row', gap: Spacing.md, padding: Spacing.lg, borderTopWidth: 1, borderTopColor: Colors.border },
  fieldLabel: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.text, marginBottom: 8, marginTop: Spacing.sm },
  rolePill: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: Colors.border, marginRight: 8, backgroundColor: Colors.background },
  rolePillActive: { borderColor: Colors.primary, backgroundColor: Colors.primary },
  rolePillText: { fontSize: FontSize.xs, color: Colors.textMuted },
  rolePillTextActive: { color: '#fff', fontWeight: '700' },
  input: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: 10, paddingHorizontal: Spacing.md, paddingVertical: 10, fontSize: FontSize.sm, color: Colors.text, marginBottom: Spacing.sm },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.sm, borderRadius: 8, borderWidth: 1, borderColor: Colors.borderLight, marginBottom: 6 },
  memberRowActive: { borderColor: Colors.primary, backgroundColor: '#eff6ff' },
  memberName: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.text },
  memberId: { fontSize: FontSize.xs, color: Colors.textMuted },
  checkmark: { color: Colors.primary, fontWeight: '700', fontSize: 16 },
  endTarget: { fontSize: FontSize.base, fontWeight: '600', color: Colors.text, marginBottom: Spacing.md, padding: Spacing.md, backgroundColor: Colors.surface, borderRadius: 8 },
  optionRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, paddingVertical: 10, paddingHorizontal: Spacing.sm, borderRadius: 8, borderWidth: 1, borderColor: Colors.border, marginBottom: 8 },
  optionRowActive: { borderColor: Colors.primary, backgroundColor: '#eff6ff' },
  optionDot: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: Colors.border, marginTop: 2 },
  optionDotActive: { borderColor: Colors.primary, backgroundColor: Colors.primary },
  optionLabel: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.text },
  optionHint: { fontSize: FontSize.xs, color: Colors.textMuted },
  cancelBtn: { flex: 1, borderRadius: 10, paddingVertical: 12, alignItems: 'center', backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  cancelText: { color: Colors.text, fontWeight: '600' },
  saveBtn: { flex: 2, borderRadius: 10, paddingVertical: 12, alignItems: 'center', backgroundColor: Colors.primary },
  saveText: { color: '#fff', fontWeight: '700', fontSize: FontSize.base },
});
