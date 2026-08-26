import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, TextInput, Modal, Switch, Platform, Alert, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api, errorMessage } from '../../../../src/api/client';
import { useAuth } from '../../../../src/context/AuthContext';
import { hasPermission } from '../../../../src/utils/permissions';
import { useToast } from '../../../../src/components/Toast';
import { Colors, FontSize, Radius, Spacing } from '../../../../src/constants/colors';
import { Picker } from '@react-native-picker/picker';
import EmptyState from '../../../../src/components/EmptyState';

const TIER_CODES = ['BASIC_UNIT', 'AREA', 'DISTRICT', 'PROVINCE', 'CENTRAL'];
const FORMATS = ['PDF', 'XLSX', 'BOTH'];

export default function ReportTemplatesScreen() {
  const { user } = useAuth();
  const toast = useToast();
  const canWrite = hasPermission(user, 'MANAGE_UNIT_CONFIG');

  const [templates, setTemplates] = useState([]);
  const [sections, setSections] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [renderingFor, setRenderingFor] = useState(null);
  const [editing, setEditing] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);

  async function load() {
    setBusy(true); setErr('');
    try {
      const [tplRes, secRes] = await Promise.all([
        api.get('/admin/units/report-templates'),
        api.get('/admin/units/report-templates/sections'),
      ]);
      setTemplates(tplRes.data?.data || []);
      setSections(secRes.data?.data || []);
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => { load(); }, []);

  async function deleteTemplate(t) {
    if (t.isSystem) return;
    Alert.alert(
      'Confirm Delete',
      `Delete template "${t.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.delete(`/admin/units/report-templates/${t._id}`);
              toast.success('Template deleted.');
              load();
            } catch (e) { toast.error(errorMessage(e)); }
          }
        }
      ]
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <View style={styles.heroHeader}>
          <View style={styles.heroIconBg}>
            <Ionicons name="document-text" size={24} color={Colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroTitle}>Report Templates</Text>
            <Text style={styles.heroSub}>
              Composable PDF / XLSX reports built from pre-built sections.
            </Text>
          </View>
        </View>
        <View style={styles.heroActions}>
          <TouchableOpacity style={styles.btnOutline} onPress={load} disabled={busy}>
            <Ionicons name="refresh" size={16} color={Colors.primary} style={{ marginRight: 6 }} />
            <Text style={styles.btnOutlineText}>Refresh</Text>
          </TouchableOpacity>
          {canWrite && (
            <TouchableOpacity style={styles.btnSolid} onPress={() => setCreateOpen(true)}>
              <Ionicons name="add" size={18} color="#fff" style={{ marginRight: 4 }} />
              <Text style={styles.btnSolidText}>New template</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {err ? <Text style={styles.errorText}>{err}</Text> : null}
      
      {/* Available sections */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Ionicons name="extension-puzzle" size={18} color={Colors.textLight} />
          <Text style={styles.cardTitle}>Available section kinds</Text>
          <View style={styles.badge}><Text style={styles.badgeText}>{sections.length}</Text></View>
        </View>
        <View style={styles.cardBody}>
          <View style={styles.tileGrid}>
            {sections.map((s) => (
              <View key={s.kind} style={styles.tile}>
                <Text style={styles.tileText}>
                  <Text style={styles.codeText}>{s.kind}</Text> · {s.label}
                </Text>
              </View>
            ))}
          </View>
        </View>
      </View>

      {/* Templates */}
      {!busy && templates.length === 0 && (
        <EmptyState icon="document-text" title="No report templates yet — tap 'New template' to compose one." />
      )}

      {templates.map((t) => (
        <View key={t._id} style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="document-text" size={18} color={Colors.textLight} />
            <Text style={styles.cardTitle}>
              {t.name} · {t.format}
              {t.isSystem && ' · built-in'}
              {!t.isActive && ' · inactive'}
            </Text>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>v{t.templateVersion || 1}</Text>
            </View>
          </View>
          <View style={styles.cardBody}>
            {t.description ? <Text style={styles.descriptionText}>{t.description}</Text> : null}
            {(t.tierScope || []).length > 0 && (
              <Text style={styles.scopeText}>
                Scope: {(t.tierScope || []).join(', ')}
              </Text>
            )}
            
            <View style={styles.sectionList}>
              {(t.sections || [])
                .slice()
                .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
                .map((s, i) => (
                  <Text key={i} style={styles.sectionItemText}>
                    {i + 1}. <Text style={styles.codeText}>{s.kind}</Text>
                    {s.title ? ` · "${s.title}"` : ''}
                    {s.config && Object.keys(s.config).length > 0 && (
                      <Text style={styles.mutedText}> · {Object.entries(s.config).map(([k, v]) => `${k}=${v == null ? 'any' : v}`).join(', ')}</Text>
                    )}
                  </Text>
                ))}
            </View>

            <View style={styles.cardActions}>
              <TouchableOpacity style={styles.actionBtn} onPress={() => setRenderingFor(t)} disabled={!t.isActive}>
                <Text style={[styles.actionBtnText, { color: !t.isActive ? Colors.textMuted : Colors.primary }]}>Render</Text>
              </TouchableOpacity>
              {canWrite && (
                <TouchableOpacity style={styles.actionBtn} onPress={() => setEditing(t)}>
                  <Text style={styles.actionBtnText}>Edit</Text>
                </TouchableOpacity>
              )}
              {!t.isSystem && canWrite && (
                <TouchableOpacity style={styles.actionBtn} onPress={() => deleteTemplate(t)}>
                  <Ionicons name="trash" size={14} color={Colors.danger} style={{ marginRight: 4 }} />
                  <Text style={[styles.actionBtnText, { color: Colors.danger }]}>Delete</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      ))}
      <View style={{ height: 40 }} />

      <Modal visible={createOpen || !!editing} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => {
        setCreateOpen(false);
        setEditing(null);
      }}>
        {createOpen && (
          <TemplateEditor
            mode="create"
            sectionRegistry={sections}
            onClose={() => setCreateOpen(false)}
            onSaved={() => { setCreateOpen(false); load(); toast.success('Template created.'); }}
          />
        )}
        {editing && (
          <TemplateEditor
            mode="edit"
            template={editing}
            sectionRegistry={sections}
            onClose={() => setEditing(null)}
            onSaved={() => { setEditing(null); load(); toast.success('Template updated.'); }}
          />
        )}
      </Modal>

      <Modal visible={!!renderingFor} animationType="fade" transparent onRequestClose={() => setRenderingFor(null)}>
        {renderingFor && (
          <RenderDialog template={renderingFor} onClose={() => setRenderingFor(null)} />
        )}
      </Modal>

    </ScrollView>
  );
}

function TemplateEditor({ mode, template, sectionRegistry, onClose, onSaved }) {
  const isEdit = mode === 'edit';
  const [name, setName] = useState(template?.name || '');
  const [description, setDescription] = useState(template?.description || '');
  const [format, setFormat] = useState(template?.format || 'PDF');
  const [tierScope, setTierScope] = useState(template?.tierScope || []);
  const [isActive, setIsActive] = useState(template?.isActive !== false);
  const [pickedSections, setPickedSections] = useState(() => {
    const src = (template?.sections || []).slice().sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
    return src.map((s) => ({
      kind: s.kind,
      title: s.title || '',
      config: { ...(s.config || {}) },
    }));
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const registryByKind = useMemo(() => {
    const m = new Map();
    for (const s of sectionRegistry) m.set(s.kind, s);
    return m;
  }, [sectionRegistry]);

  function addSection(kind) {
    const def = registryByKind.get(kind);
    if (!def) return;
    setPickedSections((arr) => [
      ...arr,
      { kind, title: '', config: { ...(def.defaultConfig || {}) } },
    ]);
  }
  function removeSection(idx) {
    setPickedSections((arr) => arr.filter((_, i) => i !== idx));
  }
  function moveSection(idx, dir) {
    setPickedSections((arr) => {
      const next = arr.slice();
      const j = idx + dir;
      if (j < 0 || j >= next.length) return arr;
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
  }
  function updateSection(idx, patch) {
    setPickedSections((arr) => arr.map((s, i) => i === idx ? { ...s, ...patch } : s));
  }
  function toggleTier(t) {
    setTierScope((arr) => arr.includes(t) ? arr.filter((x) => x !== t) : [...arr, t]);
  }

  async function save() {
    setErr(''); setBusy(true);
    try {
      if (!name.trim() || name.trim().length < 2) throw new Error('Name must be at least 2 characters');
      if (pickedSections.length === 0) throw new Error('Add at least one section');

      const cleanSections = pickedSections.map((s, i) => {
        const out = {
          kind: s.kind,
          sortOrder: (i + 1) * 10,
        };
        if (s.title?.trim()) out.title = s.title.trim();
        if (s.config && Object.keys(s.config).length > 0) {
          const cfg = {};
          for (const [k, v] of Object.entries(s.config)) {
            if (v === '' || v == null) continue;
            cfg[k] = v;
          }
          if (Object.keys(cfg).length > 0) out.config = cfg;
        }
        return out;
      });

      const payload = {
        name: name.trim(),
        sections: cleanSections,
        format,
        isActive,
      };
      if (description.trim()) payload.description = description.trim();
      if (tierScope.length > 0) payload.tierScope = tierScope;

      if (isEdit) {
        await api.patch(`/admin/units/report-templates/${template._id}`, payload);
      } else {
        await api.post('/admin/units/report-templates', payload);
      }
      onSaved();
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.modalContainer}>
      <View style={styles.modalHeader}>
        <Text style={styles.modalTitle}>{isEdit ? 'Edit Template' : 'New Template'}</Text>
        <TouchableOpacity style={styles.modalCloseBtn} onPress={onClose}>
          <Ionicons name="close" size={24} color={Colors.text} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.modalContent} contentContainerStyle={{ padding: Spacing.md, paddingBottom: 60 }}>
        {err ? <Text style={styles.errorText}>{err}</Text> : null}

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Template Details</Text>
          </View>
          <View style={styles.cardBody}>
            <View style={styles.field}>
              <Text style={styles.label}>Name</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="e.g. Monthly Area summary"
                maxLength={120}
              />
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>Description (optional)</Text>
              <TextInput
                style={styles.input}
                value={description}
                onChangeText={setDescription}
                placeholder="Brief description"
                maxLength={500}
              />
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>Format</Text>
              <View style={styles.pickerContainer}>
                <Picker selectedValue={format} onValueChange={setFormat}>
                  {FORMATS.map(f => <Picker.Item key={f} label={f} value={f} />)}
                </Picker>
              </View>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Tier scope (optional)</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
                {TIER_CODES.map((t) => {
                  const active = tierScope.includes(t);
                  return (
                    <TouchableOpacity
                      key={t}
                      style={[styles.tierPill, active && styles.tierPillActive]}
                      onPress={() => toggleTier(t)}
                    >
                      <Text style={[styles.tierPillText, active && styles.tierPillTextActive]}>{t}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <Text style={styles.hintText}>Empty = available to all tiers.</Text>
            </View>
            <View style={[styles.field, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}>
              <Text style={styles.label}>Active</Text>
              <Switch value={isActive} onValueChange={setIsActive} />
            </View>
          </View>
        </View>

        <View style={[styles.card, { marginTop: Spacing.md }]}>
          <View style={styles.cardHeader}>
            <Ionicons name="extension-puzzle" size={18} color={Colors.textLight} />
            <Text style={styles.cardTitle}>Sections</Text>
            <View style={styles.badge}><Text style={styles.badgeText}>{pickedSections.length}</Text></View>
          </View>
          <View style={styles.cardBody}>
            {pickedSections.length === 0 && (
              <Text style={[styles.mutedText, { marginBottom: 12 }]}>No sections added. Pick from below.</Text>
            )}

            {pickedSections.map((s, idx) => {
              const def = registryByKind.get(s.kind);
              const configKeys = Object.keys(def?.defaultConfig || {});
              return (
                <View key={idx} style={styles.sectionConfigBox}>
                  <View style={styles.sectionConfigHeader}>
                    <Text style={styles.sectionConfigTitle}>{idx + 1}. {def?.label || s.kind}</Text>
                    <View style={styles.sectionConfigActions}>
                      <TouchableOpacity onPress={() => moveSection(idx, -1)} disabled={idx === 0} style={styles.iconBtn}>
                        <Ionicons name="arrow-up" size={18} color={idx === 0 ? Colors.border : Colors.text} />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => moveSection(idx, 1)} disabled={idx === pickedSections.length - 1} style={styles.iconBtn}>
                        <Ionicons name="arrow-down" size={18} color={idx === pickedSections.length - 1 ? Colors.border : Colors.text} />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => removeSection(idx)} style={styles.iconBtn}>
                        <Ionicons name="trash" size={18} color={Colors.danger} />
                      </TouchableOpacity>
                    </View>
                  </View>

                  <View style={styles.field}>
                    <Text style={styles.label}>Title override (optional)</Text>
                    <TextInput
                      style={styles.input}
                      value={s.title || ''}
                      onChangeText={(v) => updateSection(idx, { title: v })}
                      placeholder={def?.defaultTitle || 'Section title'}
                    />
                  </View>

                  {configKeys.map((k) => {
                    const fallback = def.defaultConfig[k];
                    const isBool = typeof fallback === 'boolean';
                    const isNum = typeof fallback === 'number';
                    
                    return (
                      <View key={k} style={styles.field}>
                        <Text style={styles.label}>{k}</Text>
                        {isBool ? (
                          <View style={styles.pickerContainer}>
                            <Picker
                              selectedValue={s.config?.[k] == null ? '' : String(s.config[k])}
                              onValueChange={(val) => updateSection(idx, {
                                config: { ...(s.config || {}), [k]: val === '' ? null : val === 'true' }
                              })}
                            >
                              <Picker.Item label={`Default (${String(fallback)})`} value="" />
                              <Picker.Item label="true" value="true" />
                              <Picker.Item label="false" value="false" />
                            </Picker>
                          </View>
                        ) : (
                          <TextInput
                            style={styles.input}
                            keyboardType={isNum ? 'numeric' : 'default'}
                            value={String(s.config?.[k] ?? '')}
                            placeholder={fallback == null ? '(any)' : String(fallback)}
                            onChangeText={(val) => updateSection(idx, {
                              config: {
                                ...(s.config || {}),
                                [k]: val === '' ? '' : (isNum ? Number(val) : val)
                              }
                            })}
                          />
                        )}
                      </View>
                    );
                  })}
                </View>
              );
            })}

            <Text style={[styles.label, { marginTop: 16, marginBottom: 8 }]}>Add Section</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {sectionRegistry.map((def) => (
                <TouchableOpacity
                  key={def.kind}
                  style={styles.addSectionBtn}
                  onPress={() => addSection(def.kind)}
                  disabled={pickedSections.length >= 20}
                >
                  <Text style={styles.addSectionBtnText}>+ {def.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>

      </ScrollView>

      <View style={styles.modalFooter}>
        <TouchableOpacity style={styles.btnOutlineModal} onPress={onClose}>
          <Text style={styles.btnOutlineModalText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btnSolidModal, (busy || pickedSections.length === 0) && styles.btnDisabled]} onPress={save} disabled={busy || pickedSections.length === 0}>
          <Text style={styles.btnSolidModalText}>{busy ? 'Saving...' : 'Save Template'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function RenderDialog({ template, onClose }) {
  const toast = useToast();
  const [unitLevel, setUnitLevel] = useState('AREA');
  const [unitId, setUnitId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [format, setFormat] = useState(template.format === 'BOTH' ? 'PDF' : template.format);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function go() {
    setErr(''); setBusy(true);
    try {
      const params = new URLSearchParams({ unitLevel, unitId, format });
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      if (body) params.set('body', body);
      
      const token = await api.getToken?.();
      const baseUrl = api.defaults.baseURL || 'http://localhost:8000'; // fallback
      const url = `${baseUrl}/api/reports/templates/${template._id}/render?${params}`;
      
      // For mobile, we typically can't just fetch blob + createObjectURL to download.
      // Easiest is to open the URL in the system browser so the OS handles the download.
      const fullUrl = `${url}&token=${token || ''}`; // Or however token auth is supported via GET for downloads on this system.
      // Using Linking is safer for mobile downloads.
      
      const supported = await Linking.canOpenURL(fullUrl);
      if (supported) {
        await Linking.openURL(fullUrl);
        onClose();
      } else {
        throw new Error("Don't know how to open this URL");
      }
      
    } catch (e) {
      setErr(e.message || errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.dialogBackdrop}>
      <View style={styles.dialog}>
        <View style={styles.dialogHeader}>
          <Text style={styles.dialogTitle}>Render "{template.name}"</Text>
          <TouchableOpacity onPress={onClose}><Ionicons name="close" size={24} color={Colors.text} /></TouchableOpacity>
        </View>
        {err ? <Text style={styles.errorText}>{err}</Text> : null}
        
        <ScrollView style={{ maxHeight: '80%' }}>
          <View style={styles.field}>
            <Text style={styles.label}>Unit level</Text>
            <View style={styles.pickerContainer}>
              <Picker selectedValue={unitLevel} onValueChange={setUnitLevel}>
                {TIER_CODES.map(t => <Picker.Item key={t} label={t} value={t} />)}
              </Picker>
            </View>
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>Unit ID</Text>
            <TextInput style={styles.input} value={unitId} onChangeText={setUnitId} placeholder="ObjectId of the unit" />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>From (YYYY-MM-DD)</Text>
            <TextInput style={styles.input} value={from} onChangeText={setFrom} placeholder="e.g. 2024-01-01" />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>To (YYYY-MM-DD)</Text>
            <TextInput style={styles.input} value={to} onChangeText={setTo} placeholder="e.g. 2024-12-31" />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>Format</Text>
            <View style={[styles.pickerContainer, template.format !== 'BOTH' && { opacity: 0.5 }]}>
              <Picker selectedValue={format} onValueChange={setFormat} enabled={template.format === 'BOTH'}>
                <Picker.Item label="PDF" value="PDF" />
                <Picker.Item label="XLSX" value="XLSX" />
              </Picker>
            </View>
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>Body</Text>
            <View style={styles.pickerContainer}>
              <Picker selectedValue={body} onValueChange={setBody}>
                <Picker.Item label="Combined" value="" />
                <Picker.Item label="Executive" value="EXECUTIVE" />
                <Picker.Item label="Committee" value="COMMITTEE" />
              </Picker>
            </View>
            <Text style={styles.hintText}>Filters meetings, activities, etc. Combined pools both.</Text>
          </View>
        </ScrollView>
        
        <View style={[styles.modalFooter, { borderTopWidth: 0, paddingBottom: 0, paddingHorizontal: 0 }]}>
          <TouchableOpacity style={styles.btnOutlineModal} onPress={onClose}>
            <Text style={styles.btnOutlineModalText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.btnSolidModal, (busy || !unitId) && styles.btnDisabled]} onPress={go} disabled={busy || !unitId}>
            <Text style={styles.btnSolidModalText}>{busy ? 'Rendering...' : 'Download'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.md },
  hero: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: Spacing.xl, flexWrap: 'wrap', gap: Spacing.md },
  heroHeader: { flexDirection: 'row', flex: 1, minWidth: 250 },
  heroIconBg: { width: 48, height: 48, borderRadius: Radius.md, backgroundColor: `${Colors.primary}15`, alignItems: 'center', justifyContent: 'center', marginRight: Spacing.md },
  heroTitle: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.text, marginBottom: 4 },
  heroSub: { fontSize: FontSize.sm, color: Colors.textMuted, lineHeight: 20 },
  heroActions: { flexDirection: 'row', gap: Spacing.sm },
  btnOutline: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.border, backgroundColor: '#fff' },
  btnOutlineText: { color: Colors.text, fontWeight: '600', fontSize: FontSize.sm },
  btnSolid: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: Radius.sm, backgroundColor: Colors.primary },
  btnSolidText: { color: '#fff', fontWeight: '600', fontSize: FontSize.sm },
  errorText: { color: Colors.danger, backgroundColor: '#fee2e2', padding: Spacing.md, borderRadius: Radius.sm, marginBottom: Spacing.md, overflow: 'hidden' },
  
  card: { backgroundColor: '#fff', borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, marginBottom: Spacing.md, overflow: 'hidden' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', padding: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border, backgroundColor: '#f9fafb' },
  cardTitle: { fontSize: FontSize.md, fontWeight: '600', color: Colors.text, marginLeft: Spacing.sm, flex: 1 },
  badge: { backgroundColor: Colors.border, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12 },
  badgeText: { fontSize: FontSize.xs, fontWeight: '600', color: Colors.text },
  cardBody: { padding: Spacing.md },
  descriptionText: { fontSize: FontSize.sm, color: Colors.textMuted, marginBottom: 8 },
  scopeText: { fontSize: FontSize.sm, color: Colors.text, marginBottom: 8, fontWeight: '500' },
  
  tileGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: { backgroundColor: '#f3f4f6', paddingHorizontal: 12, paddingVertical: 8, borderRadius: Radius.sm },
  tileText: { fontSize: FontSize.sm, color: Colors.text },
  codeText: { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', color: Colors.primary, backgroundColor: `${Colors.primary}15`, paddingHorizontal: 4, borderRadius: 4 },
  
  sectionList: { marginTop: 8, gap: 4 },
  sectionItemText: { fontSize: FontSize.sm, color: Colors.text, lineHeight: 22 },
  mutedText: { color: Colors.textMuted },
  
  cardActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: Spacing.md, marginTop: Spacing.md, paddingTop: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.border },
  actionBtn: { flexDirection: 'row', alignItems: 'center' },
  actionBtnText: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.primary },
  
  modalContainer: { flex: 1, backgroundColor: Colors.background },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border, backgroundColor: '#fff' },
  modalTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.text },
  modalCloseBtn: { padding: 4 },
  modalContent: { flex: 1 },
  modalFooter: { flexDirection: 'row', justifyContent: 'flex-end', gap: Spacing.md, padding: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.border, backgroundColor: '#fff' },
  btnOutlineModal: { paddingHorizontal: Spacing.md, paddingVertical: 10, borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.border },
  btnOutlineModalText: { fontWeight: '600', color: Colors.text },
  btnSolidModal: { paddingHorizontal: Spacing.md, paddingVertical: 10, borderRadius: Radius.sm, backgroundColor: Colors.primary },
  btnSolidModalText: { fontWeight: '600', color: '#fff' },
  btnDisabled: { opacity: 0.5 },
  
  field: { marginBottom: Spacing.md },
  label: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.text, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm, padding: 10, fontSize: FontSize.sm, backgroundColor: '#fff', color: Colors.text },
  hintText: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 4 },
  pickerContainer: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm, backgroundColor: '#fff', overflow: 'hidden' },
  
  tierPill: { borderWidth: 1, borderColor: Colors.border, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#fff' },
  tierPillActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  tierPillText: { fontSize: FontSize.sm, color: Colors.text },
  tierPillTextActive: { color: '#fff', fontWeight: '600' },
  
  sectionConfigBox: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm, padding: Spacing.md, marginBottom: Spacing.md, backgroundColor: '#fafafa' },
  sectionConfigHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md },
  sectionConfigTitle: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.text },
  sectionConfigActions: { flexDirection: 'row', gap: Spacing.xs },
  iconBtn: { padding: 4 },
  addSectionBtn: { backgroundColor: `${Colors.primary}15`, paddingHorizontal: 12, paddingVertical: 8, borderRadius: Radius.sm },
  addSectionBtnText: { color: Colors.primary, fontWeight: '600', fontSize: FontSize.sm },

  dialogBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: Spacing.lg },
  dialog: { backgroundColor: '#fff', borderRadius: Radius.md, padding: Spacing.md, width: '100%', maxWidth: 400 },
  dialogHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md },
  dialogTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.text },
});
