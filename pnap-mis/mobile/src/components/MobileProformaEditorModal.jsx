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
  }, [visible, formType, year, month, unitId, areaId, districtId, provinceId]);

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
          districtId,
          provinceId,
        },
      });
      const d = res.data?.data || {};
      if (formType === 'form9' && (!d.rows || d.rows.length === 0) && Array.isArray(d.sec1Members)) {
        d.rows = d.sec1Members;
      }
      setFormData(d);
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
      const resolvedTargetId =
        formType === 'form5'
          ? (provinceId || unitId)
          : (['form6', 'form7', 'form8', 'form9'].includes(formType)
            ? (districtId || unitId)
            : (['form1', 'form2', 'form3'].includes(formType)
              ? (areaId || unitId)
              : unitId));

      const payloadData = { ...formData };
      if (formType === 'form9') {
        payloadData.sec1Members = formData.rows || [];
      }

      const payload = {
        formType,
        year: parseInt(year, 10),
        month: parseInt(month, 10),
        unitId: resolvedTargetId,
        areaId,
        districtId: ['form6', 'form7', 'form8', 'form9'].includes(formType) ? (districtId || resolvedTargetId) : districtId,
        provinceId,
        unitLevel,
        unitName,
        data: payloadData,
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

  function getFieldValue(key, defaultVal = '') {
    if (formData[key] !== undefined && formData[key] !== null) return formData[key];
    if (formData.upper && formData.upper[key] !== undefined && formData.upper[key] !== null) {
      return formData.upper[key];
    }
    return defaultVal;
  }

  function updateField(key, val) {
    setFormData((prev) => {
      const next = { ...prev, [key]: val };
      if (prev.upper) {
        next.upper = { ...prev.upper, [key]: val };
      }
      return next;
    });
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
      let newRow = { serial: rows.length + 1 };
      if (formType === 'form1') {
        newRow = {
          ...newRow,
          srNo: rows.length + 1,
          name: '',
          role: '',
          areaExecMeetings: 1,
          areaCommMeetings: 1,
          buExecMeetings: 0,
          buMeetings: 0,
          rallies: 0,
          jirgas: 0,
          studyCircles: 0,
          monthlyDues: 0,
          bloodZakat: 0,
          reading: '',
          notes: '',
        };
      } else if (formType === 'form2') {
        newRow = {
          ...newRow,
          srNo: rows.length + 1,
          unitName: '',
          totalMembers: 0,
          execMeetingsHeld: 1,
          gbPresent: 0,
          studyCircles: 0,
          rallies: 0,
          duesCollected: 0,
          emergencyDonations: 0,
          notes: '',
        };
      } else if (formType === 'form3') {
        newRow = {
          ...newRow,
          srNo: rows.length + 1,
          name: '',
          role: '',
          meetingsAttended: 1,
          ralliesAttended: 0,
          duesPaid: 0,
          notes: '',
        };
      } else if (formType === 'form4') {
        newRow = {
          ...newRow,
          srNo: rows.length + 1,
          name: '',
          role: '',
          executiveMeetingsAttended: 1,
          generalBodyMeetingsAttended: 1,
          ralliesAttended: 0,
          protestsAttended: 0,
          donationsCollected: 0,
          partyLiteratureRead: '',
          notes: '',
        };
      } else if (formType === 'form5') {
        newRow = {
          ...newRow,
          srNo: rows.length + 1,
          name: '',
          role: '',
          provincialCabinetMeetings: 1,
          ralliesRallies: 0,
          protestsStrikes: 0,
          toursVisitsCount: 0,
          duesPaidMonthly: 0,
          notes: '',
        };
      } else if (formType === 'form6') {
        newRow = {
          ...newRow,
          srNo: rows.length + 1,
          name: '',
          role: '',
          distExec: 1,
          distExecMeeting: 1,
          distComm: 1,
          distCommMeeting: 1,
          ralliesAndProtests: 0,
          jirgasAndCornerMeetings: 0,
          dues: 0,
          notes: '',
        };
      } else if (formType === 'form7') {
        newRow = {
          ...newRow,
          srNo: rows.length + 1,
          areaName: '',
          execHeld: 1,
          commHeld: 1,
          buCount: 0,
          membershipTotal: 0,
          ralliesCount: 0,
          duesMonthly: 0,
          notes: '',
        };
      } else if (formType === 'form8') {
        newRow = {
          ...newRow,
          srNo: rows.length + 1,
          name: '',
          distCommMeeting: 1,
          areaExecMeeting: 0,
          publicGatherings: 0,
          totalMeetings: 1,
          monthlyDues: 0,
          activeStatus: 'فعاله',
          notes: '',
        };
      } else if (formType === 'form9') {
        newRow = {
          ...newRow,
          srNo: rows.length + 1,
          name: '',
          organRole: '',
          totalMeetings: 1,
          publicGatherings: 0,
          conferences: 0,
          monthlyDues: 0,
          notes: '',
        };
      } else {
        newRow = {
          ...newRow,
          name: '',
          role: '',
          notes: '',
        };
      }
      rows.push(newRow);
      return { ...prev, rows };
    });
  }

  function removeRow(rowIndex) {
    setFormData((prev) => {
      const rows = [...(prev.rows || [])];
      rows.splice(rowIndex, 1);
      return { ...prev, rows };
    });
  }

  function handleKeyboardInsert(text) {
    if (!activeInputKey) return;
    if (typeof activeInputKey === 'string') {
      const cur = String(getFieldValue(activeInputKey) || '');
      updateField(activeInputKey, cur + text);
    } else if (typeof activeInputKey === 'object' && activeInputKey.rowIndex != null) {
      const { rowIndex, colKey } = activeInputKey;
      const cur = String(formData.rows?.[rowIndex]?.[colKey] || '');
      updateRowField(rowIndex, colKey, cur + text);
    }
  }

  function handleKeyboardBackspace() {
    if (!activeInputKey) return;
    if (typeof activeInputKey === 'string') {
      const cur = String(getFieldValue(activeInputKey) || '');
      if (cur.length > 0) updateField(activeInputKey, cur.slice(0, -1));
    } else if (typeof activeInputKey === 'object' && activeInputKey.rowIndex != null) {
      const { rowIndex, colKey } = activeInputKey;
      const cur = String(formData.rows?.[rowIndex]?.[colKey] || '');
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
              {formType === 'form2'
                ? `يونټونه (${rows.length})`
                : (formType === 'form7'
                  ? `علاقائي يونټونه (${rows.length})`
                  : (formType === 'form8'
                    ? `کميټي غړي (${rows.length})`
                    : (formType === 'form9'
                      ? `د ادارو غړي (${rows.length})`
                      : `ملګري / جدول (${rows.length})`)))}
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
                        value={String(getFieldValue('executiveMeetingDate') || '')}
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
                        value={String(getFieldValue('generalBodyMeetingDate') || '')}
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
                        value={String(getFieldValue('totalMembers', ''))}
                        onFocus={() => setActiveInputKey('totalMembers')}
                        onChangeText={(v) => updateField('totalMembers', parseInt(v, 10) || 0)}
                      />
                    </View>
                    <View style={styles.field}>
                      <Text style={styles.fieldLabel}>غير فعاله ملګري (Inactive):</Text>
                      <TextInput
                        style={styles.input}
                        keyboardType="numeric"
                        value={String(getFieldValue('inactiveMembers', ''))}
                        onFocus={() => setActiveInputKey('inactiveMembers')}
                        onChangeText={(v) => updateField('inactiveMembers', parseInt(v, 10) || 0)}
                      />
                    </View>
                    <View style={styles.field}>
                      <Text style={styles.fieldLabel}>حاضري سلنه % (Attendance %):</Text>
                      <TextInput
                        style={styles.input}
                        value={String(getFieldValue('attendanceRate') || '')}
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
                        value={String(getFieldValue('monthlyTargetDues', ''))}
                        onFocus={() => setActiveInputKey('monthlyTargetDues')}
                        onChangeText={(v) => updateField('monthlyTargetDues', parseInt(v, 10) || 0)}
                      />
                    </View>
                    <View style={styles.field}>
                      <Text style={styles.fieldLabel}>ټولټال وصولي / چنده (Collected):</Text>
                      <TextInput
                        style={styles.input}
                        keyboardType="numeric"
                        value={String(getFieldValue('totalDuesCollected', ''))}
                        onFocus={() => setActiveInputKey('totalDuesCollected')}
                        onChangeText={(v) => updateField('totalDuesCollected', parseInt(v, 10) || 0)}
                      />
                    </View>
                    <View style={styles.field}>
                      <Text style={styles.fieldLabel}>د سټډي سرکلونو شمېر:</Text>
                      <TextInput
                        style={styles.input}
                        keyboardType="numeric"
                        value={String(getFieldValue('studyCirclesCount', ''))}
                        onFocus={() => setActiveInputKey('studyCirclesCount')}
                        onChangeText={(v) => updateField('studyCirclesCount', parseInt(v, 10) || 0)}
                      />
                    </View>
                  </>
                )}

                {formType === 'form1' && (
                  <>
                    <View style={styles.field}>
                      <Text style={styles.fieldLabel}>د علاقائي ايګزيکټيو د غونډې نېټه:</Text>
                      <TextInput
                        style={styles.input}
                        value={String(getFieldValue('execDate') || getFieldValue('executiveMeetingDate') || '')}
                        onFocus={() => setActiveInputKey('execDate')}
                        onChangeText={(v) => {
                          updateField('execDate', v);
                          updateField('executiveMeetingDate', v);
                        }}
                        placeholder="مثلا: 24 اکتوبر 2026"
                        placeholderTextColor="#64748b"
                      />
                    </View>
                    <View style={styles.field}>
                      <Text style={styles.fieldLabel}>ايګزيکټيو کښي حاضر ملګري (Present):</Text>
                      <TextInput
                        style={styles.input}
                        keyboardType="numeric"
                        value={String(getFieldValue('execPresent', ''))}
                        onFocus={() => setActiveInputKey('execPresent')}
                        onChangeText={(v) => updateField('execPresent', parseInt(v, 10) || 0)}
                      />
                    </View>
                    <View style={styles.field}>
                      <Text style={styles.fieldLabel}>ايګزيکټيو کښي غير حاضر (Absent):</Text>
                      <TextInput
                        style={styles.input}
                        keyboardType="numeric"
                        value={String(getFieldValue('execAbsent', ''))}
                        onFocus={() => setActiveInputKey('execAbsent')}
                        onChangeText={(v) => updateField('execAbsent', parseInt(v, 10) || 0)}
                      />
                    </View>
                    <View style={styles.field}>
                      <Text style={styles.fieldLabel}>د علاقائي کميټۍ د غونډې نېټه:</Text>
                      <TextInput
                        style={styles.input}
                        value={String(getFieldValue('commDate') || getFieldValue('committeeMeetingDate') || '')}
                        onFocus={() => setActiveInputKey('commDate')}
                        onChangeText={(v) => {
                          updateField('commDate', v);
                          updateField('committeeMeetingDate', v);
                        }}
                        placeholder="مثلا: 28 اکتوبر 2026"
                        placeholderTextColor="#64748b"
                      />
                    </View>
                    <View style={styles.field}>
                      <Text style={styles.fieldLabel}>ټول ماتحت بنسټيز يونټونه (Total Units):</Text>
                      <TextInput
                        style={styles.input}
                        keyboardType="numeric"
                        value={String(getFieldValue('totalUnitsCount', ''))}
                        onFocus={() => setActiveInputKey('totalUnitsCount')}
                        onChangeText={(v) => updateField('totalUnitsCount', parseInt(v, 10) || 0)}
                      />
                    </View>
                    <View style={styles.field}>
                      <Text style={styles.fieldLabel}>فعاله يونټونه (Active Units):</Text>
                      <TextInput
                        style={styles.input}
                        keyboardType="numeric"
                        value={String(getFieldValue('activeUnitsCount', ''))}
                        onFocus={() => setActiveInputKey('activeUnitsCount')}
                        onChangeText={(v) => updateField('activeUnitsCount', parseInt(v, 10) || 0)}
                      />
                    </View>
                    <View style={styles.field}>
                      <Text style={styles.fieldLabel}>جلسې او اولسي لاريونونه (Rallies):</Text>
                      <TextInput
                        style={styles.input}
                        keyboardType="numeric"
                        value={String(getFieldValue('ralliesCount', ''))}
                        onFocus={() => setActiveInputKey('ralliesCount')}
                        onChangeText={(v) => updateField('ralliesCount', parseInt(v, 10) || 0)}
                      />
                    </View>
                    <View style={styles.field}>
                      <Text style={styles.fieldLabel}>جرګې او اولسي ناستې (Jirgas):</Text>
                      <TextInput
                        style={styles.input}
                        keyboardType="numeric"
                        value={String(getFieldValue('jirgasCount', ''))}
                        onFocus={() => setActiveInputKey('jirgasCount')}
                        onChangeText={(v) => updateField('jirgasCount', parseInt(v, 10) || 0)}
                      />
                    </View>
                    <View style={styles.field}>
                      <Text style={styles.fieldLabel}>ټولټال چنده (Total Dues PKR):</Text>
                      <TextInput
                        style={styles.input}
                        keyboardType="numeric"
                        value={String(getFieldValue('totalDuesCollected', getFieldValue('totalDonations', '')))}
                        onFocus={() => setActiveInputKey('totalDuesCollected')}
                        onChangeText={(v) => {
                          const n = parseInt(v, 10) || 0;
                          updateField('totalDuesCollected', n);
                          updateField('totalDonations', n);
                        }}
                      />
                    </View>
                  </>
                )}

                {formType === 'form2' && (
                  <>
                    <View style={styles.field}>
                      <Text style={styles.fieldLabel}>د علاقائي غونډې نېټه:</Text>
                      <TextInput
                        style={styles.input}
                        value={String(getFieldValue('areaMeetingDate') || '')}
                        onFocus={() => setActiveInputKey('areaMeetingDate')}
                        onChangeText={(v) => updateField('areaMeetingDate', v)}
                        placeholder="مثلا: 15 اکتوبر 2026"
                        placeholderTextColor="#64748b"
                      />
                    </View>
                    <View style={styles.field}>
                      <Text style={styles.fieldLabel}>ټول ابتدائي يونټونه (Basic Units):</Text>
                      <TextInput
                        style={styles.input}
                        keyboardType="numeric"
                        value={String(getFieldValue('totalUnitsCount', rows.length))}
                        onFocus={() => setActiveInputKey('totalUnitsCount')}
                        onChangeText={(v) => updateField('totalUnitsCount', parseInt(v, 10) || 0)}
                      />
                    </View>
                    <View style={styles.field}>
                      <Text style={styles.fieldLabel}>فعاله يونټونه (Active Units):</Text>
                      <TextInput
                        style={styles.input}
                        keyboardType="numeric"
                        value={String(getFieldValue('activeUnitsCount', ''))}
                        onFocus={() => setActiveInputKey('activeUnitsCount')}
                        onChangeText={(v) => updateField('activeUnitsCount', parseInt(v, 10) || 0)}
                      />
                    </View>
                    <View style={styles.field}>
                      <Text style={styles.fieldLabel}>ټولټال وصولي / چنده (Total Dues PKR):</Text>
                      <TextInput
                        style={styles.input}
                        keyboardType="numeric"
                        value={String(getFieldValue('totalDuesCollected', ''))}
                        onFocus={() => setActiveInputKey('totalDuesCollected')}
                        onChangeText={(v) => updateField('totalDuesCollected', parseInt(v, 10) || 0)}
                      />
                    </View>
                  </>
                )}

                {formType === 'form3' && (
                  <>
                    <View style={styles.field}>
                      <Text style={styles.fieldLabel}>د علاقائي غونډې نېټه:</Text>
                      <TextInput
                        style={styles.input}
                        value={String(getFieldValue('areaMeetingDate') || '')}
                        onFocus={() => setActiveInputKey('areaMeetingDate')}
                        onChangeText={(v) => updateField('areaMeetingDate', v)}
                        placeholder="مثلا: 18 اکتوبر 2026"
                        placeholderTextColor="#64748b"
                      />
                    </View>
                    <View style={styles.field}>
                      <Text style={styles.fieldLabel}>غير فعاله يونټونه (Inactive Units):</Text>
                      <TextInput
                        style={styles.input}
                        keyboardType="numeric"
                        value={String(getFieldValue('inactiveUnitsCount', ''))}
                        onFocus={() => setActiveInputKey('inactiveUnitsCount')}
                        onChangeText={(v) => updateField('inactiveUnitsCount', parseInt(v, 10) || 0)}
                      />
                    </View>
                    <View style={styles.field}>
                      <Text style={styles.fieldLabel}>اولسي پروګرامونه او لاريونونه:</Text>
                      <TextInput
                        style={styles.input}
                        keyboardType="numeric"
                        value={String(getFieldValue('ralliesAndProtests', ''))}
                        onFocus={() => setActiveInputKey('ralliesAndProtests')}
                        onChangeText={(v) => updateField('ralliesAndProtests', parseInt(v, 10) || 0)}
                      />
                    </View>
                    <View style={styles.field}>
                      <Text style={styles.fieldLabel}>قومي جرګې (Jirgas):</Text>
                      <TextInput
                        style={styles.input}
                        keyboardType="numeric"
                        value={String(getFieldValue('jirgasCount', ''))}
                        onFocus={() => setActiveInputKey('jirgasCount')}
                        onChangeText={(v) => updateField('jirgasCount', parseInt(v, 10) || 0)}
                      />
                    </View>
                    <View style={styles.field}>
                      <Text style={styles.fieldLabel}>فکري ناستې / سټډي سرکلونه:</Text>
                      <TextInput
                        style={styles.input}
                        keyboardType="numeric"
                        value={String(getFieldValue('studyCirclesCount', ''))}
                        onFocus={() => setActiveInputKey('studyCirclesCount')}
                        onChangeText={(v) => updateField('studyCirclesCount', parseInt(v, 10) || 0)}
                      />
                    </View>
                    <View style={styles.field}>
                      <Text style={styles.fieldLabel}>ټولټال راټولې شوې چندې (PKR):</Text>
                      <TextInput
                        style={styles.input}
                        keyboardType="numeric"
                        value={String(getFieldValue('totalDuesCollected', getFieldValue('totalDonations', '')))}
                        onFocus={() => setActiveInputKey('totalDuesCollected')}
                        onChangeText={(v) => {
                          const n = parseInt(v, 10) || 0;
                          updateField('totalDuesCollected', n);
                          updateField('totalDonations', n);
                        }}
                      />
                    </View>
                  </>
                )}

                {formType === 'form5' && (
                  <>
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                      <View style={[styles.field, { flex: 1 }]}>
                        <Text style={styles.fieldLabel}>د پيل نېټه (From Date):</Text>
                        <TextInput
                          style={styles.input}
                          value={String(getFieldValue('fromDate', `01/${String(month).padStart(2, '0')}`))}
                          onFocus={() => setActiveInputKey('fromDate')}
                          onChangeText={(v) => updateField('fromDate', v)}
                          placeholder="01/10"
                          placeholderTextColor="#64748b"
                        />
                      </View>
                      <View style={[styles.field, { flex: 1 }]}>
                        <Text style={styles.fieldLabel}>د پای نېټه (To Date):</Text>
                        <TextInput
                          style={styles.input}
                          value={String(getFieldValue('toDate', `30/${String(month).padStart(2, '0')}`))}
                          onFocus={() => setActiveInputKey('toDate')}
                          onChangeText={(v) => updateField('toDate', v)}
                          placeholder="31/10"
                          placeholderTextColor="#64748b"
                        />
                      </View>
                    </View>
                    <View style={styles.field}>
                      <Text style={styles.fieldLabel}>د صوبائي کابينې د غونډې نېټه:</Text>
                      <TextInput
                        style={styles.input}
                        value={String(getFieldValue('meetingDate') || '')}
                        onFocus={() => setActiveInputKey('meetingDate')}
                        onChangeText={(v) => updateField('meetingDate', v)}
                        placeholder="مثلا: 12 اکتوبر 2026"
                        placeholderTextColor="#64748b"
                      />
                    </View>
                    <View style={styles.field}>
                      <Text style={styles.fieldLabel}>ټولټال راټولې شوې چندې (PKR):</Text>
                      <TextInput
                        style={styles.input}
                        keyboardType="numeric"
                        value={String(getFieldValue('totalDuesCollected', ''))}
                        onFocus={() => setActiveInputKey('totalDuesCollected')}
                        onChangeText={(v) => updateField('totalDuesCollected', parseInt(v, 10) || 0)}
                      />
                    </View>
                  </>
                )}

                {formType === 'form6' && (
                  <>
                    <View style={styles.field}>
                      <Text style={styles.fieldLabel}>د ضلعي ايګزيکټيو د غونډې نېټه:</Text>
                      <TextInput
                        style={styles.input}
                        value={String(getFieldValue('execDate') || '')}
                        onFocus={() => setActiveInputKey('execDate')}
                        onChangeText={(v) => updateField('execDate', v)}
                        placeholder="مثلا: 14 اکتوبر 2026"
                        placeholderTextColor="#64748b"
                      />
                    </View>
                    <View style={styles.field}>
                      <Text style={styles.fieldLabel}>د ايګزيکټيو د غونډې حاضري %:</Text>
                      <TextInput
                        style={styles.input}
                        value={String(getFieldValue('execPct') || '')}
                        onFocus={() => setActiveInputKey('execPct')}
                        onChangeText={(v) => updateField('execPct', v)}
                        placeholder="85%"
                        placeholderTextColor="#64748b"
                      />
                    </View>
                    <View style={styles.field}>
                      <Text style={styles.fieldLabel}>د ضلعي کميټۍ د غونډې نېټه:</Text>
                      <TextInput
                        style={styles.input}
                        value={String(getFieldValue('commDate') || '')}
                        onFocus={() => setActiveInputKey('commDate')}
                        onChangeText={(v) => updateField('commDate', v)}
                        placeholder="مثلا: 20 اکتوبر 2026"
                        placeholderTextColor="#64748b"
                      />
                    </View>
                    <View style={styles.field}>
                      <Text style={styles.fieldLabel}>ماتحت علاقائي يونټونه (Area Units):</Text>
                      <TextInput
                        style={styles.input}
                        keyboardType="numeric"
                        value={String(getFieldValue('areasCount', ''))}
                        onFocus={() => setActiveInputKey('areasCount')}
                        onChangeText={(v) => updateField('areasCount', parseInt(v, 10) || 0)}
                      />
                    </View>
                    <View style={styles.field}>
                      <Text style={styles.fieldLabel}>ماتحت ابتدائي يونټونه (Basic Units):</Text>
                      <TextInput
                        style={styles.input}
                        keyboardType="numeric"
                        value={String(getFieldValue('buCount', ''))}
                        onFocus={() => setActiveInputKey('buCount')}
                        onChangeText={(v) => updateField('buCount', parseInt(v, 10) || 0)}
                      />
                    </View>
                    <View style={styles.field}>
                      <Text style={styles.fieldLabel}>جلسې او مظاهرې (Rallies & Protests):</Text>
                      <TextInput
                        style={styles.input}
                        keyboardType="numeric"
                        value={String(getFieldValue('ralliesAndProtests', ''))}
                        onFocus={() => setActiveInputKey('ralliesAndProtests')}
                        onChangeText={(v) => updateField('ralliesAndProtests', parseInt(v, 10) || 0)}
                      />
                    </View>
                    <View style={styles.field}>
                      <Text style={styles.fieldLabel}>جرګې او اولسي غونډې (Jirgas):</Text>
                      <TextInput
                        style={styles.input}
                        keyboardType="numeric"
                        value={String(getFieldValue('jirgasAndCornerMeetings', ''))}
                        onFocus={() => setActiveInputKey('jirgasAndCornerMeetings')}
                        onChangeText={(v) => updateField('jirgasAndCornerMeetings', parseInt(v, 10) || 0)}
                      />
                    </View>
                    <View style={styles.field}>
                      <Text style={styles.fieldLabel}>مياشتنۍ چندې / وصولي (Dues PKR):</Text>
                      <TextInput
                        style={styles.input}
                        keyboardType="numeric"
                        value={String(getFieldValue('dues', ''))}
                        onFocus={() => setActiveInputKey('dues')}
                        onChangeText={(v) => updateField('dues', parseInt(v, 10) || 0)}
                      />
                    </View>
                    <View style={styles.field}>
                      <Text style={styles.fieldLabel}>اخراجات (Expenses PKR):</Text>
                      <TextInput
                        style={styles.input}
                        keyboardType="numeric"
                        value={String(getFieldValue('expenses', ''))}
                        onFocus={() => setActiveInputKey('expenses')}
                        onChangeText={(v) => updateField('expenses', parseInt(v, 10) || 0)}
                      />
                    </View>
                  </>
                )}

                {formType === 'form7' && (
                  <>
                    <View style={styles.field}>
                      <Text style={styles.fieldLabel}>په ضلع کښي ټول علاقائي يونټونه:</Text>
                      <TextInput
                        style={styles.input}
                        keyboardType="numeric"
                        value={String(getFieldValue('areasCount', rows.length))}
                        onFocus={() => setActiveInputKey('areasCount')}
                        onChangeText={(v) => updateField('areasCount', parseInt(v, 10) || 0)}
                      />
                    </View>
                    <View style={styles.field}>
                      <Text style={styles.fieldLabel}>ټول اولسي پروګرامونه او جلسې:</Text>
                      <TextInput
                        style={styles.input}
                        keyboardType="numeric"
                        value={String(getFieldValue('ralliesCount', ''))}
                        onFocus={() => setActiveInputKey('ralliesCount')}
                        onChangeText={(v) => updateField('ralliesCount', parseInt(v, 10) || 0)}
                      />
                    </View>
                    <View style={styles.field}>
                      <Text style={styles.fieldLabel}>ټولټال راټولې شوې چندې (PKR):</Text>
                      <TextInput
                        style={styles.input}
                        keyboardType="numeric"
                        value={String(getFieldValue('duesMonthly', ''))}
                        onFocus={() => setActiveInputKey('duesMonthly')}
                        onChangeText={(v) => updateField('duesMonthly', parseInt(v, 10) || 0)}
                      />
                    </View>
                  </>
                )}

                {formType === 'form8' && (
                  <>
                    <View style={styles.field}>
                      <Text style={styles.fieldLabel}>په ضلع کښي د کميټۍ ټول ملګري:</Text>
                      <TextInput
                        style={styles.input}
                        keyboardType="numeric"
                        value={String(getFieldValue('comradesCount', rows.length))}
                        onFocus={() => setActiveInputKey('comradesCount')}
                        onChangeText={(v) => updateField('comradesCount', parseInt(v, 10) || 0)}
                      />
                    </View>
                    <View style={styles.field}>
                      <Text style={styles.fieldLabel}>ټولې تر سره شوې غونډې:</Text>
                      <TextInput
                        style={styles.input}
                        keyboardType="numeric"
                        value={String(getFieldValue('totalMeetings', ''))}
                        onFocus={() => setActiveInputKey('totalMeetings')}
                        onChangeText={(v) => updateField('totalMeetings', parseInt(v, 10) || 0)}
                      />
                    </View>
                    <View style={styles.field}>
                      <Text style={styles.fieldLabel}>اولسي جلسې او جرګې:</Text>
                      <TextInput
                        style={styles.input}
                        keyboardType="numeric"
                        value={String(getFieldValue('publicGatherings', ''))}
                        onFocus={() => setActiveInputKey('publicGatherings')}
                        onChangeText={(v) => updateField('publicGatherings', parseInt(v, 10) || 0)}
                      />
                    </View>
                    <View style={styles.field}>
                      <Text style={styles.fieldLabel}>ټولټال مياشتنۍ چنده (PKR):</Text>
                      <TextInput
                        style={styles.input}
                        keyboardType="numeric"
                        value={String(getFieldValue('monthlyDues', ''))}
                        onFocus={() => setActiveInputKey('monthlyDues')}
                        onChangeText={(v) => updateField('monthlyDues', parseInt(v, 10) || 0)}
                      />
                    </View>
                  </>
                )}

                {formType === 'form9' && (
                  <>
                    <View style={styles.field}>
                      <Text style={styles.fieldLabel}>د مرکزي او صوبائي ادارو ټول غړي:</Text>
                      <TextInput
                        style={styles.input}
                        keyboardType="numeric"
                        value={String(getFieldValue('membersCount', rows.length))}
                        onFocus={() => setActiveInputKey('membersCount')}
                        onChangeText={(v) => updateField('membersCount', parseInt(v, 10) || 0)}
                      />
                    </View>
                    <View style={styles.field}>
                      <Text style={styles.fieldLabel}>تنظيمي غونډې:</Text>
                      <TextInput
                        style={styles.input}
                        keyboardType="numeric"
                        value={String(getFieldValue('totalMeetings', ''))}
                        onFocus={() => setActiveInputKey('totalMeetings')}
                        onChangeText={(v) => updateField('totalMeetings', parseInt(v, 10) || 0)}
                      />
                    </View>
                    <View style={styles.field}>
                      <Text style={styles.fieldLabel}>اولسي جلسې او فعاليتونه:</Text>
                      <TextInput
                        style={styles.input}
                        keyboardType="numeric"
                        value={String(getFieldValue('publicGatherings', ''))}
                        onFocus={() => setActiveInputKey('publicGatherings')}
                        onChangeText={(v) => updateField('publicGatherings', parseInt(v, 10) || 0)}
                      />
                    </View>
                    <View style={styles.field}>
                      <Text style={styles.fieldLabel}>کانفرنسونه او سيمينارونه:</Text>
                      <TextInput
                        style={styles.input}
                        keyboardType="numeric"
                        value={String(getFieldValue('conferences', ''))}
                        onFocus={() => setActiveInputKey('conferences')}
                        onChangeText={(v) => updateField('conferences', parseInt(v, 10) || 0)}
                      />
                    </View>
                    <View style={styles.field}>
                      <Text style={styles.fieldLabel}>بلډ بينک او زکات وصولي (PKR):</Text>
                      <TextInput
                        style={styles.input}
                        keyboardType="numeric"
                        value={String(getFieldValue('bloodCash', ''))}
                        onFocus={() => setActiveInputKey('bloodCash')}
                        onChangeText={(v) => updateField('bloodCash', parseInt(v, 10) || 0)}
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
                  <Text style={styles.addRowBtnText}>➕ نوې کرښه اضافه کول (Add Row)</Text>
                </TouchableOpacity>

                {rows.map((r, i) => (
                  <View key={i} style={styles.rowCard}>
                    <View style={styles.rowCardHeader}>
                      <Text style={styles.rowNum}>#{i + 1}</Text>
                      <Text style={styles.rowCardTitle}>
                        {r.name || r.areaName || r.unitName || 'New Row'}
                      </Text>
                      <Text style={styles.rowCardRole}>
                        ({r.role || r.organRole || r.activeStatus || 'Record'})
                      </Text>
                      <TouchableOpacity
                        onPress={() => removeRow(i)}
                        style={styles.removeRowBtn}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Text style={styles.removeRowText}>✕</Text>
                      </TouchableOpacity>
                    </View>

                    {/* Standard Name / Title Field */}
                    <View style={styles.rowFieldGroup}>
                      <Text style={styles.miniLabel}>
                        {formType === 'form7' ? 'د علاقائي يونټ نوم:' : 'نوم (Name):'}
                      </Text>
                      <TextInput
                        style={styles.miniInput}
                        value={String(r.name || r.areaName || r.unitName || '')}
                        onFocus={() =>
                          setActiveInputKey({
                            rowIndex: i,
                            colKey: formType === 'form7' ? 'areaName' : (formType === 'form2' ? 'unitName' : 'name'),
                          })
                        }
                        onChangeText={(v) =>
                          updateRowField(
                            i,
                            formType === 'form7' ? 'areaName' : (formType === 'form2' ? 'unitName' : 'name'),
                            v
                          )
                        }
                      />
                    </View>

                    {/* Form 1: Area Executive Comrade */}
                    {formType === 'form1' && (
                      <>
                        <View style={styles.rowFieldGroup}>
                          <Text style={styles.miniLabel}>عهده (Role / Designation):</Text>
                          <TextInput
                            style={styles.miniInput}
                            value={String(r.role || '')}
                            onFocus={() => setActiveInputKey({ rowIndex: i, colKey: 'role' })}
                            onChangeText={(v) => updateRowField(i, 'role', v)}
                            placeholder="مثلا: صدر / جنرل سيکرټري"
                            placeholderTextColor="#64748b"
                          />
                        </View>
                        <View style={styles.miniGrid}>
                          <View style={styles.miniGridItem}>
                            <Text style={styles.miniLabel}>علاقه ایګزيکټيو:</Text>
                            <TextInput
                              style={styles.miniInput}
                              keyboardType="numeric"
                              value={String(r.areaExecMeetings ?? r.areaExecMeeting ?? r.areaExec ?? '')}
                              onChangeText={(v) => {
                                updateRowField(i, 'areaExecMeetings', v);
                                updateRowField(i, 'areaExecMeeting', v);
                              }}
                            />
                          </View>
                          <View style={styles.miniGridItem}>
                            <Text style={styles.miniLabel}>علاقه کميټي:</Text>
                            <TextInput
                              style={styles.miniInput}
                              keyboardType="numeric"
                              value={String(r.areaCommMeetings ?? r.areaCommMeeting ?? r.areaComm ?? '')}
                              onChangeText={(v) => {
                                updateRowField(i, 'areaCommMeetings', v);
                                updateRowField(i, 'areaCommMeeting', v);
                              }}
                            />
                          </View>
                          <View style={styles.miniGridItem}>
                            <Text style={styles.miniLabel}>بنسټيز ایګزيکټيو:</Text>
                            <TextInput
                              style={styles.miniInput}
                              keyboardType="numeric"
                              value={String(r.buExecMeetings ?? r.buExecMeeting ?? '')}
                              onChangeText={(v) => {
                                updateRowField(i, 'buExecMeetings', v);
                                updateRowField(i, 'buExecMeeting', v);
                              }}
                            />
                          </View>
                          <View style={styles.miniGridItem}>
                            <Text style={styles.miniLabel}>عمومي غونډه:</Text>
                            <TextInput
                              style={styles.miniInput}
                              keyboardType="numeric"
                              value={String(r.buMeetings ?? r.buGbMeeting ?? '')}
                              onChangeText={(v) => {
                                updateRowField(i, 'buMeetings', v);
                                updateRowField(i, 'buGbMeeting', v);
                              }}
                            />
                          </View>
                          <View style={styles.miniGridItem}>
                            <Text style={styles.miniLabel}>جلسې/مظاهرې:</Text>
                            <TextInput
                              style={styles.miniInput}
                              keyboardType="numeric"
                              value={String(r.rallies ?? r.rallyMeeting ?? '')}
                              onChangeText={(v) => {
                                updateRowField(i, 'rallies', v);
                                updateRowField(i, 'rallyMeeting', v);
                              }}
                            />
                          </View>
                          <View style={styles.miniGridItem}>
                            <Text style={styles.miniLabel}>جرګې:</Text>
                            <TextInput
                              style={styles.miniInput}
                              keyboardType="numeric"
                              value={String(r.jirgas ?? r.jirgaMeeting ?? '')}
                              onChangeText={(v) => {
                                updateRowField(i, 'jirgas', v);
                                updateRowField(i, 'jirgaMeeting', v);
                              }}
                            />
                          </View>
                          <View style={styles.miniGridItem}>
                            <Text style={styles.miniLabel}>چنده (PKR):</Text>
                            <TextInput
                              style={styles.miniInput}
                              keyboardType="numeric"
                              value={String(r.monthlyDues ?? r.dues ?? '')}
                              onChangeText={(v) => {
                                updateRowField(i, 'monthlyDues', v);
                                updateRowField(i, 'dues', v);
                              }}
                            />
                          </View>
                          <View style={styles.miniGridItem}>
                            <Text style={styles.miniLabel}>بلډ بينک/زکات:</Text>
                            <TextInput
                              style={styles.miniInput}
                              keyboardType="numeric"
                              value={String(r.bloodZakat ?? r.bloodBankPosts ?? '')}
                              onChangeText={(v) => {
                                updateRowField(i, 'bloodZakat', v);
                                updateRowField(i, 'bloodBankPosts', v);
                              }}
                            />
                          </View>
                        </View>
                      </>
                    )}

                    {/* Form 3: Area Detailed Comrade */}
                    {formType === 'form3' && (
                      <>
                        <View style={styles.rowFieldGroup}>
                          <Text style={styles.miniLabel}>عهده (Role):</Text>
                          <TextInput
                            style={styles.miniInput}
                            value={String(r.role || '')}
                            onFocus={() => setActiveInputKey({ rowIndex: i, colKey: 'role' })}
                            onChangeText={(v) => updateRowField(i, 'role', v)}
                          />
                        </View>
                        <View style={styles.miniGrid}>
                          <View style={styles.miniGridItem}>
                            <Text style={styles.miniLabel}>غونډې (Meetings):</Text>
                            <TextInput
                              style={styles.miniInput}
                              keyboardType="numeric"
                              value={String(r.meetingsAttended ?? 1)}
                              onChangeText={(v) => updateRowField(i, 'meetingsAttended', v)}
                            />
                          </View>
                          <View style={styles.miniGridItem}>
                            <Text style={styles.miniLabel}>جلسې (Rallies):</Text>
                            <TextInput
                              style={styles.miniInput}
                              keyboardType="numeric"
                              value={String(r.ralliesAttended ?? 0)}
                              onChangeText={(v) => updateRowField(i, 'ralliesAttended', v)}
                            />
                          </View>
                          <View style={styles.miniGridItem}>
                            <Text style={styles.miniLabel}>چنده ورکړې (PKR):</Text>
                            <TextInput
                              style={styles.miniInput}
                              keyboardType="numeric"
                              value={String(r.duesPaid ?? 0)}
                              onChangeText={(v) => updateRowField(i, 'duesPaid', v)}
                            />
                          </View>
                        </View>
                      </>
                    )}

                    {/* Form 4: Basic Unit Comrade */}
                    {formType === 'form4' && (
                      <>
                        <View style={styles.rowFieldGroup}>
                          <Text style={styles.miniLabel}>عهده (Role):</Text>
                          <TextInput
                            style={styles.miniInput}
                            value={String(r.role || '')}
                            onFocus={() => setActiveInputKey({ rowIndex: i, colKey: 'role' })}
                            onChangeText={(v) => updateRowField(i, 'role', v)}
                          />
                        </View>
                        <View style={styles.miniGrid}>
                          <View style={styles.miniGridItem}>
                            <Text style={styles.miniLabel}>کاري غونډه:</Text>
                            <TextInput
                              style={styles.miniInput}
                              keyboardType="numeric"
                              value={String(r.executiveMeetingsAttended ?? '')}
                              onChangeText={(v) => updateRowField(i, 'executiveMeetingsAttended', v)}
                            />
                          </View>
                          <View style={styles.miniGridItem}>
                            <Text style={styles.miniLabel}>عمومي غونډه:</Text>
                            <TextInput
                              style={styles.miniInput}
                              keyboardType="numeric"
                              value={String(r.generalBodyMeetingsAttended ?? '')}
                              onChangeText={(v) => updateRowField(i, 'generalBodyMeetingsAttended', v)}
                            />
                          </View>
                          <View style={styles.miniGridItem}>
                            <Text style={styles.miniLabel}>جلسې:</Text>
                            <TextInput
                              style={styles.miniInput}
                              keyboardType="numeric"
                              value={String(r.ralliesAttended ?? '')}
                              onChangeText={(v) => updateRowField(i, 'ralliesAttended', v)}
                            />
                          </View>
                          <View style={styles.miniGridItem}>
                            <Text style={styles.miniLabel}>مظاهرې:</Text>
                            <TextInput
                              style={styles.miniInput}
                              keyboardType="numeric"
                              value={String(r.protestsAttended ?? '')}
                              onChangeText={(v) => updateRowField(i, 'protestsAttended', v)}
                            />
                          </View>
                          <View style={styles.miniGridItem}>
                            <Text style={styles.miniLabel}>چنده وصولي:</Text>
                            <TextInput
                              style={styles.miniInput}
                              keyboardType="numeric"
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
                      </>
                    )}

                    {/* Form 5: Provincial Executive */}
                    {formType === 'form5' && (
                      <>
                        <View style={styles.rowFieldGroup}>
                          <Text style={styles.miniLabel}>عهده (Role):</Text>
                          <TextInput
                            style={styles.miniInput}
                            value={String(r.role || '')}
                            onFocus={() => setActiveInputKey({ rowIndex: i, colKey: 'role' })}
                            onChangeText={(v) => updateRowField(i, 'role', v)}
                          />
                        </View>
                        <View style={styles.miniGrid}>
                          <View style={styles.miniGridItem}>
                            <Text style={styles.miniLabel}>صوبائي غونډې:</Text>
                            <TextInput
                              style={styles.miniInput}
                              keyboardType="numeric"
                              value={String(r.provincialCabinetMeetings ?? '')}
                              onChangeText={(v) => updateRowField(i, 'provincialCabinetMeetings', v)}
                            />
                          </View>
                          <View style={styles.miniGridItem}>
                            <Text style={styles.miniLabel}>جلسې:</Text>
                            <TextInput
                              style={styles.miniInput}
                              keyboardType="numeric"
                              value={String(r.ralliesRallies ?? '')}
                              onChangeText={(v) => updateRowField(i, 'ralliesRallies', v)}
                            />
                          </View>
                          <View style={styles.miniGridItem}>
                            <Text style={styles.miniLabel}>مظاهرې:</Text>
                            <TextInput
                              style={styles.miniInput}
                              keyboardType="numeric"
                              value={String(r.protestsStrikes ?? '')}
                              onChangeText={(v) => updateRowField(i, 'protestsStrikes', v)}
                            />
                          </View>
                          <View style={styles.miniGridItem}>
                            <Text style={styles.miniLabel}>دورې:</Text>
                            <TextInput
                              style={styles.miniInput}
                              keyboardType="numeric"
                              value={String(r.toursVisitsCount ?? '')}
                              onChangeText={(v) => updateRowField(i, 'toursVisitsCount', v)}
                            />
                          </View>
                          <View style={styles.miniGridItem}>
                            <Text style={styles.miniLabel}>مياشتنۍ چنده:</Text>
                            <TextInput
                              style={styles.miniInput}
                              keyboardType="numeric"
                              value={String(r.duesPaidMonthly ?? '')}
                              onChangeText={(v) => updateRowField(i, 'duesPaidMonthly', v)}
                            />
                          </View>
                        </View>
                      </>
                    )}

                    {/* Form 6: District Executive Comrades */}
                    {formType === 'form6' && (
                      <>
                        <View style={styles.rowFieldGroup}>
                          <Text style={styles.miniLabel}>عهده (Role / Designation):</Text>
                          <TextInput
                            style={styles.miniInput}
                            value={String(r.role || '')}
                            onFocus={() => setActiveInputKey({ rowIndex: i, colKey: 'role' })}
                            onChangeText={(v) => updateRowField(i, 'role', v)}
                          />
                        </View>
                        <View style={styles.miniGrid}>
                          <View style={styles.miniGridItem}>
                            <Text style={styles.miniLabel}>ضلعي ايګزيکټيو:</Text>
                            <TextInput
                              style={styles.miniInput}
                              keyboardType="numeric"
                              value={String(r.distExec ?? r.distExecMeeting ?? '')}
                              onChangeText={(v) => {
                                updateRowField(i, 'distExec', v);
                                updateRowField(i, 'distExecMeeting', v);
                              }}
                            />
                          </View>
                          <View style={styles.miniGridItem}>
                            <Text style={styles.miniLabel}>ضلعي کميټي:</Text>
                            <TextInput
                              style={styles.miniInput}
                              keyboardType="numeric"
                              value={String(r.distComm ?? r.distCommMeeting ?? '')}
                              onChangeText={(v) => {
                                updateRowField(i, 'distComm', v);
                                updateRowField(i, 'distCommMeeting', v);
                              }}
                            />
                          </View>
                          <View style={styles.miniGridItem}>
                            <Text style={styles.miniLabel}>جلسې/مظاهرې:</Text>
                            <TextInput
                              style={styles.miniInput}
                              keyboardType="numeric"
                              value={String(r.ralliesAndProtests ?? '')}
                              onChangeText={(v) => updateRowField(i, 'ralliesAndProtests', v)}
                            />
                          </View>
                          <View style={styles.miniGridItem}>
                            <Text style={styles.miniLabel}>جرګې:</Text>
                            <TextInput
                              style={styles.miniInput}
                              keyboardType="numeric"
                              value={String(r.jirgasAndCornerMeetings ?? '')}
                              onChangeText={(v) => updateRowField(i, 'jirgasAndCornerMeetings', v)}
                            />
                          </View>
                          <View style={styles.miniGridItem}>
                            <Text style={styles.miniLabel}>چنده (PKR):</Text>
                            <TextInput
                              style={styles.miniInput}
                              keyboardType="numeric"
                              value={String(r.dues ?? '')}
                              onChangeText={(v) => updateRowField(i, 'dues', v)}
                            />
                          </View>
                        </View>
                      </>
                    )}

                    {/* Form 7: District Subordinate Areas */}
                    {formType === 'form7' && (
                      <View style={styles.miniGrid}>
                        <View style={styles.miniGridItem}>
                          <Text style={styles.miniLabel}>ايګزيکټيو غونډې:</Text>
                          <TextInput
                            style={styles.miniInput}
                            keyboardType="numeric"
                            value={String(r.execHeld ?? '')}
                            onChangeText={(v) => updateRowField(i, 'execHeld', v)}
                          />
                        </View>
                        <View style={styles.miniGridItem}>
                          <Text style={styles.miniLabel}>کميټۍ غونډې:</Text>
                          <TextInput
                            style={styles.miniInput}
                            keyboardType="numeric"
                            value={String(r.commHeld ?? '')}
                            onChangeText={(v) => updateRowField(i, 'commHeld', v)}
                          />
                        </View>
                        <View style={styles.miniGridItem}>
                          <Text style={styles.miniLabel}>ابتدائي يونټونه:</Text>
                          <TextInput
                            style={styles.miniInput}
                            keyboardType="numeric"
                            value={String(r.buCount ?? '')}
                            onChangeText={(v) => updateRowField(i, 'buCount', v)}
                          />
                        </View>
                        <View style={styles.miniGridItem}>
                          <Text style={styles.miniLabel}>ټول غړي:</Text>
                          <TextInput
                            style={styles.miniInput}
                            keyboardType="numeric"
                            value={String(r.membershipTotal ?? '')}
                            onChangeText={(v) => updateRowField(i, 'membershipTotal', v)}
                          />
                        </View>
                        <View style={styles.miniGridItem}>
                          <Text style={styles.miniLabel}>جلسې/جرګې:</Text>
                          <TextInput
                            style={styles.miniInput}
                            keyboardType="numeric"
                            value={String(r.ralliesCount ?? '')}
                            onChangeText={(v) => updateRowField(i, 'ralliesCount', v)}
                          />
                        </View>
                        <View style={styles.miniGridItem}>
                          <Text style={styles.miniLabel}>چنده (PKR):</Text>
                          <TextInput
                            style={styles.miniInput}
                            keyboardType="numeric"
                            value={String(r.duesMonthly ?? '')}
                            onChangeText={(v) => updateRowField(i, 'duesMonthly', v)}
                          />
                        </View>
                      </View>
                    )}

                    {/* Form 8: Central & Provincial Committee in District */}
                    {formType === 'form8' && (
                      <>
                        <View style={styles.rowFieldGroup}>
                          <Text style={styles.miniLabel}>حيثيت (Status):</Text>
                          <TextInput
                            style={styles.miniInput}
                            value={String(r.activeStatus || 'فعاله')}
                            onFocus={() => setActiveInputKey({ rowIndex: i, colKey: 'activeStatus' })}
                            onChangeText={(v) => updateRowField(i, 'activeStatus', v)}
                          />
                        </View>
                        <View style={styles.miniGrid}>
                          <View style={styles.miniGridItem}>
                            <Text style={styles.miniLabel}>ضلعي کميټي:</Text>
                            <TextInput
                              style={styles.miniInput}
                              keyboardType="numeric"
                              value={String(r.distCommMeeting ?? '')}
                              onChangeText={(v) => updateRowField(i, 'distCommMeeting', v)}
                            />
                          </View>
                          <View style={styles.miniGridItem}>
                            <Text style={styles.miniLabel}>علاقائي ايګزيکټيو:</Text>
                            <TextInput
                              style={styles.miniInput}
                              keyboardType="numeric"
                              value={String(r.areaExecMeeting ?? '')}
                              onChangeText={(v) => updateRowField(i, 'areaExecMeeting', v)}
                            />
                          </View>
                          <View style={styles.miniGridItem}>
                            <Text style={styles.miniLabel}>اولسي غونډې:</Text>
                            <TextInput
                              style={styles.miniInput}
                              keyboardType="numeric"
                              value={String(r.publicGatherings ?? '')}
                              onChangeText={(v) => updateRowField(i, 'publicGatherings', v)}
                            />
                          </View>
                          <View style={styles.miniGridItem}>
                            <Text style={styles.miniLabel}>ټولې غونډې:</Text>
                            <TextInput
                              style={styles.miniInput}
                              keyboardType="numeric"
                              value={String(r.totalMeetings ?? '')}
                              onChangeText={(v) => updateRowField(i, 'totalMeetings', v)}
                            />
                          </View>
                          <View style={styles.miniGridItem}>
                            <Text style={styles.miniLabel}>مياشتنۍ چنده:</Text>
                            <TextInput
                              style={styles.miniInput}
                              keyboardType="numeric"
                              value={String(r.monthlyDues ?? '')}
                              onChangeText={(v) => updateRowField(i, 'monthlyDues', v)}
                            />
                          </View>
                        </View>
                      </>
                    )}

                    {/* Form 9: Central & Provincial Organs */}
                    {formType === 'form9' && (
                      <>
                        <View style={styles.rowFieldGroup}>
                          <Text style={styles.miniLabel}>د ادارې عهده / څانګه (Organ Role):</Text>
                          <TextInput
                            style={styles.miniInput}
                            value={String(r.organRole || r.role || '')}
                            onFocus={() => setActiveInputKey({ rowIndex: i, colKey: 'organRole' })}
                            onChangeText={(v) => updateRowField(i, 'organRole', v)}
                          />
                        </View>
                        <View style={styles.miniGrid}>
                          <View style={styles.miniGridItem}>
                            <Text style={styles.miniLabel}>غونډې (Mtgs):</Text>
                            <TextInput
                              style={styles.miniInput}
                              keyboardType="numeric"
                              value={String(r.totalMeetings ?? '')}
                              onChangeText={(v) => updateRowField(i, 'totalMeetings', v)}
                            />
                          </View>
                          <View style={styles.miniGridItem}>
                            <Text style={styles.miniLabel}>جلسې/اولسي:</Text>
                            <TextInput
                              style={styles.miniInput}
                              keyboardType="numeric"
                              value={String(r.publicGatherings ?? '')}
                              onChangeText={(v) => updateRowField(i, 'publicGatherings', v)}
                            />
                          </View>
                          <View style={styles.miniGridItem}>
                            <Text style={styles.miniLabel}>کانفرنسونه:</Text>
                            <TextInput
                              style={styles.miniInput}
                              keyboardType="numeric"
                              value={String(r.conferences ?? '')}
                              onChangeText={(v) => updateRowField(i, 'conferences', v)}
                            />
                          </View>
                          <View style={styles.miniGridItem}>
                            <Text style={styles.miniLabel}>چنده (PKR):</Text>
                            <TextInput
                              style={styles.miniInput}
                              keyboardType="numeric"
                              value={String(r.monthlyDues ?? '')}
                              onChangeText={(v) => updateRowField(i, 'monthlyDues', v)}
                            />
                          </View>
                        </View>
                      </>
                    )}

                    {/* Form 2: Basic Units in Area */}
                    {formType === 'form2' && (
                      <View style={styles.miniGrid}>
                        <View style={styles.miniGridItem}>
                          <Text style={styles.miniLabel}>ټول غړي:</Text>
                          <TextInput
                            style={styles.miniInput}
                            keyboardType="numeric"
                            value={String(r.totalMembers ?? r.gbTotalMembers ?? '')}
                            onChangeText={(v) => {
                              updateRowField(i, 'totalMembers', v);
                              updateRowField(i, 'gbTotalMembers', v);
                            }}
                          />
                        </View>
                        <View style={styles.miniGridItem}>
                          <Text style={styles.miniLabel}>کاري غونډې:</Text>
                          <TextInput
                            style={styles.miniInput}
                            keyboardType="numeric"
                            value={String(r.execMeetingsHeld ?? r.execMeetings ?? '')}
                            onChangeText={(v) => {
                              updateRowField(i, 'execMeetingsHeld', v);
                              updateRowField(i, 'execMeetings', v);
                            }}
                          />
                        </View>
                        <View style={styles.miniGridItem}>
                          <Text style={styles.miniLabel}>عمومي حاضري:</Text>
                          <TextInput
                            style={styles.miniInput}
                            keyboardType="numeric"
                            value={String(r.gbPresent ?? '')}
                            onChangeText={(v) => updateRowField(i, 'gbPresent', v)}
                          />
                        </View>
                        <View style={styles.miniGridItem}>
                          <Text style={styles.miniLabel}>جلسې/جرګې:</Text>
                          <TextInput
                            style={styles.miniInput}
                            keyboardType="numeric"
                            value={String(r.rallies ?? r.ralliesCount ?? '')}
                            onChangeText={(v) => updateRowField(i, 'rallies', v)}
                          />
                        </View>
                        <View style={styles.miniGridItem}>
                          <Text style={styles.miniLabel}>چنده وصولي (PKR):</Text>
                          <TextInput
                            style={styles.miniInput}
                            keyboardType="numeric"
                            value={String(r.duesCollected ?? r.unitDonations ?? '')}
                            onChangeText={(v) => {
                              updateRowField(i, 'duesCollected', v);
                              updateRowField(i, 'unitDonations', v);
                            }}
                          />
                        </View>
                        <View style={styles.miniGridItem}>
                          <Text style={styles.miniLabel}>بېړنۍ چنده (PKR):</Text>
                          <TextInput
                            style={styles.miniInput}
                            keyboardType="numeric"
                            value={String(r.emergencyDonations ?? '')}
                            onChangeText={(v) => updateRowField(i, 'emergencyDonations', v)}
                          />
                        </View>
                      </View>
                    )}

                    <View style={{ marginTop: 6 }}>
                      <Text style={styles.miniLabel}>نوټ / تبصره:</Text>
                      <TextInput
                        style={styles.miniInput}
                        value={String(r.notes || '')}
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
                  value={String(formData.notes || '')}
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
    flex: 1,
  },
  rowCardRole: {
    color: '#94a3b8',
    fontSize: FontSize.xs,
  },
  removeRowBtn: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: '#334155',
    borderRadius: 4,
  },
  removeRowText: {
    color: '#ef4444',
    fontSize: 12,
    fontWeight: '700',
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
