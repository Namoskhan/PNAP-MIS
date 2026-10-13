/**
 * /campaigns/metrics/[type] — Campaign Metric Detail Screen
 *
 * Opened when the user taps one of the 4 Campaign KPI tiles on the main dashboard.
 * `type` is one of: running (or active) | upcoming | completed | total
 *
 * Features:
 *   • Hero KPI card with context and totals
 *   • Campaign Reach & impact stats (households, contacts, joiners)
 *   • Cascading geo-filters: Province → District → Area
 *   • 6-month trend bar chart (default) with toggle to horizontal all-time view
 *   • Tier-wise campaign breakdown with distribution bars
 *   • Summary status grid
 *   • Direct link to campaign roster in Activities
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../../../src/api/client';
import { useLanguage } from '../../../../src/context/LanguageContext';
import { Colors, FontSize, Radius, Spacing } from '../../../../src/constants/colors';
import Card from '../../../../src/components/Card';
import { AreaTrendChart } from '../../../../src/components/charts';
import LocationFilterPicker from '../../../../src/components/dashboard/LocationFilterPicker';

// ─── Config per metric type ───────────────────────────────────────────────────

const TYPE_CONFIG = {
  running: {
    title: 'Active Campaigns',
    icon: '🎯',
    accent: Colors.primary,
    iconBg: 'rgba(30, 64, 175, 0.12)',
    valueKey: 'running',
    barColor: Colors.primary,
    trackColor: '#eff6ff',
    description: 'Campaigns currently active and in the field',
    stateFilter: 'SCHEDULED',
  },
  active: {
    title: 'Active Campaigns',
    icon: '🎯',
    accent: Colors.primary,
    iconBg: 'rgba(30, 64, 175, 0.12)',
    valueKey: 'running',
    barColor: Colors.primary,
    trackColor: '#eff6ff',
    description: 'Campaigns currently active and in the field',
    stateFilter: 'SCHEDULED',
  },
  upcoming: {
    title: 'Upcoming Campaigns',
    icon: '⏱️',
    accent: '#d97706',
    iconBg: 'rgba(217, 119, 6, 0.12)',
    valueKey: 'upcoming',
    barColor: '#f59e0b',
    trackColor: '#fffbeb',
    description: 'Campaigns scheduled to start in the upcoming days',
    stateFilter: 'SCHEDULED',
  },
  completed: {
    title: 'Completed Campaigns',
    icon: '✅',
    accent: Colors.success || '#16a34a',
    iconBg: 'rgba(22, 163, 74, 0.12)',
    valueKey: 'completed',
    barColor: '#16a34a',
    trackColor: '#f0fdf4',
    description: 'Field campaigns successfully executed and finalized',
    stateFilter: 'COMPLETED',
  },
  total: {
    title: 'Total Campaigns',
    icon: '📋',
    accent: '#64748b',
    iconBg: 'rgba(100, 116, 139, 0.15)',
    valueKey: 'total',
    barColor: '#64748b',
    trackColor: '#f8fafc',
    description: 'All recorded field campaigns across all stages',
    stateFilter: '',
  },
};

// ─── Utility ─────────────────────────────────────────────────────────────────

function computeTrendForType(data, type) {
  if (!data) return [];
  const trendAll = data.trendAll || data.trend || [];
  if (!trendAll.length) return [];

  const key = type === 'active' ? 'running' : type;

  return trendAll.map((b) => {
    let val = 0;
    if (key === 'total') {
      val = b.total != null ? b.total : (b.completed || 0) + (b.running || 0);
    } else if (b[key] != null) {
      val = b[key];
    } else if (key === 'completed') {
      val = b.completed || 0;
    } else {
      val = b.total || 0;
    }
    return { ...b, value: val };
  });
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function TierBreakdownRow({ row, valueKey, accent }) {
  const val = row[valueKey] ?? row.total ?? 0;
  const pct = row._max > 0 ? Math.round((val / row._max) * 100) : 0;
  return (
    <View style={styles.breakdownRow}>
      <Text style={styles.breakdownName} numberOfLines={1}>{row.name}</Text>
      <View style={styles.breakdownBarWrap}>
        <View style={[styles.breakdownBarFill, { width: `${pct}%`, backgroundColor: accent }]} />
      </View>
      <Text style={[styles.breakdownVal, { color: accent }]}>{val.toLocaleString()}</Text>
    </View>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function CampaignMetricDetailScreen() {
  const { type = 'total' } = useLocalSearchParams();
  const router = useRouter();
  const { isRTL } = useLanguage();

  const cfg = TYPE_CONFIG[type] || TYPE_CONFIG.total;

  // ── State ────────────────────────────────────────────────────────────────
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAllTime, setShowAllTime] = useState(false);

  // Geo-filter state
  const [selProvince, setSelProvince] = useState(null);
  const [selDistrict, setSelDistrict] = useState(null);
  const [selArea, setSelArea] = useState(null);

  // ── Fetch ────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = {
        days: showAllTime ? 3650 : 365,
      };
      if (selProvince) params.provinceId = selProvince;
      if (selDistrict) params.districtId = selDistrict;
      if (selArea) params.areaId = selArea;

      const res = await api.get('/dashboard/campaigns', { params });
      setData(res.data?.data || null);
    } catch (e) {
      setError(e?.response?.data?.message || 'Failed to load campaign data');
    } finally {
      setLoading(false);
    }
  }, [selProvince, selDistrict, selArea, showAllTime]);

  useEffect(() => { load(); }, [load]);

  // ── Trend data ────────────────────────────────────────────────────────────
  const trendFull = useMemo(() => computeTrendForType(data, type), [data, type]);
  const trend6 = useMemo(() => trendFull.slice(-6), [trendFull]);
  const displayTrend = showAllTime ? trendFull : trend6;

  // ── Totals ────────────────────────────────────────────────────────────────
  const totals = data?.totals || {};
  const metricValue = totals[cfg.valueKey] ?? 0;
  const reach = data?.reach || null;

  // ── Tier breakdown table ──────────────────────────────────────────────────
  const tierRows = useMemo(() => {
    const level = data?.levels?.[0] || null;
    if (!level) return [];
    const rows = data?.byLevel?.[level] || [];
    const max = Math.max(...rows.map((r) => r[cfg.valueKey] ?? r.total ?? 0), 1);
    return rows.map((r) => ({ ...r, _max: max }));
  }, [data, cfg.valueKey]);

  const activeLevelLabel = data?.levels?.[0]
    ? data.levels[0].charAt(0) + data.levels[0].slice(1).toLowerCase()
    : 'Unit';

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={[styles.header, isRTL && { flexDirection: 'row-reverse' }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons
            name={isRTL ? 'chevron-forward' : 'chevron-back'}
            size={22}
            color={Colors.text}
          />
        </TouchableOpacity>
        <View style={[styles.headerTitleRow, isRTL && { alignItems: 'flex-end' }]}>
          <View style={[styles.headerIconBox, { backgroundColor: cfg.iconBg }]}>
            <Text style={styles.headerIcon}>{cfg.icon}</Text>
          </View>
          <View>
            <Text style={styles.headerTitle}>{cfg.title}</Text>
            <Text style={styles.headerSub}>{cfg.description}</Text>
          </View>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {loading && !data ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={cfg.accent} />
            <Text style={styles.loadingText}>Loading…</Text>
          </View>
        ) : error ? (
          <Card style={styles.errorCard}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={load}>
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </Card>
        ) : (
          <>
            {/* KPI Hero */}
            <Card style={[styles.heroCard, { borderLeftColor: cfg.accent }]}>
              <Text style={[styles.heroValue, { color: cfg.accent }]}>
                {metricValue.toLocaleString()}
              </Text>
              <Text style={styles.heroLabel}>{cfg.title}</Text>
              {type !== 'total' && (
                <View style={styles.heroMeta}>
                  <Text style={styles.heroMetaText}>
                    Total Recorded: {(totals.total ?? 0).toLocaleString()}
                    {totals.total > 0
                      ? `  ·  ${Math.round((metricValue / totals.total) * 100)}% of total`
                      : ''}
                  </Text>
                </View>
              )}
            </Card>

            {/* Campaign Reach Highlight (if present) */}
            {reach && (
              <Card style={styles.reachCard}>
                <Text style={styles.sectionTitle}>Campaign Impact & Reach</Text>
                <View style={styles.reachGrid}>
                  <View style={styles.reachCell}>
                    <Text style={[styles.reachVal, { color: Colors.primary }]}>
                      {(reach.peopleContacted || 0).toLocaleString()}
                    </Text>
                    <Text style={styles.reachLabel}>People Contacted</Text>
                  </View>
                  <View style={styles.reachCell}>
                    <Text style={[styles.reachVal, { color: '#d97706' }]}>
                      {(reach.householdsVisited || 0).toLocaleString()}
                    </Text>
                    <Text style={styles.reachLabel}>Households Visited</Text>
                  </View>
                  <View style={styles.reachCell}>
                    <Text style={[styles.reachVal, { color: Colors.success || '#16a34a' }]}>
                      {(reach.actualJoiners || 0).toLocaleString()}
                    </Text>
                    <Text style={styles.reachLabel}>Actual Joiners</Text>
                  </View>
                  <View style={styles.reachCell}>
                    <Text style={[styles.reachVal, { color: '#64748b' }]}>
                      {reach.conversionPct != null ? `${reach.conversionPct}%` : '—'}
                    </Text>
                    <Text style={styles.reachLabel}>Conversion Rate</Text>
                  </View>
                </View>
              </Card>
            )}

            {/* Geo-filters: Persistent Provinces + Searchable District & Area */}
            <LocationFilterPicker
              selectedProvinceId={selProvince}
              selectedDistrictId={selDistrict}
              selectedAreaId={selArea}
              onSelectProvince={(provId) => {
                setSelProvince(provId);
                setSelDistrict(null);
                setSelArea(null);
              }}
              onSelectDistrict={(distId) => {
                setSelDistrict(distId);
                setSelArea(null);
              }}
              onSelectArea={(areaId) => {
                setSelArea(areaId);
              }}
              onReset={() => {
                setSelProvince(null);
                setSelDistrict(null);
                setSelArea(null);
              }}
            />

            {/* Trend Chart */}
            <Card style={styles.chartCard}>
              <View style={styles.chartHeader}>
                <View>
                  <Text style={styles.sectionTitle}>Campaign Monthly Trend</Text>
                  <Text style={styles.chartSub}>
                    {showAllTime ? 'All-time (scroll right for older data)' : 'Last 6 months'}
                  </Text>
                </View>
                <TouchableOpacity
                  style={[styles.toggleBtn, showAllTime && styles.toggleBtnActive]}
                  onPress={() => setShowAllTime((s) => !s)}
                >
                  <Ionicons
                    name={showAllTime ? 'contract-outline' : 'expand-outline'}
                    size={13}
                    color={showAllTime ? '#fff' : Colors.text}
                  />
                  <Text style={[styles.toggleBtnText, showAllTime && styles.toggleBtnTextActive]}>
                    {showAllTime ? '6-Month' : 'All-Time'}
                  </Text>
                </TouchableOpacity>
              </View>

              {displayTrend.length > 0 ? (
                <AreaTrendChart
                  trend={displayTrend}
                  height={140}
                  barColor={cfg.barColor}
                  trackColor={cfg.trackColor}
                  scrollable={showAllTime}
                  valueKey="value"
                />
              ) : (
                <Text style={styles.emptyText}>No trend data available.</Text>
              )}
            </Card>

            {/* Tier Breakdown */}
            {tierRows.length > 0 && (
              <Card style={styles.breakdownCard}>
                <Text style={styles.sectionTitle}>
                  {activeLevelLabel}-wise Campaign Distribution
                </Text>
                {tierRows.slice(0, 20).map((row) => (
                  <TierBreakdownRow
                    key={String(row._id)}
                    row={row}
                    valueKey={cfg.valueKey}
                    accent={cfg.accent}
                  />
                ))}
                {tierRows.length > 20 && (
                  <Text style={styles.emptyText}>
                    + {tierRows.length - 20} more units…
                  </Text>
                )}
              </Card>
            )}

            {/* Summary stats */}
            {data && (
              <Card style={styles.statsCard}>
                <Text style={styles.sectionTitle}>Campaigns Summary</Text>
                <View style={styles.statsGrid}>
                  {[
                    { label: 'Total', value: totals.total ?? 0, color: Colors.primary },
                    { label: 'Active', value: totals.running ?? 0, color: Colors.primary },
                    { label: 'Upcoming', value: totals.upcoming ?? 0, color: '#d97706' },
                    { label: 'Completed', value: totals.completed ?? 0, color: Colors.success || '#16a34a' },
                    { label: 'Cancelled', value: totals.cancelled ?? 0, color: '#64748b' },
                  ].map((s) => (
                    <View key={s.label} style={styles.statCell}>
                      <Text style={[styles.statValue, { color: s.color }]}>
                        {s.value.toLocaleString()}
                      </Text>
                      <Text style={styles.statLabel}>{s.label}</Text>
                    </View>
                  ))}
                </View>
              </Card>
            )}

            {/* View Campaign Activities Button */}
            <TouchableOpacity
              style={[styles.rosterBtn, { backgroundColor: cfg.accent }]}
              onPress={() => {
                const params = { typeCode: 'CAMPAIGN' };
                if (cfg.stateFilter) params.state = cfg.stateFilter;
                router.push({ pathname: '/activities', params });
              }}
              activeOpacity={0.8}
            >
              <Ionicons name="megaphone" size={18} color="#fff" />
              <Text style={styles.rosterBtnText}>View {cfg.title} in Activities</Text>
              <Ionicons name="arrow-forward" size={16} color="#fff" />
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: Spacing.sm,
  },
  backBtn: {
    padding: 6,
    borderRadius: Radius.sm,
    backgroundColor: Colors.surfaceAlt,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  headerIconBox: {
    width: 36,
    height: 36,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerIcon: { fontSize: 18 },
  headerTitle: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.text,
  },
  headerSub: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 1,
  },
  scroll: { flex: 1 },
  scrollContent: {
    padding: Spacing.md,
    gap: Spacing.md,
    paddingBottom: 40,
  },
  center: {
    paddingVertical: 60,
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
  },
  errorCard: {
    padding: Spacing.md,
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
    alignItems: 'center',
    gap: 8,
  },
  errorText: {
    color: Colors.error || '#dc2626',
    fontSize: FontSize.sm,
  },
  retryBtn: {
    paddingVertical: 6,
    paddingHorizontal: 16,
    backgroundColor: Colors.primary,
    borderRadius: Radius.sm,
  },
  retryText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: FontSize.sm,
  },
  heroCard: {
    padding: Spacing.lg,
    alignItems: 'center',
    borderLeftWidth: 4,
    gap: 4,
  },
  heroValue: {
    fontSize: 40,
    fontWeight: '800',
    letterSpacing: -1.5,
  },
  heroLabel: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  heroMeta: {
    marginTop: 6,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    width: '100%',
    alignItems: 'center',
  },
  heroMetaText: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  reachCard: {
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  reachGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  reachCell: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: Colors.surfaceAlt,
    padding: Spacing.sm,
    borderRadius: Radius.md,
    alignItems: 'center',
    gap: 3,
  },
  reachVal: {
    fontSize: 20,
    fontWeight: '800',
  },
  reachLabel: {
    fontSize: 11,
    color: Colors.textMuted,
    fontWeight: '600',
  },
  filterCard: {
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  filterBlock: { gap: 6 },
  filterLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  filterChipsRow: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'nowrap',
  },
  filterChip: {
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: Radius.pill,
    backgroundColor: Colors.surfaceAlt,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  filterChipText: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    color: Colors.text,
  },
  filterChipTextActive: {
    color: '#fff',
    fontWeight: '700',
  },
  chartCard: {
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  chartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  chartSub: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
  },
  toggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: Radius.sm,
    backgroundColor: Colors.surfaceAlt,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  toggleBtnActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  toggleBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.text,
  },
  toggleBtnTextActive: {
    color: '#fff',
  },
  breakdownCard: {
    padding: Spacing.md,
    gap: 10,
  },
  breakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  breakdownName: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.text,
    width: 90,
  },
  breakdownBarWrap: {
    flex: 1,
    height: 6,
    backgroundColor: Colors.borderLight || Colors.border,
    borderRadius: Radius.pill,
    overflow: 'hidden',
  },
  breakdownBarFill: {
    height: '100%',
    borderRadius: Radius.pill,
  },
  breakdownVal: {
    fontSize: 11,
    fontWeight: '700',
    minWidth: 36,
    textAlign: 'right',
  },
  statsCard: {
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  statCell: {
    flex: 1,
    minWidth: 55,
    alignItems: 'center',
    padding: Spacing.sm,
    backgroundColor: Colors.surfaceAlt,
    borderRadius: Radius.md,
    gap: 4,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '800',
  },
  statLabel: {
    fontSize: 11,
    color: Colors.textMuted,
    fontWeight: '600',
  },
  sectionTitle: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.text,
  },
  emptyText: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    textAlign: 'center',
    paddingVertical: 12,
  },
  rosterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.md,
    gap: 8,
    marginTop: 4,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  rosterBtnText: {
    color: '#fff',
    fontSize: FontSize.sm,
    fontWeight: '700',
  },
});
