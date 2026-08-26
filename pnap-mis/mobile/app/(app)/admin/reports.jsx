import { useEffect, useState } from 'react';
import {
  ActivityIndicator, Platform, SafeAreaView, ScrollView,
  StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useAuth } from '../../../src/context/AuthContext';
import { useUnit } from '../../../src/context/UnitContext';
import { canManageFinance, isHigherAdmin, isAreaAdmin, hasRole } from '../../../src/utils/permissions';
import { Storage } from '../../../src/utils/storage';
import { Colors, FontSize, Spacing } from '../../../src/constants/colors';
import Card from '../../../src/components/Card';

const API_BASE = process.env.EXPO_PUBLIC_API_BASE_URL || 'http://localhost:5000/api';

async function downloadAndShare(path, filename, params) {
  const token = await Storage.getItem('pnap_token');
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  const url = `${API_BASE}${path}${qs}`;

  const localUri = FileSystem.cacheDirectory + filename;
  try {
    const result = await FileSystem.downloadAsync(url, localUri, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (result.status !== 200) throw new Error(`Server returned ${result.status}`);
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(result.uri, { mimeType: 'application/octet-stream', dialogTitle: `Open ${filename}` });
    }
  } catch (e) {
    throw new Error(e.message || 'Download failed');
  }
}

function ExportCard({ icon, title, description, onDownload, busy }) {
  return (
    <Card style={styles.exportCard}>
      <Text style={styles.exportIcon}>{icon}</Text>
      <Text style={styles.exportTitle}>{title}</Text>
      <Text style={styles.exportDesc}>{description}</Text>
      <View style={styles.exportBtns}>
        <TouchableOpacity
          style={styles.exportBtn}
          onPress={() => onDownload('pdf')}
          disabled={busy}
        >
          {busy ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.exportBtnText}>📄 PDF</Text>}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.exportBtn, styles.exportBtnXlsx]}
          onPress={() => onDownload('xlsx')}
          disabled={busy}
        >
          {busy ? <ActivityIndicator size="small" color={Colors.primary} /> : <Text style={[styles.exportBtnText, { color: Colors.primary }]}>📊 Excel</Text>}
        </TouchableOpacity>
      </View>
    </Card>
  );
}

export default function ReportsScreen() {
  const { user } = useAuth();
  const { ctx } = useUnit();
  const canFinance = canManageFinance(user);

  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [busyKey, setBusyKey] = useState(null);
  const [error, setError] = useState('');

  if (!isHigherAdmin(user) && !isAreaAdmin(user) && !hasRole(user, 'SENIOR_MAWIN', 'SECRETARY', 'FINANCE_SECRETARY')) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.denied}>
          <Text style={styles.deniedText}>🔒 You do not have access to export reports.</Text>
        </View>
      </SafeAreaView>
    );
  }

  async function handleDownload(key, fmt) {
    if (!ctx?.unitId) { setError('No unit context selected. Go to Profile to set your unit context.'); return; }
    setError('');
    setBusyKey(`${key}-${fmt}`);
    try {
      const params = { unitLevel: ctx.unitLevel, unitId: ctx.unitId };
      if (from) params.from = from;
      if (to) params.to = to;
      await downloadAndShare(`/exports/unit/${key}/${fmt}`, `${key}-report.${fmt}`, params);
    } catch (e) { setError(e.message); }
    finally { setBusyKey(null); }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.banner}>
          <Text style={styles.bannerIcon}>📊</Text>
          <View style={styles.bannerText}>
            <Text style={styles.bannerTitle}>Exports & Reports</Text>
            <Text style={styles.bannerSub}>
              {ctx?.unitName ? ctx.unitName : 'Select a unit context first'}
            </Text>
          </View>
        </View>

        {/* Date range pickers (text-based for cross-platform) */}
        <Card style={styles.dateCard}>
          <Text style={styles.sectionTitle}>Date Range (optional)</Text>
          <View style={styles.dateRow}>
            <View style={styles.dateField}>
              <Text style={styles.dateLabel}>From</Text>
              <TouchableOpacity style={styles.dateInput}>
                <Text style={styles.dateText}>{from || 'YYYY-MM-DD'}</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.dateField}>
              <Text style={styles.dateLabel}>To</Text>
              <TouchableOpacity style={styles.dateInput}>
                <Text style={styles.dateText}>{to || 'YYYY-MM-DD'}</Text>
              </TouchableOpacity>
            </View>
          </View>
          <Text style={styles.dateHint}>Leave blank to export all records for the unit.</Text>
        </Card>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <Text style={styles.groupLabel}>Meetings & Activities</Text>
        <ExportCard
          icon="📅"
          title="Meetings Report"
          description="All meetings for the selected unit and date range."
          onDownload={(fmt) => handleDownload('meetings', fmt)}
          busy={busyKey?.startsWith('meetings')}
        />
        <ExportCard
          icon="🚩"
          title="Activities Report"
          description="All activities for the selected unit and date range."
          onDownload={(fmt) => handleDownload('activities', fmt)}
          busy={busyKey?.startsWith('activities')}
        />

        {canFinance && (
          <>
            <Text style={styles.groupLabel}>Finance</Text>
            <ExportCard
              icon="💰"
              title="Finance Report"
              description="Donations and expenses summary for the unit."
              onDownload={(fmt) => handleDownload('finance', fmt)}
              busy={busyKey?.startsWith('finance')}
            />
            <ExportCard
              icon="🔄"
              title="Transfers Report"
              description="Interfund and inter-unit transfer records."
              onDownload={(fmt) => handleDownload('transfers', fmt)}
              busy={busyKey?.startsWith('transfers')}
            />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.lg, paddingBottom: 40 },
  denied: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: Spacing.xl },
  deniedText: { fontSize: FontSize.base, color: Colors.textMuted, textAlign: 'center' },
  banner: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: Colors.primary, borderRadius: 14, padding: Spacing.lg, marginBottom: Spacing.md },
  bannerIcon: { fontSize: 32 },
  bannerText: { flex: 1 },
  bannerTitle: { fontSize: FontSize.xl, fontWeight: '800', color: '#fff' },
  bannerSub: { fontSize: FontSize.xs, color: 'rgba(255,255,255,0.75)', marginTop: 2 },
  dateCard: { marginBottom: Spacing.md },
  sectionTitle: { fontSize: FontSize.base, fontWeight: '700', color: Colors.text, marginBottom: Spacing.md },
  dateRow: { flexDirection: 'row', gap: Spacing.md },
  dateField: { flex: 1 },
  dateLabel: { fontSize: FontSize.xs, fontWeight: '600', color: Colors.textMuted, marginBottom: 4 },
  dateInput: { backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border, borderRadius: 8, padding: 10 },
  dateText: { fontSize: FontSize.sm, color: Colors.textLight },
  dateHint: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: Spacing.sm },
  errorText: { color: Colors.error, fontSize: FontSize.sm, marginBottom: Spacing.md, textAlign: 'center' },
  groupLabel: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: Spacing.sm, marginTop: Spacing.md },
  exportCard: { marginBottom: Spacing.sm },
  exportIcon: { fontSize: 28, marginBottom: 6 },
  exportTitle: { fontSize: FontSize.base, fontWeight: '700', color: Colors.text, marginBottom: 2 },
  exportDesc: { fontSize: FontSize.xs, color: Colors.textMuted, marginBottom: Spacing.md },
  exportBtns: { flexDirection: 'row', gap: Spacing.sm },
  exportBtn: { flex: 1, backgroundColor: Colors.primary, borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  exportBtnXlsx: { backgroundColor: '#fff', borderWidth: 1, borderColor: Colors.primary },
  exportBtnText: { color: '#fff', fontWeight: '700', fontSize: FontSize.sm },
});
