import { useEffect, useState } from 'react';
import {
  ActivityIndicator, Linking, SafeAreaView,
  ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { api } from '../../../src/api/client';
import { useAuth } from '../../../src/context/AuthContext';
import { hasPermission } from '../../../src/utils/permissions';
import Card from '../../../src/components/Card';
import EmptyState from '../../../src/components/EmptyState';
import { Colors, FontSize, Spacing } from '../../../src/constants/colors';

function InfoRow({ label, value }) {
  if (!value) return null;
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

export default function SystemSettingsScreen() {
  const { user } = useAuth();
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
        <EmptyState icon="🔒" title="Access Restricted" subtitle="You need VIEW_SYSTEM_BRANDING or MANAGE_SYSTEM_BRANDING to view settings." />
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
        <View style={styles.banner}>
          <Text style={styles.bannerIcon}>⚙️</Text>
          <View style={styles.bannerText}>
            <Text style={styles.bannerTitle}>System Settings</Text>
            <Text style={styles.bannerSub}>Configuration v{v} · Read-only on mobile</Text>
          </View>
        </View>

        <View style={styles.readOnlyBar}>
          <Text style={styles.readOnlyText}>
            ℹ️  To edit branding, theme, logos, or typography, open the web admin panel on a desktop browser.
          </Text>
        </View>

        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>System Identity</Text>
          <InfoRow label="System Name" value={identity.systemName} />
          <InfoRow label="Short Name" value={identity.shortName} />
          <InfoRow label="Organization" value={identity.organizationName} />
          <InfoRow label="Browser Tab Title" value={identity.browserTabTitle} />
          <InfoRow label="Footer Text" value={identity.footerText} />
        </Card>

        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>Theme & Appearance</Text>
          <InfoRow label="Preset" value={theme.presetName} />
          <InfoRow label="Mode" value={theme.activeMode} />
          <InfoRow label="Primary Color" value={theme.overrides?.colorPrimary} />
        </Card>

        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>About</Text>
          <InfoRow label="Settings Version" value={`v${v}`} />
          <InfoRow label="Last Updated" value={settings?.updatedAt ? new Date(settings.updatedAt).toLocaleDateString('en-PK') : undefined} />
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
