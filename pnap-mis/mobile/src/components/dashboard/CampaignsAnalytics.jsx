import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import useAnalytics from '../../hooks/useAnalytics';
import { useLanguage } from '../../context/LanguageContext';
import { Colors, FontSize, Spacing } from '../../constants/colors';
import Card from '../Card';
import { AreaTrendChart, HBar, PieChart, SmartKpi, BRAND } from '../charts';

const LEVEL_ACCENT = {
  PROVINCE: BRAND.dark,
  DISTRICT: BRAND.mid,
  AREA: BRAND.bright,
  BASIC_UNIT: BRAND.light,
};

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

export default function CampaignsAnalytics({ params, windowLabel = 'last 12 months' }) {
  const { t, isRTL } = useLanguage();
  const { data, loading, error } = useAnalytics('/dashboard/campaigns', params);

  const levelNoun = {
    PROVINCE: t('units.province', 'Province'),
    DISTRICT: t('units.district', 'District'),
    AREA: t('units.area', 'Area'),
    BASIC_UNIT: t('units.basicUnit', 'Basic Unit'),
  };

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

  if ((totals.total || 0) === 0) {
    return (
      <Card style={styles.emptyCard}>
        <Text style={styles.emptyIcon}>🎯</Text>
        <Text style={styles.emptyText}>
          {t('dashboard.noCampaignsRecorded', 'No campaigns recorded in the {{windowLabel}} for this scope.', { windowLabel })}
        </Text>
      </Card>
    );
  }

  const stageRows = [
    { label: t('dashboard.running', 'Running'), value: totals.running || 0, color: BRAND.dark },
    { label: t('dashboard.upcoming', 'Upcoming'), value: totals.upcoming || 0, color: Colors.warning },
    { label: t('common.completed', 'Completed'), value: totals.completed || 0, color: Colors.success },
    { label: t('common.cancelled', 'Cancelled'), value: totals.cancelled || 0, color: Colors.textMuted },
  ].filter((r) => r.value > 0);

  const trendBuckets = (data.trend || []).map((b) => ({
    month: b.label,
    total: b.total || 0,
  }));

  return (
    <View style={styles.container}>
      {/* 4 KPIs */}
      <View style={[styles.kpiGrid, isRTL && { flexDirection: 'row-reverse' }]}>
        <SmartKpi
          label={t('dashboard.activeCampaigns', 'Active Campaigns')}
          value={totals.running}
          icon="🎯"
          iconBg="rgba(30, 64, 175, 0.12)"
          iconColor={Colors.primary}
        />
        <SmartKpi
          label={t('dashboard.completedCampaigns', 'Completed')}
          value={totals.completed}
          icon="✅"
          iconBg="rgba(22, 163, 74, 0.12)"
          iconColor={Colors.success}
        />
      </View>
      <View style={[styles.kpiGrid, isRTL && { flexDirection: 'row-reverse' }]}>
        <SmartKpi
          label={t('dashboard.upcomingCampaigns', 'Upcoming')}
          value={totals.upcoming}
          icon="⏱️"
          iconBg="rgba(217, 119, 6, 0.12)"
          iconColor={Colors.warning}
        />
        {data.reach ? (
          <SmartKpi
            label={t('dashboard.peopleContacted', 'People Contacted')}
            value={data.reach.peopleContacted}
            icon="👥"
            iconBg="rgba(30, 64, 175, 0.12)"
            iconColor={Colors.primary}
          />
        ) : (
          <SmartKpi
            label={t('common.total', 'Total Recorded')}
            value={totals.total}
            icon="📋"
            iconBg="rgba(100, 116, 139, 0.15)"
            iconColor={Colors.textMuted}
          />
        )}
      </View>

      {/* Campaign Trend */}
      <ChartCard
        title={t('dashboard.campaignsEachMonth', 'Campaign trend')}
        sub={t('dashboard.campaignsPerMonth12', 'Campaigns per month')}
        meta={`${(totals.total || 0).toLocaleString()} ${t('common.in', 'in')} ${windowLabel}`}
      >
        {trendBuckets.length > 1 ? (
          <AreaTrendChart
            trend={trendBuckets}
            height={130}
            barColor={BRAND.dark}
            trackColor={BRAND.tint}
          />
        ) : (
          <Text style={styles.mutedText}>{t('dashboard.notEnoughHistory', 'Not enough history yet.')}</Text>
        )}
      </ChartCard>

      {/* Campaigns by Stage */}
      <ChartCard title={t('dashboard.campaignStatus', 'Campaigns by stage')} sub={windowLabel}>
        <View style={styles.stageChartContainer}>
          <PieChart
            segments={stageRows.map((s) => ({
              label: s.label,
              value: s.value,
              color: s.color,
            }))}
            size={90}
          />
          <View style={{ flex: 1 }}>
            <HBar rows={stageRows} />
          </View>
        </View>
      </ChartCard>

      {/* Level-wise campaigns */}
      {levels.map((lvl) => {
        const rows = data.byLevel?.[lvl] || [];
        const attributed = rows.reduce((a, r) => a + (r.total || 0), 0);
        return (
          <ChartCard
            key={lvl}
            title={`${t('dashboard.campaignsBy', 'Campaigns by')} ${levelNoun[lvl] || lvl}`}
            sub={t('dashboard.allCampaignStatuses', 'All stages')}
            meta={attributed < totals.total ? `${attributed} ${t('common.of', 'of')} ${totals.total}` : undefined}
          >
            <HBar
              rows={rows.slice(0, 10).map((r) => ({ label: r.name, value: r.total }))}
              accent={LEVEL_ACCENT[lvl]}
              emptyLabel={t('dashboard.noCampaignsRecorded', 'No campaigns recorded in this scope.')}
            />
          </ChartCard>
        );
      })}

      {/* Campaign Reach Details */}
      {data.reach && (
        <ChartCard title={t('dashboard.campaignResults', 'Campaign reach')} sub={t('dashboard.totalsRecordedCampaigns', 'Aggregated across recorded campaigns')}>
          <View style={styles.reachTable}>
            {[
              [t('dashboard.homesVisited', 'Households visited'), data.reach.householdsVisited],
              [t('dashboard.peopleContacted', 'People contacted'), data.reach.peopleContacted],
              [t('dashboard.peopleExpectedJoin', 'Expected joiners'), data.reach.expectedJoiners],
              [t('dashboard.peopleWhoJoined', 'Actual joiners'), data.reach.actualJoiners],
              [t('dashboard.volHoursLong', 'Volunteer hours'), data.reach.volunteerHours],
            ].map(([label, v]) => (
              <View key={label} style={[styles.reachRow, isRTL && { flexDirection: 'row-reverse' }]}>
                <Text style={styles.reachLabel}>{label}</Text>
                <Text style={styles.reachVal}>{(v || 0).toLocaleString()}</Text>
              </View>
            ))}
            {data.reach.conversionPct != null && (
              <View style={[styles.reachRow, styles.conversionRow, isRTL && { flexDirection: 'row-reverse' }]}>
                <Text style={styles.reachLabel}>{t('dashboard.peopleWhoJoinedVsExpected', 'Conversion')}</Text>
                <Text style={[styles.reachVal, { color: Colors.success, fontWeight: '800' }]}>
                  {data.reach.conversionPct}%
                </Text>
              </View>
            )}
          </View>
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
  emptyCard: {
    padding: Spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  emptyIcon: {
    fontSize: 32,
  },
  emptyText: {
    color: Colors.textMuted,
    fontSize: FontSize.sm,
    textAlign: 'center',
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
  stageChartContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  reachTable: {
    gap: 8,
  },
  reachRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  conversionRow: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: 8,
    marginTop: 2,
  },
  reachLabel: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
  },
  reachVal: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.text,
  },
  mutedText: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    textAlign: 'center',
    paddingVertical: 12,
  },
});
