import { useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import useAnalytics from '../../hooks/useAnalytics';
import { Colors, FontSize, Radius, Spacing } from '../../constants/colors';
import Card from '../Card';
import { AreaTrendChart, HBar, SmartKpi, StackedHBar, VBars, BRAND } from '../charts';

const TIER_LABEL = {
  CENTRAL: 'Central',
  PROVINCE: 'Province',
  DISTRICT: 'District',
  AREA: 'Area',
  BASIC_UNIT: 'Basic Unit',
};

const BODY_LABEL = {
  EXECUTIVE: 'Cabinet',
  COMMITTEE: 'Committee',
  GENERAL_BODY: 'General Body',
};

const STATE_META = [
  { key: 'DRAFT', label: 'Draft', color: '#94a3b8' },
  { key: 'SCHEDULED', label: 'Scheduled', color: Colors.info },
  { key: 'IN_PROGRESS', label: 'In progress', color: Colors.warning },
  { key: 'PENDING_REPORT', label: 'Pending report', color: Colors.accent },
  { key: 'FINALIZED', label: 'Finalized', color: Colors.success },
  { key: 'CANCELLED', label: 'Cancelled', color: Colors.error },
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

export default function MeetingsAnalytics({ params, windowLabel = 'last 12 months' }) {
  const [yearBasis, setYearBasis] = useState('CALENDAR');
  const [years, setYears] = useState(5);
  const [yearSplit, setYearSplit] = useState('BODY');

  const { data, loading, error } = useAnalytics('/dashboard/meetings', {
    ...params,
    yearBasis,
    years,
  });

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
  const tiers = data.byTier || [];
  const yearly = data.yearly || [];
  const bodiesPresent = data.bodiesPresent || [];
  const tiersPresent = data.tiersPresent || [];

  const trendBuckets = (data.trend || []).map((b) => ({
    month: b.label,
    meetings: b.total || 0,
    activities: 0,
  }));

  const axisLabel = (y) => y.shortLabel || y.label;

  return (
    <View style={styles.container}>
      {/* 4 KPIs */}
      <View style={styles.kpiGrid}>
        <SmartKpi
          label="Total Meetings"
          value={t.total}
          icon="📅"
          iconBg="rgba(30, 64, 175, 0.12)"
          iconColor={Colors.primary}
        />
        <SmartKpi
          label="Conducted"
          value={t.conducted}
          icon="✅"
          iconBg="rgba(22, 163, 74, 0.12)"
          iconColor={Colors.success}
        />
      </View>
      <View style={styles.kpiGrid}>
        <SmartKpi
          label="Scheduled"
          value={t.scheduled}
          icon="⏱️"
          iconBg="rgba(217, 119, 6, 0.12)"
          iconColor={Colors.warning}
        />
        <SmartKpi
          label="Overdue Reports"
          value={t.overdueReports}
          icon="⚠️"
          iconBg="rgba(239, 68, 68, 0.12)"
          iconColor={Colors.error}
        />
      </View>

      {/* Meeting Trend */}
      <ChartCard
        title="Meeting trend"
        sub="Meetings per month"
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

      {/* Meetings by State */}
      <ChartCard title="Meetings by state" sub={`Lifecycle position, ${windowLabel}`}>
        <HBar
          rows={STATE_META
            .map((s) => ({ label: s.label, value: data.byState?.[s.key] || 0, color: s.color }))
            .filter((r) => r.value > 0)}
          emptyLabel="No meetings in this window."
        />
      </ChartCard>

      {/* Yearly View */}
      <ChartCard
        title="Conducted meetings by year"
        sub={`${data.yearBasisLabel || 'Calendar years'} · All years`}
      >
        {/* Year Basis & Years Selectors */}
        <View style={styles.controlsRow}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            {['CALENDAR', 'FISCAL', 'CONGRESS'].map((basis) => (
              <TouchableOpacity
                key={basis}
                style={[styles.basisChip, yearBasis === basis && styles.basisChipActive]}
                onPress={() => setYearBasis(basis)}
              >
                <Text style={[styles.basisChipText, yearBasis === basis && styles.basisChipTextActive]}>
                  {basis === 'CALENDAR' ? 'Calendar' : basis === 'FISCAL' ? 'Fiscal Jul–Jun' : 'Congress'}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {yearBasis !== 'CONGRESS' && (
            <View style={styles.yearsRow}>
              {[3, 5, 10].map((n) => (
                <TouchableOpacity
                  key={n}
                  style={[styles.yearNumBtn, years === n && styles.yearNumBtnActive]}
                  onPress={() => setYears(n)}
                >
                  <Text style={[styles.yearNumText, years === n && styles.yearNumTextActive]}>
                    {n}y
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {yearly.length === 0 ? (
          <Text style={styles.mutedText}>No meetings on record.</Text>
        ) : (
          <>
            <VBars
              rows={yearly.map((y) => ({
                label: axisLabel(y),
                value: y.conducted || 0,
                total: y.total || 0,
              }))}
              height={140}
              color={BRAND.dark}
              trackColor={BRAND.tint}
              horizontalScroll={yearly.length > 5}
            />
            <Text style={styles.footnote}>
              Solid = conducted (finalized) · light track = total scheduled
            </Text>
          </>
        )}
      </ChartCard>

      {/* Yearly Split by Body or Tier */}
      {yearly.length > 0 && (bodiesPresent.length > 0 || tiersPresent.length > 0) && (
        <ChartCard
          title={`Conducted by year, split by ${yearSplit === 'BODY' ? 'body' : 'tier'}`}
          sub={data.yearBasisLabel}
        >
          <View style={styles.splitToggleRow}>
            <TouchableOpacity
              style={[styles.splitBtn, yearSplit === 'BODY' && styles.splitBtnActive]}
              onPress={() => setYearSplit('BODY')}
              disabled={bodiesPresent.length === 0}
            >
              <Text style={[styles.splitBtnText, yearSplit === 'BODY' && styles.splitBtnTextActive]}>
                By Body
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.splitBtn, yearSplit === 'TIER' && styles.splitBtnActive]}
              onPress={() => setYearSplit('TIER')}
              disabled={tiersPresent.length === 0}
            >
              <Text style={[styles.splitBtnText, yearSplit === 'TIER' && styles.splitBtnTextActive]}>
                By Tier
              </Text>
            </TouchableOpacity>
          </View>

          <StackedHBar
            rows={yearly.map((y) => ({
              label: axisLabel(y),
              values: yearSplit === 'BODY'
                ? Object.fromEntries(bodiesPresent.map((b) => [b, y.bodies?.[b]?.conducted || 0]))
                : Object.fromEntries(tiersPresent.map((tr) => [tr, y.tiers?.[tr]?.conducted || 0])),
            }))}
            series={
              yearSplit === 'BODY'
                ? bodiesPresent.map((b, i) => ({
                    key: b,
                    label: BODY_LABEL[b] || b,
                    color: [BRAND.dark, Colors.accent, Colors.warning][i % 3],
                  }))
                : tiersPresent.map((tr, i) => ({
                    key: tr,
                    label: TIER_LABEL[tr] || tr,
                    color: [BRAND.darkest, BRAND.dark, BRAND.mid, BRAND.bright, Colors.success][i % 5],
                  }))
            }
            emptyLabel="No conducted meetings on record."
          />
        </ChartCard>
      )}

      {/* Breakdown by Tier and Body */}
      {tiers.length > 0 && (
        <ChartCard title="Breakdown by tier and body" sub={`Conducted vs scheduled, ${windowLabel}`}>
          <StackedHBar
            rows={tiers.map((r) => ({
              label: `${TIER_LABEL[r.level] || r.level} ${BODY_LABEL[r.body] || r.body}`,
              values: { conducted: r.conducted, scheduled: r.scheduled },
            }))}
            series={[
              { key: 'conducted', label: 'Conducted', color: Colors.success },
              { key: 'scheduled', label: 'Scheduled', color: Colors.warning },
            ]}
            emptyLabel="No meetings in this window."
          />
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
  controlsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  basisChip: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: Radius.sm,
    backgroundColor: Colors.surfaceAlt,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  basisChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  basisChipText: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.text,
  },
  basisChipTextActive: {
    color: '#fff',
    fontWeight: '700',
  },
  yearsRow: {
    flexDirection: 'row',
    gap: 4,
  },
  yearNumBtn: {
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderRadius: Radius.sm,
    backgroundColor: Colors.surfaceAlt,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  yearNumBtnActive: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  yearNumText: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  yearNumTextActive: {
    color: '#fff',
    fontWeight: '700',
  },
  splitToggleRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 8,
  },
  splitBtn: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: Radius.sm,
    backgroundColor: Colors.surfaceAlt,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  splitBtnActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  splitBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.text,
  },
  splitBtnTextActive: {
    color: '#fff',
    fontWeight: '700',
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
