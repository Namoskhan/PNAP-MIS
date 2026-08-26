import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { api } from '../../../../src/api/client';
import { useAuth } from '../../../../src/context/AuthContext';
import { hasPermission } from '../../../../src/utils/permissions';
import { Colors, FontSize, Radius, Spacing } from '../../../../src/constants/colors';
import Card from '../../../../src/components/Card';
import { Ionicons } from '@expo/vector-icons';

const SURFACES = [
  { key: 'tier-configs', label: 'Unit Type Manager', icon: 'business',
    description: 'Tier labels, capabilities, body policy, custom fields.',
    path: '/admin/units/tier-configs',
    fetchUrl: '/admin/units/tier-configs',
    countNote: 'tier configs' },
  { key: 'cabinet-templates', label: 'Cabinet Structure', icon: 'people',
    description: 'Cabinet slots per tier — required vs optional, term length.',
    path: '/admin/units/cabinet-templates',
    fetchUrl: '/admin/units/cabinet-templates',
    countNote: 'slot templates' },
  { key: 'policies', label: 'Unit Policies', icon: 'scale',
    description: 'Quorum, finance thresholds, transfer direction rules.',
    path: '/admin/units/policies',
    fetchUrl: '/admin/units/policies',
    countNote: 'policy rows' },
  { key: 'workflows', label: 'Workflow Manager', icon: 'git-network',
    description: 'Approval chains for expense / member / role / transfer.',
    path: '/admin/units/workflows',
    fetchUrl: '/admin/units/workflows',
    countNote: 'workflows' },
  { key: 'responsibility-templates', label: 'Responsibility Manager', icon: 'clipboard',
    description: 'Auto-assign tasks on meeting/activity events.',
    path: '/admin/units/responsibility-templates',
    fetchUrl: '/admin/units/responsibility-templates',
    countNote: 'task templates' },
  { key: 'performance-rulesets', label: 'Performance Rules', icon: 'bar-chart',
    description: 'Weighted scoring formula for member performance.',
    path: '/admin/units/performance-rulesets',
    fetchUrl: '/admin/units/performance-rulesets',
    countNote: 'rulesets' },
  { key: 'report-templates', label: 'Report Templates', icon: 'document-text',
    description: 'Composable PDF / XLSX reports built from sections.',
    path: '/admin/units/report-templates',
    fetchUrl: '/admin/units/report-templates',
    countNote: 'templates' },
];

export default function UnitManagementLandingScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const canRead = hasPermission(user, 'VIEW_UNIT_CONFIG') || hasPermission(user, 'MANAGE_UNIT_CONFIG');
  const [counts, setCounts] = useState({});
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    if (!canRead) { setBusy(false); return; }
    let cancel = false;
    setBusy(true);
    Promise.all(SURFACES.map((s) =>
      api.get(s.fetchUrl)
        .then((r) => [s.key, (r.data?.data || []).length])
        .catch(() => [s.key, null])
    )).then((entries) => {
      if (cancel) return;
      setCounts(Object.fromEntries(entries));
      setBusy(false);
    });
    return () => { cancel = true; };
  }, [canRead]);

  if (!canRead) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>You need VIEW_UNIT_CONFIG or MANAGE_UNIT_CONFIG to view this section.</Text>
      </View>
    );
  }

  const renderCard = ({ item }) => {
    const val = counts[item.key];
    const displayVal = val === null || val === undefined ? '—' : val;

    return (
      <Card style={styles.card}>
        <TouchableOpacity style={styles.cardTouch} onPress={() => router.push(item.path)}>
          <View style={styles.cardHeader}>
            <View style={styles.iconContainer}>
              <Ionicons name={item.icon} size={24} color={Colors.primary} />
            </View>
            <View style={styles.countBadge}>
              <Text style={styles.countValue}>{displayVal}</Text>
              <Text style={styles.countNote}>{item.countNote}</Text>
            </View>
          </View>
          <Text style={styles.cardTitle}>{item.label}</Text>
          <Text style={styles.cardDesc}>{item.description}</Text>
        </TouchableOpacity>
      </Card>
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <FlatList
        data={SURFACES}
        keyExtractor={(item) => item.key}
        renderItem={renderCard}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View style={styles.hero}>
            <View style={styles.heroHeader}>
              <Ionicons name="business" size={28} color={Colors.primary} />
              <Text style={styles.heroTitle}>Unit Management</Text>
            </View>
            <Text style={styles.heroSub}>
              Configure how every tier operates — labels, cabinet structure, policies, workflows, scoring, and reports.
            </Text>
            {busy && <ActivityIndicator size="small" color={Colors.primary} style={{ marginTop: Spacing.md }} />}
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: Spacing.xl },
  errorText: { color: Colors.danger, fontSize: FontSize.base, textAlign: 'center' },
  
  listContent: { padding: Spacing.lg, paddingBottom: 80 },
  hero: { marginBottom: Spacing.xl },
  heroHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.sm },
  heroTitle: { fontSize: FontSize.xxl, fontWeight: '800', color: Colors.text },
  heroSub: { fontSize: FontSize.sm, color: Colors.textMuted, lineHeight: 20 },
  
  card: { marginBottom: Spacing.md, padding: 0 },
  cardTouch: { padding: Spacing.md },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: Spacing.md },
  iconContainer: { 
    width: 48, height: 48, borderRadius: Radius.full, 
    backgroundColor: Colors.primary + '1A', // 10% opacity 
    justifyContent: 'center', alignItems: 'center' 
  },
  countBadge: { alignItems: 'flex-end' },
  countValue: { fontSize: FontSize.lg, fontWeight: '800', color: Colors.text },
  countNote: { fontSize: 10, color: Colors.textMuted, textTransform: 'uppercase', fontWeight: '600' },
  
  cardTitle: { fontSize: FontSize.base, fontWeight: '700', color: Colors.text, marginBottom: 4 },
  cardDesc: { fontSize: FontSize.sm, color: Colors.textMuted, lineHeight: 20 },
});
