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
import EmptyState from '../../../../src/components/EmptyState';

const METRIC_LABELS = {
  MEETING_ATTENDANCE: 'Meeting attendance',
  ACTIVITY_PARTICIPATION: 'Activity participation',
  RESPONSIBILITY_COMPLETION: 'Responsibility completion',
  DONATION_CONTRIBUTION: 'Donation contribution',
  STUDY_CONTRIBUTION: 'Study contribution',
};
const ALL_METRICS = Object.keys(METRIC_LABELS);
const TIER_CODES = ['BASIC_UNIT', 'AREA', 'DISTRICT', 'PROVINCE', 'CENTRAL'];

export default function PerformanceRuleSetsScreen() {
  const { user } = useAuth();
  const toast = useToast();
  const canWrite = hasPermission(user, 'MANAGE_UNIT_CONFIG');

  const [items, setItems] = useState([]);
  const [metrics, setMetrics] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [editing, setEditing] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);

  async function load() {
    setBusy(true); setErr('');
    try {
      const [r, m] = await Promise.all([
        api.get('/admin/units/performance-rulesets'),
        api.get('/admin/units/performance-rulesets/metrics'),
      ]);
      setItems(r.data?.data || []);
      setMetrics(m.data?.data || []);
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function deleteOne(r) {
    if (r.isSystem) return;
    Alert.alert(
      "Delete ruleset",
      `Delete TIER ruleset for ${r.tierCode}?`,
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Delete", 
          style: "destructive",
          onPress: async () => {
            try {
              await api.delete(`/admin/units/performance-rulesets/${r._id}`);
              toast.success('Ruleset deleted.');
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
              <Ionicons name="bar-chart" size={28} color={Colors.primary} />
              <Text style={styles.heroTitle}>Performance Rules</Text>
            </View>
            <Text style={styles.heroSub}>
              Weighted scoring formula for member performance.
              Resolution: TIER override → GLOBAL fallback. Weights must sum to 100%.
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

          {items.map((r) => {
            const total = (r.components || []).reduce((s, c) => s + (c.weight || 0), 0);
            return (
              <Card key={r._id} style={styles.card}>
                <View style={styles.cardHeader}>
                  <Ionicons name={r.scope === 'GLOBAL' ? 'globe' : 'pricetag'} size={18} color={Colors.text} />
                  <Text style={styles.cardTitle} numberOfLines={1}>
                    {r.name} · {r.scope}{r.tierCode ? ` · ${r.tierCode}` : ''}
                    {r.isSystem && ' · built-in'}
                    {!r.isActive && ' · inactive'}
                  </Text>
                  <Text style={styles.cardCount}>v{r.rulesetVersion || 1}</Text>
                </View>
                
                <View style={styles.cardBody}>
                  {r.description && <Text style={styles.noteText}>{r.description}</Text>}
                  
                  {(r.components || []).length === 0 ? (
                    <Text style={styles.emptyText}>No components — no scoring active.</Text>
                  ) : (
                    <View style={styles.metricsContainer}>
                      {r.components.map((c, i) => (
                        <PerfBar key={i} metric={c.metric} weight={c.weight} />
                      ))}
                      <View style={styles.totalRow}>
                        <Text style={styles.totalLabel}>Total</Text>
                        <Text style={styles.totalValue}>{(total * 100).toFixed(0)}%</Text>
                      </View>
                    </View>
                  )}

                  {canWrite && (
                    <View style={styles.rowActions}>
                      <TouchableOpacity style={styles.actionBtn} onPress={() => setEditing(r)}>
                        <Text style={styles.actionBtnText}>Edit components</Text>
                      </TouchableOpacity>
                      {!r.isSystem && (
                        <TouchableOpacity style={[styles.actionBtn, styles.actionBtnDanger]} onPress={() => deleteOne(r)}>
                          <Ionicons name="trash" size={14} color={Colors.danger} />
                          <Text style={styles.actionBtnTextDanger}>Delete</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}
                </View>
              </Card>
            );
          })}

          {!busy && items.length === 0 && (
            <EmptyState icon="bar-chart-outline" title="No rulesets configured." />
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      )}

      <Modal visible={createOpen || !!editing} animationType="slide" presentationStyle="pageSheet">
        {(createOpen || editing) && (
          <RulesetDialog
            mode={editing ? 'edit' : 'create'}
            ruleset={editing}
            metrics={metrics}
            existing={items}
            onClose={() => { setCreateOpen(false); setEditing(null); }}
            onSaved={() => { setCreateOpen(false); setEditing(null); load(); toast.success('Ruleset saved.'); }}
          />
        )}
      </Modal>
    </SafeAreaView>
  );
}

function PerfBar({ metric, weight }) {
  const pct = (weight || 0) * 100;
  const label = METRIC_LABELS[metric] || metric;
  return (
    <View style={styles.perfBarContainer}>
      <View style={{ flex: 1 }}>
        <Text style={styles.perfBarLabel}>{label}</Text>
        <View style={styles.perfBarTrack}>
          <View style={[styles.perfBarFill, { width: `${pct}%` }]} />
        </View>
      </View>
      <Text style={styles.perfBarValue}>{pct.toFixed(0)}%</Text>
    </View>
  );
}

function RulesetDialog({ mode, ruleset, metrics, existing, onClose, onSaved }) {
  const isEdit = mode === 'edit';
  const [name, setName] = useState(ruleset?.name || '');
  const [description, setDescription] = useState(ruleset?.description || '');
  const [tierCode, setTierCode] = useState(ruleset?.tierCode || 'AREA');
  const [isActive, setIsActive] = useState(ruleset?.isActive !== false);
  const [components, setComponents] = useState(() => {
    if (ruleset?.components?.length) return ruleset.components.map((c) => ({ ...c, params: { ...(c.params || {}) } }));
    return [{ metric: 'MEETING_ATTENDANCE', weight: 1, params: {} }];
  });
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const metricsByCode = useMemo(() => {
    const m = new Map();
    for (const x of metrics) m.set(x.code, x);
    return m;
  }, [metrics]);

  const takenTiers = useMemo(() => new Set(
    (existing || []).filter((r) => r.scope === 'TIER' && (!ruleset || r._id !== ruleset._id)).map((r) => r.tierCode)
  ), [existing, ruleset]);

  const availableTiers = TIER_CODES.filter((t) => !takenTiers.has(t));
  useEffect(() => {
    if (!isEdit && availableTiers.length > 0 && !availableTiers.includes(tierCode)) {
      setTierCode(availableTiers[0]);
    }
  }, [availableTiers, isEdit, tierCode]);

  const weightTotal = components.reduce((s, c) => s + Number(c.weight || 0), 0);
  const weightOk = Math.abs(weightTotal - 1) < 0.01;
  const dupMetric = (() => {
    const seen = new Set();
    for (const c of components) {
      if (seen.has(c.metric)) return c.metric;
      seen.add(c.metric);
    }
    return null;
  })();

  function addComponent() {
    const used = new Set(components.map((c) => c.metric));
    const free = ALL_METRICS.find((m) => !used.has(m));
    if (!free) return;
    const def = metricsByCode.get(free);
    setComponents((arr) => [...arr, { metric: free, weight: 0, params: { ...(def?.defaultParams || {}) } }]);
  }

  function removeComponent(idx) {
    setComponents((arr) => arr.filter((_, i) => i !== idx));
  }

  function updateComponent(idx, patch) {
    setComponents((arr) => arr.map((c, i) => i === idx ? { ...c, ...patch } : c));
  }

  function setWeight(idx, value) {
    const v = Math.max(0, Math.min(1, Number(value) || 0));
    updateComponent(idx, { weight: Math.round(v * 1000) / 1000 });
  }

  function normalize() {
    if (components.length === 0) return;
    const sum = components.reduce((s, c) => s + Number(c.weight || 0), 0);
    if (sum <= 0) {
      const w = Math.round((1 / components.length) * 1000) / 1000;
      setComponents((arr) => arr.map((c, i) => ({
        ...c,
        weight: i === arr.length - 1 ? Math.round((1 - w * (arr.length - 1)) * 1000) / 1000 : w,
      })));
      return;
    }
    const scaled = components.map((c) => Math.round((Number(c.weight || 0) / sum) * 1000) / 1000);
    const residue = Math.round((1 - scaled.reduce((s, w) => s + w, 0)) * 1000) / 1000;
    if (Math.abs(residue) > 0) {
      let maxIdx = 0;
      for (let i = 1; i < scaled.length; i++) if (scaled[i] > scaled[maxIdx]) maxIdx = i;
      scaled[maxIdx] = Math.round((scaled[maxIdx] + residue) * 1000) / 1000;
    }
    setComponents((arr) => arr.map((c, i) => ({ ...c, weight: scaled[i] })));
  }

  async function save() {
    setBusy(true);
    try {
      if (!name.trim() || name.trim().length < 2) throw new Error('Name must be at least 2 characters');
      if (!weightOk) throw new Error(`Component weights must sum to 100% (currently ${(weightTotal * 100).toFixed(0)}%)`);
      if (dupMetric) throw new Error(`Duplicate metric "${METRIC_LABELS[dupMetric]}" — each may appear once`);

      const cleanComponents = components.map((c) => {
        const out = { metric: c.metric, weight: Number(c.weight || 0) };
        const def = metricsByCode.get(c.metric);
        const paramKeys = Object.keys(def?.defaultParams || {});
        if (paramKeys.length > 0) {
          const params = {};
          for (const k of paramKeys) {
            const raw = c.params?.[k];
            const fallback = def.defaultParams[k];
            params[k] = typeof fallback === 'number'
              ? (raw === '' || raw == null ? fallback : Number(raw))
              : (raw == null ? fallback : raw);
          }
          out.params = params;
        }
        return out;
      });

      if (isEdit) {
        await api.patch(`/admin/units/performance-rulesets/${ruleset._id}`, {
          name: name.trim(),
          description: description.trim() || undefined,
          components: cleanComponents,
          isActive,
        });
      } else {
        await api.post('/admin/units/performance-rulesets', {
          name: name.trim(),
          description: description.trim() || undefined,
          scope: 'TIER',
          tierCode,
          components: cleanComponents,
          isActive,
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
          <Text style={styles.modalTitle}>{isEdit ? `Edit ruleset` : 'New TIER ruleset'}</Text>
          {isEdit && <Text style={styles.modalSubtitle}>{ruleset.scope}{ruleset.tierCode ? ' · ' + ruleset.tierCode : ''}</Text>}
        </View>
        <TouchableOpacity style={styles.closeBtn} onPress={onClose} disabled={busy}>
          <Ionicons name="close" size={24} color={Colors.text} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalContent}>
        
        <View style={styles.cardSection}>
          <View style={styles.cardSectionHeader}>
            <Ionicons name="bar-chart" size={16} color={Colors.text} />
            <Text style={styles.cardSectionTitle}>Ruleset</Text>
          </View>
          <View style={styles.formGroup}>
            <Text style={styles.label}>Name</Text>
            <TextInput 
              style={styles.input}
              value={name}
              onChangeText={setName}
              maxLength={120}
              placeholder="e.g. Area-level scoring (donor-heavy)"
            />
          </View>

          {!isEdit && (
            <View style={styles.formGroup}>
              <Text style={styles.label}>Tier</Text>
              <View style={styles.chipScrollWrapper}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {availableTiers.length === 0 ? (
                    <Text style={styles.hintText}>All tiers have overrides</Text>
                  ) : (
                    availableTiers.map(t => (
                      <TouchableOpacity 
                        key={t}
                        style={[styles.choiceChip, tierCode === t && styles.choiceChipActive]}
                        onPress={() => setTierCode(t)}
                      >
                        <Text style={[styles.choiceChipText, tierCode === t && styles.choiceChipTextActive]}>{t}</Text>
                      </TouchableOpacity>
                    ))
                  )}
                </ScrollView>
              </View>
              <Text style={styles.hintText}>One ruleset per tier. GLOBAL is seeded — edit it directly.</Text>
            </View>
          )}

          <View style={[styles.formGroup, { marginBottom: 0 }]}>
            <Text style={styles.label}>Description (optional)</Text>
            <TextInput 
              style={styles.input}
              value={description}
              onChangeText={setDescription}
              maxLength={500}
            />
          </View>
        </View>

        <View style={styles.cardSection}>
          <View style={styles.cardSectionHeader}>
            <Ionicons name="scale" size={16} color={Colors.text} />
            <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={styles.cardSectionTitle}>Components</Text>
              <Text style={[styles.cardCount, { color: weightOk ? Colors.textMuted : Colors.danger }]}>
                {(weightTotal * 100).toFixed(0)}% / 100%
              </Text>
            </View>
          </View>

          {components.map((c, idx) => {
            const def = metricsByCode.get(c.metric);
            const paramKeys = Object.keys(def?.defaultParams || {});
            const used = new Set(components.map((cc, i) => i !== idx ? cc.metric : null).filter(Boolean));
            
            return (
              <View key={idx} style={styles.stageEditorCard}>
                <View style={styles.stageEditorHeader}>
                  <Text style={styles.stageEditorTitle}>Component {idx + 1}</Text>
                  <TouchableOpacity disabled={components.length <= 1} onPress={() => removeComponent(idx)} style={{ padding: 4, opacity: components.length <= 1 ? 0.3 : 1 }}>
                    <Ionicons name="trash" size={18} color={Colors.danger} />
                  </TouchableOpacity>
                </View>

                <View style={styles.formGroup}>
                  <Text style={styles.label}>Metric</Text>
                  <View style={styles.chipScrollWrapper}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                      {ALL_METRICS.map(m => (
                        <TouchableOpacity 
                          key={m}
                          disabled={used.has(m)}
                          style={[styles.choiceChip, c.metric === m && styles.choiceChipActive, used.has(m) && { opacity: 0.3 }]}
                          onPress={() => {
                            const newDef = metricsByCode.get(m);
                            updateComponent(idx, { metric: m, params: { ...(newDef?.defaultParams || {}) } });
                          }}
                        >
                          <Text style={[styles.choiceChipText, c.metric === m && styles.choiceChipTextActive]}>{METRIC_LABELS[m]}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                  {def?.description && <Text style={styles.hintText}>{def.description}</Text>}
                </View>

                <View style={styles.formGroup}>
                  <Text style={styles.label}>Weight ({(Number(c.weight || 0) * 100).toFixed(0)}%)</Text>
                  <TextInput 
                    style={styles.input}
                    type="number"
                    keyboardType="numeric"
                    value={c.weight != null ? String(c.weight) : ''}
                    onChangeText={(v) => setWeight(idx, v)}
                  />
                  <Text style={styles.hintText}>Enter value between 0 and 1 (e.g. 0.25)</Text>
                </View>

                {paramKeys.map((k) => {
                  const fallback = def.defaultParams[k];
                  const isNum = typeof fallback === 'number';
                  return (
                    <View key={k} style={styles.formGroup}>
                      <Text style={styles.label}>Param · {k}</Text>
                      <TextInput
                        style={styles.input}
                        keyboardType={isNum ? 'numeric' : 'default'}
                        value={c.params?.[k] != null ? String(c.params[k]) : ''}
                        placeholder={String(fallback)}
                        onChangeText={(v) => updateComponent(idx, {
                          params: { ...(c.params || {}), [k]: isNum && v !== '' ? Number(v) : v },
                        })}
                      />
                      <Text style={styles.hintText}>Default: {String(fallback)}</Text>
                    </View>
                  );
                })}
              </View>
            );
          })}

          <View style={{ flexDirection: 'row', gap: 8, marginTop: Spacing.sm }}>
            <TouchableOpacity style={styles.btnSecondarySmall} onPress={addComponent} disabled={components.length >= ALL_METRICS.length}>
              <Text style={styles.btnSecondarySmallText}>+ Add component</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.btnSecondarySmall} onPress={normalize}>
              <Text style={styles.btnSecondarySmallText}>Normalize to 100%</Text>
            </TouchableOpacity>
          </View>
          
          {!weightOk && (
            <Text style={[styles.hintText, { color: Colors.danger, marginTop: Spacing.sm }]}>
              Weights must sum to 100% (currently {(weightTotal * 100).toFixed(0)}%)
            </Text>
          )}
        </View>

        <View style={styles.cardSection}>
          <TouchableOpacity style={[styles.toggleRow, { marginBottom: 0, opacity: ruleset?.isSystem ? 0.5 : 1 }]} disabled={ruleset?.isSystem} onPress={() => setIsActive(v => !v)}>
            <View style={[styles.capCheckbox, isActive && styles.capCheckboxOn]}>
              {isActive && <Ionicons name="checkmark" size={14} color="#fff" />}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.toggleText}>Active</Text>
              {ruleset?.isSystem && <Text style={styles.hintText}>Seeded GLOBAL ruleset cannot be deactivated.</Text>}
            </View>
          </TouchableOpacity>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      <View style={styles.modalFooter}>
        <TouchableOpacity style={[styles.btn, styles.btnSecondary]} onPress={onClose} disabled={busy}>
          <Text style={styles.btnSecondaryText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btn, (busy || !weightOk || dupMetric || components.length === 0) && { opacity: 0.7 }]} onPress={save} disabled={busy || !weightOk || dupMetric || components.length === 0}>
          <Text style={styles.btnText}>{busy ? 'Saving...' : (isEdit ? 'Save changes' : 'Create ruleset')}</Text>
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
  
  noteText: { fontSize: 13, color: Colors.textMuted, marginBottom: Spacing.md },
  emptyText: { fontSize: 13, color: Colors.textMuted, fontStyle: 'italic' },
  
  metricsContainer: { gap: 8 },
  perfBarContainer: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 8 },
  perfBarLabel: { fontSize: 13, fontWeight: '600', color: Colors.text, marginBottom: 4 },
  perfBarTrack: { height: 6, backgroundColor: Colors.border, borderRadius: 3, overflow: 'hidden' },
  perfBarFill: { height: '100%', backgroundColor: Colors.primary, borderRadius: 3 },
  perfBarValue: { fontSize: 13, fontWeight: '600', color: Colors.text, minWidth: 40, textAlign: 'right' },
  
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 8, marginTop: 4 },
  totalLabel: { fontSize: 13, fontWeight: '700', color: Colors.text },
  totalValue: { fontSize: 13, fontWeight: '700', color: Colors.text },
  
  rowActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: Spacing.md },
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

  stageEditorCard: {
    backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border,
    borderRadius: Radius.base, padding: Spacing.md, marginBottom: Spacing.md
  },
  stageEditorHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.md },
  stageEditorTitle: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.text },

  formGroup: { marginBottom: Spacing.md },
  label: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.text, marginBottom: 6 },
  input: { 
    backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border, 
    borderRadius: Radius.base, padding: 12, fontSize: FontSize.base, color: Colors.text 
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
  btnSecondarySmall: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 12, paddingVertical: 8, borderRadius: Radius.base },
  btnSecondarySmallText: { fontSize: 13, fontWeight: '600', color: Colors.text },
});
