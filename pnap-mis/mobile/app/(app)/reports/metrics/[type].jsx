/**
 * /reports/metrics/[type] — Reports Metric Detail Screen
 *
 * Opened when the user taps one of the 3 KPI tiles on the dashboard:
 * `type` is one of: filed | outstanding | rate
 *
 * Features:
 *   • Hero metric card with filing efficiency
 *   • Cascading geo-filters: Province → District → Area (LocationFilterPicker)
 *   • 6-month trend bar chart with All-Time toggle
 *   • Tier breakdown matrix (by administrative level)
 *   • Summary stats grid (Filed, Outstanding, Total, Rate)
 *   • Quick Unit Report Export (PDF & Excel)
 *   • Direct link to Meeting roster
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
import { AreaTrendChart, Donut } from '../../../../src/components/charts';
import LocationFilterPicker from '../../../../src/components/dashboard/LocationFilterPicker';
import { downloadAndShare } from '../../../../src/utils/export';
import { useToast } from '../../../../src/components/Toast';

// ─── Config per metric type ───────────────────────────────────────────────────

const TYPE_CONFIG = {
  filed: {
    title: 'Reports Filed',
    icon: '✅',
    accent: Colors.success || '#16a34a',
    iconBg: 'rgba(22, 163, 74, 0.12)',
    valueKey: 'filed',
    barColor: '#16a34a',
    trackColor: '#f0fdf4',
    description: 'Finalized meeting reports submitted by active administrative units',
    badge: 'FILED',
  },
  outstanding: {
    title: 'Outstanding Reports',
    icon: '⚠️',
    accent: Colors.error || '#dc2626',
    iconBg: 'rgba(239, 68, 68, 0.12)',
    valueKey: 'outstanding',
    barColor: '#dc2626',
    trackColor: '#fef2f2',
    description: 'Concluded meetings awaiting formal minutes submission',
    badge: 'OVERDUE',
  },
  rate: {
    title: 'Overall Filing Rate',
    icon: '📊',
    accent: Colors.primary || '#1e40af',
    iconBg: 'rgba(30, 64, 175, 0.12)',
    valueKey: 'filingRate',
    barColor: Colors.primary || '#1e40af',
    trackColor: '#eff6ff',
    description: 'Percentage of concluded meetings with finalized reports',
    badge: 'RATE',
    isPct: true,
  },
  unit_reports: {
    title: 'Unit Reports',
    icon: '📑',
    accent: '#7c3aed',
    iconBg: 'rgba(124, 58, 237, 0.12)',
    valueKey: 'units',
    barColor: '#7c3aed',
    trackColor: '#f5f3ff',
    description: 'Governance & financial reports compiled across administrative units',
    badge: 'UNIT REPORTS',
  },
};

// ─── Trend Computation ─────────────────────────────────────────────────────────

function computeTrendForType(data, type) {
  if (!data) return [];
  const trendAll = data.trendAll || data.trend || [];
  if (!trendAll.length) return [];

  return trendAll.map((b) => {
    let val = 0;
    if (type === 'filed') {
      val = b.filed ?? 0;
    } else if (type === 'outstanding') {
      val = b.outstanding ?? 0;
    } else if (type === 'rate') {
      val = b.rate ?? 0;
    } else {
      val = b.total ?? (b.filed || 0) + (b.outstanding || 0);
    }
    return { ...b, value: val };
  });
}

// ─── Tier Breakdown Row ────────────────────────────────────────────────────────

function TierBreakdownRow({ row, valueKey, accent, isPct }) {
  const val = isPct
    ? (row.filingRate ?? (row.total > 0 ? Math.round((row.filed / row.total) * 100) : 0))
    : (row[valueKey] ?? row.total ?? 0);

  const pct = isPct
    ? Math.min(100, Math.max(0, val))
    : (row._max > 0 ? Math.round((val / row._max) * 100) : 0);

  return (
    <View style={styles.breakdownRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.breakdownName} numberOfLines={1}>{row.name}</Text>
        <Text style={styles.breakdownSub}>
          {row.filed ?? 0} filed · {row.outstanding ?? 0} overdue
        </Text>
      </View>
      <View style={styles.breakdownBarWrap}>
        <View style={[styles.breakdownBarFill, { width: `${pct}%`, backgroundColor: accent }]} />
      </View>
      <Text style={[styles.breakdownVal, { color: accent }]}>
        {isPct ? `${val}%` : val.toLocaleString()}
      </Text>
    </View>
  );
}

// ─── Main Screen Component ────────────────────────────────────────────────────

export default function ReportMetricDetailScreen() {
  const { type = 'filed' } = useLocalSearchParams();
  const router = useRouter();
  const { isRTL, t } = useLanguage();
  const toast = useToast();

  const normType = (type === 'unit' || type === 'unitReports') ? 'unit_reports' : type;
  const cfg = TYPE_CONFIG[normType] || TYPE_CONFIG.filed;

  // ── State ────────────────────────────────────────────────────────────────
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAllTime, setShowAllTime] = useState(false);
  const [busyExport, setBusyExport] = useState('');

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

      const res = await api.get('/dashboard/reports', { params });
      setData(res.data?.data || null);
    } catch (e) {
      setError(e?.response?.data?.message || 'Failed to load report analytics');
    } finally {
      setLoading(false);
    }
  }, [selProvince, selDistrict, selArea, showAllTime]);

  useEffect(() => { load(); }, [load]);

  // ── Trend data ────────────────────────────────────────────────────────────
  const trendFull = useMemo(() => computeTrendForType(data, normType), [data, normType]);
  const trend6 = useMemo(() => trendFull.slice(-6), [trendFull]);
  const displayTrend = showAllTime ? trendFull : trend6;

  // ── Totals ────────────────────────────────────────────────────────────────
  const totals = data?.totals || {};
  const metricValue = cfg.isPct
    ? (totals.filingRate ?? (totals.total > 0 ? Math.round((totals.filed / totals.total) * 100) : 0))
    : (normType === 'unit_reports'
      ? (totals.units ?? data?.rows?.length ?? totals.total ?? 0)
      : (totals[cfg.valueKey] ?? 0));

  // ── Tier breakdown rows ───────────────────────────────────────────────────
  const tierRows = useMemo(() => {
    const level = data?.levels?.[0] || data?.level || null;
    let rows = [];
    if (level && data?.byLevel?.[level]) {
      rows = data.byLevel[level];
    } else if (data?.rows?.length) {
      rows = data.rows;
    }
    const maxVal = Math.max(...rows.map((r) => r[cfg.valueKey] ?? r.total ?? 0), 1);
    return rows.map((r) => ({ ...r, _max: maxVal }));
  }, [data, cfg.valueKey]);

  const activeLevelLabel = data?.levels?.[0] || data?.level
    ? ((data.levels?.[0] || data.level).charAt(0) + (data.levels?.[0] || data.level).slice(1).toLowerCase())
    : 'Unit';

  // ── Handle Export ─────────────────────────────────────────────────────────
  const handleExport = async (kind, format) => {
    const tag = `${kind}-${format}`;
    setBusyExport(tag);
    try {
      let unitLevel = 'CENTRAL';
      let unitId = '';
      if (selArea) {
        unitLevel = 'AREA';
        unitId = selArea;
      } else if (selDistrict) {
        unitLevel = 'DISTRICT';
        unitId = selDistrict;
      } else if (selProvince) {
        unitLevel = 'PROVINCE';
        unitId = selProvince;
      }

      const qParams = { unitLevel };
      if (unitId) qParams.unitId = unitId;

      const filename = `reports-${kind}-${normType}.${format === 'pdf' ? 'pdf' : 'xlsx'}`;
      await downloadAndShare(`/exports/unit/${kind}/${format}`, filename, qParams);
      toast.success(`Export ready: ${filename}`);
    } catch (e) {
      toast.error(e.message || 'Export failed');
    } finally {
      setBusyExport('');
    }
  };

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
          <View style={styles.centerBox}>
            <ActivityIndicator size="large" color={cfg.accent} />
            <Text style={styles.loadingText}>Loading report analytics…</Text>
          </View>
        ) : error ? (
          <Card style={styles.errorCard}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={load}>
              <Text style={styles.retryBtnText}>Retry</Text>
            </TouchableOpacity>
          </Card>
        ) : (
          <>
            {/* Hero Metric Card */}
            <Card style={[styles.heroCard, { borderTopColor: cfg.accent }]}>
              <View style={styles.heroTop}>
                <View style={[styles.heroIconBox, { backgroundColor: cfg.iconBg }]}>
                  <Text style={styles.heroIcon}>{cfg.icon}</Text>
                </View>
                <View style={styles.heroBadge}>
                  <Text style={[styles.heroBadgeText, { color: cfg.accent }]}>
                    {cfg.badge}
                  </Text>
                </View>
              </View>

              <Text style={[styles.heroValue, { color: cfg.accent }]}>
                {cfg.isPct ? `${metricValue}%` : metricValue.toLocaleString()}
              </Text>
              <Text style={styles.heroLabel}>{cfg.title}</Text>

              <View style={styles.heroMeta}>
                <Text style={styles.heroMetaText}>
                  {totals.filed ?? 0} filed · {totals.outstanding ?? 0} outstanding
                  {totals.total > 0 ? `  ·  ${totals.total} total reports` : ''}
                </Text>
              </View>
            </Card>

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

            {/* Monthly Trend Chart */}
            <Card style={styles.chartCard}>
              <View style={styles.chartHeader}>
                <View>
                  <Text style={styles.sectionTitle}>Reporting Monthly Trend</Text>
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

            {/* Level-wise Breakdown */}
            {tierRows.length > 0 && (
              <Card style={styles.breakdownCard}>
                <View style={styles.breakdownHeader}>
                  <Text style={styles.sectionTitle}>
                    {activeLevelLabel}-wise Filing Breakdown
                  </Text>
                  <Text style={styles.breakdownHeaderSub}>
                    Units ranked by performance
                  </Text>
                </View>

                {tierRows.slice(0, 20).map((row) => (
                  <TierBreakdownRow
                    key={String(row._id)}
                    row={row}
                    valueKey={cfg.valueKey}
                    accent={cfg.accent}
                    isPct={cfg.isPct}
                  />
                ))}

                {tierRows.length > 20 && (
                  <Text style={styles.emptyText}>
                    + {tierRows.length - 20} more units…
                  </Text>
                )}
              </Card>
            )}

            {/* Summary Stats Grid */}
            <Card style={styles.statsCard}>
              <Text style={styles.sectionTitle}>Governance & Compliance Summary</Text>
              <View style={styles.statsGrid}>
                {[
                  { label: 'Reports Filed', value: totals.filed ?? 0, color: Colors.success || '#16a34a' },
                  { label: 'Outstanding', value: totals.outstanding ?? 0, color: Colors.error || '#dc2626' },
                  { label: 'Total Concluded', value: totals.total ?? ((totals.filed || 0) + (totals.outstanding || 0)), color: Colors.primary },
                  { label: 'Filing Rate', value: `${totals.filingRate ?? 0}%`, color: '#d97706' },
                ].map((s) => (
                  <View key={s.label} style={styles.statCell}>
                    <Text style={[styles.statValue, { color: s.color }]}>
                      {typeof s.value === 'number' ? s.value.toLocaleString() : s.value}
                    </Text>
                    <Text style={styles.statLabel}>{s.label}</Text>
                  </View>
                ))}
              </View>
            </Card>

            {/* Unit Reports Export Box */}
            <Card style={styles.exportCard}>
              <View style={[styles.exportCardHeader, isRTL && { flexDirection: 'row-reverse' }]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.exportCardTitle}>Unit Report Downloads</Text>
                  <Text style={styles.exportCardSub}>
                    Generate official PDF and Excel documents for the selected filter
                  </Text>
                </View>
                <Ionicons name="cloud-download-outline" size={24} color="#6b21a8" />
              </View>

              {/* Meetings & Activities Download */}
              <View style={styles.exportSection}>
                <Text style={styles.exportSectionTitle}>📋 Meetings & Activities Roster</Text>
                <View style={[styles.exportActionsRow, isRTL && { flexDirection: 'row-reverse' }]}>
                  <TouchableOpacity
                    style={[styles.exportBtn, busyExport === 'meetings-pdf' && { opacity: 0.6 }]}
                    onPress={() => handleExport('meetings', 'pdf')}
                    disabled={!!busyExport}
                  >
                    {busyExport === 'meetings-pdf' ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Ionicons name="document-text" size={15} color="#fff" />
                        <Text style={styles.exportBtnText}>PDF Report</Text>
                      </>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.exportBtn, styles.exportBtnSecondary, busyExport === 'meetings-xlsx' && { opacity: 0.6 }]}
                    onPress={() => handleExport('meetings', 'xlsx')}
                    disabled={!!busyExport}
                  >
                    {busyExport === 'meetings-xlsx' ? (
                      <ActivityIndicator size="small" color={Colors.primary} />
                    ) : (
                      <>
                        <Ionicons name="grid-outline" size={15} color={Colors.primary} />
                        <Text style={[styles.exportBtnText, { color: Colors.primary }]}>Excel (XLSX)</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </View>

              {/* Finance & Treasury Download */}
              <View style={styles.exportSection}>
                <Text style={styles.exportSectionTitle}>💰 Financial Activity & Balance</Text>
                <View style={[styles.exportActionsRow, isRTL && { flexDirection: 'row-reverse' }]}>
                  <TouchableOpacity
                    style={[styles.exportBtn, busyExport === 'finance-pdf' && { opacity: 0.6 }]}
                    onPress={() => handleExport('finance', 'pdf')}
                    disabled={!!busyExport}
                  >
                    {busyExport === 'finance-pdf' ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Ionicons name="document-text" size={15} color="#fff" />
                        <Text style={styles.exportBtnText}>PDF Report</Text>
                      </>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.exportBtn, styles.exportBtnSecondary, busyExport === 'finance-xlsx' && { opacity: 0.6 }]}
                    onPress={() => handleExport('finance', 'xlsx')}
                    disabled={!!busyExport}
                  >
                    {busyExport === 'finance-xlsx' ? (
                      <ActivityIndicator size="small" color={Colors.primary} />
                    ) : (
                      <>
                        <Ionicons name="grid-outline" size={15} color={Colors.primary} />
                        <Text style={[styles.exportBtnText, { color: Colors.primary }]}>Excel (XLSX)</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </Card>

            {/* Navigation Actions */}
            <View style={{ gap: Spacing.sm }}>
              <TouchableOpacity
                style={[styles.jumpBtn, isRTL && { flexDirection: 'row-reverse' }]}
                onPress={() => router.push('/meetings')}
                activeOpacity={0.8}
              >
                <View style={[styles.jumpLeft, isRTL && { flexDirection: 'row-reverse' }]}>
                  <Ionicons name="calendar-outline" size={18} color={Colors.primary} />
                  <Text style={styles.jumpBtnText}>
                    View All Associated Meetings
                  </Text>
                </View>
                <Ionicons
                  name={isRTL ? 'chevron-back' : 'chevron-forward'}
                  size={18}
                  color={Colors.primary}
                />
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.jumpBtn, isRTL && { flexDirection: 'row-reverse' }]}
                onPress={() => router.push('/admin/reports')}
                activeOpacity={0.8}
              >
                <View style={[styles.jumpLeft, isRTL && { flexDirection: 'row-reverse' }]}>
                  <Ionicons name="documents-outline" size={18} color={Colors.primary} />
                  <Text style={styles.jumpBtnText}>
                    Open Dedicated Reports Center
                  </Text>
                </View>
                <Ionicons
                  name={isRTL ? 'chevron-back' : 'chevron-forward'}
                  size={18}
                  color={Colors.primary}
                />
              </TouchableOpacity>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

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
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceAlt,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flex: 1,
  },
  headerIconBox: {
    width: 36,
    height: 36,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerIcon: {
    fontSize: 18,
  },
  headerTitle: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.text,
  },
  headerSub: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.md,
    paddingBottom: Spacing.xl * 2,
    gap: Spacing.md,
  },
  centerBox: {
    paddingVertical: Spacing.xl * 2,
    alignItems: 'center',
    gap: Spacing.sm,
  },
  loadingText: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
  },
  errorCard: {
    padding: Spacing.md,
    alignItems: 'center',
    gap: Spacing.sm,
  },
  errorText: {
    fontSize: FontSize.sm,
    color: Colors.error,
    textAlign: 'center',
  },
  retryBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: Radius.sm,
  },
  retryBtnText: {
    color: '#fff',
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
  heroCard: {
    padding: Spacing.md,
    borderTopWidth: 4,
    alignItems: 'center',
    gap: 4,
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  heroIconBox: {
    width: 44,
    height: 44,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroIcon: {
    fontSize: 22,
  },
  heroBadge: {
    backgroundColor: Colors.surfaceAlt,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.full || 12,
  },
  heroBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  heroValue: {
    fontSize: 40,
    fontWeight: '900',
    letterSpacing: -1,
    marginTop: 6,
  },
  heroLabel: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  heroMeta: {
    marginTop: 4,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    width: '100%',
    alignItems: 'center',
  },
  heroMetaText: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
  },
  sectionTitle: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: Spacing.xs,
  },
  chartCard: {
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  chartHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  chartSub: {
    fontSize: 11,
    color: Colors.textMuted,
  },
  toggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
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
    gap: 8,
  },
  breakdownHeader: {
    marginBottom: 4,
  },
  breakdownHeaderSub: {
    fontSize: 11,
    color: Colors.textMuted,
  },
  breakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border || '#f1f5f9',
  },
  breakdownName: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    color: Colors.text,
  },
  breakdownSub: {
    fontSize: 10,
    color: Colors.textMuted,
    marginTop: 1,
  },
  breakdownBarWrap: {
    width: 90,
    height: 8,
    borderRadius: Radius.full || 4,
    backgroundColor: Colors.surfaceAlt,
    overflow: 'hidden',
  },
  breakdownBarFill: {
    height: '100%',
    borderRadius: Radius.full || 4,
  },
  breakdownVal: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    minWidth: 44,
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
    width: '47%',
    padding: Spacing.sm,
    backgroundColor: Colors.surfaceAlt,
    borderRadius: Radius.md,
    gap: 2,
  },
  statValue: {
    fontSize: FontSize.lg,
    fontWeight: '800',
  },
  statLabel: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
  },
  exportCard: {
    padding: Spacing.md,
    gap: Spacing.sm,
    backgroundColor: '#faf5ff',
    borderColor: '#e9d5ff',
  },
  exportCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  exportCardTitle: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: '#6b21a8',
  },
  exportCardSub: {
    fontSize: 11,
    color: '#7e22ce',
    marginTop: 2,
  },
  exportActionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  exportSection: {
    gap: 6,
    marginTop: 6,
  },
  exportSectionTitle: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: '#581c87',
  },
  exportBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    paddingVertical: 9,
    borderRadius: Radius.md,
    gap: 6,
  },
  exportBtnSecondary: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  exportBtnText: {
    color: '#fff',
    fontSize: FontSize.xs,
    fontWeight: '700',
  },
  jumpBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  jumpLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  jumpBtnText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.primary,
  },
  emptyText: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontStyle: 'italic',
    paddingVertical: 6,
    textAlign: 'center',
  },
});
