import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
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
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api, errorMessage } from '../../../../src/api/client';
import { useAuth } from '../../../../src/context/AuthContext';
import { hasPermission } from '../../../../src/utils/permissions';
import { useToast } from '../../../../src/components/Toast';
import Card from '../../../../src/components/Card';
import Badge from '../../../../src/components/Badge';
import { Colors, FontSize, Radius, Spacing } from '../../../../src/constants/colors';

const CORE_STATES = {
  MEETING: ['DRAFT', 'SCHEDULED', 'IN_PROGRESS', 'PENDING_REPORT', 'FINALIZED', 'CANCELLED'],
  ACTIVITY: ['PLANNED', 'COMPLETED', 'CANCELLED'],
};

export default function EventTypeEditorScreen() {
  const { id } = useLocalSearchParams();
  const { user } = useAuth();
  const toast = useToast();
  const canWrite = hasPermission(user, 'MANAGE_EVENT_CONFIG');

  const [doc, setDoc] = useState(null);
  const [library, setLibrary] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [snapshotOpen, setSnapshotOpen] = useState(false);
  const [snapshotData, setSnapshotData] = useState(null);
  const [snapshotLoading, setSnapshotLoading] = useState(false);

  // Editable form state
  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [sortOrder, setSortOrder] = useState('100');
  const [appliesTo, setAppliesTo] = useState({ executive: true, committee: true });
  const [photoPolicy, setPhotoPolicy] = useState({ required: false, minCount: 0, requireGps: true, requireExif: true });
  const [workflow, setWorkflow] = useState({ extraStates: [], finalizeRequiresPhotos: true });
  const [fieldIds, setFieldIds] = useState([]);
  const [baseline, setBaseline] = useState('');

  async function load() {
    setLoading(true);
    setErr('');
    try {
      const [t, f] = await Promise.all([
        api.get(`/admin/events/types/${id}`),
        api.get('/admin/events/fields', { params: { active: 'true' } }),
      ]);
      const td = t.data?.data;
      setDoc(td);
      setLabel(td.label || '');
      setDescription(td.description || '');
      setIsActive(td.isActive !== false);
      setSortOrder(String(td.sortOrder ?? 100));
      setAppliesTo({
        executive: td.appliesTo?.executive !== false,
        committee: td.appliesTo?.committee !== false,
      });
      setPhotoPolicy({
        required: !!td.photoPolicy?.required,
        minCount: td.photoPolicy?.minCount ?? 0,
        requireGps: td.photoPolicy?.requireGps !== false,
        requireExif: td.photoPolicy?.requireExif !== false,
      });
      setWorkflow({
        extraStates: (td.workflow?.extraStates || []).map((e) => ({ ...e })),
        finalizeRequiresPhotos: td.workflow?.finalizeRequiresPhotos !== false,
      });
      setFieldIds((td.fields || []).map((field) => (typeof field === 'string' ? field : field._id)));
      setLibrary(f.data?.data || []);

      const req = !!td.photoPolicy?.required;
      let mc = Math.max(0, parseInt(td.photoPolicy?.minCount, 10) || 0);
      if (!req) mc = 0; else if (mc < 1) mc = 1;

      setBaseline(JSON.stringify({
        label: td.label || '',
        description: td.description || undefined,
        isActive: td.isActive !== false,
        sortOrder: td.sortOrder ?? 100,
        appliesTo: {
          executive: td.appliesTo?.executive !== false,
          committee: td.appliesTo?.committee !== false,
        },
        photoPolicy: {
          required: req,
          minCount: mc,
          requireGps: td.photoPolicy?.requireGps !== false,
          requireExif: td.photoPolicy?.requireExif !== false,
        },
        workflow: {
          extraStates: (td.workflow?.extraStates || []).map((s) => ({
            code: String(s.code).toUpperCase(),
            label: s.label,
            after: String(s.after).toUpperCase(),
          })),
          finalizeRequiresPhotos: td.workflow?.finalizeRequiresPhotos !== false,
        },
        fields: (td.fields || []).map((field) => (typeof field === 'string' ? field : field._id)),
      }));
    } catch (e) {
      setErr(errorMessage(e));
      toast.error(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [id]);

  const isSystem = !!doc?.isSystem;
  const entity = doc?.entity || 'MEETING';
  const coreStates = CORE_STATES[entity] || CORE_STATES.MEETING;

  function addExtraState() {
    setWorkflow((w) => ({
      ...w,
      extraStates: [...w.extraStates, { code: '', label: '', after: coreStates[0] }],
    }));
  }

  function updateExtraState(idx, patch) {
    setWorkflow((w) => ({
      ...w,
      extraStates: w.extraStates.map((s, i) => (i === idx ? { ...s, ...patch } : s)),
    }));
  }

  function removeExtraState(idx) {
    setWorkflow((w) => ({
      ...w,
      extraStates: w.extraStates.filter((_, i) => i !== idx),
    }));
  }

  function toggleField(fid) {
    if (!canWrite) return;
    setFieldIds((cur) => {
      if (cur.includes(fid)) return cur.filter((x) => x !== fid);
      return [...cur, fid];
    });
  }

  function buildPayload() {
    const required = !!photoPolicy.required;
    let minCount = Math.max(0, parseInt(photoPolicy.minCount, 10) || 0);
    if (!required) minCount = 0; else if (minCount < 1) minCount = 1;

    return {
      label: label.trim(),
      description: description.trim() || undefined,
      isActive,
      sortOrder: parseInt(sortOrder, 10) || 100,
      appliesTo,
      photoPolicy: {
        required,
        minCount,
        requireGps: !!photoPolicy.requireGps,
        requireExif: !!photoPolicy.requireExif,
      },
      workflow: {
        extraStates: workflow.extraStates
          .filter((s) => s.code && s.label && s.after)
          .map((s) => ({
            code: String(s.code).toUpperCase(),
            label: s.label.trim(),
            after: String(s.after).toUpperCase(),
          })),
        finalizeRequiresPhotos: !!workflow.finalizeRequiresPhotos,
      },
      fields: fieldIds,
    };
  }

  const dirty = useMemo(() => {
    return baseline !== '' && JSON.stringify(buildPayload()) !== baseline;
  }, [baseline, label, description, isActive, sortOrder, appliesTo, photoPolicy, workflow, fieldIds]);

  async function handleSave() {
    setErr('');
    if (!label.trim()) {
      setErr('Display label is required.');
      return;
    }
    if (!appliesTo.executive && !appliesTo.committee) {
      setErr('Type must apply to at least one body (Executive or Committee).');
      return;
    }
    const incomplete = workflow.extraStates.filter((s) => (s.code || s.label) && !(s.code && s.label && s.after));
    if (incomplete.length > 0) {
      setErr('Complete or remove the partially-filled workflow extra state(s) before saving.');
      return;
    }

    setSaving(true);
    try {
      await api.patch(`/admin/events/types/${id}`, buildPayload());
      toast.success('Event type saved successfully.');
      load();
    } catch (e) {
      setErr(errorMessage(e));
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  async function openSnapshot() {
    setSnapshotOpen(true);
    setSnapshotLoading(true);
    try {
      const res = await api.get(`/admin/events/types/${id}/snapshot`);
      setSnapshotData(res.data?.data);
    } catch (e) {
      toast.error('Could not load snapshot: ' + errorMessage(e));
    } finally {
      setSnapshotLoading(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (!doc) {
    return (
      <View style={styles.center}>
        <Text style={styles.errText}>Event type not found.</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      {/* Hero Header */}
      <View style={styles.hero}>
        <View style={styles.heroTopRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={20} color="#fff" />
          </TouchableOpacity>
          <View style={{ flex: 1, marginLeft: Spacing.sm }}>
            <Text style={styles.heroTitle}>{doc.label}</Text>
            <Text style={styles.heroCode}>
              {doc.code} · {entity === 'MEETING' ? 'Meeting' : 'Activity'} · v{doc.configVersion || 1}
              {isSystem ? ' · Built-in' : ''}
            </Text>
          </View>
        </View>

        <View style={styles.heroActionsRow}>
          <TouchableOpacity style={styles.snapshotBtn} onPress={openSnapshot}>
            <Ionicons name="eye-outline" size={15} color="#fff" style={{ marginRight: 4 }} />
            <Text style={styles.snapshotBtnText}>Snapshot</Text>
          </TouchableOpacity>
          {canWrite && (
            <TouchableOpacity
              style={[styles.heroSaveBtn, (!dirty || saving) && { opacity: 0.6 }]}
              onPress={handleSave}
              disabled={!dirty || saving}
            >
              {saving ? (
                <ActivityIndicator size="small" color={Colors.primary} />
              ) : (
                <>
                  <Ionicons name="checkmark-sharp" size={16} color={Colors.primary} style={{ marginRight: 4 }} />
                  <Text style={styles.heroSaveBtnText}>Save</Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {err ? (
          <View style={styles.errorBanner}>
            <Ionicons name="alert-circle" size={18} color={Colors.error} style={{ marginRight: 6 }} />
            <Text style={styles.errorText}>{err}</Text>
          </View>
        ) : null}

        {isSystem ? (
          <View style={styles.systemAlert}>
            <Ionicons name="information-circle" size={18} color="#d97706" style={{ marginRight: 8 }} />
            <Text style={styles.systemAlertText}>
              Built-in type. Code is canonical and cannot be deactivated, but display label, photo policy, workflow extras, and fields can be customized.
            </Text>
          </View>
        ) : null}

        {/* 1. Basic Info */}
        <Card style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="information-circle-outline" size={18} color={Colors.primary} />
            <Text style={styles.cardTitle}>Basic Info</Text>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Display Label *</Text>
            <TextInput
              style={[styles.input, !canWrite && styles.inputDisabled]}
              value={label}
              onChangeText={setLabel}
              editable={canWrite}
              placeholder="e.g. Executive Meeting"
              placeholderTextColor={Colors.textMuted}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Description</Text>
            <TextInput
              style={[styles.input, styles.multiline, !canWrite && styles.inputDisabled]}
              value={description}
              onChangeText={setDescription}
              editable={canWrite}
              placeholder="Description and purpose of this event type..."
              placeholderTextColor={Colors.textMuted}
              multiline
              numberOfLines={3}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Sort Order</Text>
            <View style={styles.numberStepperRow}>
              <TouchableOpacity
                style={[styles.stepperBtn, !canWrite && styles.inputDisabled]}
                onPress={() => {
                  if (!canWrite) return;
                  const cur = parseInt(sortOrder, 10) || 0;
                  setSortOrder(String(Math.max(0, cur - 10)));
                }}
                disabled={!canWrite}
              >
                <Ionicons name="remove" size={18} color={Colors.text} />
              </TouchableOpacity>

              <TextInput
                style={[styles.numberInput, !canWrite && styles.inputDisabled]}
                value={sortOrder}
                onChangeText={(v) => setSortOrder(v.replace(/[^0-9]/g, ''))}
                editable={canWrite}
                keyboardType="numeric"
                inputMode="numeric"
                placeholder="100"
                placeholderTextColor={Colors.textMuted}
              />

              <TouchableOpacity
                style={[styles.stepperBtn, !canWrite && styles.inputDisabled]}
                onPress={() => {
                  if (!canWrite) return;
                  const cur = parseInt(sortOrder, 10) || 0;
                  setSortOrder(String(cur + 10));
                }}
                disabled={!canWrite}
              >
                <Ionicons name="add" size={18} color={Colors.text} />
              </TouchableOpacity>
            </View>
            <Text style={styles.hint}>Lower numbers appear first in lists.</Text>
          </View>

          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.switchTitle}>Active Status</Text>
              <Text style={styles.switchSub}>Allow officers to schedule and log this event type</Text>
            </View>
            <Switch
              value={isActive}
              onValueChange={setIsActive}
              disabled={!canWrite || isSystem}
              trackColor={{ true: Colors.primary }}
            />
          </View>
        </Card>

        {/* 2. Body Applicability */}
        <Card style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="people-outline" size={18} color={Colors.primary} />
            <Text style={styles.cardTitle}>Body Applicability</Text>
          </View>
          <Text style={styles.sectionDesc}>
            Control which administrative bodies are authorized to record this {entity.toLowerCase()} type.
          </Text>

          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.switchTitle}>Executive Body</Text>
              <Text style={styles.switchSub}>Executive cabinet can record this type</Text>
            </View>
            <Switch
              value={appliesTo.executive}
              onValueChange={(v) => setAppliesTo((p) => ({ ...p, executive: v }))}
              disabled={!canWrite}
              trackColor={{ true: Colors.primary }}
            />
          </View>

          <View style={[styles.switchRow, styles.dividerRow]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.switchTitle}>Committee Body</Text>
              <Text style={styles.switchSub}>Appointed committees can record this type</Text>
            </View>
            <Switch
              value={appliesTo.committee}
              onValueChange={(v) => setAppliesTo((p) => ({ ...p, committee: v }))}
              disabled={!canWrite}
              trackColor={{ true: Colors.primary }}
            />
          </View>
        </Card>

        {/* 3. Photo Policy */}
        <Card style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="camera-outline" size={18} color={Colors.primary} />
            <Text style={styles.cardTitle}>Photo Policy</Text>
          </View>

          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.switchTitle}>Photos Required</Text>
              <Text style={styles.switchSub}>Require event proof photos before completion/finalization</Text>
            </View>
            <Switch
              value={photoPolicy.required}
              onValueChange={(v) =>
                setPhotoPolicy((p) => ({
                  ...p,
                  required: v,
                  minCount: v ? Math.max(1, p.minCount || 1) : 0,
                }))
              }
              disabled={!canWrite}
              trackColor={{ true: Colors.primary }}
            />
          </View>

          {photoPolicy.required && (
            <View style={[styles.field, { marginTop: Spacing.md }]}>
              <Text style={styles.label}>Minimum Photo Count</Text>
              <View style={styles.numberStepperRow}>
                <TouchableOpacity
                  style={[styles.stepperBtn, (!canWrite || photoPolicy.minCount <= 1) && styles.inputDisabled]}
                  onPress={() => {
                    if (!canWrite) return;
                    setPhotoPolicy((p) => ({
                      ...p,
                      minCount: Math.max(1, (p.minCount || 1) - 1),
                    }));
                  }}
                  disabled={!canWrite || photoPolicy.minCount <= 1}
                >
                  <Ionicons name="remove" size={18} color={Colors.text} />
                </TouchableOpacity>

                <TextInput
                  style={[styles.numberInput, !canWrite && styles.inputDisabled]}
                  value={String(photoPolicy.minCount)}
                  onChangeText={(v) => {
                    const clean = v.replace(/[^0-9]/g, '');
                    if (!clean) {
                      setPhotoPolicy((p) => ({ ...p, minCount: 1 }));
                      return;
                    }
                    const num = parseInt(clean, 10);
                    setPhotoPolicy((p) => ({
                      ...p,
                      minCount: Math.min(20, Math.max(1, num)),
                    }));
                  }}
                  editable={canWrite}
                  keyboardType="numeric"
                  inputMode="numeric"
                  maxLength={2}
                />

                <TouchableOpacity
                  style={[styles.stepperBtn, (!canWrite || photoPolicy.minCount >= 20) && styles.inputDisabled]}
                  onPress={() => {
                    if (!canWrite) return;
                    setPhotoPolicy((p) => ({
                      ...p,
                      minCount: Math.min(20, (p.minCount || 1) + 1),
                    }));
                  }}
                  disabled={!canWrite || photoPolicy.minCount >= 20}
                >
                  <Ionicons name="add" size={18} color={Colors.text} />
                </TouchableOpacity>
              </View>
              <Text style={styles.hint}>Minimum number of photos (1 to 20) required before finalizing.</Text>
            </View>
          )}

          <View style={[styles.switchRow, styles.dividerRow]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.switchTitle}>Require GPS Geotagging</Text>
              <Text style={styles.switchSub}>Verify location coordinates in photo metadata</Text>
            </View>
            <Switch
              value={photoPolicy.requireGps}
              onValueChange={(v) => setPhotoPolicy((p) => ({ ...p, requireGps: v }))}
              disabled={!canWrite}
              trackColor={{ true: Colors.primary }}
            />
          </View>

          <View style={[styles.switchRow, styles.dividerRow]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.switchTitle}>Require EXIF Timestamp</Text>
              <Text style={styles.switchSub}>Validate original capture timestamp from camera</Text>
            </View>
            <Switch
              value={photoPolicy.requireExif}
              onValueChange={(v) => setPhotoPolicy((p) => ({ ...p, requireExif: v }))}
              disabled={!canWrite}
              trackColor={{ true: Colors.primary }}
            />
          </View>
        </Card>

        {/* 4. Workflow Extras */}
        <Card style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="git-branch-outline" size={18} color={Colors.primary} />
            <Text style={styles.cardTitle}>Workflow Extras</Text>
            <Badge label={`${workflow.extraStates.length} extra`} />
          </View>
          <Text style={styles.sectionDesc}>
            Custom workflow states slot in after a chosen core state ({coreStates.join(' → ')}).
          </Text>

          {entity === 'MEETING' && (
            <View style={styles.switchRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.switchTitle}>Finalize Requires Photos</Text>
                <Text style={styles.switchSub}>Meeting cannot be finalized without at least one picture</Text>
              </View>
              <Switch
                value={workflow.finalizeRequiresPhotos}
                onValueChange={(v) => setWorkflow((w) => ({ ...w, finalizeRequiresPhotos: v }))}
                disabled={!canWrite}
                trackColor={{ true: Colors.primary }}
              />
            </View>
          )}

          {workflow.extraStates.map((s, idx) => (
            <View key={idx} style={styles.extraStateBox}>
              <View style={styles.extraStateHeader}>
                <Text style={styles.extraStateNum}>State #{idx + 1}</Text>
                {canWrite && (
                  <TouchableOpacity onPress={() => removeExtraState(idx)}>
                    <Ionicons name="trash-outline" size={16} color={Colors.error} />
                  </TouchableOpacity>
                )}
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>State Code</Text>
                <TextInput
                  style={[styles.input, !canWrite && styles.inputDisabled]}
                  value={s.code}
                  onChangeText={(v) =>
                    updateExtraState(idx, { code: v.toUpperCase().replace(/[^A-Z0-9_]/g, '') })
                  }
                  placeholder="e.g. AWAITING_APPROVAL"
                  placeholderTextColor={Colors.textMuted}
                  editable={canWrite}
                  autoCapitalize="characters"
                />
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Display Label</Text>
                <TextInput
                  style={[styles.input, !canWrite && styles.inputDisabled]}
                  value={s.label}
                  onChangeText={(v) => updateExtraState(idx, { label: v })}
                  placeholder="e.g. Awaiting Approval"
                  placeholderTextColor={Colors.textMuted}
                  editable={canWrite}
                />
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Insert After Core State</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
                  {coreStates.map((cs) => (
                    <TouchableOpacity
                      key={cs}
                      style={[styles.chip, s.after === cs && styles.chipActive]}
                      onPress={() => updateExtraState(idx, { after: cs })}
                      disabled={!canWrite}
                    >
                      <Text style={[styles.chipText, s.after === cs && styles.chipTextActive]}>{cs}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            </View>
          ))}

          {canWrite && (
            <TouchableOpacity style={styles.addStateBtn} onPress={addExtraState}>
              <Ionicons name="add" size={16} color={Colors.primary} style={{ marginRight: 4 }} />
              <Text style={styles.addStateBtnText}>Add Extra State</Text>
            </TouchableOpacity>
          )}
        </Card>

        {/* 5. Custom Fields Library Selection */}
        <Card style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="extension-puzzle-outline" size={18} color={Colors.primary} />
            <Text style={styles.cardTitle}>Custom Field Set</Text>
            <Badge label={`${fieldIds.length} / ${library.length}`} />
          </View>
          <Text style={styles.sectionDesc}>
            Select reusable custom fields that appear in record and finalize forms for this {entity.toLowerCase()} type.
          </Text>

          {library.length === 0 ? (
            <Text style={styles.emptyFieldsText}>No active fields defined in Field Library yet.</Text>
          ) : (
            <View style={styles.fieldsGrid}>
              {library.map((f) => {
                const selected = fieldIds.includes(f._id);
                return (
                  <TouchableOpacity
                    key={f._id}
                    style={[styles.fieldTile, selected && styles.fieldTileActive]}
                    onPress={() => toggleField(f._id)}
                    disabled={!canWrite}
                    activeOpacity={0.7}
                  >
                    <View style={styles.fieldTileTop}>
                      <Ionicons
                        name={selected ? 'checkbox' : 'square-outline'}
                        size={18}
                        color={selected ? Colors.primary : Colors.textMuted}
                      />
                      <Text style={[styles.fieldTileName, selected && styles.fieldTileNameActive]}>
                        {f.label}
                      </Text>
                    </View>
                    <Text style={styles.fieldTileMeta}>
                      <code>{f.key}</code> · {f.type}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </Card>
      </ScrollView>

      {/* Floating Save Footer */}
      {canWrite && (
        <View style={styles.footer}>
          {dirty && <Text style={styles.dirtyNote}>Unsaved changes</Text>}
          <TouchableOpacity
            style={[styles.saveBtn, (!dirty || saving) && { opacity: 0.6 }]}
            onPress={handleSave}
            disabled={!dirty || saving}
          >
            {saving ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.saveBtnText}>Save Configuration</Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* ─── SNAPSHOT PREVIEW MODAL ─── */}
      <Modal visible={snapshotOpen} animationType="slide" transparent>
        <SafeAreaView style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Snapshot Preview</Text>
                <Text style={styles.modalSub}>Configuration state frozen on new records</Text>
              </View>
              <TouchableOpacity onPress={() => setSnapshotOpen(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ padding: Spacing.md }}>
              {snapshotLoading ? (
                <ActivityIndicator size="large" color={Colors.primary} style={{ marginVertical: 30 }} />
              ) : snapshotData ? (
                <View style={styles.codeBlock}>
                  <Text style={styles.codeText}>{JSON.stringify(snapshotData, null, 2)}</Text>
                </View>
              ) : (
                <Text style={{ color: Colors.textMuted }}>No snapshot data available.</Text>
              )}
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setSnapshotOpen(false)}>
                <Text style={styles.modalCloseBtnText}>Close</Text>
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
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errText: { color: Colors.error, fontSize: FontSize.base },
  hero: {
    backgroundColor: Colors.primary,
    padding: Spacing.lg,
    paddingTop: Spacing.md,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backBtn: {
    padding: 6,
    borderRadius: Radius.sm,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  heroTitle: {
    fontSize: FontSize.xl,
    fontWeight: '800',
    color: '#fff',
  },
  heroCode: {
    fontSize: FontSize.xs,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 2,
  },
  heroActionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  snapshotBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  snapshotBtnText: {
    color: '#fff',
    fontSize: FontSize.xs,
    fontWeight: '700',
  },
  heroSaveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: Radius.md,
  },
  heroSaveBtnText: {
    color: Colors.primary,
    fontSize: FontSize.xs,
    fontWeight: '800',
  },
  content: {
    padding: Spacing.md,
    paddingBottom: 110,
  },
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
  systemAlert: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fffbeb',
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: '#fde68a',
  },
  systemAlertText: {
    color: '#b45309',
    fontSize: FontSize.xs,
    fontWeight: '500',
    flex: 1,
  },
  card: {
    marginBottom: Spacing.md,
    padding: Spacing.md,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: Spacing.xs,
  },
  cardTitle: {
    fontSize: FontSize.base,
    fontWeight: '700',
    color: Colors.text,
    flex: 1,
  },
  sectionDesc: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginBottom: Spacing.md,
  },
  field: {
    marginBottom: Spacing.md,
  },
  label: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  hint: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 4,
  },
  input: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 9,
    fontSize: FontSize.sm,
    color: Colors.text,
  },
  numberStepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stepperBtn: {
    width: 42,
    height: 42,
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
    paddingVertical: 9,
    fontSize: FontSize.base,
    fontWeight: '700',
    color: Colors.text,
    textAlign: 'center',
  },
  inputDisabled: {
    opacity: 0.6,
    backgroundColor: '#f8fafc',
  },
  multiline: {
    height: 70,
    textAlignVertical: 'top',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  dividerRow: {
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight || '#f1f5f9',
    marginTop: Spacing.xs,
    paddingTop: Spacing.sm,
  },
  switchTitle: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.text,
  },
  switchSub: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: 2,
  },
  extraStateBox: {
    backgroundColor: Colors.surfaceAlt || '#f8fafc',
    borderRadius: Radius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.md,
  },
  extraStateHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  extraStateNum: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.primary,
    textTransform: 'uppercase',
  },
  chipScroll: {
    flexDirection: 'row',
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    marginRight: 6,
  },
  chipActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary,
  },
  chipText: {
    fontSize: 11,
    color: Colors.textMuted,
    fontWeight: '600',
  },
  chipTextActive: {
    color: '#fff',
    fontWeight: '700',
  },
  addStateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    borderRadius: Radius.md,
    backgroundColor: '#eff6ff',
    paddingVertical: 10,
    marginTop: Spacing.xs,
  },
  addStateBtnText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.primary,
  },
  emptyFieldsText: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontStyle: 'italic',
    paddingVertical: Spacing.sm,
  },
  fieldsGrid: {
    gap: Spacing.sm,
  },
  fieldTile: {
    backgroundColor: Colors.surfaceAlt || '#f8fafc',
    borderRadius: Radius.md,
    padding: Spacing.md,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  fieldTileActive: {
    borderColor: Colors.primary,
    backgroundColor: '#eff6ff',
  },
  fieldTileTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  fieldTileName: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.text,
  },
  fieldTileNameActive: {
    color: Colors.primary,
  },
  fieldTileMeta: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: 4,
    marginLeft: 26,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    padding: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: -2 }, shadowOpacity: 0.1, shadowRadius: 4 },
      android: { elevation: 8 },
      web: { boxShadow: '0 -4px 6px -1px rgba(0, 0, 0, 0.1)' },
    }),
  },
  dirtyNote: {
    fontSize: FontSize.xs,
    color: '#d97706',
    fontWeight: '700',
  },
  saveBtn: {
    flex: 1,
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    paddingVertical: 12,
    alignItems: 'center',
  },
  saveBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: FontSize.sm,
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
      maxWidth: 680,
      boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
    } : {}),
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  modalTitle: {
    fontSize: FontSize.base,
    fontWeight: '700',
    color: Colors.text,
  },
  modalSub: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: 2,
  },
  codeBlock: {
    backgroundColor: '#0f172a',
    borderRadius: Radius.md,
    padding: Spacing.md,
  },
  codeText: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: '#38bdf8',
    fontSize: 11,
    lineHeight: 16,
  },
  modalFooter: {
    padding: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  modalCloseBtn: {
    backgroundColor: Colors.surfaceAlt || '#f1f5f9',
    borderRadius: Radius.md,
    paddingVertical: 10,
    alignItems: 'center',
  },
  modalCloseBtnText: {
    color: Colors.text,
    fontWeight: '700',
    fontSize: FontSize.sm,
  },
});
