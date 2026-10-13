import { useCallback } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import useAnalytics from '../../hooks/useAnalytics';
import { useLanguage } from '../../context/LanguageContext';
import { Colors, FontSize, Radius, Spacing } from '../../constants/colors';
import Card from '../Card';

/**
 * ReportsAnalytics — Main Dashboard View
 *
 * Renders exactly 4 interactive KPI tiles on the main dashboard:
 *   1. Reports Filed
 *   2. Outstanding Reports
 *   3. Overall Filing Rate
 *   4. Unit Reports
 *
 * Each tile navigates to its own dedicated full-screen detail page
 * (/reports/metrics/[type]) containing:
 *   - 6-month & all-time horizontal trend graphs
 *   - Cascading geo-filters (Province -> District -> Area)
 *   - Administrative tier breakdown matrix
 *   - Unit report document downloads (PDF & Excel)
 *   - Links to Meetings roster & Reports Center
 */

const KPI_CONFIG = [
  {
    type: 'filed',
    labelKey: 'dashboard.reportsSubmitted',
    labelFallback: 'Reports Filed',
    icon: '✅',
    iconColor: Colors.success,
    iconBg: 'rgba(22, 163, 74, 0.12)',
    valueKey: 'filed',
    accent: Colors.success,
  },
  {
    type: 'outstanding',
    labelKey: 'dashboard.reportsNotSubmitted',
    labelFallback: 'Outstanding',
    icon: '⚠️',
    iconColor: Colors.error,
    iconBg: 'rgba(239, 68, 68, 0.12)',
    valueKey: 'outstanding',
    accent: Colors.error,
  },
  {
    type: 'rate',
    labelKey: 'dashboard.reportsSubmittedPct',
    labelFallback: 'Overall Filing Rate',
    icon: '📊',
    iconColor: Colors.primary,
    iconBg: 'rgba(30, 64, 175, 0.12)',
    valueKey: 'filingRate',
    accent: Colors.primary,
    format: (v) => `${v ?? 0}%`,
  },
  {
    type: 'unit_reports',
    labelKey: 'dashboard.unitReports',
    labelFallback: 'Unit Reports',
    icon: '📑',
    iconColor: '#7c3aed',
    iconBg: 'rgba(124, 58, 237, 0.12)',
    valueKey: 'units',
    accent: '#7c3aed',
  },
];

function ReportKpiTile({ config, value, isRTL, onPress }) {
  const isLoading = value == null;
  return (
    <TouchableOpacity
      style={[styles.kpiTile, { borderLeftColor: config.accent }]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <View style={[styles.kpiTileRow, isRTL && { flexDirection: 'row-reverse' }]}>
        {/* Icon */}
        <View style={[styles.kpiIconBox, { backgroundColor: config.iconBg }]}>
          <Text style={styles.kpiIcon}>{config.icon}</Text>
        </View>
        {/* Value */}
        <View style={[styles.kpiTextCol, isRTL && { alignItems: 'flex-end' }]}>
          {isLoading ? (
            <ActivityIndicator size="small" color={config.iconColor} />
          ) : (
            <Text style={[styles.kpiValue, { color: config.accent }]}>
              {config.format ? config.format(value) : (value ?? 0).toLocaleString()}
            </Text>
          )}
        </View>
        {/* Chevron */}
        <Ionicons
          name={isRTL ? 'chevron-back' : 'chevron-forward'}
          size={14}
          color={Colors.textMuted}
          style={styles.kpiChevron}
        />
      </View>
      {/* Label */}
      <Text style={[styles.kpiLabel, isRTL && { textAlign: 'right' }]}>
        {config.labelFallback}
      </Text>
    </TouchableOpacity>
  );
}

export default function ReportsAnalytics({ params }) {
  const { t, isRTL } = useLanguage();
  const router = useRouter();
  const { data, loading, error } = useAnalytics('/dashboard/reports', params);

  const navigate = useCallback(
    (type) => router.push(`/reports/metrics/${type}`),
    [router]
  );

  const totals = data?.totals || {};

  if (loading && !data) {
    return (
      <View style={styles.loadingRow}>
        {KPI_CONFIG.map((cfg) => (
          <View key={cfg.type} style={[styles.kpiTile, styles.kpiTileSkeleton]} />
        ))}
      </View>
    );
  }

  if (error) {
    return (
      <Card style={styles.errorCard}>
        <Text style={styles.errorText}>{error}</Text>
      </Card>
    );
  }

  // Value resolution for 4th KPI tile (Unit Reports count)
  const unitReportsCount =
    totals.units ??
    data?.rows?.length ??
    totals.total ??
    0;

  return (
    <View style={styles.container}>
      {/* Row 1: Reports Filed + Outstanding */}
      <View style={[styles.kpiGrid, isRTL && { flexDirection: 'row-reverse' }]}>
        <ReportKpiTile
          config={KPI_CONFIG[0]}
          value={totals.filed}
          isRTL={isRTL}
          onPress={() => navigate('filed')}
        />
        <ReportKpiTile
          config={KPI_CONFIG[1]}
          value={totals.outstanding}
          isRTL={isRTL}
          onPress={() => navigate('outstanding')}
        />
      </View>

      {/* Row 2: Filing Rate + Unit Reports */}
      <View style={[styles.kpiGrid, isRTL && { flexDirection: 'row-reverse' }]}>
        <ReportKpiTile
          config={KPI_CONFIG[2]}
          value={totals.filingRate}
          isRTL={isRTL}
          onPress={() => navigate('rate')}
        />
        <ReportKpiTile
          config={KPI_CONFIG[3]}
          value={unitReportsCount}
          isRTL={isRTL}
          onPress={() => navigate('unit_reports')}
        />
      </View>

      {/* Tap hint */}
      <Text style={[styles.tapHint, isRTL && { textAlign: 'right' }]}>
        {t('dashboard.tapForDetails', 'Tap a tile to see detailed breakdown & trends')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.sm,
  },
  loadingRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    flexWrap: 'wrap',
  },
  kpiGrid: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  kpiTile: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    borderLeftWidth: 3,
    padding: Spacing.sm,
    gap: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
  },
  kpiTileSkeleton: {
    height: 72,
    backgroundColor: Colors.surfaceAlt,
    borderLeftColor: Colors.border,
    opacity: 0.5,
  },
  kpiTileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  kpiIconBox: {
    width: 30,
    height: 30,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kpiIcon: {
    fontSize: 14,
  },
  kpiTextCol: {
    flex: 1,
    alignItems: 'flex-start',
  },
  kpiValue: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  kpiChevron: {
    marginLeft: 4,
  },
  kpiLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textMuted,
    marginTop: 2,
  },
  errorCard: {
    padding: Spacing.md,
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
  },
  errorText: {
    color: Colors.error,
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
  tapHint: {
    fontSize: 10,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: 2,
  },
});
