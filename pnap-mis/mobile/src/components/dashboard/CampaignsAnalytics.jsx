import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import useAnalytics from '../../hooks/useAnalytics';
import { Colors, FontSize, Spacing } from '../../constants/colors';
import Card from '../Card';
import { AreaTrendChart, HBar, PieChart, SmartKpi, BRAND } from '../charts';

const LEVEL_NOUN = {
  PROVINCE: 'Province',
  DISTRICT: 'District',
  AREA: 'Area',
  BASIC_UNIT: 'Basic Unit',
};

const LEVEL_ACCENT = {
  PROVINCE: BRAND.dark,
  DISTRICT: BRAND.mid,
  AREA: BRAND.bright,
  BASIC_UNIT: BRAND.light,
};

function ChartCard({ title, sub, meta, children }) {
  return (
    <Card style={styles.chartCard}>
      <View style={styles.cardHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>{title}</Text>
          {sub && <Text style={styles.cardSub}>{sub}</Text>}
        </View>
        {meta && <Text style={styles.cardMeta}>{meta}</Text>}
      </View>
      {children}
    </Card>
  );
}

export default function CampaignsAnalytics({ params, windowLabel = 'last 12 months' }) {
  const { data, loading, error } = useAnalytics('/dashboard/campaigns', params);

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

  const t = data.totals || {};
  const levels = data.levels || [];

  if ((t.total || 0) === 0) {
    return (
      <Card style={styles.emptyCard}>
        <Text style={styles.emptyIcon}>🎯</Text>
        <Text style={styles.emptyText}>
          No campaigns recorded in the {windowLabel} for this scope.
        </Text>
      </Card>
    );
  }

  const stageRows = [
    { label: 'Running', value: t.running || 0, color: BRAND.dark },
    { label: 'Upcoming', value: t.upcoming || 0, color: Colors.warning },
    { label: 'Completed', value: t.completed || 0, color: Colors.success },
    { label: 'Cancelled', value: t.cancelled || 0, color: Colors.textMuted },
  ].filter((r) => r.value > 0);

  const trendBuckets = (data.trend || []).map((b) => ({
    month: b.label,
    meetings: b.total || 0,
    activities: 0,
  }));

  return (
    <View style={styles.container}>
      {/* 4 KPIs */}
      <View style={styles.kpiGrid}>
        <SmartKpi
          label="Active Campaigns"
          value={t.running}
          icon="🎯"
          iconBg="rgba(30, 64, 175, 0.12)"
          iconColor={Colors.primary}
        />
        <SmartKpi
          label="Completed"
          value={t.completed}
          icon="✅"
          iconBg="rgba(22, 163, 74, 0.12)"
          iconColor={Colors.success}
        />
      </View>
      <View style={styles.kpiGrid}>
        <SmartKpi
          label="Upcoming"
          value={t.upcoming}
          icon="⏱️"
          iconBg="rgba(217, 119, 6, 0.12)"
          iconColor={Colors.warning}
        />
        {data.reach ? (
          <SmartKpi
            label="People Contacted"
            value={data.reach.peopleContacted}
            icon="👥"
            iconBg="rgba(30, 64, 175, 0.12)"
            iconColor={Colors.primary}
          />
        ) : (
          <SmartKpi
            label="Total Recorded"
            value={t.total}
            icon="📋"
            iconBg="rgba(100, 116, 139, 0.15)"
            iconColor={Colors.textMuted}
          />
        )}
      </View>

      {/* Campaign Trend */}
      <ChartCard
        title="Campaign trend"
        sub="Campaigns per month"
        meta={`${(t.total || 0).toLocaleString()} in window`}
      >
        {trendBuckets.length > 1 ? (
          <AreaTrendChart
            trend={trendBuckets}
            height={130}
            barColor={BRAND.dark}
            trackColor={BRAND.tint}
          />
        ) : (
          <Text style={styles.mutedText}>Not enough history yet.</Text>
        )}
      </ChartCard>

      {/* Campaigns by Stage */}
      <ChartCard title="Campaigns by stage" sub={windowLabel}>
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
            title={`${LEVEL_NOUN[lvl]}-wise campaigns`}
            sub="All stages"
            meta={attributed < t.total ? `${attributed} of ${t.total}` : undefined}
          >
            <HBar
              rows={rows.slice(0, 10).map((r) => ({ label: r.name, value: r.total }))}
              accent={LEVEL_ACCENT[lvl]}
              emptyLabel={`No ${LEVEL_NOUN[lvl]} campaigns.`}
            />
          </ChartCard>
        );
      })}

      {/* Campaign Reach Details */}
      {data.reach && (
        <ChartCard title="Campaign reach" sub="Aggregated across recorded campaigns">
          <View style={styles.reachTable}>
            {[
              ['Households visited', data.reach.householdsVisited],
              ['People contacted', data.reach.peopleContacted],
              ['Expected joiners', data.reach.expectedJoiners],
              ['Actual joiners', data.reach.actualJoiners],
              ['Volunteer hours', data.reach.volunteerHours],
            ].map(([label, v]) => (
              <View key={label} style={styles.reachRow}>
                <Text style={styles.reachLabel}>{label}</Text>
                <Text style={styles.reachVal}>{(v || 0).toLocaleString()}</Text>
              </View>
            ))}
            {data.reach.conversionPct != null && (
              <View style={[styles.reachRow, styles.conversionRow]}>
                <Text style={styles.reachLabel}>Conversion</Text>
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
