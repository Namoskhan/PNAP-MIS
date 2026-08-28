import { useEffect, useState } from 'react';
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
import { Colors, FontSize, Radius, Spacing } from '../../../../src/constants/colors';
import EmptyState from '../../../../src/components/EmptyState';

const TRIGGER_EVENTS = [
  { code: 'MEETING_FINALIZED', label: 'Meeting finalized' },
  { code: 'MEETING_CREATED', label: 'Meeting created' },
  { code: 'ACTIVITY_COMPLETED', label: 'Activity completed' },
  { code: 'ROLE_APPROVED', label: 'Role approved' },
  { code: 'CABINET_APPOINTED', label: 'Cabinet appointed' },
];
const TARGETS = [
  { code: 'CREATOR', label: 'Creator (meeting/activity)' },
  { code: 'CHAIRPERSON', label: 'Chairperson (meeting)' },
  { code: 'LEAD', label: 'Lead member (activity)' },
  { code: 'CABINET_ROLE', label: 'Cabinet role holder' },
];
const TIER_CODES = ['', 'BASIC_UNIT', 'AREA', 'DISTRICT', 'PROVINCE', 'CENTRAL'];
const BODIES = ['', 'EXECUTIVE', 'COMMITTEE'];

export default function ResponsibilityTemplatesScreen() {
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
      const r = await api.get('/admin/units/responsibility-templates');
      setItems(r.data?.data || []);
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function deleteTpl(t) {
    if (!canWrite) return;
    confirmAction(
      'Delete template',
      `Delete "${t.name}"? Responsibility documents already created from this template stay in place.`,
      async () => {
        try {
          const r = await api.delete(`/admin/units/responsibility-templates/${t._id}`);
          const inFlight = r.data?.data?.inFlightResponsibilities || 0;
          if (inFlight > 0) {
            toast.success(`Template deleted; ${inFlight} in-flight responsibility/ies remain in place.`);
          } else {
            toast.success('Template deleted.');
          }
          load();
        } catch (e) { toast.error(errorMessage(e)); }
      },
      { confirmText: 'Delete', destructive: true }
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
              <Ionicons name="clipboard" size={28} color={Colors.primary} />
              <Text style={styles.heroTitle}>Responsibility Manager</Text>
            </View>
            <Text style={styles.heroSub}>
              Auto-assign tasks when meetings are finalized or activities completed.
              Templates fire idempotently — same (template, source) won't double-create.
            </Text>

            <View style={styles.actionButtons}>
              <TouchableOpacity style={[styles.btn, styles.btnSecondary, { flex: 1 }]} onPress={load} disabled={busy}>
                {busy ? <ActivityIndicator size="small" /> : <Text style={styles.btnSecondaryText}>Refresh</Text>}
              </TouchableOpacity>
              {canWrite && (
                <TouchableOpacity style={[styles.btn, { flex: 1 }]} onPress={() => setCreateOpen(true)}>
                  <Text style={styles.btnText}>+ New template</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {items.map(t => (
            <Card key={t._id} style={styles.card}>
              <View style={styles.cardHeader}>
                <Ionicons name="clipboard-outline" size={18} color={Colors.text} />
                <Text style={styles.cardTitle} numberOfLines={1}>
                  {t.name}
                  {!t.isActive ? ' · inactive' : ''}
                </Text>
                <Text style={styles.cardCount}>{t.trigger?.event}</Text>
              </View>
              
              <View style={styles.cardBody}>
                <View style={styles.detailsList}>
                  <Text style={styles.detailText}>
                    <Text style={{ fontWeight: '600' }}>Trigger: </Text>
                    <Text style={styles.codeText}>{t.trigger?.event}</Text>
                    {t.trigger?.conditions?.tierCode && <Text> · tier <Text style={styles.codeText}>{t.trigger.conditions.tierCode}</Text></Text>}
                    {t.trigger?.conditions?.typeCode && <Text> · type <Text style={styles.codeText}>{t.trigger.conditions.typeCode}</Text></Text>}
                    {t.trigger?.conditions?.body && <Text> · body <Text style={styles.codeText}>{t.trigger.conditions.body}</Text></Text>}
                  </Text>
                  
                  <Text style={styles.detailText}>
                    <Text style={{ fontWeight: '600' }}>Assign to: </Text>
                    <Text style={styles.codeText}>{t.assignment?.target}</Text>
                    {t.assignment?.roleCode && <Text> · role <Text style={styles.codeText}>{t.assignment.roleCode}</Text></Text>}
                  </Text>
                  
                  <Text style={styles.detailText}>
                    <Text style={{ fontWeight: '600' }}>Due: </Text>
                    {t.dueDateOffsetDays > 0 ? `${t.dueDateOffsetDays} days after trigger` : 'no due date'}
                  </Text>

                  {t.titleTemplate && (
                    <Text style={styles.detailText}>
                      <Text style={{ fontWeight: '600' }}>Title template: </Text>
                      "{t.titleTemplate}"
                    </Text>
                  )}

                  {t.description && <Text style={[styles.detailText, styles.muted]}>{t.description}</Text>}
                </View>
                
                {canWrite && (
                  <View style={styles.rowActions}>
                    <TouchableOpacity 
                      style={styles.actionBtn}
                      onPress={() => setEditing(t)}
                    >
                      <Text style={styles.actionBtnText}>Edit</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.actionBtn, styles.actionBtnDanger]} onPress={() => deleteTpl(t)}>
                      <Ionicons name="trash" size={14} color={Colors.danger} />
                      <Text style={styles.actionBtnTextDanger}>Delete</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </Card>
          ))}

          {!busy && items.length === 0 && (
            <EmptyState icon="📋" title="No templates configured. Auto-task creation is opt-in." />
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      )}

      <Modal visible={createOpen || !!editing} animationType="slide" presentationStyle="pageSheet">
        {(createOpen || editing) && (
          <ResponsibilityTemplateDialog
            mode={editing ? 'edit' : 'create'}
            template={editing}
            onClose={() => { setCreateOpen(false); setEditing(null); }}
            onSaved={() => { setCreateOpen(false); setEditing(null); load(); toast.success('Template saved.'); }}
          />
        )}
      </Modal>
    </SafeAreaView>
  );
}

function ResponsibilityTemplateDialog({ mode, template, onClose, onSaved }) {
  const isEdit = mode === 'edit';
  const [name, setName] = useState(template?.name || '');
  const [description, setDescription] = useState(template?.description || '');
  const [event, setEvent] = useState(template?.trigger?.event || 'MEETING_FINALIZED');
  const [condTier, setCondTier] = useState(template?.trigger?.conditions?.tierCode || '');
  const [condType, setCondType] = useState(template?.trigger?.conditions?.typeCode || '');
  const [condBody, setCondBody] = useState(template?.trigger?.conditions?.body || '');
  const [target, setTarget] = useState(template?.assignment?.target || 'CREATOR');
  const [roleCode, setRoleCode] = useState(template?.assignment?.roleCode || '');
  const [titleTemplate, setTitleTemplate] = useState(template?.titleTemplate || '');
  const [descriptionTemplate, setDescriptionTemplate] = useState(template?.descriptionTemplate || '');
  const [dueDateOffsetDays, setDueDateOffsetDays] = useState(template?.dueDateOffsetDays || 0);
  const [isActive, setIsActive] = useState(template?.isActive !== false);
  
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const bodyApplies = ['MEETING_FINALIZED', 'MEETING_CREATED', 'ACTIVITY_COMPLETED'].includes(event);
  const targetOpts = (() => {
    if (event === 'ROLE_APPROVED' || event === 'CABINET_APPOINTED') {
      return TARGETS.filter((t) => t.code === 'CABINET_ROLE');
    }
    if (event === 'ACTIVITY_COMPLETED') {
      return TARGETS.filter((t) => t.code !== 'CHAIRPERSON');
    }
    return TARGETS;
  })();

  useEffect(() => {
    if (!targetOpts.some((o) => o.code === target)) {
      setTarget(targetOpts[0]?.code || 'CREATOR');
    }
  }, [event]);

  async function save() {
    setBusy(true);
    try {
      if (!name.trim() || name.trim().length < 2) {
        throw new Error('Name must be at least 2 characters');
      }
      if (target === 'CABINET_ROLE' && !roleCode.trim()) {
        throw new Error('Cabinet role code is required when target is CABINET_ROLE');
      }
      const conditions = {};
      if (condTier) conditions.tierCode = condTier;
      if (condType) conditions.typeCode = condType.toUpperCase();
      if (condBody && bodyApplies) conditions.body = condBody;

      const payload = {
        name: name.trim(),
        trigger: {
          event,
          ...(Object.keys(conditions).length > 0 ? { conditions } : {}),
        },
        assignment: {
          target,
          ...(target === 'CABINET_ROLE' ? { roleCode: roleCode.trim().toUpperCase() } : {}),
        },
        dueDateOffsetDays: Number(dueDateOffsetDays) || 0,
        isActive,
      };
      if (description.trim()) payload.description = description.trim();
      if (titleTemplate.trim()) payload.titleTemplate = titleTemplate.trim();
      if (descriptionTemplate.trim()) payload.descriptionTemplate = descriptionTemplate.trim();

      if (isEdit) {
        await api.patch(`/admin/units/responsibility-templates/${template._id}`, payload);
      } else {
        await api.post('/admin/units/responsibility-templates', payload);
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
          <Text style={styles.modalTitle}>{isEdit ? `Edit template` : 'New template'}</Text>
          {isEdit && <Text style={styles.modalSubtitle}>{template.name}</Text>}
        </View>
        <TouchableOpacity style={styles.closeBtn} onPress={onClose} disabled={busy}>
          <Ionicons name="close" size={24} color={Colors.text} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalContent}>
        
        <View style={styles.cardSection}>
          <View style={styles.cardSectionHeader}>
            <Ionicons name="clipboard" size={16} color={Colors.text} />
            <Text style={styles.cardSectionTitle}>Template</Text>
          </View>
          <View style={styles.formGroup}>
            <Text style={styles.label}>Name</Text>
            <TextInput 
              style={styles.input}
              value={name}
              onChangeText={setName}
              maxLength={120}
              placeholder="e.g. Draft minutes after monthly meeting"
            />
          </View>
          <View style={[styles.formGroup, { marginBottom: 0 }]}>
            <Text style={styles.label}>Internal description (optional)</Text>
            <TextInput 
              style={styles.input}
              value={description}
              onChangeText={setDescription}
              maxLength={500}
            />
            <Text style={styles.hintText}>For admin reference. Not shown to assignees.</Text>
          </View>
        </View>

        <View style={styles.cardSection}>
          <View style={styles.cardSectionHeader}>
            <Ionicons name="flash" size={16} color={Colors.text} />
            <Text style={styles.cardSectionTitle}>Trigger</Text>
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Event</Text>
            <View style={styles.chipScrollWrapper}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {TRIGGER_EVENTS.map(e => (
                  <TouchableOpacity 
                    key={e.code}
                    style={[styles.choiceChip, event === e.code && styles.choiceChipActive]}
                    onPress={() => setEvent(e.code)}
                  >
                    <Text style={[styles.choiceChipText, event === e.code && styles.choiceChipTextActive]}>{e.label}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Only on tier (optional)</Text>
            <View style={styles.chipScrollWrapper}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {TIER_CODES.map(t => (
                  <TouchableOpacity 
                    key={t || 'any'}
                    style={[styles.choiceChip, condTier === t && styles.choiceChipActive]}
                    onPress={() => setCondTier(t)}
                  >
                    <Text style={[styles.choiceChipText, condTier === t && styles.choiceChipTextActive]}>{t || 'Any tier'}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Only on type code (optional)</Text>
            <TextInput 
              style={styles.input}
              value={condType}
              onChangeText={(v) => setCondType(v.toUpperCase().replace(/[^A-Z0-9_]/g, ''))}
              placeholder="MONTHLY_MEETING"
              maxLength={60}
            />
            <Text style={styles.hintText}>Empty = any meeting/activity type.</Text>
          </View>

          {bodyApplies && (
            <View style={[styles.formGroup, { marginBottom: 0 }]}>
              <Text style={styles.label}>Only on body (optional)</Text>
              <View style={styles.chipScrollWrapper}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {BODIES.map(b => (
                    <TouchableOpacity 
                      key={b || 'any'}
                      style={[styles.choiceChip, condBody === b && styles.choiceChipActive]}
                      onPress={() => setCondBody(b)}
                    >
                      <Text style={[styles.choiceChipText, condBody === b && styles.choiceChipTextActive]}>{b || 'Any body'}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            </View>
          )}
        </View>

        <View style={styles.cardSection}>
          <View style={styles.cardSectionHeader}>
            <Ionicons name="person" size={16} color={Colors.text} />
            <Text style={styles.cardSectionTitle}>Assignment</Text>
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Assign to</Text>
            <View style={styles.chipScrollWrapper}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {targetOpts.map(t => (
                  <TouchableOpacity 
                    key={t.code}
                    style={[styles.choiceChip, target === t.code && styles.choiceChipActive]}
                    onPress={() => setTarget(t.code)}
                  >
                    <Text style={[styles.choiceChipText, target === t.code && styles.choiceChipTextActive]}>{t.label}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </View>

          {target === 'CABINET_ROLE' && (
            <View style={styles.formGroup}>
              <Text style={styles.label}>Cabinet role code</Text>
              <TextInput 
                style={styles.input}
                value={roleCode}
                onChangeText={(v) => setRoleCode(v.toUpperCase().replace(/[^A-Z0-9_]/g, ''))}
                placeholder="GENERAL_SECRETARY"
                maxLength={60}
              />
              <Text style={styles.hintText}>Must match a role in the Role catalogue.</Text>
            </View>
          )}

          <View style={[styles.formGroup, { marginBottom: 0 }]}>
            <Text style={styles.label}>Due in days (0 = no due date)</Text>
            <View style={styles.numberStepperRow}>
              <TouchableOpacity
                style={styles.stepperBtn}
                onPress={() => setDueDateOffsetDays(Math.max(0, (dueDateOffsetDays || 0) - 1))}
              >
                <Ionicons name="remove" size={18} color={Colors.text} />
              </TouchableOpacity>
              <TextInput
                style={styles.numberInput}
                keyboardType="numeric"
                inputMode="numeric"
                value={dueDateOffsetDays != null ? String(dueDateOffsetDays) : '0'}
                onChangeText={(v) => {
                  const clean = v.replace(/[^0-9]/g, '');
                  setDueDateOffsetDays(clean === '' ? 0 : parseInt(clean, 10));
                }}
                placeholder="0"
                placeholderTextColor={Colors.textMuted}
              />
              <TouchableOpacity
                style={styles.stepperBtn}
                onPress={() => setDueDateOffsetDays((dueDateOffsetDays || 0) + 1)}
              >
                <Ionicons name="add" size={18} color={Colors.text} />
              </TouchableOpacity>
            </View>
            <Text style={styles.hintText}>Number of days from trigger event until due date.</Text>
          </View>
        </View>

        <View style={styles.cardSection}>
          <View style={styles.cardSectionHeader}>
            <Ionicons name="document-text" size={16} color={Colors.text} />
            <Text style={styles.cardSectionTitle}>Generated task content</Text>
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Title template (optional)</Text>
            <TextInput 
              style={styles.input}
              value={titleTemplate}
              onChangeText={setTitleTemplate}
              maxLength={200}
              placeholder="Submit minutes for {{eventTitle}}"
            />
            <Text style={styles.hintText}>Placeholders like {'{{eventTitle}}'} are replaced.</Text>
          </View>

          <View style={[styles.formGroup, { marginBottom: 0 }]}>
            <Text style={styles.label}>Description template (optional)</Text>
            <TextInput 
              style={[styles.input, { minHeight: 80, textAlignVertical: 'top' }]}
              value={descriptionTemplate}
              onChangeText={setDescriptionTemplate}
              multiline
              maxLength={2000}
            />
          </View>
        </View>

        <View style={styles.cardSection}>
          <TouchableOpacity style={[styles.toggleRow, { marginBottom: 0 }]} onPress={() => setIsActive(v => !v)}>
            <View style={[styles.capCheckbox, isActive && styles.capCheckboxOn]}>
              {isActive && <Ionicons name="checkmark" size={14} color="#fff" />}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.toggleText}>Active</Text>
              <Text style={styles.hintText}>Inactive templates stop firing but remain editable.</Text>
            </View>
          </TouchableOpacity>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      <View style={styles.modalFooter}>
        <TouchableOpacity style={[styles.btn, styles.btnSecondary]} onPress={onClose} disabled={busy}>
          <Text style={styles.btnSecondaryText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btn, busy && { opacity: 0.7 }]} onPress={save} disabled={busy}>
          <Text style={styles.btnText}>{busy ? 'Saving...' : (isEdit ? 'Save changes' : 'Create template')}</Text>
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
  
  detailsList: { marginBottom: Spacing.md, gap: 6 },
  detailText: { fontSize: 13, color: Colors.text },
  codeText: { fontFamily: 'Courier', backgroundColor: Colors.background, paddingHorizontal: 4, borderRadius: 4, fontSize: 12 },
  muted: { color: Colors.textMuted, fontStyle: 'italic' },
  
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
  
  cardSection: {
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
    borderRadius: Radius.base, padding: Spacing.md, marginBottom: Spacing.md
  },
  cardSectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border, paddingBottom: 8 },
  cardSectionTitle: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.text },

  formGroup: { marginBottom: Spacing.md },
  label: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.text, marginBottom: 6 },
  input: { 
    backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border, 
    borderRadius: Radius.base, padding: 12, fontSize: FontSize.base, color: Colors.text 
  },
  numberStepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stepperBtn: {
    width: 42,
    height: 42,
    borderRadius: Radius.base,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  numberInput: {
    flex: 1,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.base,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    fontSize: FontSize.base,
    fontWeight: '700',
    color: Colors.text,
    textAlign: 'center',
  },
  hintText: { fontSize: 12, color: Colors.textMuted, marginTop: 4 },
  
  chipScrollWrapper: { marginHorizontal: -Spacing.lg, paddingHorizontal: Spacing.lg },
  choiceChip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: Radius.base, backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border, marginRight: 8 },
  choiceChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  choiceChipText: { fontSize: FontSize.sm, color: Colors.text, fontWeight: '500' },
  choiceChipTextActive: { color: '#fff' },

  toggleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.md },
  toggleText: { fontSize: FontSize.sm, color: Colors.text, fontWeight: '500' },
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
