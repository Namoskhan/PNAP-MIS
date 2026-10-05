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
import { useLanguage } from '../../context/LanguageContext';
import { Colors, FontSize, Radius, Spacing } from '../../constants/colors';
import Card from '../Card';
import { AreaTrendChart, HBar, SmartKpi, StackedHBar, VBars, BRAND } from '../charts';

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

export default function MeetingsAnalytics({ params, windowLabel = 'last 12 months' }) {
  const { t, isRTL } = useLanguage();
  const [yearBasis, setYearBasis] = useState('CALENDAR');
  const [years, setYears] = useState(5);
  const [yearSplit, setYearSplit] = useState('BODY');

  const tierLabels = {
    CENTRAL: t('admin.central', 'Central'),
    PROVINCE: t('units.province', 'Province'),
    DISTRICT: t('units.district', 'District'),
    AREA: t('units.area', 'Area'),
    BASIC_UNIT: t('units.basicUnit', 'Basic Unit'),
  };

  const bodyLabels = {
    EXECUTIVE: t('admin.executiveCabinet', 'Cabinet'),
    COMMITTEE: t('admin.committee', 'Committee'),
    GENERAL_BODY: t('meetings.types.generalBody', 'General Body'),
  };

  const stateMeta = [
    { key: 'DRAFT', label: t('common.draft', 'Draft'), color: '#94a3b8' },
    { key: 'SCHEDULED', label: t('dashboard.plannedMeetings', 'Scheduled'), color: Colors.info },
    { key: 'IN_PROGRESS', label: t('common.inProgress', 'In progress'), color: Colors.warning },
    { key: 'PENDING_REPORT', label: t('dashboard.lateReports', 'Pending report'), color: Colors.accent },
    { key: 'FINALIZED', label: t('dashboard.completedMeetings', 'Finalized'), color: Colors.success },
    { key: 'CANCELLED', label: t('common.cancelled', 'Cancelled'), color: Colors.error },
  ];

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

  const totals = data.totals || {};
  const tiers = data.byTier || [];
  const yearly = data.yearly || [];
  const bodiesPresent = data.bodiesPresent || [];
  const tiersPresent = data.tiersPresent || [];

  const trendBuckets = (data.trend || []).map((b) => ({
    month: b.label,
    total: b.total || 0,
  }));

  const axisLabel = (y) => y.shortLabel || y.label;

  return (
    <View style={styles.container}>
      {/* 4 KPIs */}
      <View style={[styles.kpiGrid, isRTL && { flexDirection: 'row-reverse' }]}>
        <SmartKpi
          label={t('dashboard.totalMeetings', 'Total Meetings')}
          value={totals.total}
          icon="📅"
          iconBg="rgba(30, 64, 175, 0.12)"
          iconColor={Colors.primary}
        />
        <SmartKpi
          label={t('dashboard.conductedMeetings', 'Conducted')}
          value={totals.conducted}
          icon="✅"
          iconBg="rgba(22, 163, 74, 0.12)"
          iconColor={Colors.success}
        />
      </View>
      <View style={[styles.kpiGrid, isRTL && { flexDirection: 'row-reverse' }]}>
        <SmartKpi
          label={t('dashboard.scheduledMeetings', 'Scheduled')}
          value={totals.scheduled}
          icon="⏱️"
          iconBg="rgba(217, 119, 6, 0.12)"
          iconColor={Colors.warning}
        />
        <SmartKpi
          label={t('dashboard.lateReports', 'Overdue Reports')}
          value={totals.overdueReports}
          icon="⚠️"
          iconBg="rgba(239, 68, 68, 0.12)"
          iconColor={Colors.error}
        />
      </View>

      {/* Meeting Trend */}
      <ChartCard
        title={t('dashboard.meetingsEachMonth', 'Meeting trend')}
        sub={t('dashboard.meetingsPerMonth12', 'Meetings per month')}
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

      {/* Meetings by State */}
      <ChartCard title={t('dashboard.meetingStatus', 'Meetings by state')} sub={`${t('common.status', 'Status')}: ${windowLabel}`}>
        <HBar
          rows={stateMeta
            .map((s) => ({ label: s.label, value: data.byState?.[s.key] || 0, color: s.color }))
            .filter((r) => r.value > 0)}
          emptyLabel={t('dashboard.nothingRecordedWindow', 'No meetings in this window.')}
        />
      </ChartCard>

      {/* Yearly View */}
      <ChartCard
        title={t('dashboard.completedMeetingsByYear', 'Conducted meetings by year')}
        sub={`${data.yearBasisLabel || t('dashboard.januaryDecember', 'Calendar')} · ${t('dashboard.usesYearOptions', 'All years')}`}
      >
        {/* Year Basis & Years Selectors */}
        <View style={styles.controlsRow}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[{ gap: 6 }, isRTL && { flexDirection: 'row-reverse' }]}>
            {['CALENDAR', 'FISCAL', 'CONGRESS'].map((basis) => (
              <TouchableOpacity
                key={basis}
                style={[styles.basisChip, yearBasis === basis && styles.basisChipActive]}
                onPress={() => setYearBasis(basis)}
              >
                <Text style={[styles.basisChipText, yearBasis === basis && styles.basisChipTextActive]}>
                  {basis === 'CALENDAR'
                    ? t('dashboard.januaryDecember', 'Calendar')
                    : basis === 'FISCAL'
                    ? t('dashboard.julyJune', 'Fiscal Jul–Jun')
                    : t('dashboard.congressToCongress', 'Congress')}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {yearBasis !== 'CONGRESS' && (
            <View style={[styles.yearsRow, isRTL && { flexDirection: 'row-reverse' }]}>
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
          <Text style={styles.mutedText}>{t('common.noData', 'No records found')}</Text>
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
              {t('dashboard.darkLightBarsMeetingNote', 'Solid = conducted (finalized) · light track = total scheduled')}
            </Text>
          </>
        )}
      </ChartCard>

      {/* Yearly Split by Body or Tier */}
      {yearly.length > 0 && (bodiesPresent.length > 0 || tiersPresent.length > 0) && (
        <ChartCard
          title={`${t('dashboard.completedMeetingsByYearAnd', 'Conducted by year, split by')} ${yearSplit === 'BODY' ? t('dashboard.byGroup', 'body') : t('dashboard.byLevel', 'tier')}`}
          sub={data.yearBasisLabel}
        >
          <View style={[styles.splitToggleRow, isRTL && { flexDirection: 'row-reverse' }]}>
            <TouchableOpacity
              style={[styles.splitBtn, yearSplit === 'BODY' && styles.splitBtnActive]}
              onPress={() => setYearSplit('BODY')}
              disabled={bodiesPresent.length === 0}
            >
              <Text style={[styles.splitBtnText, yearSplit === 'BODY' && styles.splitBtnTextActive]}>
                {t('dashboard.byGroup', 'By Body')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.splitBtn, yearSplit === 'TIER' && styles.splitBtnActive]}
              onPress={() => setYearSplit('TIER')}
              disabled={tiersPresent.length === 0}
            >
              <Text style={[styles.splitBtnText, yearSplit === 'TIER' && styles.splitBtnTextActive]}>
                {t('dashboard.byLevel', 'By Tier')}
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
                    label: bodyLabels[b] || b,
                    color: [BRAND.dark, Colors.accent, Colors.warning][i % 3],
                  }))
                : tiersPresent.map((tr, i) => ({
                    key: tr,
                    label: tierLabels[tr] || tr,
                    color: [BRAND.darkest, BRAND.dark, BRAND.mid, BRAND.bright, Colors.success][i % 5],
                  }))
            }
            emptyLabel={t('dashboard.noCompletedMeetingsFound', 'No conducted meetings on record.')}
          />
        </ChartCard>
      )}

      {/* Breakdown by Tier and Body */}
      {tiers.length > 0 && (
        <ChartCard title={t('dashboard.meetingsByLevelAndGroup', 'Breakdown by tier and body')} sub={`${t('dashboard.completedAndPlannedMeetings', 'Conducted vs scheduled')}, ${windowLabel}`}>
          <StackedHBar
            rows={tiers.map((r) => ({
              label: `${tierLabels[r.level] || r.level} ${bodyLabels[r.body] || r.body}`,
              values: { conducted: r.conducted, scheduled: r.scheduled },
            }))}
            series={[
              { key: 'conducted', label: t('dashboard.completed', 'Conducted'), color: Colors.success },
              { key: 'scheduled', label: t('dashboard.planned', 'Scheduled'), color: Colors.warning },
            ]}
            emptyLabel={t('dashboard.nothingRecordedWindow', 'No meetings in this window.')}
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
