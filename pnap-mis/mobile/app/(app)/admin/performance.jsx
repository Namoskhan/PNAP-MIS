import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { useLanguage } from '../../../src/context/LanguageContext';
import { useUnit } from '../../../src/context/UnitContext';
import { api, errorMessage } from '../../../src/api/client';
import Card from '../../../src/components/Card';
import KpiCard from '../../../src/components/KpiCard';
import { Colors, FontSize, Spacing, Radius } from '../../../src/constants/colors';
import { PKR } from '../../../src/utils/formatters';

export default function PerformanceScreen() {
  const { t, isRTL } = useLanguage();
  const { ctx } = useUnit();
  const [members, setMembers] = useState([]);
  const [memberId, setMemberId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [report, setReport] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!ctx) return;
    const params = { status: 'ACTIVE', limit: 500 };
    if (ctx.unitLevel === 'BASIC_UNIT') params.basicUnitId = ctx.unitId;
    else if (ctx.unitLevel === 'AREA') params.areaId = ctx.unitId;
    else if (ctx.unitLevel === 'DISTRICT') params.districtId = ctx.unitId;
    else if (ctx.unitLevel === 'PROVINCE') params.provinceId = ctx.unitId;
    else if (ctx.unitLevel === 'CENTRAL') params.scope = 'all';
    api.get('/members', { params }).then((r) => setMembers(r.data.data)).catch(() => {});
  }, [ctx]);

  async function load() {
    if (!memberId) return;
    setErr(''); setBusy(true); setReport(null);
    try {
      const params = {};
      if (from) params.from = from;
      if (to) params.to = to;
      const r = await api.get(`/performance/member/${memberId}`, { params });
      setReport(r.data.data);
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function download(type) {
    if (!memberId) return;
    if (Platform.OS === 'web') {
      Alert.alert(t('common.notSupported', 'Not Supported'), t('reports.webPreviewDownloadNotice', 'Downloading is not fully supported on the web preview. Please use the mobile app or desktop dashboard.'));
      return;
    }
    Alert.alert(t('common.info', 'Info'), t('reports.downloadRequestedNotice', 'Download {{type}} requested. Check Web Dashboard for direct download.', { type: type.toUpperCase() }));
  }

  if (!ctx) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>{t('performance.selectUnitContextFirst', 'Select a unit context first.')}</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        
        <Card style={styles.formCard}>
          <Text style={[styles.label, isRTL && { textAlign: 'right' }]}>{t('performance.member', 'Member')}</Text>
          <View style={styles.pickerWrap}>
            <Picker
              selectedValue={memberId}
              onValueChange={(v) => setMemberId(v)}
              style={styles.picker}
            >
              <Picker.Item label={t('performance.pickMember', '— pick a member —')} value="" />
              {members.map((m) => (
                <Picker.Item key={m._id} label={`${m.fullName} · ${m.memberId || m.cnic}`} value={m._id} />
              ))}
            </Picker>
          </View>

          <TouchableOpacity style={[styles.btn, (!memberId || busy) && styles.btnDisabled]} onPress={load} disabled={!memberId || busy}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>{t('performance.generate', t('reports.generateReport', 'Generate Report'))}</Text>}
          </TouchableOpacity>
          {err ? <Text style={[styles.error, isRTL && { textAlign: 'right' }]}>{err}</Text> : null}
        </Card>

        {report && (
          <View>
            <Card style={styles.headerCard}>
              <Text style={[styles.memberName, isRTL && { textAlign: 'right' }]}>{report.member.fullName}</Text>
              <Text style={[styles.memberMeta, isRTL && { textAlign: 'right' }]}>{report.member.memberId} · CNIC {report.member.cnic} · {report.member.phone}</Text>
              {report.roles?.length > 0 && (
                <Text style={[styles.memberRoles, isRTL && { textAlign: 'right' }]}>
                  {t('roles.rolesList', 'Roles:')} {report.roles.map((r) => r.customRoleName || t(`roles.${r.roleCode}`, r.roleCode)).join(', ')}
                </Text>
              )}
              
              <View style={[styles.actionRow, isRTL && { flexDirection: 'row-reverse' }]}>
                <TouchableOpacity style={styles.secondaryBtn} onPress={() => download('pdf')}>
                  <Text style={styles.secondaryBtnText}>{t('common.exportPdf', 'PDF')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.secondaryBtn} onPress={() => download('xlsx')}>
                  <Text style={styles.secondaryBtnText}>{t('common.exportExcel', 'Excel')}</Text>
                </TouchableOpacity>
              </View>
            </Card>

            <View style={[styles.kpiGrid, isRTL && { flexDirection: 'row-reverse' }]}>
              <KpiCard label={t('meetings.title', 'Meetings')} value={report.meetings.totalRoster} icon="📅" color={Colors.primary} />
              <KpiCard label={t('status.present', t('meetings.present', 'Present'))} value={report.meetings.present} icon="✅" color={Colors.success} />
              <KpiCard label={t('status.absent', t('meetings.absent', 'Absent'))} value={report.meetings.absent} icon="❌" color={report.meetings.absent > 0 ? Colors.error : Colors.textMuted} />
            </View>

            <View style={[styles.kpiGrid, isRTL && { flexDirection: 'row-reverse' }]}>
              <KpiCard label={t('performance.activitiesParticipated', 'Activities (Part.)')} value={report.activities.participated} icon="🎯" color={Colors.info} />
              <KpiCard label={t('performance.activitiesLed', 'Activities (Led)')} value={report.activities.led} icon="⭐" color={Colors.warning} />
            </View>

            <View style={[styles.kpiGrid, isRTL && { flexDirection: 'row-reverse' }]}>
              <KpiCard label={t('performance.tasksPending', 'Tasks Pending')} value={report.responsibilities.pending} icon="⏳" color={Colors.warning} />
              <KpiCard label={t('performance.tasksDone', 'Tasks Done')} value={report.responsibilities.completed} icon="✅" color={Colors.success} />
            </View>
            
            <View style={[styles.kpiGrid, isRTL && { flexDirection: 'row-reverse' }]}>
              <KpiCard label={t('finance.donations', 'Donations')} value={PKR(report.donations.total)} icon="💰" color={Colors.success} />
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { padding: Spacing.lg, paddingBottom: 40 },
  formCard: { marginBottom: Spacing.md },
  label: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.text, marginBottom: 4 },
  pickerWrap: { borderWidth: 1, borderColor: Colors.borderLight, borderRadius: Radius.md, marginBottom: Spacing.md, overflow: 'hidden' },
  picker: { height: 50, width: '100%' },
  btn: { backgroundColor: Colors.primary, padding: Spacing.md, borderRadius: Radius.md, alignItems: 'center' },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: FontSize.base },
  error: { color: Colors.error, marginTop: Spacing.sm, fontSize: FontSize.sm },
  headerCard: { marginBottom: Spacing.md },
  memberName: { fontSize: FontSize.lg, fontWeight: '800', color: Colors.text },
  memberMeta: { fontSize: FontSize.sm, color: Colors.textMuted, marginTop: 2 },
  memberRoles: { fontSize: FontSize.xs, color: Colors.primary, marginTop: 4, fontWeight: '500' },
  actionRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md },
  secondaryBtn: { flex: 1, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, paddingVertical: 8, alignItems: 'center' },
  secondaryBtnText: { color: Colors.text, fontWeight: '600', fontSize: FontSize.sm },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.sm },
  muted: { color: Colors.textMuted },
});
