import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { api, errorMessage } from '../../api/client';
import { useToast } from '../Toast';
import { Colors, FontSize, Spacing, Radius } from '../../constants/colors';
import Card from '../Card';
import { HBar, StackedHBar, BRAND } from '../charts';
import KpiCard from '../KpiCard';

const LEVEL_NOUN = {
  PROVINCE: 'Province',
  DISTRICT: 'District',
  AREA: 'Area',
  BASIC_UNIT: 'Basic Unit',
};

const STATUS_META = [
  { key: 'ACTIVE', label: 'Active', color: Colors.success },
  { key: 'PENDING_APPROVAL', label: 'Pending', color: Colors.warning },
  { key: 'REJECTED', label: 'Rejected', color: Colors.error },
  { key: 'INACTIVE', label: 'Inactive', color: Colors.textMuted },
  { key: 'SUSPENDED', label: 'Suspended', color: Colors.accent },
  { key: 'EXPELLED', label: 'Expelled', color: Colors.errorDark || '#991b1b' },
  { key: 'DECEASED', label: 'Deceased', color: Colors.textLight },
];

export default function MembershipAnalytics({ days = 365, byStatus }) {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tier, setTier] = useState(null);

  useEffect(() => {
    async function fetch() {
      setLoading(true);
      try {
        const res = await api.get('/dashboard/membership', { params: { days } });
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
  const activeTier = levels.includes(tier) ? tier : levels[0] || null;
  const rows = activeTier ? (data.byLevel[activeTier] || []) : [];
  const noun = activeTier ? LEVEL_NOUN[activeTier] : null;
  const top = rows.slice(0, 10);

  const statusRows = STATUS_META
    .map((m) => ({ label: m.label, value: byStatus?.[m.key] || 0, color: m.color }))
    .filter((r) => r.value > 0);
  const statusTotal = statusRows.reduce((s, r) => s + r.value, 0);

  return (
    <View style={styles.container}>
      <View style={styles.kpiGrid}>
        <KpiCard label="Total Membership" value={t.total?.toLocaleString()} icon="👥" color={Colors.primary} />
        <KpiCard label="New Membership" value={t.newMembers?.toLocaleString()} icon="⚡" color={Colors.accent} />
      </View>
      <View style={styles.kpiGrid}>
        <KpiCard label="Active" value={t.active?.toLocaleString()} icon="✅" color={Colors.success} />
        <KpiCard label="Inactive" value={t.inactive?.toLocaleString()} icon="➖" color={Colors.textMuted} />
      </View>

      {statusRows.length > 0 && (
        <Card style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Status distribution</Text>
            <Text style={styles.cardSub}>{statusTotal.toLocaleString()} total</Text>
          </View>
          <HBar rows={statusRows} emptyLabel="No members registered yet." />
        </Card>
      )}

      {levels.length > 1 && (
        <View style={styles.chipScroll}>
          <Text style={styles.chipLabel}>Break down by:</Text>
          {levels.map((lvl) => {
            const isActive = activeTier === lvl;
            return (
              <Text 
                key={lvl} 
                onPress={() => setTier(lvl)}
                style={[styles.chip, isActive && styles.chipActive]}
              >
                {LEVEL_NOUN[lvl]}
              </Text>
            );
          })}
        </View>
      )}

      {noun && (
        <>
          <Card style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>{noun}-wise membership</Text>
              <Text style={styles.cardSub}>Total members</Text>
            </View>
            <HBar
              rows={top.map((r) => ({ label: r.name, value: r.total }))}
              accent={BRAND.dark}
              emptyLabel="No units in this scope."
            />
          </Card>

          <Card style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>Every {noun.toLowerCase()}, side by side</Text>
              <Text style={styles.cardSub}>Taking part vs Not taking part</Text>
            </View>
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
          </Card>
        </>
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
  chipScroll: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginVertical: Spacing.xs,
  },
  chipLabel: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.pill,
    backgroundColor: Colors.surfaceAlt,
    color: Colors.text,
    fontSize: FontSize.sm,
    fontWeight: '500',
    overflow: 'hidden',
  },
  chipActive: {
    backgroundColor: Colors.primary,
    color: '#fff',
  },
});
