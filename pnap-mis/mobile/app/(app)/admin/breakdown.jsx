import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLanguage } from '../../../src/context/LanguageContext';
import { useUnit } from '../../../src/context/UnitContext';
import { useAuth } from '../../../src/context/AuthContext';
import { api, errorMessage } from '../../../src/api/client';
import { useToast } from '../../../src/components/Toast';
import Card from '../../../src/components/Card';
import Badge from '../../../src/components/Badge';
import EmptyState from '../../../src/components/EmptyState';
import { Colors, FontSize, Radius, Spacing } from '../../../src/constants/colors';
import { PKR } from '../../../src/utils/formatters';

export default function SubordinateBreakdownScreen() {
  const { t, isRTL } = useLanguage();
  const { ctx } = useUnit();
  const { user } = useAuth();
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    if (!ctx?.unitId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await api.get('/dashboard/subordinates', {
        params: { unitLevel: ctx.unitLevel, unitId: ctx.unitId },
      });
      setRows(res.data?.data || []);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [ctx?.unitId, ctx?.unitLevel]);

  if (!ctx) {
    return (
      <SafeAreaView style={styles.safe}>
        <EmptyState icon="📊" title={t('common.selectUnitContext', 'Select a unit')} subtitle={t('common.selectUnitSubtitle', 'Please select a unit context from your dashboard or profile.')} />
      </SafeAreaView>
    );
  }

  if (ctx.unitLevel === 'BASIC_UNIT') {
    return (
      <SafeAreaView style={styles.safe}>
        <EmptyState icon="📊" title={t('breakdown.noSubordinates', 'No Subordinates')} subtitle={t('breakdown.noSubordinatesBasicUnit', 'Basic Units are the foundational tier and have no subordinate units.')} />
      </SafeAreaView>
    );
  }

  const childLabelMap = {
    AREA: t('units.basicUnits', 'Basic Units'),
    DISTRICT: t('units.areas', 'Areas'),
    PROVINCE: t('units.districts', 'Districts'),
    CENTRAL: t('units.provinces', 'Provinces'),
  };
  const childLabel = childLabelMap[ctx.unitLevel] || t('breakdown.subordinateUnits', 'Subordinate Units');

  function renderItem({ item: r }) {
    const isNegative = (r.balance || 0) < 0;
    return (
      <Card style={styles.unitCard}>
        {/* Header */}
        <View style={[styles.cardHeader, isRTL && { flexDirection: 'row-reverse' }]}>
          <View style={[styles.nameBlock, isRTL && { marginRight: 0, marginLeft: Spacing.sm }]}>
            <Text style={[styles.unitName, isRTL && { textAlign: 'right' }]}>{r.name}</Text>
            {r.code ? <Text style={[styles.unitCode, isRTL && { textAlign: 'right' }]}>{r.code}</Text> : null}
          </View>
          <Badge label={`${r.members || 0} ${t('common.members', 'Members')}`} color={Colors.primary} bg="#eff6ff" />
        </View>

        {/* 30-Day Activity Stats */}
        <View style={[styles.statsRow, isRTL && { flexDirection: 'row-reverse' }]}>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{r.meetings30 || 0}</Text>
            <Text style={styles.statLabel}>{t('breakdown.meetings30', 'Meetings (30d)')}</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{r.activities30 || 0}</Text>
            <Text style={styles.statLabel}>{t('breakdown.activities30', 'Activities (30d)')}</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statBox}>
            <Text style={[styles.statValue, isNegative && { color: Colors.error }]}>
              {PKR(r.balance || 0)}
            </Text>
            <Text style={styles.statLabel}>{t('finance.balance', 'Balance')}</Text>
          </View>
        </View>

        {/* Finance Detail Line */}
        <View style={[styles.finRow, isRTL && { flexDirection: 'row-reverse' }]}>
          <Text style={styles.finText}>
            {t('finance.donations', 'Donations')}: <Text style={{ color: Colors.success, fontWeight: '600' }}>{PKR(r.donations || 0)}</Text>
          </Text>
          <Text style={styles.finText}>
            {t('finance.expenses', 'Expenses')}: <Text style={{ color: Colors.error, fontWeight: '600' }}>{PKR(r.expenses || 0)}</Text>
          </Text>
        </View>
      </Card>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      {/* Banner */}
      <View style={[styles.banner, isRTL && { flexDirection: 'row-reverse' }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.bannerTitle, isRTL && { textAlign: 'right' }]}>{t('breakdown.breakdownTitle', '{{childLabel}} Breakdown', { childLabel })}</Text>
          <Text style={[styles.bannerSub, isRTL && { textAlign: 'right' }]}>
            {t('breakdown.overviewUnderUnit', 'Overview of all subordinate units under {{name}}', { name: ctx.unitName })}
          </Text>
        </View>
        <Badge label={`${rows.length} ${t('common.total', 'Total')}`} color="#fff" bg="rgba(255,255,255,0.2)" />
      </View>

      <FlatList
        data={rows}
        renderItem={renderItem}
        keyExtractor={(r) => r._id}
        contentContainerStyle={styles.list}
        onRefresh={load}
        refreshing={loading}
        ListEmptyComponent={
          !loading && (
            <EmptyState
              icon="📊"
              title={t('breakdown.noChildFound', 'No {{childLabel}} found', { childLabel: childLabel.toLowerCase() })}
              subtitle={t('breakdown.noSubordinateRegistered', 'No subordinate units are currently registered under this level.')}
            />
          )
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  banner: {
    backgroundColor: Colors.primary,
    padding: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  bannerTitle: { fontSize: FontSize.lg, fontWeight: '800', color: '#fff' },
  bannerSub: { fontSize: FontSize.xs, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
  list: { padding: Spacing.md, paddingBottom: 40 },
  unitCard: { marginBottom: Spacing.md, padding: Spacing.md },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: Spacing.md },
  nameBlock: { flex: 1, marginRight: Spacing.sm },
  unitName: { fontSize: FontSize.base, fontWeight: '700', color: Colors.text },
  unitCode: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2, fontFamily: 'monospace' },
  statsRow: {
    flexDirection: 'row',
    backgroundColor: Colors.surfaceAlt,
    borderRadius: Radius.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xs,
    marginBottom: Spacing.sm,
    alignItems: 'center',
  },
  statBox: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.text },
  statLabel: { fontSize: FontSize.xs - 2, color: Colors.textMuted, marginTop: 2, textAlign: 'center' },
  statDivider: { width: 1, height: 24, backgroundColor: Colors.border },
  finRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: Spacing.xs,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
  finText: { fontSize: FontSize.xs, color: Colors.textMuted },
});
