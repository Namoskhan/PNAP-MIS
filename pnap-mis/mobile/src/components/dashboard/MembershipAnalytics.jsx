import { useCallback } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import useAnalytics from '../../hooks/useAnalytics';
import { useLanguage } from '../../context/LanguageContext';
import { Colors, FontSize, Radius, Spacing } from '../../constants/colors';
import Card from '../Card';
import { Ionicons } from '@expo/vector-icons';

/**
 * MembershipAnalytics — Main Dashboard View
 *
 * Renders exactly 4 interactive KPI tiles on the main dashboard.
 * Each tile navigates to its own dedicated full-screen detail page
 * (/members/metrics/[type]) which contains the trend chart,
 * geographic filters, and tier breakdown.
 *
 * The registration-trend chart and breakdown cards have been moved
 * out of this component and now live in the dedicated detail screens.
 */

const KPI_CONFIG = [
  {
    type: 'total',
    labelKey: 'dashboard.totalMembers',
    labelFallback: 'Total Members',
    icon: '👥',
    iconColor: Colors.primary,
    iconBg: 'rgba(30, 64, 175, 0.12)',
    valueKey: 'total',
    accent: Colors.primary,
  },
  {
    type: 'new',
    labelKey: 'dashboard.newMembers',
    labelFallback: 'New Members',
    icon: '⚡',
    iconColor: '#d97706',
    iconBg: 'rgba(217, 119, 6, 0.12)',
    valueKey: 'newMembers',
    accent: '#d97706',
  },
  {
    type: 'active',
    labelKey: 'dashboard.activeMembers',
    labelFallback: 'Active',
    icon: '✅',
    iconColor: Colors.success,
    iconBg: 'rgba(22, 163, 74, 0.12)',
    valueKey: 'active',
    accent: Colors.success,
  },
  {
    type: 'inactive',
    labelKey: 'dashboard.inactiveMembers',
    labelFallback: 'Inactive',
    icon: '➖',
    iconColor: Colors.textMuted,
    iconBg: 'rgba(100, 116, 139, 0.15)',
    valueKey: 'inactive',
    accent: Colors.textMuted,
  },
];

function MemberKpiTile({ config, value, isRTL, onPress }) {
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
        {/* Value & Label */}
        <View style={[styles.kpiTextCol, isRTL && { alignItems: 'flex-end' }]}>
          {isLoading ? (
            <ActivityIndicator size="small" color={config.iconColor} />
          ) : (
            <Text style={[styles.kpiValue, { color: config.accent }]}>
              {(value ?? 0).toLocaleString()}
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
      {/* Label below */}
      <Text style={[styles.kpiLabel, isRTL && { textAlign: 'right' }]}>{config.labelFallback}</Text>
    </TouchableOpacity>
  );
}

export default function MembershipAnalytics({ params, windowLabel = 'last 12 months', byStatus }) {
  const { t, isRTL } = useLanguage();
  const router = useRouter();
  const { data, loading, error } = useAnalytics('/dashboard/membership', params);

  const navigate = useCallback(
    (type) => router.push(`/members/metrics/${type}`),
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

  return (
    <View style={styles.container}>
      <View style={[styles.kpiGrid, isRTL && { flexDirection: 'row-reverse' }]}>
        {/* Row 1: Total + New */}
        {KPI_CONFIG.slice(0, 2).map((cfg) => (
          <MemberKpiTile
            key={cfg.type}
            config={cfg}
            value={totals[cfg.valueKey]}
            isRTL={isRTL}
            onPress={() => navigate(cfg.type)}
          />
        ))}
      </View>
      <View style={[styles.kpiGrid, isRTL && { flexDirection: 'row-reverse' }]}>
        {/* Row 2: Active + Inactive */}
        {KPI_CONFIG.slice(2, 4).map((cfg) => (
          <MemberKpiTile
            key={cfg.type}
            config={cfg}
            value={totals[cfg.valueKey]}
            isRTL={isRTL}
            onPress={() => navigate(cfg.type)}
          />
        ))}
      </View>
      {/* Hint text */}
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
