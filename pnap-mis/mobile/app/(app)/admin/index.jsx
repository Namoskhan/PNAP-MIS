import { useState } from 'react';
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
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
import { Ionicons } from '@expo/vector-icons';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function AdminHubScreen() {
  const { user } = useAuth();
  const { ctx } = useUnit();
  const router = useRouter();

  const isSuper = isSuperAdmin(user);
  const isCentral = hasRole(user, 'CENTRAL_ADMIN');
  const isProvince = hasRole(user, 'PROVINCE_ADMIN');
  const isDistrict = hasRole(user, 'DISTRICT_ADMIN');
  const isArea = hasRole(user, 'AREA_ADMIN');

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

  const sections = [
    {
      key: 'god_mode',
      title: 'God Mode',
      icon: '👑',
      show: () => isSuper,
      items: [
        { key: 'dashboard', icon: '🏠', title: 'Dashboard', description: 'Central Command Center', route: '/' },
        { key: 'central-admins', icon: '🏛️', title: 'Central Admins', description: 'Manage Central Admin users, credentials, and access.', route: '/admin/users?role=CENTRAL_ADMIN' },
        { key: 'org', icon: '🏢', title: 'Manage Units', description: 'Create and manage the administrative hierarchy.', route: '/admin/org' },
        { key: 'members', icon: '👥', title: 'All Members', description: 'Browse, filter, and register members globally.', route: '/members' },
        { key: 'pending-approvals', icon: '⏳', title: 'Pending Role Approvals', description: 'Approve or reject roles.', route: '/admin/pending-approvals' },
        { key: 'finance-overview', icon: '💰', title: 'Finance Overview', description: 'System-wide finance stats.', route: '/admin/finance-overview' },
      ],
    },
    {
      key: 'user_manager',
      title: 'User Manager',
      icon: '👥',
      show: () => isSuper,
      items: [
        { key: 'roles', icon: '🛡️', title: 'Role Management', description: 'Define system roles and configure permissions.', route: '/admin/roles' },
        { key: 'users', icon: '👤', title: 'All Users & Credentials', description: 'Manage root administrative login credentials.', route: '/admin/users' },
        { key: 'audit', icon: '📜', title: 'Audit Log', description: 'Immutable stream of privileged write and admin actions.', route: '/admin/audit' },
      ],
    },
    {
      key: 'event_manager',
      title: 'Event Manager',
      icon: '📁',
      show: () => isSuper || hasPermission(user, 'MANAGE_EVENT_CONFIG') || hasPermission(user, 'VIEW_EVENT_CONFIG'),
      items: [
        { key: 'event-types-meetings', icon: '📅', title: 'Meeting Types', description: 'Configure meeting type taxonomy and rules.', route: '/admin/event-types/meetings' },
        { key: 'event-types-activities', icon: '🚩', title: 'Activity Types', description: 'Configure activity type taxonomy and rules.', route: '/admin/event-types/activities' },
        { key: 'event-types-fields', icon: '📝', title: 'Field Library', description: 'Configure custom fields.', route: '/admin/events/fields' },
      ],
    },
    {
      key: 'unit_mgmt',
      title: 'Unit Management',
      icon: '🏢',
      show: () => isSuper,
      items: [
        { key: 'unit-mgmt', icon: '🏗️', title: 'Overview', description: 'Unit Management Overview', route: '/admin/units' },
        { key: 'unit-tiers', icon: '🏢', title: 'Unit Type Manager', description: 'Configure tier levels', route: '/admin/units/tier-configs' },
        { key: 'unit-cabinet', icon: '🏛️', title: 'Cabinet Structure', description: 'Configure cabinet templates', route: '/admin/units/cabinet-templates' },
        { key: 'unit-policies', icon: '📋', title: 'Unit Policies', description: 'Configure unit policies', route: '/admin/units/policies' },
        { key: 'unit-workflows', icon: '🔄', title: 'Workflow Manager', description: 'Manage approval workflows', route: '/admin/units/workflows' },
        { key: 'unit-resp', icon: '✅', title: 'Responsibility Manager', description: 'Configure task templates', route: '/admin/units/responsibility-templates' },
        { key: 'unit-perf', icon: '📈', title: 'Performance Rules', description: 'Configure KPI scoring rules', route: '/admin/units/performance-rulesets' },
        { key: 'unit-reports', icon: '📑', title: 'Report Templates', description: 'Configure PDF report templates', route: '/admin/units/report-templates' },
      ],
    },
    {
      key: 'settings',
      title: 'Settings',
      icon: '⚙️',
      show: () => isSuper || hasPermission(user, 'VIEW_SYSTEM_BRANDING') || hasPermission(user, 'MANAGE_SYSTEM_BRANDING'),
      items: [
        { key: 'settings-brand', icon: '⚙️', title: 'Branding Overview', description: 'View current system identity and branding configuration.', route: '/admin/settings' },
        { key: 'settings-id', icon: '🆔', title: 'System Identity', description: 'System name and details', route: '/admin/settings/identity' },
        { key: 'settings-logo', icon: '🖼️', title: 'Logo Manager', description: 'Manage application logos', route: '/admin/settings/logos' },
        { key: 'settings-theme', icon: '🎨', title: 'Theme Manager', description: 'Color themes and UI styles', route: '/admin/settings/theme' },
        { key: 'settings-type', icon: 'Aa', title: 'Typography', description: 'Font configurations', route: '/admin/settings/typography' },
        { key: 'settings-dash', icon: '🖥️', title: 'UI Preferences', description: 'Dashboard customizations', route: '/admin/settings/dashboard' },
        { key: 'settings-reports', icon: '📊', title: 'Report Branding', description: 'Report styles and watermarks', route: '/admin/settings/reports' },
        { key: 'settings-login', icon: '🔐', title: 'Login Customization', description: 'Login page look and feel', route: '/admin/settings/login' },
        { key: 'settings-history', icon: '🕒', title: 'Settings History', description: 'Changelog of settings', route: '/admin/settings/history' },
      ],
    },
    {
      key: 'central_tier',
      title: 'Central Tier',
      icon: '🏛️',
      show: () => isSuper,
      items: [
        { key: 'central-dash', icon: '🏠', title: 'Central Dashboard', description: 'Central level analytics', route: '/' },
        { key: 'central-cab', icon: '🏛️', title: 'Central Cabinet', description: 'Manage central cabinet', route: '/cabinet?unitLevel=CENTRAL&unitId=CENTRAL' },
        { key: 'central-congress', icon: '🤝', title: 'National Congress', description: 'National Congress details', route: '/admin/congress?unitLevel=CENTRAL&unitId=CENTRAL' },
        { key: 'central-meet', icon: '📅', title: 'Central Meetings', description: 'Central tier meetings', route: '/meetings?unitLevel=CENTRAL&unitId=CENTRAL' },
        { key: 'central-act', icon: '🚩', title: 'Central Activities', description: 'Central tier activities', route: '/activities?unitLevel=CENTRAL&unitId=CENTRAL' },
        { key: 'central-resp', icon: '📋', title: 'Central Responsibilities', description: 'Central tier tasks', route: '/admin/responsibilities?unitLevel=CENTRAL&unitId=CENTRAL' },
        { key: 'central-fin', icon: '💰', title: 'Central Finance', description: 'Central tier finances', route: '/finance?unitLevel=CENTRAL&unitId=CENTRAL' },
        { key: 'central-trans', icon: '💸', title: 'Central Fund Transfers', description: 'Central tier transfers', route: '/finance/transfers?unitLevel=CENTRAL&unitId=CENTRAL' },
        { key: 'central-rep', icon: '📈', title: 'Central Reports', description: 'Central tier exports', route: '/admin/reports?unitLevel=CENTRAL&unitId=CENTRAL' },
      ],
    },
    {
      key: 'congress',
      title: 'National Congress',
      icon: '🤝',
      show: () => isSuper || isCentral,
      items: [
        { key: 'congress-roster', icon: '👥', title: 'Congress Roster', description: 'National Congress composition & member assignments', route: '/admin/congress?unitLevel=CENTRAL&unitId=CENTRAL' },
        { key: 'congress-meetings', icon: '📅', title: 'Congress Meetings', description: 'Schedule and manage National Congress assemblies', route: '/meetings?body=CONGRESS&unitLevel=CENTRAL&unitId=CENTRAL' },
        { key: 'congress-activities', icon: '🚩', title: 'Congress Activities', description: 'Log and monitor National Congress events & campaigns', route: '/activities?body=CONGRESS&unitLevel=CENTRAL&unitId=CENTRAL' },
        { key: 'congress-finance', icon: '💰', title: 'Congress Finance', description: 'Donations, expenses & funds for National Congress', route: '/finance?body=CONGRESS&unitLevel=CENTRAL&unitId=CENTRAL' },
        { key: 'congress-reports', icon: '📊', title: 'Congress Reports', description: 'Performance and financial reports for Congress', route: '/admin/reports?body=CONGRESS&unitLevel=CENTRAL&unitId=CENTRAL' },
      ],
    },
    {
      key: 'jirga',
      title: 'Qomi Jirga',
      icon: '⚖️',
      show: () => isSuper || isCentral,
      items: [
        { key: 'jirga-comp', icon: '⚖️', title: 'Jirga Composition', description: 'Central Jirga members & elders assembly', route: '/admin/jirga?unitLevel=CENTRAL&unitId=CENTRAL' },
        { key: 'jirga-meetings', icon: '📅', title: 'Jirga Meetings', description: 'Central Jirga meeting records', route: '/meetings?body=JIRGA&unitLevel=CENTRAL&unitId=CENTRAL' },
        { key: 'jirga-activities', icon: '🚩', title: 'Jirga Activities', description: 'Central Jirga activities & events', route: '/activities?body=JIRGA&unitLevel=CENTRAL&unitId=CENTRAL' },
        { key: 'jirga-finance', icon: '💰', title: 'Jirga Finance', description: 'Central Jirga financial ledger', route: '/finance?body=JIRGA&unitLevel=CENTRAL&unitId=CENTRAL' },
        { key: 'jirga-transfers', icon: '💸', title: 'Jirga Transfers', description: 'Central Jirga fund transfers', route: '/finance/transfers?body=JIRGA&unitLevel=CENTRAL&unitId=CENTRAL' },
        { key: 'jirga-reports', icon: '📊', title: 'Jirga Reports', description: 'Central Jirga reports & exports', route: '/admin/reports?body=JIRGA&unitLevel=CENTRAL&unitId=CENTRAL' },
      ],
    },
    {
      key: 'communication',
      title: 'Communication',
      icon: '📢',
      show: () => true,
      items: [
        { key: 'notifications', icon: '🔔', title: 'Notifications', description: 'System alerts and updates', route: '/notifications' },
        { key: 'announcements', icon: '📢', title: 'Announcements', description: 'Org wide broadcasts & direct messages', route: '/announcements' },
      ],
    },
    {
      key: 'admin_tools',
      title: 'Administrative Tools',
      icon: '🛠️',
      show: () => !isSuper && (isHigherAdmin(user) || isAreaAdmin(user) || canInitiateRole(user) || canDecideRole(user) || hasRole(user, 'SECRETARY', 'SENIOR_MAWIN')),
      items: [
        { key: 'breakdown', icon: '📊', title: breakdownTitle, description: 'Activity, membership & finance stats.', route: '/admin/breakdown', show: () => isProvince || isDistrict || isCentral },
        { key: 'org', icon: '🏢', title: orgManageTitle, description: 'Create and manage the administrative hierarchy below you.', route: '/admin/org', show: () => isHigherAdmin(user) || isAreaAdmin(user) },
        { key: 'cabinet', icon: '🏛️', title: cabinetTitle, description: 'Assign office-holders and approve cabinet proposals.', route: '/cabinet', show: () => isHigherAdmin(user) || isAreaAdmin(user) || canInitiateRole(user) || canDecideRole(user) },
        { key: 'responsibilities', icon: '📋', title: 'Responsibilities', description: 'Assign tasks to unit members and track progress.', route: '/admin/responsibilities', show: () => isHigherAdmin(user) || isAreaAdmin(user) || hasRole(user, 'SECRETARY', 'SENIOR_MAWIN') },
        { key: 'members', icon: '👥', title: 'Unit Members', description: 'Browse, filter, and register members in your territory.', route: '/members', show: () => isHigherAdmin(user) || isAreaAdmin(user) },
        { key: 'reports', icon: '📈', title: 'Exports & Reports', description: 'Download PDF and Excel reports for meetings, finance, and transfers.', route: '/admin/reports', show: () => isHigherAdmin(user) || isAreaAdmin(user) || hasRole(user, 'SENIOR_MAWIN', 'SECRETARY', 'FINANCE_SECRETARY') },
      ].filter((i) => (i.show ? i.show() : true)),
    }
  ];

  const visibleSections = sections.filter(s => s.show() && s.items.length > 0);

  const [openSections, setOpenSections] = useState({
    god_mode: true,
    user_manager: true,
    communication: true,
    admin_tools: true,
  });

  function toggleSection(key) {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function setAllSections(open) {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    const updated = {};
    visibleSections.forEach((s) => { updated[s.key] = open; });
    setOpenSections(updated);
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.heroRow}>
          <View style={styles.heroHeader}>
            <Text style={styles.heroIcon}>🛡️</Text>
            <View style={styles.heroText}>
              <Text style={styles.heroTitle}>{tierTitle} Panel</Text>
              <Text style={styles.heroSub}>{ctx?.unitName || 'Administrative Control Center'}</Text>
            </View>
          </View>
          <View style={styles.heroTagRow}>
            <Badge label={user?.roles?.[0]?.replace(/_/g, ' ') || 'Admin'} color="#fff" bg="rgba(255,255,255,0.2)" />
            {ctx?.unitLevel && <Badge label={`Tier: ${ctx.unitLevel}`} color="rgba(255,255,255,0.9)" bg="rgba(0,0,0,0.2)" />}
          </View>
        </View>

        <View style={styles.accordionControlsRow}>
          <Text style={styles.sectionsHeaderLabel}>SECTIONS & MODULES</Text>
          <View style={styles.accordionBtns}>
            <TouchableOpacity onPress={() => setAllSections(true)} style={styles.miniBtn}><Text style={styles.miniBtnText}>Expand all</Text></TouchableOpacity>
            <Text style={styles.miniDivider}>·</Text>
            <TouchableOpacity onPress={() => setAllSections(false)} style={styles.miniBtn}><Text style={styles.miniBtnText}>Collapse all</Text></TouchableOpacity>
          </View>
        </View>

        {visibleSections.length === 0 && (
          <View style={styles.empty}><Text style={styles.emptyText}>No administrative tools available for your current role.</Text></View>
        )}

        {visibleSections.map((section) => {
          const isOpen = !!openSections[section.key];
          return (
            <View key={section.key} style={styles.sectionContainer}>
              <TouchableOpacity style={[styles.sectionHeaderBtn, isOpen && styles.sectionHeaderBtnOpen]} onPress={() => toggleSection(section.key)} activeOpacity={0.7}>
                <View style={styles.sectionHeaderLeft}>
                  <Text style={styles.sectionHeaderIcon}>{section.icon}</Text>
                  <Text style={styles.sectionHeaderTitle}>{section.title}</Text>
                  <View style={styles.countBadge}><Text style={styles.countBadgeText}>{section.items.length}</Text></View>
                </View>
                <Ionicons name={isOpen ? 'chevron-down' : 'chevron-forward'} size={20} color={isOpen ? Colors.primary : Colors.textMuted} />
              </TouchableOpacity>
              {isOpen && (
                <View style={styles.grid}>
                  {section.items.map((card) => (
                    <TouchableOpacity key={card.key} style={styles.card} onPress={() => router.push(card.route)} activeOpacity={0.75}>
                      <Text style={styles.cardIcon}>{card.icon}</Text>
                      <Text style={styles.cardTitle}>{card.title}</Text>
                      <Text style={styles.cardDesc} numberOfLines={2}>{card.description}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.lg, paddingBottom: 40 },
  heroRow: { backgroundColor: Colors.primary, borderRadius: Radius.lg, padding: Spacing.lg, marginBottom: Spacing.lg, shadowColor: Colors.primaryDark, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 10, elevation: 6 },
  heroHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginBottom: Spacing.md },
  heroIcon: { fontSize: 32 },
  heroText: { flex: 1 },
  heroTitle: { fontSize: FontSize.xl, fontWeight: '800', color: '#fff' },
  heroSub: { fontSize: FontSize.sm, color: 'rgba(255,255,255,0.85)', marginTop: 2 },
  heroTagRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  accordionControlsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md, paddingHorizontal: 4 },
  sectionsHeaderLabel: { fontSize: FontSize.xs, fontWeight: '800', color: Colors.textMuted, letterSpacing: 0.5 },
  accordionBtns: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  miniBtn: { paddingVertical: 2, paddingHorizontal: 4 },
  miniBtnText: { fontSize: FontSize.xs, color: Colors.primary, fontWeight: '600' },
  miniDivider: { fontSize: FontSize.xs, color: Colors.textLight },
  sectionContainer: { marginBottom: Spacing.md, backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  sectionHeaderBtn: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md },
  sectionHeaderBtnOpen: { borderBottomWidth: 1, borderBottomColor: Colors.border, backgroundColor: '#f8fafc' },
  sectionHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  sectionHeaderIcon: { fontSize: 20 },
  sectionHeaderTitle: { fontSize: FontSize.base, fontWeight: '700', color: Colors.text },
  countBadge: { paddingHorizontal: 7, paddingVertical: 2, backgroundColor: '#eff6ff', borderRadius: Radius.pill, borderWidth: 1, borderColor: '#dbeafe' },
  countBadgeText: { fontSize: 11, fontWeight: '700', color: Colors.primary },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md, padding: Spacing.md, backgroundColor: Colors.background },
  card: { backgroundColor: Colors.surface, borderRadius: Radius.md, padding: Spacing.md, width: '47.5%', borderWidth: 1, borderColor: Colors.border, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  cardIcon: { fontSize: 24, marginBottom: Spacing.xs },
  cardTitle: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.text, marginBottom: 2 },
  cardDesc: { fontSize: 11, color: Colors.textMuted, lineHeight: 15 },
  empty: { alignItems: 'center', paddingVertical: 40 },
  emptyText: { color: Colors.textMuted, fontSize: FontSize.sm, textAlign: 'center' },
});
