import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { api, errorMessage } from '../../api/client';
import { useToast } from '../Toast';
import { Colors, FontSize, Spacing } from '../../constants/colors';
import Card from '../Card';
import { HBar, StackedHBar } from '../charts';
import KpiCard from '../KpiCard';

const TIER_LABEL = {
  CENTRAL: 'Central', PROVINCE: 'Province', DISTRICT: 'District',
  AREA: 'Area', BASIC_UNIT: 'Basic Unit',
};
const BODY_LABEL = { EXECUTIVE: 'Cabinet', COMMITTEE: 'Committee', GENERAL_BODY: 'General Body' };

const STATE_META = [
  { key: 'DRAFT', label: 'Draft', color: Colors.textLight },
  { key: 'SCHEDULED', label: 'Scheduled', color: Colors.info },
  { key: 'IN_PROGRESS', label: 'In progress', color: Colors.warning },
  { key: 'PENDING_REPORT', label: 'Pending report', color: Colors.accent },
  { key: 'FINALIZED', label: 'Finalized', color: Colors.success },
  { key: 'CANCELLED', label: 'Cancelled', color: Colors.error },
];

export default function MeetingsAnalytics({ days = 365 }) {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetch() {
      setLoading(true);
      try {
        const res = await api.get('/dashboard/meetings', { params: { days } });
        setData(res.data?.data);
      } catch (err) {
        toast.error(errorMessage(err));
      } finally {
        setLoading(false);
      }
    }
    fetch();
  }, [days]);

  if (loading && !data) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (!data) return null;

  const t = data.totals;
  const tiers = data.byTier || [];

  return (
    <View style={styles.container}>
      <View style={styles.kpiGrid}>
        <KpiCard label="Total Meetings" value={t.total?.toLocaleString()} icon="📅" color={Colors.primary} />
        <KpiCard label="Conducted" value={t.conducted?.toLocaleString()} icon="✅" color={Colors.success} />
      </View>
      <View style={styles.kpiGrid}>
        <KpiCard label="Scheduled" value={t.scheduled?.toLocaleString()} icon="⏱️" color={Colors.warning} />
        <KpiCard label="Overdue Reports" value={t.overdueReports?.toLocaleString()} icon="⚠️" color={Colors.error} />
      </View>

      <Card style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Meetings by state</Text>
          <Text style={styles.cardSub}>Lifecycle position</Text>
        </View>
        <HBar
          rows={STATE_META
            .map((s) => ({ label: s.label, value: data.byState?.[s.key] || 0, color: s.color }))
            .filter((r) => r.value > 0)}
          emptyLabel="No meetings in this window."
        />
      </Card>

      {tiers.length > 0 && (
        <Card style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Breakdown by tier and body</Text>
            <Text style={styles.cardSub}>Conducted vs scheduled</Text>
          </View>
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
        </Card>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.md,
    paddingBottom: Spacing.xl,
  },
  center: {
    padding: Spacing.xl,
    justifyContent: 'center',
    alignItems: 'center',
  },
  kpiGrid: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  card: {
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  cardHeader: {
    marginBottom: Spacing.sm,
  },
  cardTitle: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.text,
  },
  cardSub: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: 2,
  },
});
