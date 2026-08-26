import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api, errorMessage } from '../../../../src/api/client';
import { useAuth } from '../../../../src/context/AuthContext';
import { hasPermission } from '../../../../src/utils/permissions';
import { useToast } from '../../../../src/components/Toast';
import Card from '../../../../src/components/Card';
import { Colors, FontSize, Radius, Spacing } from '../../../../src/constants/colors';

const SCOPES = ['GLOBAL', 'TIER', 'UNIT'];
const TIER_CODES = ['BASIC_UNIT', 'AREA', 'DISTRICT', 'PROVINCE', 'CENTRAL'];
const TRANSFER_DIRECTIONS = ['UP', 'DOWN', 'SAME_TIER'];

export default function UnitPoliciesScreen() {
  const { user } = useAuth();
  const toast = useToast();
  const canWrite = hasPermission(user, 'MANAGE_UNIT_CONFIG');

  const [policies, setPolicies] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [editing, setEditing] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);

  async function load() {
    setBusy(true); setErr('');
    try {
      const r = await api.get('/admin/units/policies');
      setPolicies(r.data?.data || []);
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function deletePolicy(p) {
    if (p.isSystem) return;
    Alert.alert(
      "Delete policy",
      `Delete this ${p.scope} policy? Records resolving to it will fall back to GLOBAL.`,
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Delete", 
          style: "destructive",
          onPress: async () => {
            try {
              await api.delete(`/admin/units/policies/${p._id}`);
              toast.success('Policy deleted.');
              load();
            } catch (e) { toast.error(errorMessage(e)); }
          }
        }
      ]
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      {err ? (
        <View style={styles.center}><Text style={styles.errorText}>{err}</Text></View>
      ) : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.listContent}>
          <View style={styles.hero}>
            <View style={styles.heroHeader}>
              <Ionicons name="scale" size={28} color={Colors.primary} />
              <Text style={styles.heroTitle}>Unit Policies</Text>
            </View>
            <Text style={styles.heroSub}>
              Quorum, attendance, finance thresholds, and transfer rules. Resolution: UNIT → TIER → GLOBAL.
            </Text>

            <View style={styles.actionButtons}>
              <TouchableOpacity style={[styles.btn, styles.btnSecondary, { flex: 1 }]} onPress={load} disabled={busy}>
                {busy ? <ActivityIndicator size="small" /> : <Text style={styles.btnSecondaryText}>Refresh</Text>}
              </TouchableOpacity>
              {canWrite && (
                <TouchableOpacity style={[styles.btn, { flex: 1 }]} onPress={() => setCreateOpen(true)}>
                  <Text style={styles.btnText}>+ New Override</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {policies.map(p => (
            <Card key={p._id} style={styles.card}>
              <View style={styles.cardHeader}>
                <Ionicons name={p.scope === 'GLOBAL' ? 'globe' : p.scope === 'TIER' ? 'pricetag' : 'business'} size={18} color={Colors.text} />
                <Text style={styles.cardTitle} numberOfLines={1}>
                  {p.scope}
                  {p.tierCode ? ` · ${p.tierCode}` : ''}
                  {p.unitId ? ` · unit ${String(p.unitId).slice(-6)}` : ''}
                  {p.isSystem ? ' · built-in' : ''}
                  {!p.isActive ? ' · inactive' : ''}
                </Text>
                <Text style={styles.cardCount}>v{p.policyVersion || 1}</Text>
              </View>
              
              <View style={styles.cardBody}>
                <PolicySummary policy={p} />
                
                <View style={styles.rowActions}>
                  <TouchableOpacity 
                    style={[styles.actionBtn, !canWrite && { opacity: 0.5 }]}
                    onPress={() => setEditing(p)} disabled={!canWrite}
                  >
                    <Text style={styles.actionBtnText}>Edit</Text>
                  </TouchableOpacity>
                  {!p.isSystem && canWrite && (
                    <TouchableOpacity style={[styles.actionBtn, styles.actionBtnDanger]} onPress={() => deletePolicy(p)}>
                      <Ionicons name="trash" size={14} color={Colors.danger} />
                      <Text style={styles.actionBtnTextDanger}>Delete</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </Card>
          ))}

          <View style={{ height: 40 }} />
        </ScrollView>
      )}

      <Modal visible={createOpen || !!editing} animationType="slide" presentationStyle="pageSheet">
        {(createOpen || editing) && (
          <PolicyDialog
            mode={editing ? 'edit' : 'create'}
            policy={editing}
            onClose={() => { setCreateOpen(false); setEditing(null); }}
            onSaved={() => { setCreateOpen(false); setEditing(null); load(); toast.success('Policy saved.'); }}
          />
        )}
      </Modal>
    </SafeAreaView>
  );
}

function PolicySummary({ policy }) {
  const m = policy.meeting || {};
  const f = policy.finance || {};
  const t = policy.transfer || {};
  const mb = policy.member || {};
  const lines = [];
  
  if (m.quorumMin) lines.push(`Quorum ≥ ${m.quorumMin}`);
  if (m.quorumWarn) lines.push(`Quorum warn @ ${m.quorumWarn}`);
  if (m.minAttendancePercent) lines.push(`Attendance ≥ ${m.minAttendancePercent}%`);
  if (m.requirePreviousReport) lines.push('Require previous report');
  if (f.expenseAutoApproveBelow) lines.push(`Auto-approve expense < Rs ${f.expenseAutoApproveBelow.toLocaleString()}`);
  if (f.expenseRequireSecondApproverAbove) lines.push(`2nd approver above Rs ${f.expenseRequireSecondApproverAbove.toLocaleString()}`);
  if (f.donationCnicRequiredAbove) lines.push(`Donation CNIC above Rs ${f.donationCnicRequiredAbove.toLocaleString()}`);
  if (Array.isArray(t.allowedDirections) && t.allowedDirections.length) lines.push(`Transfer: ${t.allowedDirections.join(', ')}`);
  if (t.requirePresidentApprovalAbove) lines.push(`President approval above Rs ${t.requirePresidentApprovalAbove.toLocaleString()}`);
  if (mb.requireApprovalAtTier) lines.push(`Member approval at ${mb.requireApprovalAtTier}`);
  if ((mb.minimumProfileFields || []).length) lines.push(`Profile fields: ${mb.minimumProfileFields.join(', ')}`);
  
  if (lines.length === 0) {
    return <Text style={styles.emptyText}>No rules set — falls through to less-specific scope.</Text>;
  }
  
  return (
    <View style={{ marginBottom: 12 }}>
      {lines.map((l, i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: Colors.textMuted }} />
          <Text style={{ fontSize: 13, color: Colors.text }}>{l}</Text>
        </View>
      ))}
    </View>
  );
}

function PolicyDialog({ mode, policy, onClose, onSaved }) {
  const isEdit = mode === 'edit';
  const [scope, setScope] = useState(policy?.scope || 'TIER');
  const [tierCode, setTierCode] = useState(policy?.tierCode || 'AREA');
  const [unitId, setUnitId] = useState(policy?.unitId ? String(policy.unitId) : '');
  
  const [meeting, setMeeting] = useState({
    quorumMin: policy?.meeting?.quorumMin?.toString() ?? '',
    quorumWarn: policy?.meeting?.quorumWarn?.toString() ?? '',
    minAttendancePercent: policy?.meeting?.minAttendancePercent?.toString() ?? '',
    requirePreviousReport: !!policy?.meeting?.requirePreviousReport,
  });
  
  const [finance, setFinance] = useState({
    expenseAutoApproveBelow: policy?.finance?.expenseAutoApproveBelow?.toString() ?? '',
    expenseRequireSecondApproverAbove: policy?.finance?.expenseRequireSecondApproverAbove?.toString() ?? '',
    donationCnicRequiredAbove: policy?.finance?.donationCnicRequiredAbove?.toString() ?? '',
  });
  
  const [transfer, setTransfer] = useState({
    allowedDirections: policy?.transfer?.allowedDirections || ['UP'],
    requirePresidentApprovalAbove: policy?.transfer?.requirePresidentApprovalAbove?.toString() ?? '',
  });
  
  const [isActive, setIsActive] = useState(policy?.isActive !== false);
  const [note, setNote] = useState(policy?.note || '');
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  function _num(v) { return v === '' || v == null ? undefined : Number(v); }

  async function save() {
    setBusy(true);
    try {
      const meetingClean = {};
      if (meeting.quorumMin !== '') meetingClean.quorumMin = _num(meeting.quorumMin);
      if (meeting.quorumWarn !== '') meetingClean.quorumWarn = _num(meeting.quorumWarn);
      if (meeting.minAttendancePercent !== '') meetingClean.minAttendancePercent = _num(meeting.minAttendancePercent);
      if (meeting.requirePreviousReport) meetingClean.requirePreviousReport = true;

      const financeClean = {};
      if (finance.expenseAutoApproveBelow !== '') financeClean.expenseAutoApproveBelow = _num(finance.expenseAutoApproveBelow);
      if (finance.expenseRequireSecondApproverAbove !== '') financeClean.expenseRequireSecondApproverAbove = _num(finance.expenseRequireSecondApproverAbove);
      if (finance.donationCnicRequiredAbove !== '') financeClean.donationCnicRequiredAbove = _num(finance.donationCnicRequiredAbove);

      const transferClean = {};
      if ((transfer.allowedDirections || []).length) transferClean.allowedDirections = transfer.allowedDirections;
      if (transfer.requirePresidentApprovalAbove !== '') transferClean.requirePresidentApprovalAbove = _num(transfer.requirePresidentApprovalAbove);

      const payload = {
        member: {},
        meeting: meetingClean,
        finance: financeClean,
        transfer: transferClean,
        isActive,
        note: note || undefined,
      };

      if (isEdit) {
        await api.patch(`/admin/units/policies/${policy._id}`, payload);
      } else {
        payload.scope = scope;
        if (scope === 'TIER' || scope === 'UNIT') payload.tierCode = tierCode;
        if (scope === 'UNIT') payload.unitId = unitId;
        await api.post('/admin/units/policies', payload);
      }
      onSaved();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  function toggleDirection(d) {
    setTransfer((p) => {
      const has = p.allowedDirections.includes(d);
      return { ...p, allowedDirections: has ? p.allowedDirections.filter((x) => x !== d) : [...p.allowedDirections, d] };
    });
  }

  return (
    <SafeAreaView style={styles.modalSafe}>
      <View style={styles.modalHeader}>
        <View>
          <Text style={styles.modalTitle}>{isEdit ? 'Edit policy' : 'New policy override'}</Text>
        </View>
        <TouchableOpacity style={styles.closeBtn} onPress={onClose} disabled={busy}>
          <Ionicons name="close" size={24} color={Colors.text} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalContent}>
        
        {!isEdit && (
          <View style={styles.formGroup}>
            <Text style={styles.label}>Scope</Text>
            <View style={styles.chipScrollWrapper}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {SCOPES.map(s => (
                  <TouchableOpacity 
                    key={s}
                    style={[styles.choiceChip, scope === s && styles.choiceChipActive]}
                    onPress={() => setScope(s)}
                  >
                    <Text style={[styles.choiceChipText, scope === s && styles.choiceChipTextActive]}>{s}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
            <Text style={styles.hintText}>GLOBAL is seeded — admin only creates TIER / UNIT overrides.</Text>
          </View>
        )}

        {!isEdit && (scope === 'TIER' || scope === 'UNIT') && (
          <View style={styles.formGroup}>
            <Text style={styles.label}>Tier</Text>
            <View style={styles.chipScrollWrapper}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {TIER_CODES.map(t => (
                  <TouchableOpacity 
                    key={t}
                    style={[styles.choiceChip, tierCode === t && styles.choiceChipActive]}
                    onPress={() => setTierCode(t)}
                  >
                    <Text style={[styles.choiceChipText, tierCode === t && styles.choiceChipTextActive]}>{t}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </View>
        )}

        {!isEdit && scope === 'UNIT' && (
          <View style={styles.formGroup}>
            <Text style={styles.label}>Unit</Text>
            <UnitDrillDownPicker tierCode={tierCode} value={unitId} onChange={setUnitId} />
          </View>
        )}

        <Text style={styles.sectionHeader}>Meeting Rules</Text>
        <View style={styles.cardSection}>
          <View style={styles.formGroup}>
            <Text style={styles.label}>Quorum minimum (hard fail)</Text>
            <TextInput style={styles.input} value={meeting.quorumMin} onChangeText={v => setMeeting(p => ({ ...p, quorumMin: v }))} keyboardType="number-pad" />
          </View>
          <View style={styles.formGroup}>
            <Text style={styles.label}>Quorum warning (soft)</Text>
            <TextInput style={styles.input} value={meeting.quorumWarn} onChangeText={v => setMeeting(p => ({ ...p, quorumWarn: v }))} keyboardType="number-pad" />
          </View>
          <View style={styles.formGroup}>
            <Text style={styles.label}>Min attendance %</Text>
            <TextInput style={styles.input} value={meeting.minAttendancePercent} onChangeText={v => setMeeting(p => ({ ...p, minAttendancePercent: v }))} keyboardType="number-pad" />
          </View>
          <TouchableOpacity style={[styles.toggleRow, { marginBottom: 0 }]} onPress={() => setMeeting(p => ({ ...p, requirePreviousReport: !p.requirePreviousReport }))}>
            <View style={[styles.capCheckbox, meeting.requirePreviousReport && styles.capCheckboxOn]}>
              {meeting.requirePreviousReport && <Ionicons name="checkmark" size={14} color="#fff" />}
            </View>
            <Text style={styles.toggleText}>Require previous report attached</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionHeader}>Finance Rules</Text>
        <View style={styles.cardSection}>
          <View style={styles.formGroup}>
            <Text style={styles.label}>Auto-approve below (PKR)</Text>
            <TextInput style={styles.input} value={finance.expenseAutoApproveBelow} onChangeText={v => setFinance(p => ({ ...p, expenseAutoApproveBelow: v }))} keyboardType="number-pad" />
          </View>
          <View style={styles.formGroup}>
            <Text style={styles.label}>Second approver above (PKR)</Text>
            <TextInput style={styles.input} value={finance.expenseRequireSecondApproverAbove} onChangeText={v => setFinance(p => ({ ...p, expenseRequireSecondApproverAbove: v }))} keyboardType="number-pad" />
          </View>
          <View style={styles.formGroup}>
            <Text style={styles.label}>Donation CNIC above (PKR)</Text>
            <TextInput style={styles.input} value={finance.donationCnicRequiredAbove} onChangeText={v => setFinance(p => ({ ...p, donationCnicRequiredAbove: v }))} keyboardType="number-pad" />
          </View>
        </View>

        <Text style={styles.sectionHeader}>Transfer Rules</Text>
        <View style={styles.cardSection}>
          <Text style={styles.label}>Allowed directions</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: Spacing.md }}>
            {TRANSFER_DIRECTIONS.map(d => {
              const on = transfer.allowedDirections.includes(d);
              return (
                <TouchableOpacity
                  key={d}
                  style={[styles.choiceChip, on && styles.choiceChipActive]}
                  onPress={() => toggleDirection(d)}
                >
                  <Text style={[styles.choiceChipText, on && styles.choiceChipTextActive]}>{d}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          
          <View style={styles.formGroup}>
            <Text style={styles.label}>President approval above (PKR)</Text>
            <TextInput style={styles.input} value={transfer.requirePresidentApprovalAbove} onChangeText={v => setTransfer(p => ({ ...p, requirePresidentApprovalAbove: v }))} keyboardType="number-pad" />
          </View>
        </View>

        <View style={[styles.cardSection, { marginTop: Spacing.lg }]}>
          <TouchableOpacity style={[styles.toggleRow, { opacity: policy?.isSystem ? 0.5 : 1 }]} disabled={policy?.isSystem} onPress={() => setIsActive(v => !v)}>
            <View style={[styles.capCheckbox, isActive && styles.capCheckboxOn]}>
              {isActive && <Ionicons name="checkmark" size={14} color="#fff" />}
            </View>
            <Text style={styles.toggleText}>Active</Text>
          </TouchableOpacity>
          <View style={[styles.formGroup, { marginBottom: 0 }]}>
            <Text style={styles.label}>Note (optional)</Text>
            <TextInput style={styles.input} value={note} onChangeText={setNote} maxLength={500} placeholder="Why this override exists" />
          </View>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      <View style={styles.modalFooter}>
        <TouchableOpacity style={[styles.btn, styles.btnSecondary]} onPress={onClose} disabled={busy}>
          <Text style={styles.btnSecondaryText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btn, busy && { opacity: 0.7 }]} onPress={save} disabled={busy}>
          <Text style={styles.btnText}>{busy ? 'Saving...' : (isEdit ? 'Save Changes' : 'Create')}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

function UnitDrillDownPicker({ tierCode, value, onChange }) {
  const [provinces, setProvinces] = useState([]);
  const [districts, setDistricts] = useState([]);
  const [areas, setAreas] = useState([]);
  const [basicUnits, setBasicUnits] = useState([]);
  const [pId, setPId] = useState('');
  const [dId, setDId] = useState('');
  const [aId, setAId] = useState('');
  const [bId, setBId] = useState('');
  const [busy, setBusy] = useState(false);

  const needs = useMemo(() => {
    switch (tierCode) {
      case 'CENTRAL': return [];
      case 'PROVINCE': return ['province'];
      case 'DISTRICT': return ['province', 'district'];
      case 'AREA': return ['province', 'district', 'area'];
      case 'BASIC_UNIT': return ['province', 'district', 'area', 'basicUnit'];
      default: return [];
    }
  }, [tierCode]);

  useEffect(() => {
    if (!needs.includes('province')) return;
    let cancelled = false;
    setBusy(true);
    api.get('/org/provinces')
      .then((r) => { if (!cancelled) setProvinces(r.data?.data || []); })
      .finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, [needs]);

  useEffect(() => {
    if (!pId || !needs.includes('district')) { setDistricts([]); return; }
    let cancelled = false;
    api.get('/org/districts', { params: { provinceId: pId } })
      .then((r) => { if (!cancelled) setDistricts(r.data?.data || []); });
    return () => { cancelled = true; };
  }, [pId, needs]);

  useEffect(() => {
    if (!dId || !needs.includes('area')) { setAreas([]); return; }
    let cancelled = false;
    api.get('/org/areas', { params: { districtId: dId } })
      .then((r) => { if (!cancelled) setAreas(r.data?.data || []); });
    return () => { cancelled = true; };
  }, [dId, needs]);

  useEffect(() => {
    if (!aId || !needs.includes('basicUnit')) { setBasicUnits([]); return; }
    let cancelled = false;
    api.get('/org/basic-units', { params: { areaId: aId } })
      .then((r) => { if (!cancelled) setBasicUnits(r.data?.data || []); });
    return () => { cancelled = true; };
  }, [aId, needs]);

  useEffect(() => { setDId(''); setAId(''); setBId(''); }, [pId]);
  useEffect(() => { setAId(''); setBId(''); }, [dId]);
  useEffect(() => { setBId(''); }, [aId]);

  useEffect(() => {
    let leaf = '';
    if (tierCode === 'PROVINCE') leaf = pId;
    else if (tierCode === 'DISTRICT') leaf = dId;
    else if (tierCode === 'AREA') leaf = aId;
    else if (tierCode === 'BASIC_UNIT') leaf = bId;
    if (leaf !== (value || '')) onChange(leaf);
  }, [tierCode, pId, dId, aId, bId]);

  if (tierCode === 'CENTRAL') {
    return <Text style={styles.hintText}>CENTRAL is a singleton — no unit selection needed.</Text>;
  }

  const renderSelect = (label, items, selectedId, onSelect, disabled) => (
    <View style={{ marginBottom: 12 }}>
      <Text style={[styles.label, { fontSize: 12, color: Colors.textMuted }]}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -Spacing.lg, paddingHorizontal: Spacing.lg }}>
        {items.map(item => (
          <TouchableOpacity 
            key={item._id}
            style={[styles.choiceChip, selectedId === item._id && styles.choiceChipActive]}
            onPress={() => onSelect(item._id)}
            disabled={disabled}
          >
            <Text style={[styles.choiceChipText, selectedId === item._id && styles.choiceChipTextActive]}>{item.name}</Text>
          </TouchableOpacity>
        ))}
        {items.length === 0 && <Text style={styles.emptyText}>No items available</Text>}
      </ScrollView>
    </View>
  );

  return (
    <View style={{ marginTop: 8 }}>
      {needs.includes('province') && renderSelect('Province', provinces, pId, setPId, busy)}
      {needs.includes('district') && renderSelect('District', districts, dId, setDId, !pId)}
      {needs.includes('area') && renderSelect('Area', areas, aId, setAId, !dId)}
      {needs.includes('basicUnit') && renderSelect('Basic Unit', basicUnits, bId, setBId, !aId)}
      
      {value ? (
        <Text style={[styles.hintText, { marginTop: 4 }]}>Selected ID: {String(value).slice(-8)}</Text>
      ) : null}
    </View>
  );
}


const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: Spacing.xl },
  errorText: { color: Colors.danger, fontSize: FontSize.base, textAlign: 'center' },
  
  hero: { marginBottom: Spacing.xl },
  heroHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.sm },
  heroTitle: { fontSize: FontSize.xxl, fontWeight: '800', color: Colors.text },
  heroSub: { fontSize: FontSize.sm, color: Colors.textMuted, lineHeight: 20 },
  listContent: { padding: Spacing.lg, paddingBottom: 80 },
  actionButtons: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.md },

  card: { marginBottom: Spacing.md, padding: 0, overflow: 'hidden' },
  cardHeader: { 
    flexDirection: 'row', alignItems: 'center', padding: Spacing.md, 
    backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border, gap: 8
  },
  cardTitle: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.text, flex: 1 },
  cardCount: { fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: '600', fontFamily: 'Courier' },
  cardBody: { padding: Spacing.md },
  
  rowActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  actionBtn: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: Colors.surface, borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border },
  actionBtnText: { fontSize: FontSize.xs, fontWeight: '600', color: Colors.text },
  actionBtnDanger: { borderColor: Colors.danger + '50', flexDirection: 'row', alignItems: 'center', gap: 4 },
  actionBtnTextDanger: { fontSize: FontSize.xs, fontWeight: '600', color: Colors.danger },

  modalSafe: { flex: 1, backgroundColor: Colors.background },
  modalHeader: { 
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', 
    padding: Spacing.lg, borderBottomWidth: 1, borderBottomColor: Colors.border 
  },
  modalTitle: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.text },
  closeBtn: { padding: 4 },
  modalScroll: { flex: 1 },
  modalContent: { padding: Spacing.lg },
  
  sectionHeader: { fontSize: FontSize.base, fontWeight: '700', color: Colors.text, marginTop: Spacing.lg, marginBottom: Spacing.sm },
  
  formGroup: { marginBottom: Spacing.md },
  label: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.text, marginBottom: 6 },
  input: { 
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, 
    borderRadius: Radius.base, padding: 12, fontSize: FontSize.base, color: Colors.text 
  },
  hintText: { fontSize: 12, color: Colors.textMuted, marginTop: 4 },
  emptyText: { fontSize: 13, color: Colors.textMuted, fontStyle: 'italic' },
  
  chipScrollWrapper: { marginHorizontal: -Spacing.lg, paddingHorizontal: Spacing.lg },
  choiceChip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: Radius.base, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, marginRight: 8 },
  choiceChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  choiceChipText: { fontSize: FontSize.sm, color: Colors.text, fontWeight: '500' },
  choiceChipTextActive: { color: '#fff' },

  cardSection: { 
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, 
    borderRadius: Radius.base, padding: Spacing.md
  },
  toggleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.md },
  toggleText: { fontSize: FontSize.sm, color: Colors.text, fontWeight: '500', flex: 1 },
  capCheckbox: { 
    width: 20, height: 20, borderRadius: 4, 
    borderWidth: 1, borderColor: Colors.border, 
    marginRight: 10, justifyContent: 'center', alignItems: 'center' 
  },
  capCheckboxOn: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  
  modalFooter: { 
    flexDirection: 'row', padding: Spacing.lg, 
    borderTopWidth: 1, borderTopColor: Colors.border, backgroundColor: Colors.background,
    gap: Spacing.md
  },
  btn: { flex: 1, backgroundColor: Colors.primary, paddingVertical: 14, borderRadius: Radius.base, alignItems: 'center', justifyContent: 'center' },
  btnText: { color: '#fff', fontSize: FontSize.base, fontWeight: '700' },
  btnSecondary: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  btnSecondaryText: { color: Colors.text, fontSize: FontSize.base, fontWeight: '600' },
});
