import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { router } from 'expo-router';
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

const FIELD_TYPES = [
  'TEXT',
  'TEXTAREA',
  'NUMBER',
  'INT',
  'CURRENCY',
  'DATE',
  'BOOL',
  'SELECT',
  'MULTISELECT',
  'MEMBER_REF',
];

const TYPE_HINT = {
  TEXT: 'Single-line text',
  TEXTAREA: 'Multi-line text',
  NUMBER: 'Decimal number',
  INT: 'Whole number',
  CURRENCY: 'Money (rendered with units)',
  DATE: 'Date / date-time',
  BOOL: 'Yes / no toggle',
  SELECT: 'One-of dropdown',
  MULTISELECT: 'Pick multiple values',
  MEMBER_REF: 'Reference to a member',
};

const INITIAL_FIELD_FORM = {
  key: '',
  label: '',
  helpText: '',
  type: 'TEXT',
  required: false,
  isActive: true,
  sortOrder: 100,
  validation: {
    min: '',
    max: '',
    minLength: '',
    maxLength: '',
    regex: '',
    options: [],
  },
  visibility: {
    showOnCreate: true,
    showOnDetail: true,
    showOnList: false,
  },
  reporting: {
    includeInExport: false,
    exportLabel: '',
    exportOrder: 100,
  },
};

export default function FieldLibraryScreen() {
  const { user } = useAuth();
  const toast = useToast();
  const canWrite = hasPermission(user, 'MANAGE_EVENT_CONFIG');

  const [fields, setFields] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingField, setEditingField] = useState(null);
  const [form, setForm] = useState(INITIAL_FIELD_FORM);
  const [keyTouched, setKeyTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  async function load() {
    setLoading(true);
    setErr('');
    try {
      const res = await api.get('/admin/events/fields');
      setFields(res.data?.data || []);
    } catch (e) {
      setErr(errorMessage(e));
      toast.error(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const sorted = useMemo(() => {
    return [...fields].sort((a, b) => {
      if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
      if (a.sortOrder !== b.sortOrder) return (a.sortOrder || 0) - (b.sortOrder || 0);
      return (a.label || '').localeCompare(b.label || '');
    });
  }, [fields]);

  function openCreate() {
    setEditingField(null);
    setForm(INITIAL_FIELD_FORM);
    setKeyTouched(false);
    setErr('');
    setModalOpen(true);
  }

  function openEdit(f) {
    setEditingField(f);
    setKeyTouched(true);
    setErr('');
    setForm({
      key: f.key || '',
      label: f.label || '',
      helpText: f.helpText || '',
      type: f.type || 'TEXT',
      required: !!f.required,
      isActive: f.isActive !== false,
      sortOrder: f.sortOrder ?? 100,
      validation: {
        min: f.validation?.min !== undefined && f.validation?.min !== null ? String(f.validation.min) : '',
        max: f.validation?.max !== undefined && f.validation?.max !== null ? String(f.validation.max) : '',
        minLength: f.validation?.minLength !== undefined && f.validation?.minLength !== null ? String(f.validation.minLength) : '',
        maxLength: f.validation?.maxLength !== undefined && f.validation?.maxLength !== null ? String(f.validation.maxLength) : '',
        regex: f.validation?.regex || '',
        options: (f.validation?.options || []).map((o) => ({ ...o })),
      },
      visibility: {
        showOnCreate: f.visibility?.showOnCreate !== false,
        showOnDetail: f.visibility?.showOnDetail !== false,
        showOnList: !!f.visibility?.showOnList,
      },
      reporting: {
        includeInExport: !!f.reporting?.includeInExport,
        exportLabel: f.reporting?.exportLabel || '',
        exportOrder: f.reporting?.exportOrder ?? 100,
      },
    });
    setModalOpen(true);
  }

  function onLabelChange(text) {
    setForm((p) => {
      const updated = { ...p, label: text };
      if (!keyTouched && !editingField) {
        const slug = text
          .trim()
          .replace(/[^a-zA-Z0-9 ]+/g, '')
          .split(/\s+/)
          .filter(Boolean)
          .map((w, i) => (i === 0 ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1).toLowerCase()))
          .join('');
        updated.key = slug.slice(0, 50);
      }
      return updated;
    });
  }

  function addOption() {
    setForm((p) => ({
      ...p,
      validation: {
        ...p.validation,
        options: [...p.validation.options, { value: '', label: '' }],
      },
    }));
  }

  function updateOption(idx, patch) {
    setForm((p) => ({
      ...p,
      validation: {
        ...p.validation,
        options: p.validation.options.map((o, i) => (i === idx ? { ...o, ...patch } : o)),
      },
    }));
  }

  function removeOption(idx) {
    setForm((p) => ({
      ...p,
      validation: {
        ...p.validation,
        options: p.validation.options.filter((_, i) => i !== idx),
      },
    }));
  }

  const isString = form.type === 'TEXT' || form.type === 'TEXTAREA';
  const isNumber = form.type === 'NUMBER' || form.type === 'INT' || form.type === 'CURRENCY';
  const needsOptions = form.type === 'SELECT' || form.type === 'MULTISELECT';

  async function handleSave() {
    setErr('');
    if (!form.label.trim()) {
      setErr('Display label is required.');
      return;
    }
    if (!editingField && !form.key.trim()) {
      setErr('Machine key is required.');
      return;
    }

    setSaving(true);
    try {
      const v = {};
      if (isString) {
        if (form.validation.minLength !== '') v.minLength = parseInt(form.validation.minLength, 10);
        if (form.validation.maxLength !== '') v.maxLength = parseInt(form.validation.maxLength, 10);
        if (form.validation.regex.trim()) v.regex = form.validation.regex.trim();
      }
      if (isNumber) {
        if (form.validation.min !== '') v.min = Number(form.validation.min);
        if (form.validation.max !== '') v.max = Number(form.validation.max);
      }
      if (needsOptions) {
        v.options = form.validation.options
          .filter((o) => o.value && o.label)
          .map((o) => ({ value: String(o.value).trim(), label: String(o.label).trim() }));
        if (v.options.length === 0) {
          setErr(`${form.type} fields require at least one complete option.`);
          setSaving(false);
          return;
        }
      }

      const payload = {
        label: form.label.trim(),
        helpText: form.helpText.trim() || undefined,
        type: form.type,
        required: form.required,
        validation: v,
        visibility: form.visibility,
        reporting: {
          includeInExport: !!form.reporting.includeInExport,
          exportLabel: form.reporting.exportLabel.trim() || undefined,
          exportOrder: parseInt(form.reporting.exportOrder, 10) || 100,
        },
        isActive: form.isActive,
        sortOrder: parseInt(form.sortOrder, 10) || 100,
      };

      if (!editingField) {
        payload.key = form.key.trim();
        await api.post('/admin/events/fields', payload);
        toast.success('Field created successfully.');
      } else {
        await api.patch(`/admin/events/fields/${editingField._id}`, payload);
        toast.success('Field updated successfully.');
      }
      setModalOpen(false);
      load();
    } catch (e) {
      setErr(errorMessage(e));
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(f) {
    if (!canWrite || f.isSystem) return;
    confirmAction(
      'Delete Field',
      `Delete field "${f.label}" (${f.key})? This is only safe if no event type currently uses it.`,
      async () => {
        try {
          await api.delete(`/admin/events/fields/${f._id}`);
          toast.success('Field deleted.');
          load();
        } catch (e) {
          toast.error(errorMessage(e));
        }
      },
      { confirmText: 'Delete', destructive: true }
    );
  }

  function renderItem({ item: f }) {
    return (
      <Card style={styles.card}>
        <View style={styles.cardRow}>
          <View style={styles.fieldAvatar}>
            <Text style={styles.fieldAvatarChar}>{(f.label || '?').charAt(0).toUpperCase()}</Text>
            {f.isSystem && (
              <View style={styles.systemBadge}>
                <Ionicons name="lock-closed" size={10} color="#fff" />
              </View>
            )}
          </View>

          <View style={{ flex: 1 }}>
            <View style={styles.nameRow}>
              <Text style={styles.fieldName}>{f.label}</Text>
              <Badge label={f.type} color={Colors.primary} bg="#eff6ff" />
              {f.required && <Badge label="Required" color="#b91c1c" bg="#fef2f2" />}
              {!f.isActive && <Badge label="Inactive" color={Colors.textMuted} bg={Colors.borderLight} />}
            </View>

            <View style={styles.metaRow}>
              <Text style={styles.fieldKey}><code>{f.key}</code></Text>
              <Text style={styles.dot}>·</Text>
              <Text style={styles.fieldHint}>{TYPE_HINT[f.type] || f.type}</Text>
              {f.reporting?.includeInExport && (
                <>
                  <Text style={styles.dot}>·</Text>
                  <Text style={styles.exportTag}>📄 in exports</Text>
                </>
              )}
            </View>

            {f.helpText ? <Text style={styles.fieldHelp} numberOfLines={2}>{f.helpText}</Text> : null}
          </View>

          <View style={styles.actionsRow}>
            {canWrite && (
              <TouchableOpacity style={styles.editBtn} onPress={() => openEdit(f)}>
                <Text style={styles.editBtnText}>✎ Edit</Text>
              </TouchableOpacity>
            )}
            {canWrite && !f.isSystem && (
              <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete(f)}>
                <Ionicons name="trash-outline" size={15} color={Colors.error} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Card>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Field Library</Text>
          <Text style={styles.headerSub}>Reusable fields you can attach to meeting / activity types</Text>
        </View>
        {canWrite && (
          <TouchableOpacity style={styles.createBtn} onPress={openCreate}>
            <Ionicons name="add" size={16} color="#fff" style={{ marginRight: 4 }} />
            <Text style={styles.createBtnText}>New Field</Text>
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={sorted}
        renderItem={renderItem}
        keyExtractor={(f) => f._id}
        contentContainerStyle={styles.list}
        onRefresh={load}
        refreshing={loading}
        ListEmptyComponent={
          !loading && <EmptyState icon="🧩" title="No custom fields yet" subtitle="Click 'New Field' to define your first reusable field." />
        }
      />

      {/* ─── FIELD MODAL (Create & Edit) ─── */}
      <Modal visible={modalOpen} animationType="slide" transparent>
        <SafeAreaView style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>{editingField ? 'Edit Field' : 'New Field'}</Text>
                {editingField && (
                  <Text style={styles.modalSub}>
                    <code>{editingField.key}</code> — key is locked after creation
                  </Text>
                )}
              </View>
              <TouchableOpacity onPress={() => !saving && setModalOpen(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.modalBody}>
              {err ? (
                <View style={styles.errorBanner}>
                  <Ionicons name="alert-circle" size={18} color={Colors.error} style={{ marginRight: 6 }} />
                  <Text style={styles.errorText}>{err}</Text>
                </View>
              ) : null}

              {/* Basic Fields */}
              <View style={styles.formField}>
                <Text style={styles.label}>Display Label *</Text>
                <TextInput
                  style={styles.input}
                  value={form.label}
                  onChangeText={onLabelChange}
                  placeholder="e.g. Chief Guest Name"
                  placeholderTextColor={Colors.textMuted}
                  maxLength={120}
                />
              </View>

              <View style={styles.formField}>
                <Text style={styles.label}>Key (machine name) *</Text>
                <TextInput
                  style={[styles.input, editingField && styles.inputDisabled]}
                  value={form.key}
                  onChangeText={(v) => {
                    setKeyTouched(true);
                    setForm((p) => ({ ...p, key: v.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 50) }));
                  }}
                  editable={!editingField}
                  placeholder="chiefGuestName"
                  placeholderTextColor={Colors.textMuted}
                  autoCapitalize="none"
                  maxLength={50}
                />
                <Text style={styles.hint}>
                  {editingField ? 'Locked after creation.' : 'lowercase camelCase, ≤50 chars'}
                </Text>
              </View>

              <View style={styles.formField}>
                <Text style={styles.label}>Help Text</Text>
                <TextInput
                  style={styles.input}
                  value={form.helpText}
                  onChangeText={(v) => setForm((p) => ({ ...p, helpText: v }))}
                  placeholder="Short explanation shown under the input."
                  placeholderTextColor={Colors.textMuted}
                  maxLength={500}
                />
              </View>

              <View style={styles.formField}>
                <Text style={styles.label}>Field Type *</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
                  {FIELD_TYPES.map((t) => (
                    <TouchableOpacity
                      key={t}
                      style={[styles.chip, form.type === t && styles.chipActive]}
                      onPress={() => setForm((p) => ({ ...p, type: t }))}
                    >
                      <Text style={[styles.chipText, form.type === t && styles.chipTextActive]}>{t}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                <Text style={styles.hint}>{TYPE_HINT[form.type] || form.type}</Text>
              </View>

              <View style={styles.formField}>
                <Text style={styles.label}>Sort Order</Text>
                <View style={styles.numberStepperRow}>
                  <TouchableOpacity
                    style={styles.stepperBtn}
                    onPress={() => {
                      const cur = parseInt(form.sortOrder, 10) || 0;
                      setForm((p) => ({ ...p, sortOrder: Math.max(0, cur - 10) }));
                    }}
                  >
                    <Ionicons name="remove" size={18} color={Colors.text} />
                  </TouchableOpacity>
                  <TextInput
                    style={styles.numberInput}
                    value={String(form.sortOrder)}
                    onChangeText={(v) => setForm((p) => ({ ...p, sortOrder: v.replace(/[^0-9]/g, '') }))}
                    keyboardType="numeric"
                    inputMode="numeric"
                    placeholder="100"
                  />
                  <TouchableOpacity
                    style={styles.stepperBtn}
                    onPress={() => {
                      const cur = parseInt(form.sortOrder, 10) || 0;
                      setForm((p) => ({ ...p, sortOrder: cur + 10 }));
                    }}
                  >
                    <Ionicons name="add" size={18} color={Colors.text} />
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.switchRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.switchTitle}>Required</Text>
                  <Text style={styles.switchSub}>Must be filled before saving event records</Text>
                </View>
                <Switch
                  value={form.required}
                  onValueChange={(v) => setForm((p) => ({ ...p, required: v }))}
                  trackColor={{ true: Colors.primary }}
                />
              </View>

              <View style={[styles.switchRow, styles.dividerRow]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.switchTitle}>Active</Text>
                  <Text style={styles.switchSub}>Available to attach to meeting / activity types</Text>
                </View>
                <Switch
                  value={form.isActive}
                  onValueChange={(v) => setForm((p) => ({ ...p, isActive: v }))}
                  disabled={editingField?.isSystem}
                  trackColor={{ true: Colors.primary }}
                />
              </View>

              {/* ─── Validation Block ─── */}
              {(isString || isNumber || needsOptions) && (
                <View style={styles.sectionCard}>
                  <Text style={styles.sectionTitle}>Validation</Text>

                  {isString && (
                    <>
                      <View style={styles.rowTwo}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.subLabel}>Min Length</Text>
                          <TextInput
                            style={styles.input}
                            value={form.validation.minLength}
                            onChangeText={(v) =>
                              setForm((p) => ({
                                ...p,
                                validation: { ...p.validation, minLength: v.replace(/[^0-9]/g, '') },
                              }))
                            }
                            keyboardType="numeric"
                            inputMode="numeric"
                            placeholder="0"
                          />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.subLabel}>Max Length</Text>
                          <TextInput
                            style={styles.input}
                            value={form.validation.maxLength}
                            onChangeText={(v) =>
                              setForm((p) => ({
                                ...p,
                                validation: { ...p.validation, maxLength: v.replace(/[^0-9]/g, '') },
                              }))
                            }
                            keyboardType="numeric"
                            inputMode="numeric"
                            placeholder="500"
                          />
                        </View>
                      </View>

                      <View style={[styles.formField, { marginTop: Spacing.sm }]}>
                        <Text style={styles.subLabel}>Regex (optional)</Text>
                        <TextInput
                          style={styles.input}
                          value={form.validation.regex}
                          onChangeText={(v) =>
                            setForm((p) => ({
                              ...p,
                              validation: { ...p.validation, regex: v },
                            }))
                          }
                          placeholder="^[A-Z]{3}-\d+$"
                          placeholderTextColor={Colors.textMuted}
                          autoCapitalize="none"
                        />
                      </View>
                    </>
                  )}

                  {isNumber && (
                    <View style={styles.rowTwo}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.subLabel}>Min Value</Text>
                        <TextInput
                          style={styles.input}
                          value={form.validation.min}
                          onChangeText={(v) =>
                            setForm((p) => ({
                              ...p,
                              validation: { ...p.validation, min: v },
                            }))
                          }
                          keyboardType="numeric"
                          placeholder="0"
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.subLabel}>Max Value</Text>
                        <TextInput
                          style={styles.input}
                          value={form.validation.max}
                          onChangeText={(v) =>
                            setForm((p) => ({
                              ...p,
                              validation: { ...p.validation, max: v },
                            }))
                          }
                          keyboardType="numeric"
                          placeholder="100000"
                        />
                      </View>
                    </View>
                  )}

                  {needsOptions && (
                    <View>
                      <Text style={styles.subDesc}>
                        {form.type} fields require at least one dropdown option.
                      </Text>
                      {form.validation.options.map((o, idx) => (
                        <View key={idx} style={styles.optionRow}>
                          <TextInput
                            style={[styles.input, { flex: 1 }]}
                            value={o.value}
                            onChangeText={(v) => updateOption(idx, { value: v })}
                            placeholder="Key value (e.g. YES)"
                            placeholderTextColor={Colors.textMuted}
                          />
                          <TextInput
                            style={[styles.input, { flex: 1 }]}
                            value={o.label}
                            onChangeText={(v) => updateOption(idx, { label: v })}
                            placeholder="Display label"
                            placeholderTextColor={Colors.textMuted}
                          />
                          <TouchableOpacity style={styles.removeOptBtn} onPress={() => removeOption(idx)}>
                            <Ionicons name="trash-outline" size={16} color={Colors.error} />
                          </TouchableOpacity>
                        </View>
                      ))}
                      <TouchableOpacity style={styles.addOptBtn} onPress={addOption}>
                        <Ionicons name="add" size={16} color={Colors.primary} style={{ marginRight: 4 }} />
                        <Text style={styles.addOptBtnText}>Add Option</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              )}

              {/* ─── Visibility Block ─── */}
              <View style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>Visibility</Text>
                <View style={styles.switchRow}>
                  <Text style={styles.switchTitle}>Show on create form</Text>
                  <Switch
                    value={form.visibility.showOnCreate}
                    onValueChange={(v) =>
                      setForm((p) => ({ ...p, visibility: { ...p.visibility, showOnCreate: v } }))
                    }
                    trackColor={{ true: Colors.primary }}
                  />
                </View>
                <View style={[styles.switchRow, styles.dividerRow]}>
                  <Text style={styles.switchTitle}>Show on detail page</Text>
                  <Switch
                    value={form.visibility.showOnDetail}
                    onValueChange={(v) =>
                      setForm((p) => ({ ...p, visibility: { ...p.visibility, showOnDetail: v } }))
                    }
                    trackColor={{ true: Colors.primary }}
                  />
                </View>
                <View style={[styles.switchRow, styles.dividerRow]}>
                  <Text style={styles.switchTitle}>Show in list view</Text>
                  <Switch
                    value={form.visibility.showOnList}
                    onValueChange={(v) =>
                      setForm((p) => ({ ...p, visibility: { ...p.visibility, showOnList: v } }))
                    }
                    trackColor={{ true: Colors.primary }}
                  />
                </View>
              </View>

              {/* ─── Reporting Block ─── */}
              <View style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>Reporting</Text>
                <View style={styles.switchRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.switchTitle}>Include in PDF / Excel exports</Text>
                    <Text style={styles.switchSub}>Render this field column in exported reports</Text>
                  </View>
                  <Switch
                    value={form.reporting.includeInExport}
                    onValueChange={(v) =>
                      setForm((p) => ({
                        ...p,
                        reporting: { ...p.reporting, includeInExport: v },
                      }))
                    }
                    trackColor={{ true: Colors.primary }}
                  />
                </View>

                {form.reporting.includeInExport && (
                  <>
                    <View style={[styles.formField, { marginTop: Spacing.sm }]}>
                      <Text style={styles.subLabel}>Export Column Header Label</Text>
                      <TextInput
                        style={styles.input}
                        value={form.reporting.exportLabel}
                        onChangeText={(v) =>
                          setForm((p) => ({
                            ...p,
                            reporting: { ...p.reporting, exportLabel: v },
                          }))
                        }
                        placeholder="(defaults to display label)"
                        placeholderTextColor={Colors.textMuted}
                        maxLength={120}
                      />
                    </View>

                    <View style={styles.formField}>
                      <Text style={styles.subLabel}>Export Order</Text>
                      <TextInput
                        style={styles.input}
                        value={String(form.reporting.exportOrder)}
                        onChangeText={(v) =>
                          setForm((p) => ({
                            ...p,
                            reporting: { ...p.reporting, exportOrder: v.replace(/[^0-9]/g, '') },
                          }))
                        }
                        keyboardType="numeric"
                        inputMode="numeric"
                        placeholder="100"
                      />
                    </View>
                  </>
                )}
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setModalOpen(false)}
                disabled={saving}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, saving && { opacity: 0.7 }]}
                onPress={handleSave}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.saveBtnText}>{editingField ? 'Save Changes' : 'Create Field'}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: { fontSize: FontSize.lg, fontWeight: '800', color: Colors.text },
  headerSub: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  createBtn: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  createBtnText: { color: '#fff', fontWeight: '700', fontSize: FontSize.sm },
  list: { padding: Spacing.md, paddingBottom: 60 },
  card: { marginBottom: Spacing.sm, padding: Spacing.md },
  cardRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  fieldAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  fieldAvatarChar: {
    fontSize: FontSize.base,
    fontWeight: '800',
    color: Colors.primary,
  },
  systemBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    backgroundColor: Colors.text,
    borderRadius: 6,
    padding: 2,
  },
  nameRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginBottom: 3 },
  fieldName: { fontSize: FontSize.base, fontWeight: '700', color: Colors.text },
  metaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4 },
  fieldKey: { fontSize: FontSize.xs, color: Colors.textMuted, fontFamily: 'monospace' },
  dot: { fontSize: FontSize.xs, color: Colors.textMuted },
  fieldHint: { fontSize: FontSize.xs, color: Colors.textLight },
  exportTag: { fontSize: 11, color: Colors.primary, fontWeight: '600' },
  fieldHelp: { fontSize: FontSize.xs, color: Colors.textLight, marginTop: 4, fontStyle: 'italic' },
  actionsRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  editBtn: {
    backgroundColor: '#eff6ff',
    borderRadius: Radius.md,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  editBtnText: { fontSize: FontSize.xs, color: Colors.primary, fontWeight: '700' },
  deleteBtn: {
    backgroundColor: '#fef2f2',
    borderRadius: Radius.md,
    padding: 6,
    borderWidth: 1,
    borderColor: '#fecaca',
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: Platform.OS === 'web' ? 'center' : 'flex-end',
    alignItems: Platform.OS === 'web' ? 'center' : 'stretch',
    padding: Platform.OS === 'web' ? Spacing.lg : 0,
  },
  modalContainer: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    ...(Platform.OS === 'web' ? {
      borderRadius: Radius.xl,
      width: '100%',
      maxWidth: 620,
      boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
    } : {}),
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  modalTitle: { fontSize: FontSize.base, fontWeight: '700', color: Colors.text },
  modalSub: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  modalBody: { padding: Spacing.lg, paddingBottom: 30 },
  modalFooter: { flexDirection: 'row', gap: Spacing.md, padding: Spacing.lg, borderTopWidth: 1, borderTopColor: Colors.border },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef2f2',
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  errorText: {
    color: Colors.error,
    fontSize: FontSize.xs,
    fontWeight: '600',
    flex: 1,
  },
  formField: { marginBottom: Spacing.md },
  label: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.text, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 },
  subLabel: { fontSize: 11, fontWeight: '700', color: Colors.text, marginBottom: 4 },
  hint: { fontSize: 11, color: Colors.textMuted, marginTop: 3 },
  subDesc: { fontSize: 12, color: Colors.textMuted, marginBottom: 8 },
  input: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: 9, fontSize: FontSize.sm, color: Colors.text },
  inputDisabled: { opacity: 0.6, backgroundColor: '#f8fafc' },
  chipScroll: { flexDirection: 'row', marginBottom: 4 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    marginRight: 6,
  },
  chipActive: { borderColor: Colors.primary, backgroundColor: Colors.primary },
  chipText: { fontSize: 11, color: Colors.textMuted, fontWeight: '600' },
  chipTextActive: { color: '#fff', fontWeight: '700' },
  numberStepperRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepperBtn: {
    width: 38,
    height: 38,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceAlt || '#f1f5f9',
    borderWidth: 1,
    borderColor: Colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  numberInput: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.text,
    textAlign: 'center',
  },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 },
  dividerRow: { borderTopWidth: 1, borderTopColor: Colors.borderLight || '#f1f5f9', marginTop: Spacing.xs, paddingTop: Spacing.sm },
  switchTitle: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.text },
  switchSub: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  sectionCard: {
    backgroundColor: Colors.surfaceAlt || '#f8fafc',
    borderRadius: Radius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.md,
    marginTop: Spacing.xs,
  },
  sectionTitle: {
    fontSize: FontSize.xs,
    fontWeight: '800',
    color: Colors.text,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: Spacing.sm,
  },
  rowTwo: { flexDirection: 'row', gap: Spacing.md },
  optionRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  removeOptBtn: { padding: 6 },
  addOptBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    borderRadius: Radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 4,
  },
  addOptBtnText: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.primary },
  cancelBtn: { flex: 1, borderRadius: Radius.md, paddingVertical: 12, alignItems: 'center', backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  cancelBtnText: { color: Colors.text, fontWeight: '600', fontSize: FontSize.sm },
  saveBtn: { flex: 2, borderRadius: Radius.md, paddingVertical: 12, alignItems: 'center', backgroundColor: Colors.primary },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: FontSize.sm },
});
