import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
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
import Badge from '../../../../src/components/Badge';
import EmptyState from '../../../../src/components/EmptyState';
import { Colors, FontSize, Radius, Spacing } from '../../../../src/constants/colors';

const CAPABILITY_KEYS = [
  { key: 'meetings',         label: 'Meetings' },
  { key: 'activities',       label: 'Activities' },
  { key: 'finance',          label: 'Finance' },
  { key: 'cabinet',          label: 'Cabinet' },
  { key: 'committee',        label: 'Committee body' },
  { key: 'transfers',        label: 'Fund transfers' },
  { key: 'performance',      label: 'Performance' },
  { key: 'responsibilities', label: 'Responsibilities' },
];

export default function UnitTierConfigsScreen() {
  const { user } = useAuth();
  const toast = useToast();
  const canWrite = hasPermission(user, 'MANAGE_UNIT_CONFIG');

  const [tiers, setTiers] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [editing, setEditing] = useState(null);

  async function load() {
    setBusy(true); setErr('');
    try {
      const r = await api.get('/admin/units/tier-configs');
      setTiers(r.data?.data || []);
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => { load(); }, []);

  const renderTier = ({ item: t }) => {
    const enabledCount = CAPABILITY_KEYS.filter((c) => t.capabilities?.[c.key]).length;
    const bodyCount = (t.bodyPolicy?.executive ? 1 : 0) + (t.bodyPolicy?.committee ? 1 : 0);

    return (
      <Card style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{t.label.charAt(0).toUpperCase()}</Text>
              <View style={styles.lockBadge}><Ionicons name="lock-closed" size={10} color="#fff" /></View>
            </View>
            <View style={{ marginLeft: Spacing.sm, flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
                <Text style={styles.tierName}>{t.label}</Text>
                <Badge label={`v${t.configVersion || 1}`} color={Colors.primary} bg={Colors.primary + '20'} style={{ marginLeft: 8 }} />
              </View>
              <Text style={styles.tierCode}>{t.tierCode} · {t.pluralLabel}</Text>
            </View>
          </View>
          <TouchableOpacity 
            style={[styles.editBtn, !canWrite && { opacity: 0.5 }]} 
            onPress={() => setEditing(t)}
            disabled={!canWrite}
          >
            <Text style={styles.editBtnText}>Edit</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.metaRow}>
          <Text style={styles.metaText}>{enabledCount}/{CAPABILITY_KEYS.length} capabilities</Text>
          <Text style={styles.metaDot}>·</Text>
          <Text style={styles.metaText}>{bodyCount === 2 ? 'Both bodies' : bodyCount === 1 ? '1 body' : 'no bodies'}</Text>
          <Text style={styles.metaDot}>·</Text>
          <Text style={styles.metaText}>{(t.customFields || []).length} custom fields</Text>
        </View>
      </Card>
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      {err ? (
        <View style={styles.center}><Text style={styles.errorText}>{err}</Text></View>
      ) : (
        <FlatList
          data={tiers}
          keyExtractor={(item) => item._id}
          renderItem={renderTier}
          contentContainerStyle={styles.listContent}
          refreshing={busy}
          onRefresh={load}
          ListHeaderComponent={
            <View style={styles.hero}>
              <View style={styles.heroHeader}>
                <Ionicons name="business" size={28} color={Colors.primary} />
                <Text style={styles.heroTitle}>Unit Type Manager</Text>
              </View>
              <Text style={styles.heroSub}>
                Configure label, plural label, capabilities, and body policy for each of the 5 hierarchy tiers.
              </Text>
            </View>
          }
        />
      )}

      <Modal visible={!!editing} animationType="slide" presentationStyle="pageSheet">
        {editing && (
          <EditTierDialog 
            tier={editing} 
            onClose={() => setEditing(null)} 
            onSaved={() => { setEditing(null); load(); toast.success('Tier updated.'); }}
          />
        )}
      </Modal>
    </SafeAreaView>
  );
}

function EditTierDialog({ tier, onClose, onSaved }) {
  const [label, setLabel] = useState(tier.label || '');
  const [pluralLabel, setPluralLabel] = useState(tier.pluralLabel || '');
  const [description, setDescription] = useState(tier.description || '');
  const [capabilities, setCapabilities] = useState({
    meetings: tier.capabilities?.meetings !== false,
    activities: tier.capabilities?.activities !== false,
    finance: tier.capabilities?.finance !== false,
    cabinet: tier.capabilities?.cabinet !== false,
    committee: tier.capabilities?.committee !== false,
    transfers: tier.capabilities?.transfers !== false,
    performance: tier.capabilities?.performance !== false,
    responsibilities: tier.capabilities?.responsibilities !== false,
  });
  const [bodyPolicy, setBodyPolicy] = useState({
    executive: tier.bodyPolicy?.executive !== false,
    committee: tier.bodyPolicy?.committee !== false,
  });

  const [fieldLibrary, setFieldLibrary] = useState([]);
  const [pickedFieldIds, setPickedFieldIds] = useState(
    () => (tier.customFields || []).map((f) => f._id || f)
  );
  const [fieldsBusy, setFieldsBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setFieldsBusy(true);
      try {
        const r = await api.get('/admin/events/fields');
        if (!cancelled) setFieldLibrary(r.data?.data || []);
      } catch (e) {
        if (!cancelled) toast.error(errorMessage(e));
      } finally {
        if (!cancelled) setFieldsBusy(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const fieldsByIdInLibrary = useMemo(() => {
    const m = new Map();
    for (const f of fieldLibrary) m.set(String(f._id), f);
    return m;
  }, [fieldLibrary]);

  const fieldLookup = useMemo(() => {
    const m = new Map(fieldsByIdInLibrary);
    for (const f of (tier.customFields || [])) {
      const id = String(f._id || f);
      if (!m.has(id) && f.key) m.set(id, f);
    }
    return m;
  }, [fieldsByIdInLibrary, tier.customFields]);

  function toggleField(id) {
    setPickedFieldIds((arr) => arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]);
  }

  function moveField(idx, dir) {
    setPickedFieldIds((arr) => {
      const next = arr.slice();
      const j = idx + dir;
      if (j < 0 || j >= next.length) return arr;
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
  }

  async function save() {
    setBusy(true);
    try {
      const payload = {
        label, pluralLabel, description: description || undefined,
        capabilities, bodyPolicy,
        customFields: pickedFieldIds,
      };
      await api.patch(`/admin/units/tier-configs/${tier.tierCode}`, payload);
      onSaved();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const unpickedFields = fieldLibrary.filter((f) => f.isActive !== false && !pickedFieldIds.includes(String(f._id)));

  return (
    <SafeAreaView style={styles.modalSafe}>
      <View style={styles.modalHeader}>
        <View>
          <Text style={styles.modalTitle}>Edit Tier</Text>
          <Text style={styles.modalSubtitle}>{tier.tierCode}</Text>
        </View>
        <TouchableOpacity style={styles.closeBtn} onPress={onClose} disabled={busy}>
          <Ionicons name="close" size={24} color={Colors.text} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalContent}>
        
        <View style={styles.formGroup}>
          <Text style={styles.label}>Display label</Text>
          <TextInput style={styles.input} value={label} onChangeText={setLabel} maxLength={80} />
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>Plural label</Text>
          <TextInput style={styles.input} value={pluralLabel} onChangeText={setPluralLabel} maxLength={80} />
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>Description (optional)</Text>
          <TextInput 
            style={[styles.input, { height: 80, textAlignVertical: 'top' }]} 
            value={description} 
            onChangeText={setDescription} 
            maxLength={500} 
            multiline 
          />
        </View>

        <Text style={styles.sectionHeader}>Capabilities</Text>
        <View style={styles.capabilitiesGrid}>
          {CAPABILITY_KEYS.map((c) => {
            const on = capabilities[c.key];
            return (
              <TouchableOpacity
                key={c.key}
                style={[styles.capTile, on && styles.capTileOn]}
                onPress={() => setCapabilities(p => ({ ...p, [c.key]: !on }))}
              >
                <View style={[styles.capCheckbox, on && styles.capCheckboxOn]}>
                  {on && <Ionicons name="checkmark" size={14} color="#fff" />}
                </View>
                <Text style={[styles.capText, on && styles.capTextOn]}>{c.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.sectionHeader}>Body Policy</Text>
        <View style={styles.cardSection}>
          <TouchableOpacity 
            style={styles.toggleRow} 
            onPress={() => setBodyPolicy(p => ({ ...p, executive: !p.executive }))}
          >
            <View style={[styles.capCheckbox, bodyPolicy.executive && styles.capCheckboxOn]}>
              {bodyPolicy.executive && <Ionicons name="checkmark" size={14} color="#fff" />}
            </View>
            <Text style={styles.toggleText}>Executive body allowed</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.toggleRow} 
            onPress={() => setBodyPolicy(p => ({ ...p, committee: !p.committee }))}
          >
            <View style={[styles.capCheckbox, bodyPolicy.committee && styles.capCheckboxOn]}>
              {bodyPolicy.committee && <Ionicons name="checkmark" size={14} color="#fff" />}
            </View>
            <Text style={styles.toggleText}>Committee body allowed</Text>
          </TouchableOpacity>
          <Text style={styles.hintText}>
            Below Area level there's typically only the Executive body — switching off Committee here hides committee meetings/activities at this tier.
          </Text>
        </View>

        <Text style={styles.sectionHeader}>Custom Fields ({pickedFieldIds.length})</Text>
        <View style={styles.cardSection}>
          {fieldsBusy && <ActivityIndicator size="small" color={Colors.primary} style={{ marginBottom: 10 }} />}
          
          <Text style={[styles.hintText, { marginBottom: 10 }]}>
            Fields are pinned into the snapshot at unit-instance save time, so changes here apply forward only.
          </Text>

          {pickedFieldIds.length === 0 && (
            <Text style={styles.emptyText}>No custom fields attached.</Text>
          )}

          {pickedFieldIds.map((id, idx) => {
            const f = fieldLookup.get(String(id));
            if (!f) {
              return (
                <View key={id} style={styles.fieldRow}>
                  <Text style={styles.emptyText}>Field {String(id).slice(-6)} (unavailable)</Text>
                  <TouchableOpacity onPress={() => toggleField(String(id))}><Ionicons name="trash" size={18} color={Colors.danger} /></TouchableOpacity>
                </View>
              );
            }
            return (
              <View key={id} style={styles.fieldRow}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={styles.fieldIndex}>{idx + 1}.</Text>
                    <Text style={styles.fieldName}>{f.label}</Text>
                  </View>
                  <Text style={styles.fieldMeta}>{f.key} · {f.type}{f.required ? ' · required' : ''}</Text>
                </View>
                <View style={styles.fieldActions}>
                  <TouchableOpacity disabled={idx === 0} onPress={() => moveField(idx, -1)} style={{ padding: 4, opacity: idx === 0 ? 0.3 : 1 }}>
                    <Ionicons name="arrow-up" size={18} color={Colors.text} />
                  </TouchableOpacity>
                  <TouchableOpacity disabled={idx === pickedFieldIds.length - 1} onPress={() => moveField(idx, +1)} style={{ padding: 4, opacity: idx === pickedFieldIds.length - 1 ? 0.3 : 1 }}>
                    <Ionicons name="arrow-down" size={18} color={Colors.text} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => toggleField(String(id))} style={{ padding: 4 }}>
                    <Ionicons name="trash" size={18} color={Colors.danger} />
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}

          {unpickedFields.length > 0 && (
            <View style={{ marginTop: 20 }}>
              <Text style={{ fontWeight: '600', marginBottom: 10 }}>Add from library ({unpickedFields.length} available)</Text>
              <View style={styles.libraryGrid}>
                {unpickedFields.map(f => (
                  <TouchableOpacity key={f._id} style={styles.libraryPill} onPress={() => toggleField(String(f._id))}>
                    <Text style={styles.libraryPillText}>+ {f.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {!fieldsBusy && fieldLibrary.length === 0 && (
            <Text style={styles.emptyText}>Field library is empty. Define fields under Event Config → Fields first.</Text>
          )}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      <View style={styles.modalFooter}>
        <TouchableOpacity style={[styles.btn, styles.btnSecondary]} onPress={onClose} disabled={busy}>
          <Text style={styles.btnSecondaryText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btn, busy && { opacity: 0.7 }]} onPress={save} disabled={busy}>
          <Text style={styles.btnText}>{busy ? 'Saving...' : 'Save Changes'}</Text>
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
  
  card: { marginBottom: Spacing.md, padding: Spacing.md },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: Spacing.md },
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
  tierName: { fontSize: FontSize.base, fontWeight: '700', color: Colors.text },
  tierCode: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2, fontFamily: 'Courier' },
  
  editBtn: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: Colors.surface, borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border },
  editBtnText: { fontSize: FontSize.xs, fontWeight: '600', color: Colors.text },
  
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', marginTop: 4 },
  metaText: { fontSize: FontSize.xs, color: Colors.textMuted },
  metaDot: { fontSize: FontSize.xs, color: Colors.textMuted, marginHorizontal: 4 },
  
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
  
  formGroup: { marginBottom: Spacing.md },
  label: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.text, marginBottom: 6 },
  input: { 
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, 
    borderRadius: Radius.base, padding: 12, fontSize: FontSize.base, color: Colors.text 
  },
  
  sectionHeader: { fontSize: FontSize.base, fontWeight: '700', color: Colors.text, marginTop: Spacing.lg, marginBottom: Spacing.sm },
  
  capabilitiesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  capTile: { 
    flexDirection: 'row', alignItems: 'center', 
    paddingHorizontal: 12, paddingVertical: 8, 
    borderRadius: Radius.full, 
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface 
  },
  capTileOn: { backgroundColor: Colors.primary + '1A', borderColor: Colors.primary },
  capCheckbox: { 
    width: 18, height: 18, borderRadius: 4, 
    borderWidth: 1, borderColor: Colors.border, 
    marginRight: 8, justifyContent: 'center', alignItems: 'center' 
  },
  capCheckboxOn: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  capText: { fontSize: FontSize.sm, color: Colors.textMuted, fontWeight: '500' },
  capTextOn: { color: Colors.primary, fontWeight: '600' },
  
  cardSection: { 
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, 
    borderRadius: Radius.base, padding: Spacing.md 
  },
  toggleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.md },
  toggleText: { fontSize: FontSize.base, color: Colors.text, fontWeight: '500' },
  hintText: { fontSize: 12, color: Colors.textMuted, lineHeight: 18 },
  
  emptyText: { fontSize: FontSize.sm, color: Colors.textMuted, fontStyle: 'italic' },
  
  fieldRow: { 
    flexDirection: 'row', alignItems: 'center', 
    borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.base, 
    padding: Spacing.sm, marginBottom: 8 
  },
  fieldIndex: { fontSize: FontSize.sm, fontWeight: '700', width: 20 },
  fieldName: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.text },
  fieldMeta: { fontSize: 11, color: Colors.textMuted, marginTop: 2, fontFamily: 'Courier' },
  fieldActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  
  libraryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  libraryPill: { 
    paddingHorizontal: 10, paddingVertical: 6, 
    borderRadius: Radius.full, backgroundColor: Colors.background, 
    borderWidth: 1, borderColor: Colors.border 
  },
  libraryPillText: { fontSize: 12, color: Colors.text, fontWeight: '500' },
  
  modalFooter: { 
    flexDirection: 'row', padding: Spacing.lg, 
    borderTopWidth: 1, borderTopColor: Colors.border, backgroundColor: Colors.background,
    gap: Spacing.md
  },
  btn: { flex: 1, backgroundColor: Colors.primary, paddingVertical: 14, borderRadius: Radius.base, alignItems: 'center' },
  btnText: { color: '#fff', fontSize: FontSize.base, fontWeight: '700' },
  btnSecondary: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  btnSecondaryText: { color: Colors.text, fontSize: FontSize.base, fontWeight: '600' },
});
