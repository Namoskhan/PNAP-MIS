import { ScrollView, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../../src/context/AuthContext';
import { useUnit } from '../../../src/context/UnitContext';
import { Colors, FontSize, Radius, Spacing } from '../../../src/constants/colors';
import {
  isSuperAdmin, isHigherAdmin, isAreaAdmin,
  hasPermission, canDecideRole, canInitiateRole,
  hasRole,
} from '../../../src/utils/permissions';
import Badge from '../../../src/components/Badge';

export default function AdminHubScreen() {
  const { user } = useAuth();
  const { ctx } = useUnit();
  const router = useRouter();

  // Persona detection
  const isSuper = isSuperAdmin(user);
  const isProvince = hasRole(user, 'PROVINCE_ADMIN');
  const isDistrict = hasRole(user, 'DISTRICT_ADMIN');
  const isArea = hasRole(user, 'AREA_ADMIN');
  const isCentral = hasRole(user, 'CENTRAL_ADMIN');

  const tierTitle = isSuper
    ? 'Super Admin'
    : isCentral
    ? 'Central Admin'
    : isProvince
    ? 'Province Admin'
    : isDistrict
    ? 'District Admin'
    : isArea
    ? 'Area Admin'
    : 'Admin';

  const orgManageTitle = isProvince
    ? 'Manage Districts'
    : isDistrict
    ? 'Manage Areas'
    : isArea
    ? 'Manage Basic Units'
    : isCentral
    ? 'Manage Provinces'
    : 'Org Structure';

  const breakdownTitle = isProvince
    ? 'District Breakdown'
    : isDistrict
    ? 'Area Breakdown'
    : isCentral
    ? 'Province Breakdown'
    : 'Subordinate Breakdown';

  const cabinetTitle = isProvince
    ? 'Assign District Cabinet'
    : isDistrict
    ? 'Assign Area Cabinet'
    : isArea
    ? 'Assign Cabinet Roles'
    : 'Cabinet & Roles';

  const adminCards = [
    // Subordinate Breakdown (Province, District, Central, Super)
    {
      key: 'breakdown',
      icon: '📊',
      title: breakdownTitle,
      description: 'Activity, membership & finance stats across subordinate units.',
      route: '/admin/breakdown',
      show: () => isProvince || isDistrict || isCentral || isSuper,
    },
    // Org Structure Management
    {
      key: 'org',
      icon: '🏢',
      title: orgManageTitle,
      description: 'Create and manage the administrative hierarchy below you.',
      route: '/admin/org',
      show: () => isHigherAdmin(user) || isAreaAdmin(user),
    },
    // Cabinet Roles
    {
      key: 'cabinet',
      icon: '🏛️',
      title: cabinetTitle,
      description: 'Assign office-holders and approve cabinet proposals.',
      route: '/cabinet',
      show: () => isHigherAdmin(user) || isAreaAdmin(user) || canInitiateRole(user) || canDecideRole(user),
    },
    // Responsibilities
    {
      key: 'responsibilities',
      icon: '📋',
      title: 'Responsibilities',
      description: 'Assign tasks to unit members and track progress.',
      route: '/admin/responsibilities',
      show: () => isHigherAdmin(user) || isAreaAdmin(user) || hasRole(user, 'SECRETARY', 'SENIOR_MAWIN'),
    },
    // Members Directory
    {
      key: 'members',
      icon: '👥',
      title: 'Unit Members',
      description: 'Browse, filter, and register members in your territory.',
      route: '/members',
      show: () => isHigherAdmin(user) || isAreaAdmin(user),
    },
    // Reports & Exports
    {
      key: 'reports',
      icon: '📈',
      title: 'Exports & Reports',
      description: 'Download PDF and Excel reports for meetings, finance, and transfers.',
      route: '/admin/reports',
      show: () => isHigherAdmin(user) || isAreaAdmin(user) || hasRole(user, 'SENIOR_MAWIN', 'SECRETARY', 'FINANCE_SECRETARY'),
    },
    // Users & Credentials (Super Admin only for bootstrap/credentials)
    {
      key: 'users',
      icon: '👤',
      title: 'User Credentials',
      description: 'Manage root administrative login credentials and passwords.',
      route: '/admin/users',
      show: () => isSuper,
    },
    // Role Manager (Super Admin)
    {
      key: 'roles',
      icon: '🛡️',
      title: 'Role Management',
      description: 'Define system roles and configure fine-grained permissions.',
      route: '/admin/roles',
      show: () => isSuper,
    },
    // Event Types (Super Admin / Permission)
    {
      key: 'event-types-meetings',
      icon: '📅',
      title: 'Meeting Types',
      description: 'Configure meeting type taxonomy and rules.',
      route: '/admin/event-types/meetings',
      show: () => hasPermission(user, 'MANAGE_EVENT_CONFIG') || hasPermission(user, 'VIEW_EVENT_CONFIG'),
    },
    {
      key: 'event-types-activities',
      icon: '🚩',
      title: 'Activity Types',
      description: 'Configure activity type taxonomy and rules.',
      route: '/admin/event-types/activities',
      show: () => hasPermission(user, 'MANAGE_EVENT_CONFIG') || hasPermission(user, 'VIEW_EVENT_CONFIG'),
    },
    // Audit Log (Super Admin)
    {
      key: 'audit',
      icon: '📜',
      title: 'Audit Log',
      description: 'Immutable stream of privileged write and admin actions.',
      route: '/admin/audit',
      show: () => isSuper,
    },
    // Settings (Super Admin / Branding)
    {
      key: 'settings',
      icon: '⚙️',
      title: 'System Settings',
      description: 'View current system identity and branding configuration.',
      route: '/admin/settings',
      show: () => hasPermission(user, 'VIEW_SYSTEM_BRANDING') || hasPermission(user, 'MANAGE_SYSTEM_BRANDING'),
    },
  ];

  const visibleCards = adminCards.filter((c) => c.show());

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Hero Card */}
        <View style={styles.heroRow}>
          <View style={styles.heroHeader}>
            <Text style={styles.heroIcon}>🛡️</Text>
            <View style={styles.heroText}>
              <Text style={styles.heroTitle}>{tierTitle} Panel</Text>
              <Text style={styles.heroSub}>
                {ctx?.unitName ? `${ctx.unitName}` : 'Administrative Control Center'}
              </Text>
            </View>
          </View>
          <View style={styles.heroTagRow}>
            <Badge
              label={user?.roles?.[0]?.replace(/_/g, ' ') || 'Admin'}
              color="#fff"
              bg="rgba(255,255,255,0.2)"
            />
            {ctx?.unitLevel ? (
              <Badge
                label={`Tier: ${ctx.unitLevel}`}
                color="rgba(255,255,255,0.9)"
                bg="rgba(0,0,0,0.2)"
              />
            ) : null}
          </View>
        </View>

        {visibleCards.length === 0 && (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No administrative tools available for your current role.</Text>
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
  heroRow: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.xl,
    shadowColor: Colors.primaryDark,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 6,
  },
  heroHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginBottom: Spacing.md },
  heroIcon: { fontSize: 32 },
  heroText: { flex: 1 },
  heroTitle: { fontSize: FontSize.xl, fontWeight: '800', color: '#fff' },
  heroSub: { fontSize: FontSize.sm, color: 'rgba(255,255,255,0.85)', marginTop: 2 },
  heroTagRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
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
