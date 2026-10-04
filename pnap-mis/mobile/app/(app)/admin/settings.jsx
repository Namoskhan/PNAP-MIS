import { useEffect, useState } from 'react';
import {
  ActivityIndicator, Linking, SafeAreaView,
  ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { api } from '../../../src/api/client';
import { useAuth } from '../../../src/context/AuthContext';
import { useLanguage } from '../../../src/context/LanguageContext';
import { hasPermission } from '../../../src/utils/permissions';
import Card from '../../../src/components/Card';
import EmptyState from '../../../src/components/EmptyState';
import { Colors, FontSize, Spacing } from '../../../src/constants/colors';

function InfoRow({ label, value, isRTL }) {
  if (!value) return null;
  return (
    <View style={[styles.row, isRTL && { flexDirection: 'row-reverse' }]}>
      <Text style={[styles.rowLabel, isRTL && { textAlign: 'right' }]}>{label}</Text>
      <Text style={[styles.rowValue, isRTL ? { textAlign: 'left' } : { textAlign: 'right' }]}>{value}</Text>
    </View>
  );
}

export default function SystemSettingsScreen() {
  const { user } = useAuth();
  const { t, isRTL } = useLanguage();
  const canRead = hasPermission(user, 'VIEW_SYSTEM_BRANDING') || hasPermission(user, 'MANAGE_SYSTEM_BRANDING');
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!canRead) { setLoading(false); return; }
    api.get('/settings')
      .then((r) => setSettings(r.data?.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [canRead]);

  if (!canRead) {
    return (
      <SafeAreaView style={styles.safe}>
        <EmptyState icon="🔒" title={t('admin.accessRestricted')} subtitle={t('admin.onlySuperAdmins')} />
      </SafeAreaView>
    );
  }

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={Colors.primary} /></View>;
  }

  const identity = settings?.identity || {};
  const theme = settings?.theme || {};
  const v = settings?.settingsVersion || 1;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Banner */}
        <View style={[styles.banner, isRTL && { flexDirection: 'row-reverse' }]}>
          <Text style={styles.bannerIcon}>⚙️</Text>
          <View style={styles.bannerText}>
            <Text style={[styles.bannerTitle, isRTL && { textAlign: 'right' }]}>{t('admin.settings.systemSettings')}</Text>
            <Text style={[styles.bannerSub, isRTL && { textAlign: 'right' }]}>v{v} · {t('admin.readOnlyOnMobile')}</Text>
          </View>
        </View>

        <View style={styles.readOnlyBar}>
          <Text style={[styles.readOnlyText, isRTL && { textAlign: 'right' }]}>
            ℹ️  {t('admin.openWebToEditSettings')}
          </Text>
        </View>

        <Card style={styles.section}>
          <Text style={[styles.sectionTitle, isRTL && { textAlign: 'right' }]}>{t('admin.settings.systemIdentity')}</Text>
          <InfoRow label={t('admin.systemName')} value={identity.systemName} isRTL={isRTL} />
          <InfoRow label={t('admin.shortName')} value={identity.shortName} isRTL={isRTL} />
          <InfoRow label={t('admin.organization')} value={identity.organizationName} isRTL={isRTL} />
          <InfoRow label={t('admin.browserTabTitle')} value={identity.browserTabTitle} isRTL={isRTL} />
          <InfoRow label={t('admin.footerText')} value={identity.footerText} isRTL={isRTL} />
        </Card>

        <Card style={styles.section}>
          <Text style={[styles.sectionTitle, isRTL && { textAlign: 'right' }]}>{t('admin.themeAndAppearance')}</Text>
          <InfoRow label={t('admin.preset')} value={theme.presetName} isRTL={isRTL} />
          <InfoRow label={t('admin.mode')} value={theme.activeMode} isRTL={isRTL} />
          <InfoRow label={t('admin.primaryColor')} value={theme.overrides?.colorPrimary} isRTL={isRTL} />
        </Card>

        <Card style={styles.section}>
          <Text style={[styles.sectionTitle, isRTL && { textAlign: 'right' }]}>{t('admin.about')}</Text>
          <InfoRow label={t('admin.settingsVersion')} value={`v${v}`} isRTL={isRTL} />
          <InfoRow label={t('admin.lastUpdated')} value={settings?.updatedAt ? new Date(settings.updatedAt).toLocaleDateString('en-PK') : undefined} isRTL={isRTL} />
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { padding: Spacing.lg, paddingBottom: 40 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: Colors.primary, borderRadius: 14, padding: Spacing.lg, marginBottom: Spacing.md },
  bannerIcon: { fontSize: 32 },
  bannerText: { flex: 1 },
  bannerTitle: { fontSize: FontSize.xl, fontWeight: '800', color: '#fff' },
  bannerSub: { fontSize: FontSize.xs, color: 'rgba(255,255,255,0.75)', marginTop: 2 },
  readOnlyBar: { backgroundColor: '#fef9c3', borderRadius: 10, padding: Spacing.md, marginBottom: Spacing.md, borderWidth: 1, borderColor: '#fde68a' },
  readOnlyText: { fontSize: FontSize.sm, color: '#92400e', lineHeight: 18 },
  section: { marginBottom: Spacing.md },
  sectionTitle: { fontSize: FontSize.base, fontWeight: '700', color: Colors.text, marginBottom: Spacing.md },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  rowLabel: { fontSize: FontSize.sm, color: Colors.textMuted, flex: 1 },
  rowValue: { fontSize: FontSize.sm, color: Colors.text, fontWeight: '500', flex: 1, textAlign: 'right' },
});
