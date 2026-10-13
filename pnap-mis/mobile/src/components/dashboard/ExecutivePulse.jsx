import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, FontSize, Radius, Spacing } from '../../constants/colors';

const num = (v) => (v ?? 0).toLocaleString();

/**
 * ExecutivePulse Component (Clean, Minimalist Bento Grid)
 * Stripped of all redundant paragraphs, footnotes and explanatory clutter.
 */
export default function ExecutivePulse({
  summary,
  scopeName,
  windowLabel,
  pendingApprovals = 0,
  isRTL = false,
  t,
  onPressMembers,
  onPressUnits,
  onPressGovernance,
  onPressAlerts,
}) {
  const o = summary?.organization;
  const m = summary?.membership;
  const mtg = summary?.meetings;

  // Calculate overall organization functioning percentage across all 4 tiers
  const totalUnits =
    (o?.provinces?.total || 0) +
    (o?.districts?.total || 0) +
    (o?.areas?.total || 0) +
    (o?.basicUnits?.total || 0);

  const activeUnits =
    (o?.provinces?.active || 0) +
    (o?.districts?.active || 0) +
    (o?.areas?.active || 0) +
    (o?.basicUnits?.active || 0);

  const healthRate = totalUnits > 0 ? Math.round((activeUnits / totalUnits) * 100) : 0;
  const isHealthy = healthRate >= 75;
  const isModerate = healthRate >= 50 && healthRate < 75;

  const healthStatusColor = isHealthy
    ? Colors.success
    : isModerate
    ? Colors.warning
    : Colors.error;

  const healthStatusBg = isHealthy
    ? 'rgba(22, 163, 74, 0.12)'
    : isModerate
    ? 'rgba(217, 119, 6, 0.12)'
    : 'rgba(220, 38, 38, 0.12)';

  const actionItemsCount = (pendingApprovals || 0) + (summary?.reports?.outstanding || 0);

  // New member count
  const newMembers = m?.newMembers || 0;
  const totalMembers = m?.total || 0;

  // Meetings conducted percentage
  const mtgTotal = mtg?.total || 0;
  const mtgConducted = mtg?.conducted || 0;
  const mtgRate = mtgTotal > 0 ? Math.round((mtgConducted / mtgTotal) * 100) : 0;

  return (
    <View style={styles.container}>
      {/* ── Header: Title & Health Badge ── */}
      <View style={[styles.headerRow, isRTL && { flexDirection: 'row-reverse' }]}>
        <Text style={[styles.scopeTitle, isRTL && { textAlign: 'right' }]} numberOfLines={1}>
          {scopeName || t('commandCenter.nationalScope', 'National Executive Overview')}
        </Text>

        <View style={[styles.healthBadge, { backgroundColor: healthStatusBg }, isRTL && { flexDirection: 'row-reverse' }]}>
          <View style={[styles.healthDot, { backgroundColor: healthStatusColor }]} />
          <Text style={[styles.healthBadgeText, { color: healthStatusColor }]}>
            {totalUnits > 0 ? `${healthRate}% Active` : '—'}
          </Text>
        </View>
      </View>

      {/* ── Minimal Health Bar ── */}
      <View style={styles.meterContainer}>
        <View style={styles.meterTrack}>
          <View
            style={[
              styles.meterFill,
              {
                width: `${Math.min(100, Math.max(0, healthRate))}%`,
                backgroundColor: healthStatusColor,
              },
            ]}
          />
        </View>
      </View>

      {/* ── BENTO GRID ── */}
      <View style={styles.bentoContainer}>
        {/* 1. HERO CARD: Membership */}
        <TouchableOpacity
          style={styles.heroBentoCard}
          activeOpacity={0.85}
          onPress={onPressMembers}
        >
          <View style={[styles.heroCardTop, isRTL && { flexDirection: 'row-reverse' }]}>
            <View style={[styles.heroIconBadge, isRTL && { flexDirection: 'row-reverse' }]}>
              <Ionicons name="people" size={16} color={Colors.primary} />
              <Text style={styles.heroCategoryLabel}>
                {t('commandCenter.totalMembers', 'Total Members')}
              </Text>
            </View>

            {newMembers > 0 && (
              <View style={[styles.trendPill, isRTL && { flexDirection: 'row-reverse' }]}>
                <Ionicons name="trending-up" size={12} color={Colors.success} />
                <Text style={styles.trendPillText}>+{num(newMembers)}</Text>
              </View>
            )}
          </View>

          <View style={[styles.heroNumberRow, isRTL && { flexDirection: 'row-reverse' }]}>
            <Text style={styles.heroBigNumber}>{num(totalMembers)}</Text>
            <View style={[styles.heroActionGroup, isRTL && { flexDirection: 'row-reverse' }]}>
              <Text style={styles.heroActionHint}>
                {t('common.view', 'View')}
              </Text>
              <Ionicons name={isRTL ? 'chevron-back' : 'chevron-forward'} size={13} color={Colors.primary} />
            </View>
          </View>

          <View style={styles.heroProgressTrack}>
            <View
              style={[
                styles.heroProgressFill,
                { width: `${Math.min(100, Math.max(20, 100 - (actionItemsCount * 2)))}%` },
              ]}
            />
          </View>
        </TouchableOpacity>

        {/* 2. SPLIT TILES: Active Units & Meetings (50 / 50) */}
        <View style={[styles.splitBentoRow, isRTL && { flexDirection: 'row-reverse' }]}>
          {/* Card A: Active Field Units */}
          <TouchableOpacity
            style={styles.splitBentoTile}
            activeOpacity={0.85}
            onPress={onPressUnits}
          >
            <View style={[styles.tileHeader, isRTL && { flexDirection: 'row-reverse' }]}>
              <View style={[styles.tileIconCircle, { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' }]}>
                <Ionicons name="business" size={15} color={Colors.success} />
              </View>
              <View style={[styles.pctBadge, { backgroundColor: healthStatusBg }]}>
                <Text style={[styles.pctBadgeText, { color: healthStatusColor }]}>
                  {healthRate}%
                </Text>
              </View>
            </View>

            <Text style={[styles.splitBigNumber, isRTL && { textAlign: 'right' }]}>
              {num(activeUnits)}
            </Text>

            <Text style={[styles.splitLabel, isRTL && { textAlign: 'right' }]}>
              {t('commandCenter.activeUnits', 'Active Units')}
            </Text>
          </TouchableOpacity>

          {/* Card B: Governance & Meetings */}
          <TouchableOpacity
            style={styles.splitBentoTile}
            activeOpacity={0.85}
            onPress={onPressGovernance}
          >
            <View style={[styles.tileHeader, isRTL && { flexDirection: 'row-reverse' }]}>
              <View style={[styles.tileIconCircle, { backgroundColor: '#eff6ff', borderColor: '#bfdbfe' }]}>
                <Ionicons name="calendar" size={15} color={Colors.primaryLight} />
              </View>
              <View style={[styles.pctBadge, { backgroundColor: 'rgba(59, 130, 246, 0.12)' }]}>
                <Text style={[styles.pctBadgeText, { color: Colors.primaryLight }]}>
                  {mtgRate}%
                </Text>
              </View>
            </View>

            <Text style={[styles.splitBigNumber, isRTL && { textAlign: 'right' }]}>
              {num(mtgConducted)}
            </Text>

            <Text style={[styles.splitLabel, isRTL && { textAlign: 'right' }]}>
              {t('nav.meetings', 'Meetings Held')}
            </Text>
          </TouchableOpacity>
        </View>

        {/* 3. URGENT BANNER (Only when pending decisions exist) */}
        {actionItemsCount > 0 ? (
          <TouchableOpacity
            style={[styles.urgentBanner, isRTL && { flexDirection: 'row-reverse' }]}
            activeOpacity={0.85}
            onPress={onPressAlerts}
          >
            <View style={styles.urgentIconCircle}>
              <Ionicons name="alert-circle" size={18} color="#d97706" />
            </View>
            <Text style={[styles.urgentTitle, isRTL && { textAlign: 'right' }]}>
              {actionItemsCount} {t('commandCenter.actionItems', 'Decisions Pending')}
            </Text>
            <Ionicons name={isRTL ? 'chevron-back' : 'chevron-forward'} size={16} color="#d97706" />
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#ffffff',
    borderRadius: Radius.lg || 18,
    padding: 14,
    marginBottom: Spacing.md || 12,
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.9)',
    ...Platform.select({
      web: {
        boxShadow: '0 4px 16px rgba(15, 23, 42, 0.04)',
      },
      default: {
        shadowColor: '#0f172a',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 6,
        elevation: 2,
      },
    }),
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  scopeTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
  },
  healthBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 20,
    gap: 5,
  },
  healthDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  healthBadgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  meterContainer: {
    marginBottom: 12,
  },
  meterTrack: {
    height: 4,
    backgroundColor: '#f1f5f9',
    borderRadius: 2,
    overflow: 'hidden',
  },
  meterFill: {
    height: '100%',
    borderRadius: 2,
  },

  // ── BENTO GRID ──
  bentoContainer: {
    gap: 8,
  },

  // Hero Bento Card
  heroBentoCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  heroCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  heroIconBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  heroCategoryLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
  },
  trendPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#dcfce7',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  trendPillText: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.success,
  },
  heroNumberRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  heroBigNumber: {
    fontSize: 30,
    fontWeight: '900',
    color: '#0f172a',
    letterSpacing: -0.6,
  },
  heroActionGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  heroActionHint: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.primary,
  },
  heroProgressTrack: {
    height: 4,
    backgroundColor: '#e2e8f0',
    borderRadius: 2,
    overflow: 'hidden',
  },
  heroProgressFill: {
    height: '100%',
    backgroundColor: Colors.primary,
    borderRadius: 2,
  },

  // Split Bento Tiles (Side-by-Side 50/50)
  splitBentoRow: {
    flexDirection: 'row',
    gap: 8,
  },
  splitBentoTile: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  tileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  tileIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  pctBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 8,
  },
  pctBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  splitBigNumber: {
    fontSize: 22,
    fontWeight: '900',
    color: '#0f172a',
    letterSpacing: -0.4,
  },
  splitLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
    marginTop: 2,
  },

  // Urgent Action Strip
  urgentBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fffbeb',
    borderRadius: 12,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#fde68a',
    gap: 8,
  },
  urgentIconCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#fef3c7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  urgentTitle: {
    flex: 1,
    fontSize: 12,
    fontWeight: '800',
    color: '#92400e',
  },
});
