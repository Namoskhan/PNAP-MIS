import { useEffect, useState } from 'react';
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
import EmptyState from '../../../../src/components/EmptyState';

const DOMAIN_LABELS = {
  EXPENSE_APPROVAL: 'Expense approval',
  MEMBER_APPROVAL: 'Member approval',
  ROLE_APPROVAL: 'Role approval',
  TRANSFER_APPROVAL: 'Transfer approval',
  CABINET_APPOINTMENT: 'Cabinet appointment',
};
const DOMAINS = Object.keys(DOMAIN_LABELS);
const TIER_CODES = ['BASIC_UNIT', 'AREA', 'DISTRICT', 'PROVINCE', 'CENTRAL'];

export default function WorkflowsScreen() {
  const { user } = useAuth();
  const toast = useToast();
  const canWrite = hasPermission(user, 'MANAGE_UNIT_CONFIG');

  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [editing, setEditing] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);

  async function load() {
    setBusy(true); setErr('');
    try {
      const r = await api.get('/admin/units/workflows');
      setItems(r.data?.data || []);
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function deleteOne(w) {
    if (w.isSystem) return;
    Alert.alert(
      "Delete workflow",
      `Delete the ${w.scope} workflow for ${w.domain}${w.tierCode ? ' · ' + w.tierCode : ''}?`,
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Delete", 
          style: "destructive",
          onPress: async () => {
            try {
              await api.delete(`/admin/units/workflows/${w._id}`);
              toast.success('Workflow deleted.');
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
              <Ionicons name="git-network" size={28} color={Colors.primary} />
              <Text style={styles.heroTitle}>Workflow Manager</Text>
            </View>
            <Text style={styles.heroSub}>
              Approval chains per domain. Default GLOBAL chains have one stage matching the legacy gate.
              Add stages or thresholds to chain in second approvers.
            </Text>

            <View style={styles.actionButtons}>
              <TouchableOpacity style={[styles.btn, styles.btnSecondary, { flex: 1 }]} onPress={load} disabled={busy}>
                {busy ? <ActivityIndicator size="small" /> : <Text style={styles.btnSecondaryText}>Refresh</Text>}
              </TouchableOpacity>
              {canWrite && (
                <TouchableOpacity style={[styles.btn, { flex: 1 }]} onPress={() => setCreateOpen(true)}>
                  <Text style={styles.btnText}>+ TIER Override</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {items.map(w => (
            <Card key={w._id} style={styles.card}>
              <View style={styles.cardHeader}>
                <Ionicons name={w.scope === 'GLOBAL' ? 'globe' : 'pricetag'} size={18} color={Colors.text} />
                <Text style={styles.cardTitle} numberOfLines={1}>
                  {DOMAIN_LABELS[w.domain] || w.domain}
                  {' · '}{w.scope}{w.tierCode ? ` · ${w.tierCode}` : ''}
                  {w.isSystem ? ' · built-in' : ''}
                  {!w.isActive ? ' · inactive' : ''}
                </Text>
                <Text style={styles.cardCount}>v{w.configVersion || 1} · {w.stages?.length || 0} stage(s)</Text>
              </View>
              
              <View style={styles.cardBody}>
                {(w.stages || []).length === 0 ? (
                  <Text style={styles.emptyText}>No stages defined.</Text>
                ) : (
                  <View style={styles.stagesList}>
                    {w.stages.map((s, i) => (
                      <View key={s.code || i} style={styles.stageItem}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <View style={styles.stageNumber}><Text style={styles.stageNumberText}>{i + 1}</Text></View>
                          <Text style={styles.stageName}>{s.name}</Text>
                          <Text style={styles.stageCode}>{s.code}</Text>
                        </View>
                        <View style={styles.stageDetails}>
                          {s.requirePermission && <Text style={styles.stageDetailText}>• requires <Text style={styles.codeText}>{s.requirePermission}</Text></Text>}
                          {s.requireRoleCode && <Text style={styles.stageDetailText}>• role <Text style={styles.codeText}>{s.requireRoleCode}</Text></Text>}
                          {typeof s.thresholdAmount === 'number' && s.thresholdAmount > 0 && (
                            <Text style={styles.stageDetailText}>• skip below {s.thresholdAmount.toLocaleString()} on <Text style={styles.codeText}>{s.thresholdField}</Text></Text>
                          )}
                        </View>
                      </View>
                    ))}
                  </View>
                )}

                {w.note && <Text style={styles.noteText}>{w.note}</Text>}
                
                {canWrite && (
                  <View style={styles.rowActions}>
                    <TouchableOpacity 
                      style={styles.actionBtn}
                      onPress={() => setEditing(w)}
                    >
                      <Text style={styles.actionBtnText}>Edit stages</Text>
                    </TouchableOpacity>
                    {!w.isSystem && (
                      <TouchableOpacity style={[styles.actionBtn, styles.actionBtnDanger]} onPress={() => deleteOne(w)}>
                        <Ionicons name="trash" size={14} color={Colors.danger} />
                        <Text style={styles.actionBtnTextDanger}>Delete</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              </View>
            </Card>
          ))}

          {!busy && items.length === 0 && (
            <EmptyState icon="git-network-outline" title="No workflows configured." />
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      )}

      <Modal visible={createOpen || !!editing} animationType="slide" presentationStyle="pageSheet">
        {(createOpen || editing) && (
          <WorkflowDialog
            mode={editing ? 'edit' : 'create'}
            workflow={editing}
            onClose={() => { setCreateOpen(false); setEditing(null); }}
            onSaved={() => { setCreateOpen(false); setEditing(null); load(); toast.success('Workflow saved.'); }}
          />
        )}
      </Modal>
    </SafeAreaView>
  );
}

function WorkflowDialog({ mode, workflow, onClose, onSaved }) {
  const isEdit = mode === 'edit';
  const [domain, setDomain] = useState(workflow?.domain || 'EXPENSE_APPROVAL');
  const [scope, setScope] = useState(workflow?.scope || 'TIER');
  const [tierCode, setTierCode] = useState(workflow?.tierCode || 'AREA');
  const [isActive, setIsActive] = useState(workflow?.isActive !== false);
  const [note, setNote] = useState(workflow?.note || '');
  
  const [stages, setStages] = useState(() => {
    const src = workflow?.stages || [];
    return src.length > 0
      ? src.map((s) => ({ ...s }))
      : [{ code: 'STAGE_1', name: 'Initial review', sortOrder: 10, requirePermission: 'APPROVE_EXPENSE' }];
  });
  
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  function addStage() {
    setStages((arr) => [
      ...arr,
      {
        code: `STAGE_${arr.length + 1}`,
        name: `Stage ${arr.length + 1}`,
        sortOrder: (arr[arr.length - 1]?.sortOrder || 0) + 10,
        requirePermission: '',
      },
    ]);
  }

  function removeStage(idx) {
    setStages((arr) => arr.filter((_, i) => i !== idx));
  }

  function updateStage(idx, patch) {
    setStages((arr) => arr.map((s, i) => i === idx ? { ...s, ...patch } : s));
  }

  function moveStage(idx, dir) {
    setStages((arr) => {
      const next = arr.slice();
      const j = idx + dir;
      if (j < 0 || j >= next.length) return arr;
      [next[idx], next[j]] = [next[j], next[idx]];
      return next.map((s, i) => ({ ...s, sortOrder: (i + 1) * 10 }));
    });
  }

  async function save() {
    setBusy(true);
    try {
      const cleanStages = stages.map((s) => {
        const out = {
          code: String(s.code || '').toUpperCase(),
          name: s.name || '',
          sortOrder: typeof s.sortOrder === 'number' ? s.sortOrder : 100,
        };
        if (s.requirePermission) out.requirePermission = String(s.requirePermission).toUpperCase();
        if (s.requireRoleCode) out.requireRoleCode = String(s.requireRoleCode).toUpperCase();
        if (s.thresholdField) out.thresholdField = s.thresholdField;
        if (typeof s.thresholdAmount === 'number' && s.thresholdAmount > 0) {
          out.thresholdAmount = s.thresholdAmount;
        }
        if (s.skipBelowThreshold != null) out.skipBelowThreshold = !!s.skipBelowThreshold;
        return out;
      });

      if (isEdit) {
        await api.patch(`/admin/units/workflows/${workflow._id}`, {
          stages: cleanStages,
          isActive,
          note: note || undefined,
        });
      } else {
        await api.post('/admin/units/workflows', {
          domain,
          scope,
          tierCode: scope === 'TIER' ? tierCode : undefined,
          stages: cleanStages,
          isActive,
          note: note || undefined,
        });
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
          <Text style={styles.modalTitle}>{isEdit ? `Edit workflow` : 'New workflow override'}</Text>
          {isEdit && <Text style={styles.modalSubtitle}>{workflow.domain}</Text>}
        </View>
        <TouchableOpacity style={styles.closeBtn} onPress={onClose} disabled={busy}>
          <Ionicons name="close" size={24} color={Colors.text} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalContent}>
        
        {!isEdit && (
          <View style={styles.formGroup}>
            <Text style={styles.label}>Domain</Text>
            <View style={styles.chipScrollWrapper}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {DOMAINS.map(d => (
                  <TouchableOpacity 
                    key={d}
                    style={[styles.choiceChip, domain === d && styles.choiceChipActive]}
                    onPress={() => setDomain(d)}
                  >
                    <Text style={[styles.choiceChipText, domain === d && styles.choiceChipTextActive]}>{DOMAIN_LABELS[d]}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </View>
        )}

        {!isEdit && (
          <View style={styles.formGroup}>
            <Text style={styles.label}>Scope</Text>
            <View style={styles.chipScrollWrapper}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <TouchableOpacity style={[styles.choiceChip, styles.choiceChipActive]}>
                  <Text style={[styles.choiceChipText, styles.choiceChipTextActive]}>TIER override</Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          </View>
        )}

        {!isEdit && (
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

        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionHeader}>Stages ({stages.length})</Text>
        </View>

        {stages.map((s, idx) => (
          <View key={idx} style={styles.stageEditorCard}>
            <View style={styles.stageEditorHeader}>
              <Text style={styles.stageEditorTitle}>Stage {idx + 1}</Text>
              <View style={styles.fieldActions}>
                <TouchableOpacity disabled={idx === 0} onPress={() => moveStage(idx, -1)} style={{ padding: 4, opacity: idx === 0 ? 0.3 : 1 }}>
                  <Ionicons name="arrow-up" size={18} color={Colors.text} />
                </TouchableOpacity>
                <TouchableOpacity disabled={idx === stages.length - 1} onPress={() => moveStage(idx, +1)} style={{ padding: 4, opacity: idx === stages.length - 1 ? 0.3 : 1 }}>
                  <Ionicons name="arrow-down" size={18} color={Colors.text} />
                </TouchableOpacity>
                <TouchableOpacity disabled={stages.length <= 1} onPress={() => removeStage(idx)} style={{ padding: 4, opacity: stages.length <= 1 ? 0.3 : 1 }}>
                  <Ionicons name="trash" size={18} color={Colors.danger} />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Code</Text>
              <TextInput 
                style={styles.input}
                value={s.code || ''}
                onChangeText={(v) => updateStage(idx, { code: v.toUpperCase().replace(/[^A-Z0-9_]/g, '') })}
                maxLength={60}
                placeholder="FINANCE_APPROVAL"
              />
              <Text style={styles.hintText}>Locked once published. Used as the audit-chain key.</Text>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Name</Text>
              <TextInput 
                style={styles.input}
                value={s.name || ''}
                onChangeText={(v) => updateStage(idx, { name: v })}
                maxLength={80}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Require permission</Text>
              <TextInput 
                style={styles.input}
                value={s.requirePermission || ''}
                onChangeText={(v) => updateStage(idx, { requirePermission: v.toUpperCase().replace(/[^A-Z0-9_]/g, '') })}
                maxLength={60}
                placeholder="APPROVE_EXPENSE"
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Require role (optional)</Text>
              <TextInput 
                style={styles.input}
                value={s.requireRoleCode || ''}
                onChangeText={(v) => updateStage(idx, { requireRoleCode: v.toUpperCase().replace(/[^A-Z0-9_]/g, '') })}
                maxLength={60}
                placeholder="FINANCE_SECRETARY"
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Threshold field (optional)</Text>
              <TextInput 
                style={styles.input}
                value={s.thresholdField || ''}
                onChangeText={(v) => updateStage(idx, { thresholdField: v })}
                maxLength={40}
                placeholder="amount"
              />
            </View>

            <View style={[styles.formGroup, { marginBottom: 0 }]}>
              <Text style={styles.label}>Threshold amount (skip below)</Text>
              <TextInput 
                style={styles.input}
                value={s.thresholdAmount != null ? String(s.thresholdAmount) : ''}
                onChangeText={(v) => updateStage(idx, { thresholdAmount: v === '' ? undefined : Number(v) })}
                keyboardType="number-pad"
              />
            </View>
          </View>
        ))}

        <TouchableOpacity style={styles.addStageBtn} onPress={addStage}>
          <Text style={styles.addStageBtnText}>+ Add stage</Text>
        </TouchableOpacity>

        <View style={[styles.cardSection, { marginTop: Spacing.xl }]}>
          <TouchableOpacity style={[styles.toggleRow, { opacity: workflow?.isSystem ? 0.5 : 1 }]} disabled={workflow?.isSystem} onPress={() => setIsActive(v => !v)}>
            <View style={[styles.capCheckbox, isActive && styles.capCheckboxOn]}>
              {isActive && <Ionicons name="checkmark" size={14} color="#fff" />}
            </View>
            <Text style={styles.toggleText}>Active</Text>
          </TouchableOpacity>
          
          <View style={[styles.formGroup, { marginBottom: 0 }]}>
            <Text style={styles.label}>Note (optional)</Text>
            <TextInput style={styles.input} value={note} onChangeText={setNote} maxLength={300} placeholder="Why this override exists" />
          </View>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      <View style={styles.modalFooter}>
        <TouchableOpacity style={[styles.btn, styles.btnSecondary]} onPress={onClose} disabled={busy}>
          <Text style={styles.btnSecondaryText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btn, (busy || stages.length === 0) && { opacity: 0.7 }]} onPress={save} disabled={busy || stages.length === 0}>
          <Text style={styles.btnText}>{busy ? 'Saving...' : (isEdit ? 'Save stages' : 'Create workflow')}</Text>
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
  actionButtons: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.md },

  card: { marginBottom: Spacing.md, padding: 0, overflow: 'hidden' },
  cardHeader: { 
    flexDirection: 'row', alignItems: 'center', padding: Spacing.md, 
    backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border, gap: 8
  },
  cardTitle: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.text, flex: 1 },
  cardCount: { fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: '600', fontFamily: 'Courier' },
  cardBody: { padding: Spacing.md },
  
  stagesList: { marginBottom: Spacing.md },
  stageItem: { marginBottom: Spacing.md },
  stageNumber: { width: 20, height: 20, borderRadius: 10, backgroundColor: Colors.text, justifyContent: 'center', alignItems: 'center' },
  stageNumberText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  stageName: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.text },
  stageCode: { fontSize: 11, color: Colors.textMuted, fontFamily: 'Courier' },
  stageDetails: { paddingLeft: 26, marginTop: 4 },
  stageDetailText: { fontSize: 12, color: Colors.textMuted, marginBottom: 2 },
  codeText: { fontFamily: 'Courier', backgroundColor: Colors.background, paddingHorizontal: 4, borderRadius: 4 },
  
  noteText: { fontSize: 12, color: Colors.textMuted, marginTop: 10, fontStyle: 'italic' },
  
  rowActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: Spacing.sm },
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
  modalSubtitle: { fontSize: FontSize.sm, color: Colors.textMuted, fontFamily: 'Courier' },
  closeBtn: { padding: 4 },
  modalScroll: { flex: 1 },
  modalContent: { padding: Spacing.lg },
  
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: Spacing.md, marginBottom: Spacing.sm },
  sectionHeader: { fontSize: FontSize.base, fontWeight: '700', color: Colors.text },
  
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
  
  stageEditorCard: {
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
    borderRadius: Radius.base, padding: Spacing.md, marginBottom: Spacing.md
  },
  stageEditorHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.md },
  stageEditorTitle: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.text },
  fieldActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  
  addStageBtn: { 
    padding: Spacing.md, backgroundColor: Colors.surface, borderRadius: Radius.base, 
    borderWidth: 1, borderColor: Colors.border, borderStyle: 'dashed', alignItems: 'center' 
  },
  addStageBtnText: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.text },

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
