import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { api, errorMessage } from '../../api/client';
import { useToast } from '../Toast';
import { Colors, FontSize, Spacing } from '../../constants/colors';
import Card from '../Card';
import { HBar, BRAND } from '../charts';
import KpiCard from '../KpiCard';

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

export default function CampaignsAnalytics({ days = 365 }) {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetch() {
      setLoading(true);
      try {
        const res = await api.get('/dashboard/campaigns', { params: { days } });
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
  const levels = data.levels || [];

  if (t.total === 0) {
    return (
      <Card style={styles.center}>
        <Text style={{ fontSize: 32 }}>🎯</Text>
        <Text style={styles.emptyText}>No campaigns recorded for this scope.</Text>
      </Card>
    );
  }

  const stageRows = [
    { label: 'Running', value: t.running, color: BRAND.dark },
    { label: 'Upcoming', value: t.upcoming, color: Colors.warning },
    { label: 'Completed', value: t.completed, color: Colors.success },
    { label: 'Cancelled', value: t.cancelled, color: Colors.textMuted },
  ].filter(r => r.value > 0);

  return (
    <View style={styles.container}>
      <View style={styles.kpiGrid}>
        <KpiCard label="Active Campaigns" value={t.running?.toLocaleString()} icon="🎯" color={Colors.primary} />
        <KpiCard label="Completed" value={t.completed?.toLocaleString()} icon="✅" color={Colors.success} />
      </View>
      <View style={styles.kpiGrid}>
        <KpiCard label="Upcoming" value={t.upcoming?.toLocaleString()} icon="⏱️" color={Colors.warning} />
        {data.reach && (
          <KpiCard label="People Contacted" value={data.reach.peopleContacted?.toLocaleString()} icon="👥" color={Colors.accent} />
        )}
      </View>

      <Card style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Campaigns by stage</Text>
        </View>
        <HBar rows={stageRows} />
      </Card>

      {levels.map((lvl) => {
        const rows = data.byLevel[lvl] || [];
        const attributed = rows.reduce((a, r) => a + r.total, 0);
        return (
          <Card key={lvl} style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>{LEVEL_NOUN[lvl]}-wise campaigns</Text>
              {attributed < t.total && (
                <Text style={styles.cardSub}>{attributed} of {t.total}</Text>
              )}
            </View>
            <HBar
              rows={rows.slice(0, 10).map((r) => ({ label: r.name, value: r.total }))}
              accent={LEVEL_ACCENT[lvl]}
              emptyLabel={`No ${LEVEL_NOUN[lvl]} campaigns.`}
            />
          </Card>
        );
      })}

      {data.reach && (
        <Card style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Campaign reach</Text>
            <Text style={styles.cardSub}>Aggregated across recorded campaigns</Text>
          </View>
          <View style={styles.table}>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Households visited</Text>
              <Text style={styles.rowVal}>{data.reach.householdsVisited?.toLocaleString()}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>People contacted</Text>
              <Text style={styles.rowVal}>{data.reach.peopleContacted?.toLocaleString()}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Expected joiners</Text>
              <Text style={styles.rowVal}>{data.reach.expectedJoiners?.toLocaleString()}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Actual joiners</Text>
              <Text style={styles.rowVal}>{data.reach.actualJoiners?.toLocaleString()}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Volunteer hours</Text>
              <Text style={styles.rowVal}>{data.reach.volunteerHours?.toLocaleString()}</Text>
            </View>
            {data.reach.conversionPct != null && (
              <View style={[styles.row, { borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: Spacing.sm }]}>
                <Text style={styles.rowLabel}>Conversion</Text>
                <Text style={[styles.rowVal, { color: Colors.success }]}>{data.reach.conversionPct}%</Text>
              </View>
            )}
          </View>
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
    gap: Spacing.sm,
  },
  emptyText: {
    color: Colors.textMuted,
    fontSize: FontSize.md,
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
  table: {
    gap: Spacing.sm,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  rowLabel: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
  },
  rowVal: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.text,
  },
});
