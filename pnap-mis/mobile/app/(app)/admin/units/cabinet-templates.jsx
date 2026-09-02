import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
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
import { confirmAction } from '../../../../src/utils/dialog';
import { useToast } from '../../../../src/components/Toast';
import Card from '../../../../src/components/Card';
import Badge from '../../../../src/components/Badge';
import EmptyState from '../../../../src/components/EmptyState';
import { Colors, FontSize, Radius, Spacing } from '../../../../src/constants/colors';

const TIER_CODES = ['CENTRAL', 'PROVINCE', 'DISTRICT', 'AREA', 'BASIC_UNIT'];
const APPLIES_TO_BODY = ['BOTH', 'EXECUTIVE', 'COMMITTEE'];

export default function CabinetTemplatesScreen() {
  const { user } = useAuth();
  const toast = useToast();
  const canWrite = hasPermission(user, 'MANAGE_UNIT_CONFIG');

  const [templates, setTemplates] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [editing, setEditing] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [tierFilter, setTierFilter] = useState('');

  async function load() {
    setBusy(true); setErr('');
    try {
      const params = tierFilter ? { tier: tierFilter } : {};
      const r = await api.get('/admin/units/cabinet-templates', { params });
      setTemplates(r.data?.data || []);
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => { load(); }, [tierFilter]);

  async function rollout(t) {
    try {
      const r = await api.post(`/admin/units/cabinet-templates/${t._id}/rollout`);
      const n = r.data?.data?.rolledOutTo || 0;
      toast.success(n > 0 ? `Rolled out to ${n} unit(s).` : 'Already present on all units.');
      load();
    } catch (e) { toast.error(errorMessage(e)); }
  }

  async function deleteTemplate(t) {
    if (t.isSystem || !canWrite) return;
    confirmAction(
      'Delete slot',
      `Delete custom slot "${t.roleCode}" at ${t.tierCode}? Vacant slots on units will also be removed.`,
      async () => {
        try {
          const r = await api.delete(`/admin/units/cabinet-templates/${t._id}`);
          const removed = r.data?.data?.vacantSlotsRemoved || 0;
          toast.success(removed ? `Template deleted; ${removed} vacant slot(s) removed.` : 'Template deleted.');
          load();
        } catch (e) { toast.error(errorMessage(e)); }
      },
      { confirmText: "Delete", destructive: true }
    );
  }

  const groups = useMemo(() => {
    const g = {};
    for (const t of templates) {
      (g[t.tierCode] = g[t.tierCode] || []).push(t);
    }
    return g;
  }, [templates]);

  return (
    <SafeAreaView style={styles.safe}>
      {err ? (
        <View style={styles.center}><Text style={styles.errorText}>{err}</Text></View>
      ) : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.listContent}>
          <View style={styles.hero}>
            <View style={styles.heroHeader}>
              <Ionicons name="people" size={28} color={Colors.primary} />
              <Text style={styles.heroTitle}>Cabinet Structure</Text>
            </View>
            <Text style={styles.heroSub}>
              Cabinet slots per tier — required vs optional, term length, body applicability, propose/decide gating.
            </Text>

            <View style={styles.heroActions}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={styles.filterContent}>
                <TouchableOpacity 
                  style={[styles.filterChip, !tierFilter && styles.filterChipActive]}
                  onPress={() => setTierFilter('')}
                >
                  <Text style={[styles.filterChipText, !tierFilter && styles.filterChipTextActive]}>All Tiers</Text>
                </TouchableOpacity>
                {TIER_CODES.map(t => (
                  <TouchableOpacity 
                    key={t}
                    style={[styles.filterChip, tierFilter === t && styles.filterChipActive]}
                    onPress={() => setTierFilter(t)}
                  >
                    <Text style={[styles.filterChipText, tierFilter === t && styles.filterChipTextActive]}>{t}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              
              <View style={styles.actionButtons}>
                <TouchableOpacity style={[styles.btn, styles.btnSecondary, { flex: 1 }]} onPress={load} disabled={busy}>
                  {busy ? <ActivityIndicator size="small" /> : <Text style={styles.btnSecondaryText}>Refresh</Text>}
                </TouchableOpacity>
                {canWrite && (
                  <TouchableOpacity style={[styles.btn, { flex: 1 }]} onPress={() => setCreateOpen(true)}>
                    <Text style={styles.btnText}>+ New Slot</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>

          {TIER_CODES.filter(t => groups[t]?.length > 0).map(tierCode => (
            <Card key={tierCode} style={styles.card}>
              <View style={styles.cardHeader}>
                <Ionicons name="pricetag" size={18} color={Colors.text} />
                <Text style={styles.cardTitle}>{tierCode}</Text>
                <Text style={styles.cardCount}>{groups[tierCode].length} slot(s)</Text>
              </View>

              {groups[tierCode].map(t => (
                <View key={t._id} style={[styles.row, t.isSystem && styles.rowLocked]}>
                  <View style={styles.rowTop}>
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>{t.roleCode.charAt(0)}</Text>
                      {t.isSystem && <View style={styles.lockBadge}><Ionicons name="lock-closed" size={10} color="#fff" /></View>}
                    </View>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                        <Text style={styles.roleCode}>{t.roleCode}</Text>
                        {t.isMandatory && <Badge label="required" color="#fff" bg={Colors.primary} />}
                        {!t.isSystem && <Badge label="custom" color={Colors.text} bg={Colors.surface} />}
                        {!t.isActive && <Badge label="inactive" color={Colors.danger} bg={Colors.danger + '20'} />}
                      </View>
                      <View style={styles.metaRow}>
                        <Text style={styles.metaText}>order {t.sortOrder}</Text>
                        <Text style={styles.metaDot}>·</Text>
                        <Text style={styles.metaText}>{t.appliesToBody}</Text>
                        <Text style={styles.metaDot}>·</Text>
                        <Text style={styles.metaText}>{t.termDays > 0 ? `${t.termDays}-day term` : 'indefinite'}</Text>
                      </View>
                    </View>
                  </View>
                  
                  <View style={styles.rowActions}>
                    <TouchableOpacity 
                      style={[styles.actionBtn, (!canWrite || !t.isActive) && { opacity: 0.5 }]}
                      onPress={() => rollout(t)} disabled={!canWrite || !t.isActive}
                    >
                      <Text style={styles.actionBtnText}>Rollout</Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                      style={[styles.actionBtn, !canWrite && { opacity: 0.5 }]}
                      onPress={() => setEditing(t)} disabled={!canWrite}
                    >
                      <Text style={styles.actionBtnText}>Edit</Text>
                    </TouchableOpacity>
                    {!t.isSystem && canWrite && (
                      <TouchableOpacity style={[styles.actionBtn, styles.actionBtnDanger]} onPress={() => deleteTemplate(t)}>
                        <Ionicons name="trash" size={14} color={Colors.danger} />
                        <Text style={styles.actionBtnTextDanger}>Delete</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              ))}
            </Card>
          ))}

          {!busy && Object.keys(groups).length === 0 && (
            <EmptyState icon="albums" title="No cabinet templates match the current filter." />
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      )}

      <Modal visible={createOpen || !!editing} animationType="slide" presentationStyle="pageSheet">
        {(createOpen || editing) && (
          <CabinetTemplateDialog
            mode={editing ? 'edit' : 'create'}
            template={editing}
            onClose={() => { setCreateOpen(false); setEditing(null); }}
            onSaved={() => { setCreateOpen(false); setEditing(null); load(); toast.success('Slot saved.'); }}
          />
        )}
      </Modal>
    </SafeAreaView>
  );
}

function CabinetTemplateDialog({ mode, template, onClose, onSaved }) {
  const isEdit = mode === 'edit';
  const [tierCode, setTierCode] = useState(template?.tierCode || 'AREA');
  const [roleCode, setRoleCode] = useState(template?.roleCode || '');
  const [isMandatory, setIsMandatory] = useState(!!template?.isMandatory);
  const [sortOrder, setSortOrder] = useState(String(template?.sortOrder ?? 100));
  const [appliesToBody, setAppliesToBody] = useState(template?.appliesToBody || 'BOTH');
  const [termDays, setTermDays] = useState(String(template?.termDays ?? 0));
  const [isActive, setIsActive] = useState(template?.isActive !== false);
  const [rolloutToExistingUnits, setRolloutToExistingUnits] = useState(false);
  const [busy, setBusy] = useState(false);
  
  const toast = useToast();

  async function save() {
    setBusy(true);
    try {
      const payload = {
        isMandatory: !!isMandatory,
        sortOrder: parseInt(sortOrder, 10) || 100,
        appliesToBody,
        termDays: parseInt(termDays, 10) || 0,
        isActive: !!isActive,
      };
      if (isEdit) {
        await api.patch(`/admin/units/cabinet-templates/${template._id}`, payload);
      } else {
        payload.tierCode = tierCode;
        payload.roleCode = roleCode.toUpperCase();
        payload.rolloutToExistingUnits = !!rolloutToExistingUnits;
        await api.post('/admin/units/cabinet-templates', payload);
      }
      onSaved();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.modalSafe}>
      <View style={styles.modalHeader}>
        <View>
          <Text style={styles.modalTitle}>{isEdit ? 'Edit cabinet slot' : 'New cabinet slot'}</Text>
        </View>
        <TouchableOpacity style={styles.closeBtn} onPress={onClose} disabled={busy}>
          <Ionicons name="close" size={24} color={Colors.text} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalContent}>
        {isEdit && (
          <Text style={styles.hintTextLocked}>
            <Text style={{ fontFamily: 'Courier', fontWeight: 'bold' }}>{template.tierCode}:{template.roleCode}</Text> — tier and role code are locked once created.
          </Text>
        )}

        <View style={styles.formGroup}>
          <Text style={styles.label}>Tier</Text>
          <View style={styles.chipScrollWrapper}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {TIER_CODES.map(t => (
                <TouchableOpacity 
                  key={t}
                  style={[styles.choiceChip, tierCode === t && styles.choiceChipActive]}
                  onPress={() => setTierCode(t)}
                  disabled={isEdit}
                >
                  <Text style={[styles.choiceChipText, tierCode === t && styles.choiceChipTextActive]}>{t}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>Role code</Text>
          <TextInput 
            style={[styles.input, isEdit && { backgroundColor: Colors.background, color: Colors.textMuted }]}
            value={roleCode}
            onChangeText={(v) => setRoleCode(v.toUpperCase().replace(/[^A-Z0-9_]/g, ''))}
            editable={!isEdit}
            placeholder="YOUTH_COORDINATOR"
            maxLength={60}
          />
          <Text style={styles.hintText}>{isEdit ? 'Locked.' : 'Must already exist in the Role catalogue.'}</Text>
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>Sort order</Text>
          <TextInput 
            style={styles.input}
            value={sortOrder}
            onChangeText={setSortOrder}
            keyboardType="number-pad"
          />
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>Applies to body</Text>
          <View style={styles.chipScrollWrapper}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {APPLIES_TO_BODY.map(b => (
                <TouchableOpacity 
                  key={b}
                  style={[styles.choiceChip, appliesToBody === b && styles.choiceChipActive]}
                  onPress={() => setAppliesToBody(b)}
                >
                  <Text style={[styles.choiceChipText, appliesToBody === b && styles.choiceChipTextActive]}>{b}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>Term (days)</Text>
          <TextInput 
            style={styles.input}
            value={termDays}
            onChangeText={setTermDays}
            keyboardType="number-pad"
          />
          <Text style={styles.hintText}>0 = indefinite. Enforcement lands in a follow-up PR.</Text>
        </View>

        <View style={styles.cardSection}>
          <TouchableOpacity style={styles.toggleRow} onPress={() => setIsMandatory(v => !v)}>
            <View style={[styles.capCheckbox, isMandatory && styles.capCheckboxOn]}>
              {isMandatory && <Ionicons name="checkmark" size={14} color="#fff" />}
            </View>
            <Text style={styles.toggleText}>Mandatory slot (cabinet must fill this)</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.toggleRow, { marginBottom: !isEdit ? Spacing.md : 0 }]} onPress={() => setIsActive(v => !v)}>
            <View style={[styles.capCheckbox, isActive && styles.capCheckboxOn]}>
              {isActive && <Ionicons name="checkmark" size={14} color="#fff" />}
            </View>
            <Text style={styles.toggleText}>Active</Text>
          </TouchableOpacity>

          {!isEdit && (
            <TouchableOpacity style={[styles.toggleRow, { marginBottom: 0 }]} onPress={() => setRolloutToExistingUnits(v => !v)}>
              <View style={[styles.capCheckbox, rolloutToExistingUnits && styles.capCheckboxOn]}>
                {rolloutToExistingUnits && <Ionicons name="checkmark" size={14} color="#fff" />}
              </View>
              <Text style={styles.toggleText}>Roll out to all existing units immediately</Text>
            </TouchableOpacity>
          )}
        </View>

      </ScrollView>

      <View style={styles.modalFooter}>
        <TouchableOpacity style={[styles.btn, styles.btnSecondary]} onPress={onClose} disabled={busy}>
          <Text style={styles.btnSecondaryText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btn, (busy || (!isEdit && !roleCode)) && { opacity: 0.7 }]} onPress={save} disabled={busy || (!isEdit && !roleCode)}>
          <Text style={styles.btnText}>{busy ? 'Saving...' : (isEdit ? 'Save Changes' : 'Create')}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
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
  
  heroActions: { marginTop: Spacing.md },
  filterScroll: { marginBottom: Spacing.md },
  filterContent: { gap: 8 },
  filterChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: Radius.full, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  filterChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  filterChipText: { fontSize: FontSize.sm, color: Colors.text, fontWeight: '500' },
  filterChipTextActive: { color: '#fff' },
  actionButtons: { flexDirection: 'row', gap: Spacing.md },

  card: { marginBottom: Spacing.md, padding: 0, overflow: 'hidden' },
  cardHeader: { 
    flexDirection: 'row', alignItems: 'center', padding: Spacing.md, 
    backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border, gap: 8
  },
  cardTitle: { fontSize: FontSize.base, fontWeight: '700', color: Colors.text, flex: 1 },
  cardCount: { fontSize: FontSize.sm, color: Colors.textMuted, fontWeight: '600' },
  
  row: { padding: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border },
  rowLocked: { backgroundColor: Colors.background },
  rowTop: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
  
  avatar: { 
    width: 40, height: 40, borderRadius: Radius.full, 
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
    justifyContent: 'center', alignItems: 'center'
  },
  avatarText: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.text },
  lockBadge: { 
    position: 'absolute', bottom: -4, right: -4, 
    backgroundColor: Colors.text, borderRadius: 10, 
    width: 18, height: 18, justifyContent: 'center', alignItems: 'center',
    borderWidth: 1.5, borderColor: '#fff'
  },
  
  roleCode: { fontSize: FontSize.base, fontWeight: '700', color: Colors.text },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', marginTop: 4 },
  metaText: { fontSize: FontSize.xs, color: Colors.textMuted },
  metaDot: { fontSize: FontSize.xs, color: Colors.textMuted, marginHorizontal: 4 },
  
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
  
  formGroup: { marginBottom: Spacing.md },
  label: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.text, marginBottom: 6 },
  input: { 
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, 
    borderRadius: Radius.base, padding: 12, fontSize: FontSize.base, color: Colors.text 
  },
  hintText: { fontSize: 12, color: Colors.textMuted, marginTop: 4 },
  hintTextLocked: { fontSize: 13, color: Colors.textMuted, marginBottom: Spacing.lg, backgroundColor: Colors.surface, padding: 10, borderRadius: Radius.base },
  
  chipScrollWrapper: { marginHorizontal: -Spacing.lg, paddingHorizontal: Spacing.lg },
  choiceChip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: Radius.base, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, marginRight: 8 },
  choiceChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  choiceChipText: { fontSize: FontSize.sm, color: Colors.text, fontWeight: '500' },
  choiceChipTextActive: { color: '#fff' },

  cardSection: { 
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, 
    borderRadius: Radius.base, padding: Spacing.md, marginTop: Spacing.sm
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
