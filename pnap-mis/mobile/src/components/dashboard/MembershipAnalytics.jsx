import { useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import useAnalytics from '../../hooks/useAnalytics';
import { useLanguage } from '../../context/LanguageContext';
import { Colors, FontSize, Radius, Spacing } from '../../constants/colors';
import Card from '../Card';
import { AreaTrendChart, HBar, SmartKpi, StackedHBar, BRAND } from '../charts';

function ChartCard({ title, sub, meta, children }) {
  const { isRTL } = useLanguage();
  return (
    <Card style={styles.chartCard}>
      <View style={[styles.cardHeader, isRTL && { flexDirection: 'row-reverse' }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.cardTitle, isRTL && { textAlign: 'right' }]}>{title}</Text>
          {sub && <Text style={[styles.cardSub, isRTL && { textAlign: 'right' }]}>{sub}</Text>}
        </View>
        {meta && <Text style={styles.cardMeta}>{meta}</Text>}
      </View>
      {children}
    </Card>
  );
}

export default function MembershipAnalytics({ params, windowLabel = 'last 12 months', byStatus }) {
  const { t, isRTL } = useLanguage();
  const { data, loading, error } = useAnalytics('/dashboard/membership', params);
  const [tier, setTier] = useState(null);

  const levelNounMap = {
    PROVINCE: t('units.province', 'Province'),
    DISTRICT: t('units.district', 'District'),
    AREA: t('units.area', 'Area'),
    BASIC_UNIT: t('units.basicUnit', 'Basic Unit'),
  };

  const statusMeta = [
    { key: 'ACTIVE', label: t('common.active', 'Active'), color: Colors.success },
    { key: 'PENDING_APPROVAL', label: t('dashboard.pendingApprovals', 'Pending approval'), color: Colors.warning },
    { key: 'REJECTED', label: t('common.rejected', 'Rejected'), color: Colors.error },
    { key: 'INACTIVE', label: t('dashboard.inactive', 'Inactive'), color: Colors.textMuted },
    { key: 'SUSPENDED', label: t('dashboard.statuses.SUSPENDED', 'Suspended'), color: Colors.accent },
    { key: 'EXPELLED', label: t('dashboard.statuses.EXPELLED', 'Expelled'), color: '#991b1b' },
    { key: 'DECEASED', label: t('dashboard.statuses.DECEASED', 'Deceased'), color: '#94a3b8' },
  ];

  if (loading && !data) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.primary} />
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

  if (!data) return null;

  const totals = data.totals || {};
  const levels = data.levels || [];
  const activeTier = levels.includes(tier) ? tier : levels[0] || null;
  const rows = activeTier ? (data.byLevel[activeTier] || []) : [];
  const noun = activeTier ? levelNounMap[activeTier] : null;
  const top = rows.slice(0, 10);

  const statusRows = statusMeta
    .map((m) => ({ label: m.label, value: byStatus?.[m.key] || 0, color: m.color }))
    .filter((r) => r.value > 0);
  const statusTotal = statusRows.reduce((s, r) => s + r.value, 0);

  const trendBuckets = (data.trend || []).map((b) => ({
    month: b.label,
    total: b.newMembers || 0,
  }));

  return (
    <View style={styles.container}>
      {/* 4 Headline KPIs */}
      <View style={[styles.kpiGrid, isRTL && { flexDirection: 'row-reverse' }]}>
        <SmartKpi
          label={t('dashboard.totalMembers', 'Total Membership')}
          value={totals.total}
          icon="👥"
          iconBg="rgba(30, 64, 175, 0.12)"
          iconColor={Colors.primary}
        />
        <SmartKpi
          label={t('dashboard.newMembers', 'New Membership')}
          value={totals.newMembers}
          icon="⚡"
          iconBg="rgba(30, 64, 175, 0.12)"
          iconColor={Colors.primary}
        />
      </View>
      <View style={[styles.kpiGrid, isRTL && { flexDirection: 'row-reverse' }]}>
        <SmartKpi
          label={t('dashboard.activeMembers', 'Active')}
          value={totals.active}
          icon="✅"
          iconBg="rgba(22, 163, 74, 0.12)"
          iconColor={Colors.success}
        />
        <SmartKpi
          label={t('dashboard.inactiveMembers', 'Inactive')}
          value={totals.inactive}
          icon="➖"
          iconBg="rgba(100, 116, 139, 0.15)"
          iconColor={Colors.textMuted}
        />
      </View>

      {/* Tier Switcher Chips */}
      {levels.length > 1 && (
        <View style={styles.tierSwitcher}>
          <Text style={[styles.tierSwitcherLabel, isRTL && { textAlign: 'right' }]}>{t('dashboard.showBy', 'Break down by:')}</Text>
          <View style={[styles.tierChipsRow, isRTL && { flexDirection: 'row-reverse' }]}>
            {levels.map((lvl) => {
              const isActive = activeTier === lvl;
              return (
                <TouchableOpacity
                  key={lvl}
                  style={[styles.tierChip, isActive && styles.tierChipActive]}
                  onPress={() => setTier(lvl)}
                >
                  <Text style={[styles.tierChipText, isActive && styles.tierChipTextActive]}>
                    {levelNounMap[lvl] || lvl}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}

      {/* Member Status Distribution */}
      {statusRows.length > 0 && (
        <ChartCard
          title={t('dashboard.membersByStatus', 'Member status distribution')}
          sub={t('dashboard.membersByStatusSub', 'Registration workflow state')}
          meta={`${statusTotal.toLocaleString()} ${t('common.total', 'total')}`}
        >
          <HBar rows={statusRows} emptyLabel={t('common.noData', 'No members registered yet.')} />
        </ChartCard>
      )}

      {/* Registration Trend */}
      <ChartCard
        title={t('dashboard.newMembersEachMonth', 'Registration trend')}
        sub={t('dashboard.newMembersPerMonth12', 'New members per month')}
        meta={`${(totals.newMembers || 0).toLocaleString()} ${t('dashboard.inWindow', 'in window')}`}
      >
        {trendBuckets.length > 1 ? (
          <AreaTrendChart
            trend={trendBuckets}
            height={130}
            barColor={BRAND.dark}
            trackColor={BRAND.tint}
          />
        ) : (
          <Text style={styles.mutedText}>{t('dashboard.notEnoughDataChart', 'Not enough history yet.')}</Text>
        )}
      </ChartCard>

      {/* Tier-wise Membership breakdown */}
      {noun && (
        <>
          <ChartCard
            title={`${t('common.members', 'Members')} by ${noun.toLowerCase()}`}
            sub={t('dashboard.totalMembers', 'Total members')}
          >
            <HBar
              rows={top.map((r) => ({ label: r.name, value: r.total }))}
              accent={BRAND.dark}
              emptyLabel={t('dashboard.noUnitsFoundSelection', 'No units in this scope.')}
            />
          </ChartCard>

          <ChartCard
            title={`${t('dashboard.newMembers', 'New members')} by ${noun.toLowerCase()}`}
            sub={`${t('auth.register', 'Registered')} in ${windowLabel}`}
          >
            <HBar
              rows={top.map((r) => ({ label: r.name, value: r.newMembers }))}
              accent={BRAND.bright}
              emptyLabel={t('dashboard.noUnitsFoundSelection', 'No units in this scope.')}
            />
          </ChartCard>

          <ChartCard
            title={`${t('dashboard.activeMembers', 'Active members')} by ${noun.toLowerCase()}`}
            sub={t('dashboard.takingPart', 'Acted inside window')}
          >
            <HBar
              rows={top.map((r) => ({ label: r.name, value: r.active }))}
              accent={Colors.success}
              emptyLabel={t('dashboard.noUnitsFoundSelection', 'No units in this scope.')}
            />
          </ChartCard>

          <ChartCard
            title={`${t('dashboard.inactiveMembers', 'Inactive members')} by ${noun.toLowerCase()}`}
            sub={t('dashboard.notTakingPart', 'No activity in window')}
          >
            <HBar
              rows={top.map((r) => ({ label: r.name, value: r.inactive }))}
              accent={Colors.textMuted}
              emptyLabel={t('dashboard.noUnitsFoundSelection', 'No units in this scope.')}
            />
          </ChartCard>
        </>
      )}

      {/* Side-by-side active vs inactive stacked chart */}
      {noun && rows.length > 0 && (
        <ChartCard
          title={t('dashboard.everyTierSideBySide', 'Every {{tier}}, side by side', { tier: noun.toLowerCase() })}
          sub={t('dashboard.composition30d', 'Bar length is total members. Colors show active vs inactive.')}
          meta={`${rows.length} ${noun.toLowerCase()}`}
        >
          <StackedHBar
            rows={rows.slice(0, 15).map((r) => ({
              label: r.name,
              values: { active: r.active, inactive: r.inactive },
              note: r.newMembers,
            }))}
            series={[
              { key: 'active', label: t('dashboard.takingPart', 'Taking part'), color: Colors.success },
              { key: 'inactive', label: t('dashboard.notTakingPart', 'Not taking part'), color: Colors.textMuted },
            ]}
            emptyLabel={t('dashboard.noUnitsFoundSelection', 'No units in this scope.')}
          />
          <Text style={[styles.footnote, isRTL && { textAlign: 'right' }]}>
            {t('dashboard.joinedRecentlyNote', 'The green number (+X) shows new members joined recently.')}
          </Text>
        </ChartCard>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.md,
  },
  center: {
    padding: Spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
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
  kpiGrid: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  tierSwitcher: {
    gap: 4,
  },
  tierSwitcherLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textMuted,
    textTransform: 'uppercase',
  },
  tierChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  tierChip: {
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: Radius.pill,
    backgroundColor: Colors.surfaceAlt,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  tierChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  tierChipText: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    color: Colors.text,
  },
  tierChipTextActive: {
    color: '#fff',
    fontWeight: '700',
  },
  chartCard: {
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
    gap: 8,
  },
  cardTitle: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.text,
  },
  cardSub: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 1,
  },
  cardMeta: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.primary,
  },
  mutedText: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    textAlign: 'center',
    paddingVertical: 12,
  },
  footnote: {
    fontSize: 10,
    color: Colors.textMuted,
    marginTop: 6,
    fontStyle: 'italic',
  },
});
