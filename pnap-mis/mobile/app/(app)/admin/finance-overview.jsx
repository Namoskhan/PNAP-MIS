import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api, errorMessage } from '../../../src/api/client';
import { useAuth } from '../../../src/context/AuthContext';
import { isSuperAdmin } from '../../../src/utils/permissions';
import Card from '../../../src/components/Card';
import EmptyState from '../../../src/components/EmptyState';
import { Colors, FontSize, Radius, Spacing } from '../../../src/constants/colors';

const formatPKR = (val) => {
  const num = Number(val) || 0;
  return `Rs ${num.toLocaleString('en-PK')}`;
};

export default function FinanceOverviewScreen() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState('');

  const loadData = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setErr('');
    try {
      const res = await api.get('/admin/finance-overview');
      setData(res.data?.data || null);
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  if (!isSuperAdmin(user)) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Ionicons name="lock-closed-outline" size={48} color={Colors.error} />
          <Text style={styles.errorTitle}>Access Restricted</Text>
          <Text style={styles.errorText}>Only Super Admins can access this screen.</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (err) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={48} color={Colors.error} />
          <Text style={styles.errorTitle}>Failed to Load</Text>
          <Text style={styles.errorText}>{err}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => loadData()}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (loading && !data) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading finance overview…</Text>
        </View>
      </SafeAreaView>
    );
  }

  const t = data?.totals || { donations: 0, donationCount: 0, expenses: 0, expenseCount: 0, transfers: 0, transferCount: 0, netBalance: 0 };
  const isNetPositive = (t.netBalance || 0) >= 0;

  const renderProvince = ({ item: p }) => {
    const provNetPositive = (p.netBalance || 0) >= 0;
    return (
      <Card style={styles.provCard}>
        <View style={styles.provHeader}>
          <View style={styles.provTitleRow}>
            <Ionicons name="location-outline" size={16} color={Colors.primary} />
            <Text style={styles.provName}>{p.name}</Text>
            {p.code ? (
              <View style={styles.codeBadge}>
                <Text style={styles.codeBadgeText}>{p.code}</Text>
              </View>
            ) : null}
          </View>
          <View style={[styles.netPill, { backgroundColor: provNetPositive ? '#f0fdf4' : '#fef2f2' }]}>
            <Text style={[styles.netPillText, { color: provNetPositive ? Colors.success : Colors.error }]}>
              {formatPKR(p.netBalance)}
            </Text>
          </View>
        </View>

        <View style={styles.statsGrid}>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Donations</Text>
            <Text style={[styles.statVal, { color: Colors.primaryDark }]}>{formatPKR(p.donations)}</Text>
            <Text style={styles.statHint}>{p.donationCount || 0} {p.donationCount === 1 ? 'entry' : 'entries'}</Text>
          </View>

          <View style={styles.statDivider} />

          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Expenses</Text>
            <Text style={[styles.statVal, { color: '#dc2626' }]}>{formatPKR(p.expenses)}</Text>
            <Text style={styles.statHint}>{p.expenseCount || 0} {p.expenseCount === 1 ? 'entry' : 'entries'}</Text>
          </View>

          <View style={styles.statDivider} />

          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Net Margin</Text>
            <Text style={[styles.statVal, { color: provNetPositive ? Colors.success : Colors.error }]}>
              {provNetPositive ? '+' : ''}{formatPKR(p.netBalance)}
            </Text>
            <Text style={styles.statHint}>{provNetPositive ? 'Surplus' : 'Deficit'}</Text>
          </View>
        </View>
      </Card>
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <FlatList
        data={data?.perProvince || []}
        keyExtractor={(item) => item._id || item.name}
        renderItem={renderProvince}
        contentContainerStyle={styles.listContent}
        refreshing={refreshing}
        onRefresh={() => loadData(true)}
        ListHeaderComponent={
          <>
            {/* Hero Header Banner */}
            <View style={styles.hero}>
              <View style={styles.heroTop}>
                <View style={styles.heroIconBox}>
                  <Text style={styles.heroIcon}>💰</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.heroTitle}>Finance Overview</Text>
                  <Text style={styles.heroSub} numberOfLines={2}>
                    Aggregated financial overview across the entire organization.
                  </Text>
                </View>
              </View>

              <View style={styles.heroActions}>
                <TouchableOpacity
                  style={styles.heroSecondaryBtn}
                  onPress={() => loadData(true)}
                  activeOpacity={0.8}
                >
                  <Ionicons name="refresh" size={14} color="#fff" style={{ marginRight: 4 }} />
                  <Text style={styles.heroSecondaryBtnText}>Refresh Data</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* KPI Cards Grid */}
            <View style={styles.kpiContainer}>
              <View style={styles.kpiRow}>
                {/* Total Donations */}
                <View style={[styles.kpiCard, { borderTopColor: '#16a34a' }]}>
                  <View style={styles.kpiTop}>
                    <Text style={styles.kpiLabel}>Total Donations</Text>
                    <View style={[styles.kpiIconWrap, { backgroundColor: '#f0fdf4' }]}>
                      <Ionicons name="cash-outline" size={14} color="#16a34a" />
                    </View>
                  </View>
                  <Text style={styles.kpiValue} numberOfLines={1} adjustsFontSizeToFit>
                    {formatPKR(t.donations)}
                  </Text>
                  <Text style={styles.kpiHint}>{t.donationCount || 0} total entries</Text>
                </View>

                {/* Approved Expenses */}
                <View style={[styles.kpiCard, { borderTopColor: '#dc2626' }]}>
                  <View style={styles.kpiTop}>
                    <Text style={styles.kpiLabel}>Approved Expenses</Text>
                    <View style={[styles.kpiIconWrap, { backgroundColor: '#fef2f2' }]}>
                      <Ionicons name="receipt-outline" size={14} color="#dc2626" />
                    </View>
                  </View>
                  <Text style={[styles.kpiValue, { color: '#dc2626' }]} numberOfLines={1} adjustsFontSizeToFit>
                    {formatPKR(t.expenses)}
                  </Text>
                  <Text style={styles.kpiHint}>{t.expenseCount || 0} total entries</Text>
                </View>
              </View>

              <View style={styles.kpiRow}>
                {/* Acknowledged Transfers */}
                <View style={[styles.kpiCard, { borderTopColor: '#0284c7' }]}>
                  <View style={styles.kpiTop}>
                    <Text style={styles.kpiLabel}>Transfers</Text>
                    <View style={[styles.kpiIconWrap, { backgroundColor: '#f0f9ff' }]}>
                      <Ionicons name="swap-horizontal-outline" size={14} color="#0284c7" />
                    </View>
                  </View>
                  <Text style={[styles.kpiValue, { color: '#0284c7' }]} numberOfLines={1} adjustsFontSizeToFit>
                    {formatPKR(t.transfers)}
                  </Text>
                  <Text style={styles.kpiHint}>{t.transferCount || 0} acknowledged</Text>
                </View>

                {/* Net Balance */}
                <View
                  style={[
                    styles.kpiCard,
                    {
                      borderTopColor: isNetPositive ? '#16a34a' : '#dc2626',
                      backgroundColor: isNetPositive ? '#f0fdf4' : '#fef2f2',
                    },
                  ]}
                >
                  <View style={styles.kpiTop}>
                    <Text style={[styles.kpiLabel, { color: isNetPositive ? '#15803d' : '#b91c1c' }]}>
                      Net Balance
                    </Text>
                    <View
                      style={[
                        styles.kpiIconWrap,
                        { backgroundColor: isNetPositive ? '#dcfce7' : '#fee2e2' },
                      ]}
                    >
                      <Ionicons
                        name={isNetPositive ? "trending-up-outline" : "trending-down-outline"}
                        size={14}
                        color={isNetPositive ? '#15803d' : '#b91c1c'}
                      />
                    </View>
                  </View>
                  <Text
                    style={[
                      styles.kpiValue,
                      { color: isNetPositive ? '#15803d' : '#b91c1c' },
                    ]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                  >
                    {formatPKR(t.netBalance)}
                  </Text>
                  <Text
                    style={[
                      styles.kpiHint,
                      { color: isNetPositive ? '#16a34a' : '#dc2626', fontWeight: '600' },
                    ]}
                  >
                    {isNetPositive ? 'Overall Surplus' : 'Overall Deficit'}
                  </Text>
                </View>
              </View>
            </View>

            {/* Provincial Breakdown Section Title */}
            <View style={styles.sectionHeader}>
              <View style={styles.sectionIconBox}>
                <Ionicons name="map-outline" size={16} color={Colors.primary} />
              </View>
              <Text style={styles.sectionTitle}>By Province</Text>
              <View style={styles.sectionBadge}>
                <Text style={styles.sectionBadgeText}>
                  {data?.perProvince?.length || 0} PROVINCES
                </Text>
              </View>
            </View>
          </>
        }
        ListEmptyComponent={
          !loading && (
            <EmptyState
              icon="📊"
              title="No Provincial Data"
              message="No provincial financial records found in the database."
            />
          )
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: Spacing.xl },
  errorTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.text, marginTop: Spacing.md },
  errorText: { color: Colors.textMuted, fontSize: FontSize.sm, textAlign: 'center', marginTop: 4 },
  loadingText: { color: Colors.textMuted, fontSize: FontSize.sm, marginTop: Spacing.md },
  retryBtn: {
    marginTop: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    paddingVertical: 10,
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
  },
  retryBtnText: { color: '#fff', fontWeight: '700', fontSize: FontSize.sm },

  // Hero Banner
  hero: {
    backgroundColor: Colors.primary,
    padding: Spacing.lg,
    paddingTop: Spacing.md,
    borderBottomLeftRadius: Radius.xl,
    borderBottomRightRadius: Radius.xl,
    marginBottom: Spacing.md,
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  heroIconBox: {
    width: 48,
    height: 48,
    borderRadius: Radius.md,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroIcon: { fontSize: 26 },
  heroTitle: { fontSize: FontSize.xl, fontWeight: '800', color: '#fff' },
  heroSub: { fontSize: FontSize.xs, color: 'rgba(255, 255, 255, 0.85)', marginTop: 2, lineHeight: 16 },
  heroActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  heroSecondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingVertical: 8,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.4)',
  },
  heroSecondaryBtnText: { color: '#fff', fontWeight: '600', fontSize: FontSize.xs },

  // KPI Grid
  kpiContainer: {
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
    gap: 10,
  },
  kpiRow: {
    flexDirection: 'row',
    gap: 10,
  },
  kpiCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    padding: 12,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    borderTopWidth: 3,
    ...Platform.select({
      web: {
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
      },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 3,
        elevation: 2,
      },
    }),
  },
  kpiTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  kpiLabel: {
    fontSize: 11,
    color: Colors.textMuted,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    flex: 1,
  },
  kpiIconWrap: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kpiValue: {
    fontSize: FontSize.lg,
    fontWeight: '800',
    color: Colors.text,
    marginVertical: 2,
  },
  kpiHint: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
  },

  // Section Header
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    marginTop: Spacing.sm,
    marginBottom: Spacing.sm,
    gap: 8,
  },
  sectionIconBox: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: '#eff6ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    fontSize: FontSize.base,
    fontWeight: '800',
    color: Colors.text,
    flex: 1,
  },
  sectionBadge: {
    backgroundColor: Colors.surfaceAlt,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sectionBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.textMuted,
    letterSpacing: 0.5,
  },

  listContent: {
    paddingBottom: 40,
  },

  // Provincial Card
  provCard: {
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    padding: Spacing.md,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Platform.select({
      web: {
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
      },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 3,
        elevation: 2,
      },
    }),
  },
  provHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
    marginBottom: Spacing.sm,
  },
  provTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  provName: {
    fontSize: FontSize.base,
    fontWeight: '700',
    color: Colors.text,
  },
  codeBadge: {
    backgroundColor: '#eff6ff',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  codeBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.primaryDark,
  },
  netPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.pill,
  },
  netPillText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
  },

  statsGrid: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 4,
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
  },
  statDivider: {
    width: 1,
    height: 36,
    backgroundColor: Colors.borderLight,
  },
  statLabel: {
    fontSize: 11,
    color: Colors.textMuted,
    fontWeight: '600',
    marginBottom: 2,
  },
  statVal: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.text,
  },
  statHint: {
    fontSize: 10,
    color: Colors.textMuted,
    marginTop: 2,
  },
});
