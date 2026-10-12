import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  Alert,
} from 'react-native';
import { Colors, FontSize, Radius, Spacing } from '../constants/colors';
import { api, errorMessage } from '../api/client';
import { useLanguage } from '../context/LanguageContext';
import MobilePashtoKeyboardHelper from './MobilePashtoKeyboardHelper';

export default function MobileProformaEditorModal({
  visible,
  onClose,
  formType,
  year,
  month,
  unitId,
  areaId,
  districtId,
  provinceId,
  unitLevel,
  unitName,
  onSaved,
}) {
  const { t, isRTL } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [formData, setFormData] = useState({});
  const [metadata, setMetadata] = useState({});
  const [activeTab, setActiveTab] = useState('summary'); // 'summary' | 'rows' | 'notes'
  const [activeInputKey, setActiveInputKey] = useState(null); // tracking for keyboard insertion

  useEffect(() => {
    if (!visible) return;
    loadData();
  }, [visible, formType, year, month, unitId, areaId, provinceId]);

  async function loadData() {
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const res = await api.get('/proforma/entry', {
        params: {
          formType,
          year,
          month,
          unitId,
          areaId,
          provinceId,
        },
      });
      setFormData(res.data?.data || {});
      setMetadata(res.data?.metadata || {});
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const payload = {
        formType,
        year: parseInt(year, 10),
        month: parseInt(month, 10),
        unitId: (formType === 'form5' ? provinceId : (['form1', 'form2', 'form3'].includes(formType) ? areaId : unitId)),
        areaId,
        districtId,
        provinceId,
        unitLevel,
        unitName,
        data: formData,
        notes: formData.notes || metadata.notes || '',
      };
      const res = await api.post('/proforma/save', payload);
      setSuccess('رپورټ په ډيټابيس کې په برياليتوب سره ثبت شو!');
      setMetadata((prev) => ({
        ...prev,
        status: 'SUBMITTED',
        submittedByName: res.data?.report?.submittedByName || 'You',
        submittedByRole: res.data?.report?.submittedByRole || 'Officer',
        submittedAt: new Date().toISOString(),
      }));
      if (onSaved) onSaved(res.data?.report);
      Alert.alert('برياليتوب (Success)', 'رپورټ په ډيټابيس کې خوندي شو (Report stored in DB)');
    } catch (e) {
      setError(errorMessage(e));
      Alert.alert('تېروتنه (Error)', errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  function updateField(key, val) {
    setFormData((prev) => ({ ...prev, [key]: val }));
  }

  function updateRowField(rowIndex, colKey, val) {
    setFormData((prev) => {
      const rows = [...(prev.rows || [])];
      if (rows[rowIndex]) {
        rows[rowIndex] = { ...rows[rowIndex], [colKey]: val };
      }
      return { ...prev, rows };
    });
  }

  function addRow() {
    setFormData((prev) => {
      const rows = [...(prev.rows || [])];
      rows.push({
        serial: rows.length + 1,
        name: '',
        role: '',
        bloodGroup: '',
      });
      return { ...prev, rows };
    });
  }

  function handleKeyboardInsert(text) {
    if (!activeInputKey) return;
    if (typeof activeInputKey === 'string') {
      const cur = formData[activeInputKey] || '';
      updateField(activeInputKey, cur + text);
    } else if (typeof activeInputKey === 'object' && activeInputKey.rowIndex != null) {
      const { rowIndex, colKey } = activeInputKey;
      const cur = formData.rows?.[rowIndex]?.[colKey] || '';
      updateRowField(rowIndex, colKey, cur + text);
    }
  }

  function handleKeyboardBackspace() {
    if (!activeInputKey) return;
    if (typeof activeInputKey === 'string') {
      const cur = formData[activeInputKey] || '';
      if (cur.length > 0) updateField(activeInputKey, cur.slice(0, -1));
    } else if (typeof activeInputKey === 'object' && activeInputKey.rowIndex != null) {
      const { rowIndex, colKey } = activeInputKey;
      const cur = formData.rows?.[rowIndex]?.[colKey] || '';
      if (cur.length > 0) updateRowField(rowIndex, colKey, cur.slice(0, -1));
    }
  }

  if (!visible) return null;
  const rows = formData.rows || [];

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalContainer}>
        {/* Header */}
        <View style={styles.modalHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.modalTitle}>د کار او فعاليت رپورټ ثبتول</Text>
            <Text style={styles.modalSubtitle}>
              {formType?.toUpperCase()} · {month}/{year} · {unitName || formData.unitName || 'Unit'}
            </Text>
          </View>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeBtnText}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* Status bar */}
        <View
          style={[
            styles.statusBar,
            metadata.status === 'SUBMITTED' ? styles.statusSubmitted : styles.statusDraft,
          ]}
        >
          <Text style={styles.statusText}>
            {metadata.status === 'SUBMITTED'
              ? '✅ په ډيټابيس کې خوندي شوی (Saved in Database)'
              : '📝 مسوده / نه دی ثبت شوی (Draft / Not Saved)'}
          </Text>
        </View>

        {/* Pashto Keyboard Component */}
        <View style={{ paddingHorizontal: Spacing.md }}>
          <MobilePashtoKeyboardHelper
            onInsert={handleKeyboardInsert}
            onBackspace={handleKeyboardBackspace}
          />
        </View>

        {/* Tabs */}
        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'summary' && styles.tabBtnActive]}
            onPress={() => setActiveTab('summary')}
          >
            <Text style={[styles.tabBtnText, activeTab === 'summary' && styles.tabBtnTextActive]}>
              عمومي ارقام (Summary)
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'rows' && styles.tabBtnActive]}
            onPress={() => setActiveTab('rows')}
          >
            <Text style={[styles.tabBtnText, activeTab === 'rows' && styles.tabBtnTextActive]}>
              د غړو جدول ({rows.length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'notes' && styles.tabBtnActive]}
            onPress={() => setActiveTab('notes')}
          >
            <Text style={[styles.tabBtnText, activeTab === 'notes' && styles.tabBtnTextActive]}>
              يادښتونه (Notes)
            </Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.centerBox}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.loadingText}>ډاټا راښکل کيږي...</Text>
          </View>
        ) : (
          <ScrollView style={styles.scrollBody} contentContainerStyle={{ paddingBottom: 40 }}>
            {/* Tab 1: Summary */}
            {activeTab === 'summary' && (
              <View style={styles.section}>
                {formType === 'form4' && (
                  <>
                    <View style={styles.field}>
                      <Text style={styles.fieldLabel}>د کاري کميټۍ د غونډې نېټه:</Text>
                      <TextInput
                        style={styles.input}
                        value={formData.executiveMeetingDate || ''}
                        onFocus={() => setActiveInputKey('executiveMeetingDate')}
                        onChangeText={(v) => updateField('executiveMeetingDate', v)}
                        placeholder="مثلا: 10 اکتوبر 2026"
                        placeholderTextColor="#64748b"
                      />
                    </View>
                    <View style={styles.field}>
                      <Text style={styles.fieldLabel}>د عمومي غونډې نېټه:</Text>
                      <TextInput
                        style={styles.input}
                        value={formData.generalBodyMeetingDate || ''}
                        onFocus={() => setActiveInputKey('generalBodyMeetingDate')}
                        onChangeText={(v) => updateField('generalBodyMeetingDate', v)}
                        placeholder="مثلا: 25 اکتوبر 2026"
                        placeholderTextColor="#64748b"
                      />
                    </View>
                    <View style={styles.field}>
                      <Text style={styles.fieldLabel}>ټول ملګري (Total Members):</Text>
                      <TextInput
                        style={styles.input}
                        keyboardType="numeric"
                        value={String(formData.totalMembers ?? '')}
                        onFocus={() => setActiveInputKey('totalMembers')}
                        onChangeText={(v) => updateField('totalMembers', parseInt(v, 10) || 0)}
                      />
                    </View>
                    <View style={styles.field}>
                      <Text style={styles.fieldLabel}>غير فعاله ملګري (Inactive):</Text>
                      <TextInput
                        style={styles.input}
                        keyboardType="numeric"
                        value={String(formData.inactiveMembers ?? '')}
                        onFocus={() => setActiveInputKey('inactiveMembers')}
                        onChangeText={(v) => updateField('inactiveMembers', parseInt(v, 10) || 0)}
                      />
                    </View>
                    <View style={styles.field}>
                      <Text style={styles.fieldLabel}>حاضري سلنه % (Attendance %):</Text>
                      <TextInput
                        style={styles.input}
                        value={formData.attendanceRate || ''}
                        onFocus={() => setActiveInputKey('attendanceRate')}
                        onChangeText={(v) => updateField('attendanceRate', v)}
                        placeholder="75%"
                        placeholderTextColor="#64748b"
                      />
                    </View>
                    <View style={styles.field}>
                      <Text style={styles.fieldLabel}>مياشتنی حدف چنده (Target Dues):</Text>
                      <TextInput
                        style={styles.input}
                        keyboardType="numeric"
                        value={String(formData.monthlyTargetDues ?? '')}
                        onFocus={() => setActiveInputKey('monthlyTargetDues')}
                        onChangeText={(v) => updateField('monthlyTargetDues', parseInt(v, 10) || 0)}
                      />
                    </View>
                    <View style={styles.field}>
                      <Text style={styles.fieldLabel}>ټولټال وصولي / چنده (Collected):</Text>
                      <TextInput
                        style={styles.input}
                        keyboardType="numeric"
                        value={String(formData.totalDuesCollected ?? '')}
                        onFocus={() => setActiveInputKey('totalDuesCollected')}
                        onChangeText={(v) => updateField('totalDuesCollected', parseInt(v, 10) || 0)}
                      />
                    </View>
                    <View style={styles.field}>
                      <Text style={styles.fieldLabel}>د سټډي سرکلونو شمېر:</Text>
                      <TextInput
                        style={styles.input}
                        keyboardType="numeric"
                        value={String(formData.studyCirclesCount ?? '')}
                        onFocus={() => setActiveInputKey('studyCirclesCount')}
                        onChangeText={(v) => updateField('studyCirclesCount', parseInt(v, 10) || 0)}
                      />
                    </View>
                  </>
                )}

                {['form1', 'form2', 'form3'].includes(formType) && (
                  <>
                    <View style={styles.field}>
                      <Text style={styles.fieldLabel}>د علاقائي غونډې نېټه:</Text>
                      <TextInput
                        style={styles.input}
                        value={formData.areaMeetingDate || ''}
                        onFocus={() => setActiveInputKey('areaMeetingDate')}
                        onChangeText={(v) => updateField('areaMeetingDate', v)}
                      />
                    </View>
                    <View style={styles.field}>
                      <Text style={styles.fieldLabel}>ټول ابتدائي يونټونه:</Text>
                      <TextInput
                        style={styles.input}
                        keyboardType="numeric"
                        value={String(formData.totalUnitsCount ?? '')}
                        onFocus={() => setActiveInputKey('totalUnitsCount')}
                        onChangeText={(v) => updateField('totalUnitsCount', parseInt(v, 10) || 0)}
                      />
                    </View>
                    <View style={styles.field}>
                      <Text style={styles.fieldLabel}>فعاله يونټونه:</Text>
                      <TextInput
                        style={styles.input}
                        keyboardType="numeric"
                        value={String(formData.activeUnitsCount ?? '')}
                        onFocus={() => setActiveInputKey('activeUnitsCount')}
                        onChangeText={(v) => updateField('activeUnitsCount', parseInt(v, 10) || 0)}
                      />
                    </View>
                    <View style={styles.field}>
                      <Text style={styles.fieldLabel}>ټولټال وصولي (Total Dues):</Text>
                      <TextInput
                        style={styles.input}
                        keyboardType="numeric"
                        value={String(formData.totalDuesCollected ?? '')}
                        onFocus={() => setActiveInputKey('totalDuesCollected')}
                        onChangeText={(v) => updateField('totalDuesCollected', parseInt(v, 10) || 0)}
                      />
                    </View>
                  </>
                )}

                {formType === 'form5' && (
                  <>
                    <View style={styles.field}>
                      <Text style={styles.fieldLabel}>د صوبائي غونډې نېټه:</Text>
                      <TextInput
                        style={styles.input}
                        value={formData.meetingDate || ''}
                        onFocus={() => setActiveInputKey('meetingDate')}
                        onChangeText={(v) => updateField('meetingDate', v)}
                      />
                    </View>
                    <View style={styles.field}>
                      <Text style={styles.fieldLabel}>ټولټال راټولې شوې چندې:</Text>
                      <TextInput
                        style={styles.input}
                        keyboardType="numeric"
                        value={String(formData.totalDuesCollected ?? '')}
                        onFocus={() => setActiveInputKey('totalDuesCollected')}
                        onChangeText={(v) => updateField('totalDuesCollected', parseInt(v, 10) || 0)}
                      />
                    </View>
                  </>
                )}
              </View>
            )}

            {/* Tab 2: Rows / Executive Records */}
            {activeTab === 'rows' && (
              <View style={styles.section}>
                <TouchableOpacity style={styles.addRowBtn} onPress={addRow}>
                  <Text style={styles.addRowBtnText}>➕ غړی اضافه کول (Add Row)</Text>
                </TouchableOpacity>

                {rows.map((r, i) => (
                  <View key={i} style={styles.rowCard}>
                    <View style={styles.rowCardHeader}>
                      <Text style={styles.rowNum}>#{i + 1}</Text>
                      <Text style={styles.rowCardTitle}>{r.name || r.unitName || 'New Member'}</Text>
                      <Text style={styles.rowCardRole}>({r.role || r.totalMembers || 'Role'})</Text>
                    </View>

                    <View style={styles.rowFieldGroup}>
                      <Text style={styles.miniLabel}>نوم:</Text>
                      <TextInput
                        style={styles.miniInput}
                        value={r.name || r.unitName || ''}
                        onFocus={() => setActiveInputKey({ rowIndex: i, colKey: formType === 'form2' ? 'unitName' : 'name' })}
                        onChangeText={(v) => updateRowField(i, formType === 'form2' ? 'unitName' : 'name', v)}
                      />
                    </View>

                    <View style={styles.rowFieldGroup}>
                      <Text style={styles.miniLabel}>عهده:</Text>
                      <TextInput
                        style={styles.miniInput}
                        value={r.role || r.totalMembers || ''}
                        onFocus={() => setActiveInputKey({ rowIndex: i, colKey: formType === 'form2' ? 'totalMembers' : 'role' })}
                        onChangeText={(v) => updateRowField(i, formType === 'form2' ? 'totalMembers' : 'role', v)}
                      />
                    </View>

                    {formType === 'form4' && (
                      <View style={styles.miniGrid}>
                        <View style={styles.miniGridItem}>
                          <Text style={styles.miniLabel}>کاري غونډه:</Text>
                          <TextInput
                            style={styles.miniInput}
                            value={String(r.executiveMeetingsAttended ?? '')}
                            onChangeText={(v) => updateRowField(i, 'executiveMeetingsAttended', v)}
                          />
                        </View>
                        <View style={styles.miniGridItem}>
                          <Text style={styles.miniLabel}>عمومي غونډه:</Text>
                          <TextInput
                            style={styles.miniInput}
                            value={String(r.generalBodyMeetingsAttended ?? '')}
                            onChangeText={(v) => updateRowField(i, 'generalBodyMeetingsAttended', v)}
                          />
                        </View>
                        <View style={styles.miniGridItem}>
                          <Text style={styles.miniLabel}>جلسې:</Text>
                          <TextInput
                            style={styles.miniInput}
                            value={String(r.ralliesAttended ?? '')}
                            onChangeText={(v) => updateRowField(i, 'ralliesAttended', v)}
                          />
                        </View>
                        <View style={styles.miniGridItem}>
                          <Text style={styles.miniLabel}>مظاهرې:</Text>
                          <TextInput
                            style={styles.miniInput}
                            value={String(r.protestsAttended ?? '')}
                            onChangeText={(v) => updateRowField(i, 'protestsAttended', v)}
                          />
                        </View>
                        <View style={styles.miniGridItem}>
                          <Text style={styles.miniLabel}>چنده وصولي:</Text>
                          <TextInput
                            style={styles.miniInput}
                            value={String(r.donationsCollected ?? '')}
                            onChangeText={(v) => updateRowField(i, 'donationsCollected', v)}
                          />
                        </View>
                        <View style={styles.miniGridItem}>
                          <Text style={styles.miniLabel}>مطالعه:</Text>
                          <TextInput
                            style={styles.miniInput}
                            value={String(r.partyLiteratureRead ?? '')}
                            onChangeText={(v) => updateRowField(i, 'partyLiteratureRead', v)}
                          />
                        </View>
                      </View>
                    )}

                    {formType === 'form5' && (
                      <View style={styles.miniGrid}>
                        <View style={styles.miniGridItem}>
                          <Text style={styles.miniLabel}>صوبائي غونډې:</Text>
                          <TextInput
                            style={styles.miniInput}
                            value={String(r.provincialCabinetMeetings ?? '')}
                            onChangeText={(v) => updateRowField(i, 'provincialCabinetMeetings', v)}
                          />
                        </View>
                        <View style={styles.miniGridItem}>
                          <Text style={styles.miniLabel}>جلسې:</Text>
                          <TextInput
                            style={styles.miniInput}
                            value={String(r.ralliesRallies ?? '')}
                            onChangeText={(v) => updateRowField(i, 'ralliesRallies', v)}
                          />
                        </View>
                        <View style={styles.miniGridItem}>
                          <Text style={styles.miniLabel}>مظاهرې:</Text>
                          <TextInput
                            style={styles.miniInput}
                            value={String(r.protestsStrikes ?? '')}
                            onChangeText={(v) => updateRowField(i, 'protestsStrikes', v)}
                          />
                        </View>
                        <View style={styles.miniGridItem}>
                          <Text style={styles.miniLabel}>دورې:</Text>
                          <TextInput
                            style={styles.miniInput}
                            value={String(r.toursVisitsCount ?? '')}
                            onChangeText={(v) => updateRowField(i, 'toursVisitsCount', v)}
                          />
                        </View>
                        <View style={styles.miniGridItem}>
                          <Text style={styles.miniLabel}>مياشتنۍ چنده:</Text>
                          <TextInput
                            style={styles.miniInput}
                            value={String(r.duesPaidMonthly ?? '')}
                            onChangeText={(v) => updateRowField(i, 'duesPaidMonthly', v)}
                          />
                        </View>
                      </View>
                    )}

                    <View style={{ marginTop: 6 }}>
                      <Text style={styles.miniLabel}>نوټ / تبصره:</Text>
                      <TextInput
                        style={styles.miniInput}
                        value={r.notes || ''}
                        onFocus={() => setActiveInputKey({ rowIndex: i, colKey: 'notes' })}
                        onChangeText={(v) => updateRowField(i, 'notes', v)}
                      />
                    </View>
                  </View>
                ))}
              </View>
            )}

            {/* Tab 3: Notes */}
            {activeTab === 'notes' && (
              <View style={styles.section}>
                <Text style={styles.fieldLabel}>د سينئر مرستيال يا مسؤل ځانګړې تبصره:</Text>
                <TextInput
                  style={[styles.input, { height: 120, textAlignVertical: 'top' }]}
                  multiline
                  numberOfLines={6}
                  value={formData.notes || ''}
                  onFocus={() => setActiveInputKey('notes')}
                  onChangeText={(v) => updateField('notes', v)}
                  placeholder="دلته خپل نوټونه وليکئ..."
                  placeholderTextColor="#64748b"
                />
              </View>
            )}
          </ScrollView>
        )}

        {/* Footer Actions */}
        <View style={styles.footer}>
          <TouchableOpacity style={styles.secondaryBtn} onPress={onClose} disabled={saving}>
            <Text style={styles.secondaryBtnText}>بندول (Close)</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving || loading}>
            {saving ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.saveBtnText}>💾 په ډيټابيس کې خوندي کول (Save in DB)</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    backgroundColor: '#0b1120',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.md,
    backgroundColor: '#1e293b',
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  modalTitle: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: '#38bdf8',
  },
  modalSubtitle: {
    fontSize: FontSize.xs,
    color: '#94a3b8',
    marginTop: 2,
  },
  closeBtn: {
    padding: 8,
  },
  closeBtnText: {
    fontSize: 20,
    color: '#94a3b8',
  },
  statusBar: {
    paddingVertical: 6,
    paddingHorizontal: Spacing.md,
  },
  statusSubmitted: {
    backgroundColor: 'rgba(34, 197, 94, 0.2)',
  },
  statusDraft: {
    backgroundColor: 'rgba(234, 179, 8, 0.2)',
  },
  statusText: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    color: '#f8fafc',
    textAlign: 'center',
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#1e293b',
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
  },
  tabBtnActive: {
    borderBottomWidth: 2,
    borderBottomColor: '#38bdf8',
  },
  tabBtnText: {
    fontSize: FontSize.xs,
    color: '#94a3b8',
    fontWeight: '600',
  },
  tabBtnTextActive: {
    color: '#38bdf8',
    fontWeight: '700',
  },
  scrollBody: {
    flex: 1,
    padding: Spacing.md,
  },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  loadingText: {
    color: '#94a3b8',
    marginTop: 8,
  },
  section: {
    gap: 12,
  },
  field: {
    marginBottom: Spacing.xs,
  },
  fieldLabel: {
    fontSize: FontSize.xs,
    color: '#94a3b8',
    marginBottom: 4,
    fontWeight: '600',
  },
  input: {
    backgroundColor: '#1e293b',
    color: '#f8fafc',
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: '#334155',
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: FontSize.sm,
  },
  addRowBtn: {
    backgroundColor: '#0284c7',
    paddingVertical: 8,
    borderRadius: Radius.sm,
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  addRowBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: FontSize.sm,
  },
  rowCard: {
    backgroundColor: '#1e293b',
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: '#334155',
    padding: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  rowCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  rowNum: {
    color: '#38bdf8',
    fontWeight: '700',
  },
  rowCardTitle: {
    color: '#f8fafc',
    fontWeight: '700',
    fontSize: FontSize.sm,
  },
  rowCardRole: {
    color: '#94a3b8',
    fontSize: FontSize.xs,
  },
  rowFieldGroup: {
    marginBottom: 6,
  },
  miniLabel: {
    color: '#94a3b8',
    fontSize: 10,
    marginBottom: 2,
  },
  miniInput: {
    backgroundColor: '#0f172a',
    color: '#f8fafc',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: FontSize.xs,
  },
  miniGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  miniGridItem: {
    flex: 1,
    minWidth: '28%',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.md,
    backgroundColor: '#1e293b',
    borderTopWidth: 1,
    borderTopColor: '#334155',
    gap: 10,
  },
  secondaryBtn: {
    flex: 1,
    paddingVertical: 10,
    backgroundColor: '#334155',
    borderRadius: Radius.sm,
    alignItems: 'center',
  },
  secondaryBtnText: {
    color: '#e2e8f0',
    fontWeight: '600',
  },
  saveBtn: {
    flex: 2,
    paddingVertical: 10,
    backgroundColor: '#16a34a',
    borderRadius: Radius.sm,
    alignItems: 'center',
  },
  saveBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: FontSize.sm,
  },
});
