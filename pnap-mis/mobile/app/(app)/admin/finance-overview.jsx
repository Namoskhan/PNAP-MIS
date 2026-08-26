import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { api, errorMessage } from '../../../src/api/client';
import { useAuth } from '../../../src/context/AuthContext';
import { isSuperAdmin } from '../../../src/utils/permissions';
import Card from '../../../src/components/Card';
import EmptyState from '../../../src/components/EmptyState';
import { Colors, FontSize, Radius, Spacing } from '../../../src/constants/colors';

const PKR = new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR', maximumFractionDigits: 0 });

export default function FinanceOverviewScreen() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    api.get('/admin/finance-overview')
      .then((r) => setData(r.data.data))
      .catch((e) => setErr(errorMessage(e)))
      .finally(() => setLoading(false));
  }, []);

  if (!isSuperAdmin(user)) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Only Super Admins can access this screen.</Text>
      </View>
    );
  }

  if (err) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{err}</Text>
      </View>
    );
  }

  if (loading || !data) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  const t = data.totals;

  const renderProvince = ({ item: p }) => (
    <Card style={styles.provCard}>
      <View style={styles.provHeader}>
        <Text style={styles.provName}>{p.name} {p.code ? <Text style={styles.mutedText}>({p.code})</Text> : ''}</Text>
      </View>
      <View style={styles.row}>
        <View style={styles.col}>
          <Text style={styles.label}>Donations</Text>
          <Text style={styles.val}>{PKR.format(p.donations)}</Text>
          <Text style={styles.hint}>({p.donationCount})</Text>
        </View>
        <View style={styles.col}>
          <Text style={styles.label}>Expenses</Text>
          <Text style={styles.val}>{PKR.format(p.expenses)}</Text>
          <Text style={styles.hint}>({p.expenseCount})</Text>
        </View>
        <View style={styles.col}>
          <Text style={styles.label}>Net</Text>
          <Text style={[styles.val, p.netBalance < 0 ? styles.textDanger : styles.textSuccess]}>
            {PKR.format(p.netBalance)}
          </Text>
        </View>
      </View>
    </Card>
  );

  return (
    <SafeAreaView style={styles.safe}>
      <FlatList
        data={data.perProvince}
        keyExtractor={(item) => item._id}
        renderItem={renderProvince}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <>
            <View style={styles.header}>
              <Text style={styles.title}>Finance Overview</Text>
              <Text style={styles.subtitle}>Aggregated finance across the entire party.</Text>
            </View>

            <View style={styles.kpiGrid}>
              <View style={styles.kpiBox}>
                <Text style={styles.kpiLabel}>Total Donations</Text>
                <Text style={styles.kpiValue}>{PKR.format(t.donations)}</Text>
                <Text style={styles.kpiHint}>{t.donationCount} entries</Text>
              </View>
              <View style={styles.kpiBox}>
                <Text style={styles.kpiLabel}>Approved Expenses</Text>
                <Text style={styles.kpiValue}>{PKR.format(t.expenses)}</Text>
                <Text style={styles.kpiHint}>{t.expenseCount} entries</Text>
              </View>
              <View style={styles.kpiBox}>
                <Text style={styles.kpiLabel}>Acknowledged Transfers</Text>
                <Text style={styles.kpiValue}>{PKR.format(t.transfers)}</Text>
                <Text style={styles.kpiHint}>{t.transferCount} entries</Text>
              </View>
              <View style={[styles.kpiBox, t.netBalance < 0 ? styles.kpiDanger : styles.kpiGood]}>
                <Text style={[styles.kpiLabel, (t.netBalance < 0 || t.netBalance >= 0) && styles.kpiWhite]}>Net Balance</Text>
                <Text style={[styles.kpiValue, (t.netBalance < 0 || t.netBalance >= 0) && styles.kpiWhite]}>{PKR.format(t.netBalance)}</Text>
              </View>
            </View>

            <Text style={styles.sectionTitle}>By Province</Text>
          </>
        }
        ListEmptyComponent={<EmptyState icon="📊" title="No Data" message="No provincial data available." />}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: Spacing.xl },
  errorText: { color: Colors.danger, fontSize: FontSize.base, textAlign: 'center' },
  header: { padding: Spacing.lg, paddingBottom: Spacing.md },
  title: { fontSize: FontSize.xl, fontWeight: '800', color: Colors.text },
  subtitle: { fontSize: FontSize.sm, color: Colors.textMuted, marginTop: 4 },
  
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: Spacing.lg, gap: Spacing.md, marginBottom: Spacing.lg },
  kpiBox: { 
    flex: 1, minWidth: '45%', backgroundColor: Colors.surface, 
    padding: Spacing.md, borderRadius: Radius.base, 
    borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center'
  },
  kpiDanger: { backgroundColor: Colors.danger, borderColor: Colors.danger },
  kpiGood: { backgroundColor: Colors.success, borderColor: Colors.success },
  kpiWhite: { color: '#fff' },
  
  kpiLabel: { fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: '600', textTransform: 'uppercase', marginBottom: 4 },
  kpiValue: { fontSize: FontSize.lg, fontWeight: '800', color: Colors.text },
  kpiHint: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 4 },
  
  sectionTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.text, paddingHorizontal: Spacing.lg, marginBottom: Spacing.md },
  listContent: { paddingBottom: 80 },
  
  provCard: { marginHorizontal: Spacing.lg, marginBottom: Spacing.md, padding: Spacing.md },
  provHeader: { marginBottom: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border, paddingBottom: Spacing.sm },
  provName: { fontSize: FontSize.base, fontWeight: '700', color: Colors.text },
  mutedText: { color: Colors.textMuted, fontWeight: '400' },
  
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  col: { alignItems: 'flex-start' },
  label: { fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: '600', marginBottom: 2 },
  val: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.text },
  hint: { fontSize: 10, color: Colors.textMuted },
  
  textDanger: { color: Colors.danger },
  textSuccess: { color: Colors.success },
});
