import { useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import useAnalytics from '../../hooks/useAnalytics';
import { Colors, FontSize, Radius, Spacing } from '../../constants/colors';
import Card from '../Card';
import { AreaTrendChart, HBar, SmartKpi, StackedHBar, BRAND } from '../charts';

const LEVEL_NOUN = {
  PROVINCE: 'Province',
  DISTRICT: 'District',
  AREA: 'Area',
  BASIC_UNIT: 'Basic Unit',
};

const STATUS_META = [
  { key: 'ACTIVE', label: 'Active', color: Colors.success },
  { key: 'PENDING_APPROVAL', label: 'Pending approval', color: Colors.warning },
  { key: 'REJECTED', label: 'Rejected', color: Colors.error },
  { key: 'INACTIVE', label: 'Inactive', color: Colors.textMuted },
  { key: 'SUSPENDED', label: 'Suspended', color: Colors.accent },
  { key: 'EXPELLED', label: 'Expelled', color: '#991b1b' },
  { key: 'DECEASED', label: 'Deceased', color: '#94a3b8' },
];

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

export default function MembershipAnalytics({ params, windowLabel = 'last 12 months', byStatus }) {
  const { data, loading, error } = useAnalytics('/dashboard/membership', params);
  const [tier, setTier] = useState(null);

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
  const activeTier = levels.includes(tier) ? tier : levels[0] || null;
  const rows = activeTier ? (data.byLevel[activeTier] || []) : [];
  const noun = activeTier ? LEVEL_NOUN[activeTier] : null;
  const top = rows.slice(0, 10);

  const statusRows = STATUS_META
    .map((m) => ({ label: m.label, value: byStatus?.[m.key] || 0, color: m.color }))
    .filter((r) => r.value > 0);
  const statusTotal = statusRows.reduce((s, r) => s + r.value, 0);

  const trendBuckets = (data.trend || []).map((b) => ({
    month: b.label,
    meetings: b.newMembers || 0,
    activities: 0,
  }));

  return (
    <View style={styles.container}>
      {/* 4 Headline KPIs */}
      <View style={styles.kpiGrid}>
        <SmartKpi
          label="Total Membership"
          value={t.total}
          icon="👥"
          iconBg="rgba(30, 64, 175, 0.12)"
          iconColor={Colors.primary}
        />
        <SmartKpi
          label="New Membership"
          value={t.newMembers}
          icon="⚡"
          iconBg="rgba(30, 64, 175, 0.12)"
          iconColor={Colors.primary}
        />
      </View>
      <View style={styles.kpiGrid}>
        <SmartKpi
          label="Active"
          value={t.active}
          icon="✅"
          iconBg="rgba(22, 163, 74, 0.12)"
          iconColor={Colors.success}
        />
        <SmartKpi
          label="Inactive"
          value={t.inactive}
          icon="➖"
          iconBg="rgba(100, 116, 139, 0.15)"
          iconColor={Colors.textMuted}
        />
      </View>

      {/* Tier Switcher Chips */}
      {levels.length > 1 && (
        <View style={styles.tierSwitcher}>
          <Text style={styles.tierSwitcherLabel}>Break down by:</Text>
          <View style={styles.tierChipsRow}>
            {levels.map((lvl) => {
              const isActive = activeTier === lvl;
              return (
                <TouchableOpacity
                  key={lvl}
                  style={[styles.tierChip, isActive && styles.tierChipActive]}
                  onPress={() => setTier(lvl)}
                >
                  <Text style={[styles.tierChipText, isActive && styles.tierChipTextActive]}>
                    {LEVEL_NOUN[lvl]}
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
          title="Member status distribution"
          sub="Registration workflow state"
          meta={`${statusTotal.toLocaleString()} total`}
        >
          <HBar rows={statusRows} emptyLabel="No members registered yet." />
        </ChartCard>
      )}

      {/* Registration Trend */}
      <ChartCard
        title="Registration trend"
        sub="New members per month"
        meta={`${(t.newMembers || 0).toLocaleString()} in window`}
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

      {/* Tier-wise Membership breakdown */}
      {noun && (
        <>
          <ChartCard title={`${noun}-wise membership`} sub="Total members">
            <HBar
              rows={top.map((r) => ({ label: r.name, value: r.total }))}
              accent={BRAND.dark}
              emptyLabel="No units in this scope."
            />
          </ChartCard>

          <ChartCard title={`${noun}-wise new membership`} sub={`Registered in ${windowLabel}`}>
            <HBar
              rows={top.map((r) => ({ label: r.name, value: r.newMembers }))}
              accent={BRAND.bright}
              emptyLabel="No units in this scope."
            />
          </ChartCard>

          <ChartCard title={`${noun}-wise active members`} sub="Acted inside window">
            <HBar
              rows={top.map((r) => ({ label: r.name, value: r.active }))}
              accent={Colors.success}
              emptyLabel="No units in this scope."
            />
          </ChartCard>

          <ChartCard title={`${noun}-wise inactive members`} sub="No activity in window">
            <HBar
              rows={top.map((r) => ({ label: r.name, value: r.inactive }))}
              accent={Colors.textMuted}
              emptyLabel="No units in this scope."
            />
          </ChartCard>
        </>
      )}

      {/* Side-by-side active vs inactive stacked chart */}
      {noun && rows.length > 0 && (
        <ChartCard
          title={`Every ${noun.toLowerCase()}, side by side`}
          sub="Bar length is total members. Colors show active vs inactive."
          meta={`${rows.length} ${noun.toLowerCase()}${rows.length === 1 ? '' : 's'}`}
        >
          <StackedHBar
            rows={rows.slice(0, 15).map((r) => ({
              label: r.name,
              values: { active: r.active, inactive: r.inactive },
              note: r.newMembers,
            }))}
            series={[
              { key: 'active', label: 'Taking part', color: Colors.success },
              { key: 'inactive', label: 'Not taking part', color: Colors.textMuted },
            ]}
            emptyLabel="No units in this scope."
          />
          <Text style={styles.footnote}>
            The green number (+X) shows new members joined recently.
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
