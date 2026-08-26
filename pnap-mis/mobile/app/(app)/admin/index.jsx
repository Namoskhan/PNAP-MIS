import { ScrollView, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../../src/context/AuthContext';
import { Colors, FontSize, Spacing } from '../../../src/constants/colors';
import {
  isSuperAdmin, isHigherAdmin, isAreaAdmin,
  hasPermission, canDecideRole, canInitiateRole,
  hasRole,
} from '../../../src/utils/permissions';

const ADMIN_CARDS = [
  {
    key: 'cabinet',
    icon: '🏛️',
    title: 'Cabinet',
    description: 'View and manage office-holders for your unit.',
    route: '/cabinet',
    show: (u) => isHigherAdmin(u) || isAreaAdmin(u) || canInitiateRole(u) || canDecideRole(u),
  },
  {
    key: 'org',
    icon: '🏢',
    title: 'Org Structure',
    description: 'Create and manage the organisational hierarchy below you.',
    route: '/admin/org',
    show: (u) => isHigherAdmin(u) || isAreaAdmin(u),
  },
  {
    key: 'users',
    icon: '👤',
    title: 'Users',
    description: 'Browse, create, and manage admin user accounts.',
    route: '/admin/users',
    show: (u) => isHigherAdmin(u),
  },
  {
    key: 'roles',
    icon: '🛡️',
    title: 'Role Manager',
    description: 'View system roles and manage custom roles with permissions.',
    route: '/admin/roles',
    show: (u) => isSuperAdmin(u),
  },
  {
    key: 'event-types-meetings',
    icon: '📅',
    title: 'Meeting Types',
    description: 'Configure meeting type codes and their properties.',
    route: '/admin/event-types/meetings',
    show: (u) => hasPermission(u, 'MANAGE_EVENT_CONFIG') || hasPermission(u, 'VIEW_EVENT_CONFIG'),
  },
  {
    key: 'event-types-activities',
    icon: '🚩',
    title: 'Activity Types',
    description: 'Configure activity type codes and their properties.',
    route: '/admin/event-types/activities',
    show: (u) => hasPermission(u, 'MANAGE_EVENT_CONFIG') || hasPermission(u, 'VIEW_EVENT_CONFIG'),
  },
  {
    key: 'reports',
    icon: '📊',
    title: 'Exports & Reports',
    description: 'Download PDF and XLSX reports for your unit.',
    route: '/admin/reports',
    show: (u) => isHigherAdmin(u) || isAreaAdmin(u) || hasRole(u, 'SENIOR_MAWIN', 'SECRETARY', 'FINANCE_SECRETARY'),
  },
  {
    key: 'audit',
    icon: '📋',
    title: 'Audit Log',
    description: 'Read-only log of privileged write actions.',
    route: '/admin/audit',
    show: (u) => isSuperAdmin(u),
  },
  {
    key: 'settings',
    icon: '⚙️',
    title: 'System Settings',
    description: 'View current system identity and branding configuration.',
    route: '/admin/settings',
    show: (u) => hasPermission(u, 'VIEW_SYSTEM_BRANDING') || hasPermission(u, 'MANAGE_SYSTEM_BRANDING'),
  },
];

export default function AdminHubScreen() {
  const { user } = useAuth();
  const router = useRouter();

  const visibleCards = ADMIN_CARDS.filter((c) => c.show(user));

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.heroRow}>
          <Text style={styles.heroIcon}>🛡️</Text>
          <View style={styles.heroText}>
            <Text style={styles.heroTitle}>Admin Panel</Text>
            <Text style={styles.heroSub}>Management tools for your role</Text>
          </View>
        </View>

        {visibleCards.length === 0 && (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No admin tools available for your current role.</Text>
          </View>
        )}

        <View style={styles.grid}>
          {visibleCards.map((card) => (
            <TouchableOpacity
              key={card.key}
              style={styles.card}
              onPress={() => router.push(card.route)}
              activeOpacity={0.75}
            >
              <Text style={styles.cardIcon}>{card.icon}</Text>
              <Text style={styles.cardTitle}>{card.title}</Text>
              <Text style={styles.cardDesc} numberOfLines={2}>{card.description}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.lg, paddingBottom: 40 },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginBottom: Spacing.xl, backgroundColor: Colors.primary, borderRadius: 14, padding: Spacing.lg },
  heroIcon: { fontSize: 32 },
  heroText: { flex: 1 },
  heroTitle: { fontSize: FontSize.xl, fontWeight: '800', color: '#fff' },
  heroSub: { fontSize: FontSize.sm, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: Spacing.lg,
    width: '47%',
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardIcon: { fontSize: 28, marginBottom: Spacing.sm },
  cardTitle: { fontSize: FontSize.base, fontWeight: '700', color: Colors.text, marginBottom: 4 },
  cardDesc: { fontSize: FontSize.xs, color: Colors.textMuted, lineHeight: 16 },
  empty: { alignItems: 'center', paddingVertical: 40 },
  emptyText: { color: Colors.textMuted, fontSize: FontSize.sm, textAlign: 'center' },
});
