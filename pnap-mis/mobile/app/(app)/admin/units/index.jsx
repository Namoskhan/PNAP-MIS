import { useEffect, useMemo, useState } from 'react';
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
import { useLanguage } from '../../../../src/context/LanguageContext';
import { hasPermission } from '../../../../src/utils/permissions';
import { Colors, FontSize, Radius, Spacing } from '../../../../src/constants/colors';
import Card from '../../../../src/components/Card';
import { Ionicons } from '@expo/vector-icons';

const SURFACES_DEF = [
  { key: 'tier-configs', labelKey: 'tierConfigsTitle', descKey: 'tierConfigsDesc', noteKey: 'tierConfigsNote', icon: 'business',
    fallbackLabel: 'Unit Type Manager', fallbackDesc: 'Tier labels, capabilities, body policy, custom fields.', fallbackNote: 'tier configs',
    path: '/admin/units/tier-configs', fetchUrl: '/admin/units/tier-configs' },
  { key: 'cabinet-templates', labelKey: 'cabinetTemplatesTitle', descKey: 'cabinetTemplatesDesc', noteKey: 'cabinetTemplatesNote', icon: 'people',
    fallbackLabel: 'Cabinet Structure', fallbackDesc: 'Cabinet slots per tier — required vs optional, term length.', fallbackNote: 'slot templates',
    path: '/admin/units/cabinet-templates', fetchUrl: '/admin/units/cabinet-templates' },
  { key: 'policies', labelKey: 'policiesTitle', descKey: 'policiesDesc', noteKey: 'policiesNote', icon: 'scale',
    fallbackLabel: 'Unit Policies', fallbackDesc: 'Quorum, finance thresholds, transfer direction rules.', fallbackNote: 'policy rows',
    path: '/admin/units/policies', fetchUrl: '/admin/units/policies' },
  { key: 'workflows', labelKey: 'workflowsTitle', descKey: 'workflowsDesc', noteKey: 'workflowsNote', icon: 'git-network',
    fallbackLabel: 'Workflow Manager', fallbackDesc: 'Approval chains for expense / member / role / transfer.', fallbackNote: 'workflows',
    path: '/admin/units/workflows', fetchUrl: '/admin/units/workflows' },
  { key: 'responsibility-templates', labelKey: 'respTemplatesTitle', descKey: 'respTemplatesDesc', noteKey: 'respTemplatesNote', icon: 'clipboard',
    fallbackLabel: 'Responsibility Manager', fallbackDesc: 'Auto-assign tasks on meeting/activity events.', fallbackNote: 'task templates',
    path: '/admin/units/responsibility-templates', fetchUrl: '/admin/units/responsibility-templates' },
  { key: 'performance-rulesets', labelKey: 'perfRulesTitle', descKey: 'perfRulesDesc', noteKey: 'perfRulesNote', icon: 'bar-chart',
    fallbackLabel: 'Performance Rules', fallbackDesc: 'Weighted scoring formula for member performance.', fallbackNote: 'rulesets',
    path: '/admin/units/performance-rulesets', fetchUrl: '/admin/units/performance-rulesets' },
  { key: 'report-templates', labelKey: 'reportTemplatesTitle', descKey: 'reportTemplatesDesc', noteKey: 'reportTemplatesNote', icon: 'document-text',
    fallbackLabel: 'Report Templates', fallbackDesc: 'Composable PDF / XLSX reports built from sections.', fallbackNote: 'templates',
    path: '/admin/units/report-templates', fetchUrl: '/admin/units/report-templates' },
];

export default function UnitManagementLandingScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const { t, isRTL } = useLanguage();
  const canRead = hasPermission(user, 'VIEW_UNIT_CONFIG') || hasPermission(user, 'MANAGE_UNIT_CONFIG');
  const [counts, setCounts] = useState({});
  const [busy, setBusy] = useState(true);

  const surfaces = useMemo(() => SURFACES_DEF.map((s) => ({
    ...s,
    label: t(`admin.${s.labelKey}`) || s.fallbackLabel,
    description: t(`admin.${s.descKey}`) || s.fallbackDesc,
    countNote: t(`admin.${s.noteKey}`) || s.fallbackNote,
  })), [t]);

  useEffect(() => {
    if (!canRead) { setBusy(false); return; }
    let cancel = false;
    setBusy(true);
    Promise.all(SURFACES_DEF.map((s) =>
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
        <Text style={styles.errorText}>
          {t('admin.needUnitConfigPerm') || 'You need VIEW_UNIT_CONFIG or MANAGE_UNIT_CONFIG to view this section.'}
        </Text>
      </View>
    );
  }

  const renderCard = ({ item }) => {
    const val = counts[item.key];
    const displayVal = val === null || val === undefined ? '—' : val;

    return (
      <Card style={styles.card}>
        <TouchableOpacity style={styles.cardTouch} onPress={() => router.push(item.path)}>
          <View style={[styles.cardHeader, isRTL && { flexDirection: 'row-reverse' }]}>
            <View style={styles.iconContainer}>
              <Ionicons name={item.icon} size={24} color={Colors.primary} />
            </View>
            <View style={[styles.countBadge, isRTL && { alignItems: 'flex-start' }]}>
              <Text style={styles.countValue}>{displayVal}</Text>
              <Text style={styles.countNote}>{item.countNote}</Text>
            </View>
          </View>
          <Text style={[styles.cardTitle, isRTL && { textAlign: 'right' }]}>{item.label}</Text>
          <Text style={[styles.cardDesc, isRTL && { textAlign: 'right' }]}>{item.description}</Text>
        </TouchableOpacity>
      </Card>
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <FlatList
        data={surfaces}
        keyExtractor={(item) => item.key}
        renderItem={renderCard}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View style={styles.hero}>
            <View style={[styles.heroHeader, isRTL && { flexDirection: 'row-reverse' }]}>
              <Ionicons name="business" size={28} color={Colors.primary} />
              <Text style={styles.heroTitle}>{t('admin.unitManagementTitle') || 'Unit Management'}</Text>
            </View>
            <Text style={[styles.heroSub, isRTL && { textAlign: 'right' }]}>
              {t('admin.unitManagementDesc') || 'Configure how every tier operates — labels, cabinet structure, policies, workflows, scoring, and reports.'}
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
