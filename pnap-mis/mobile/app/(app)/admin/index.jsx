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
  hasRole, isOperatorPersona, isPresidentPersona, isFinanceOnly, isSecretaryOnly,
  isProvinceAdminOnly, isDistrictAdminOnly, isCentralAdminOnly,
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
  const isCentral = isCentralAdminOnly(user) || (hasRole(user, 'CENTRAL_ADMIN') && !isSuper);
  const isProvince = isProvinceAdminOnly(user) || (hasRole(user, 'PROVINCE_ADMIN') && !isSuper && !isCentral);
  const isDistrict = isDistrictAdminOnly(user) || (hasRole(user, 'DISTRICT_ADMIN') && !isSuper && !isHigherAdmin(user));
  const isArea = isAreaAdmin(user);
  const isSeniorMawin = isOperatorPersona(user);
  const isOperator = isOperatorPersona(user);
  const isFinanceSec = isFinanceOnly(user);
  const isPresident = isPresidentPersona(user);
  const isSecretary = isSecretaryOnly(user) || (hasRole(user, 'SECRETARY') && !isHigherAdmin(user) && !isArea);

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
    : (user?.roles?.[0]?.replace(/_/g, ' ') || 'Admin');

  const unitDisplayName = isCentral || isSuper
    ? 'PKNAP Central'
    : (ctx?.unitName || 'Administrative Control Center');

  const sections = [
    // 1. Super Admin God Mode
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

    // 2. Central Admin: My Organization
    {
      key: 'my_org',
      title: 'My Organization',
      icon: '🏛️',
      show: () => isCentral,
      items: [
        { key: 'c-dash', icon: '🏠', title: 'Dashboard', description: 'Central Command & Analytics', route: '/' },
        { key: 'c-org', icon: '🏢', title: 'Manage Provinces', description: 'Create and manage province tier units.', route: '/admin/org' },
        { key: 'c-members', icon: '👥', title: 'Province Members', description: 'Browse and filter members across provinces.', route: '/members' },
        { key: 'c-cab', icon: '🏛️', title: 'Assign Province Cabinet Roles', description: 'Appoint provincial office-holders and review cabinet.', route: '/cabinet' },
        { key: 'c-resp', icon: '📋', title: 'Responsibilities', description: 'Central task allocations and monitoring.', route: '/admin/responsibilities?unitLevel=CENTRAL&unitId=CENTRAL' },
        { key: 'c-perf', icon: '📈', title: 'Member Performance', description: 'Analyze performance metrics and generate reports.', route: '/admin/performance' },
        { key: 'c-breakdown', icon: '📊', title: 'Province Breakdown', description: 'Comparative provincial activity, membership & finance stats.', route: '/admin/breakdown' },
        { key: 'c-reports', icon: '📈', title: 'Reports', description: 'Download PDF and Excel reports for Central.', route: '/admin/reports?unitLevel=CENTRAL&unitId=CENTRAL' },
      ],
    },

    // 3. Province Admin: My Province
    {
      key: 'my_province',
      title: 'My Province',
      icon: '🏢',
      show: () => isProvince,
      items: [
        { key: 'p-dash', icon: '🏠', title: 'Dashboard', description: 'Provincial Command & Analytics', route: '/' },
        { key: 'p-org', icon: '🏢', title: 'Manage Districts', description: 'Create and manage district tier units.', route: '/admin/org' },
        { key: 'p-members', icon: '👥', title: 'All Province Members', description: 'Browse and filter members across the province.', route: '/members' },
        { key: 'p-cab', icon: '🏛️', title: 'Assign District Cabinet Roles', description: 'Appoint district office-holders and review cabinet.', route: '/cabinet' },
        { key: 'p-resp', icon: '📋', title: 'Responsibilities', description: 'Provincial task allocations and monitoring.', route: '/admin/responsibilities' },
        { key: 'p-perf', icon: '📈', title: 'Member Performance', description: 'Analyze performance metrics and generate reports.', route: '/admin/performance' },
        { key: 'p-breakdown', icon: '📊', title: 'District Breakdown', description: 'Comparative district activity, membership & finance stats.', route: '/admin/breakdown' },
        { key: 'p-reports', icon: '📈', title: 'Reports', description: 'Download PDF and Excel reports for the province.', route: '/admin/reports' },
      ],
    },

    // 4. District Admin: My District
    {
      key: 'my_district',
      title: 'My District',
      icon: '🏢',
      show: () => isDistrict,
      items: [
        { key: 'd-dash', icon: '🏠', title: 'Dashboard', description: 'District Command & Analytics', route: '/' },
        { key: 'd-org', icon: '🏢', title: 'Manage Areas', description: 'Create and manage area tier units.', route: '/admin/org' },
        { key: 'd-members', icon: '👥', title: 'Members', description: 'Browse and filter members in the district.', route: '/members' },
        { key: 'd-cab', icon: '🏛️', title: 'Assign Area Cabinet Roles', description: 'Appoint area office-holders and review cabinet.', route: '/cabinet' },
        { key: 'd-resp', icon: '📋', title: 'Responsibilities', description: 'District task allocations and monitoring.', route: '/admin/responsibilities' },
        { key: 'd-perf', icon: '📈', title: 'Member Performance', description: 'Analyze performance metrics and generate reports.', route: '/admin/performance' },
        { key: 'd-breakdown', icon: '📊', title: 'Area Breakdown', description: 'Comparative area activity, membership & finance stats.', route: '/admin/breakdown' },
        { key: 'd-reports', icon: '📈', title: 'Reports', description: 'Download PDF and Excel reports for the district.', route: '/admin/reports' },
      ],
    },

    // 5. Area Admin: My Area
    {
      key: 'my_area',
      title: 'My Area',
      icon: '🏢',
      show: () => isArea,
      items: [
        { key: 'a-dash', icon: '🏠', title: 'Dashboard', description: 'Area Command & Analytics', route: '/' },
        { key: 'a-org', icon: '🏢', title: 'Manage Basic Units', description: 'Create and manage basic units.', route: '/admin/org' },
        { key: 'a-approvals', icon: '⏳', title: 'Member Approvals', description: 'Review and approve pending member registrations.', route: '/members?status=PENDING_APPROVAL' },
        { key: 'a-members', icon: '👥', title: 'All Members', description: 'Browse and filter members in the area.', route: '/members' },
        { key: 'a-cab', icon: '🏛️', title: 'Assign Cabinet Roles', description: 'Assign office-holders and approve proposals.', route: '/cabinet' },
        { key: 'a-resp', icon: '📋', title: 'Responsibilities', description: 'Area task allocations and tracking.', route: '/admin/responsibilities' },
        { key: 'a-perf', icon: '📈', title: 'Member Performance', description: 'Analyze performance metrics and generate reports.', route: '/admin/performance' },
      ],
    },

    // 6. Generic Administrative Tools
    {
      key: 'admin_tools',
      title: 'Administrative Tools',
      icon: '🛠️',
      show: () => !isSuper && !isCentral && !isProvince && !isDistrict && !isArea && (isHigherAdmin(user) || canInitiateRole(user) || canDecideRole(user) || isSeniorMawin || isSecretary || isFinanceSec || isPresident || hasPermission(user, 'APPROVE_MEMBER')),
      items: [
        { key: 'gen-cab', icon: '🏛️', title: 'Cabinet & Roles', description: 'Cabinet assignments & proposals', route: '/cabinet' },
        { key: 'gen-resp', icon: '📋', title: 'Responsibilities', description: 'Unit tasks and responsibilities', route: '/admin/responsibilities' },
        { key: 'gen-perf', icon: '📈', title: 'Member Performance', description: 'Analyze member performance metrics', route: '/admin/performance' },
        { key: 'gen-approvals', icon: '⏳', title: 'Member Approvals', description: 'Review pending member registrations', route: '/members?status=PENDING_APPROVAL' },
        { key: 'gen-members', icon: '👥', title: 'Members', description: 'Browse members in your unit', route: '/members' },
        { key: 'gen-breakdown', icon: '📊', title: 'Breakdown', description: 'Comparative activity & stats', route: '/admin/breakdown' },
        { key: 'gen-reports', icon: '📈', title: 'Exports & Reports', description: 'Download PDF and Excel reports', route: '/admin/reports' },
      ],
    },

    // 7. National Congress (for Super Admin only)
    {
      key: 'congress',
      title: 'National Congress',
      icon: '🤝',
      show: () => isSuper,
      items: [
        { key: 'congress-roster', icon: '👥', title: 'Congress Roster', description: 'National Congress composition & member assignments', route: '/admin/congress?unitLevel=CENTRAL&unitId=CENTRAL' },
        { key: 'congress-meetings', icon: '📅', title: 'Congress Meetings', description: 'Schedule and manage National Congress assemblies', route: '/meetings?body=CONGRESS&unitLevel=CENTRAL&unitId=CENTRAL' },
        { key: 'congress-activities', icon: '🚩', title: 'Congress Activities', description: 'Log and monitor National Congress events & campaigns', route: '/activities?body=CONGRESS&unitLevel=CENTRAL&unitId=CENTRAL' },
        { key: 'congress-finance', icon: '💰', title: 'Congress Finance', description: 'Donations, expenses & funds for National Congress', route: '/finance?body=CONGRESS&unitLevel=CENTRAL&unitId=CENTRAL' },
        { key: 'congress-reports', icon: '📊', title: 'Congress Reports', description: 'Performance and financial reports for Congress', route: '/admin/reports?body=CONGRESS&unitLevel=CENTRAL&unitId=CENTRAL' },
      ],
    },

    // 8. Jirga (Sobayi Jirga for Central Admin & Province Admin / Qomi Jirga for Super Admin)
    {
      key: 'jirga',
      title: isSuper ? 'Qomi Jirga' : 'Sobayi Jirga',
      icon: '⚖️',
      show: () => isSuper || isCentral || isProvince,
      items: [
        { key: 'jirga-comp', icon: '⚖️', title: 'Composition', description: isSuper ? 'Central Jirga members & elders assembly' : 'Sobayi Jirga members & elders assembly', route: isSuper ? '/admin/jirga?unitLevel=CENTRAL&unitId=CENTRAL' : '/admin/jirga' },
        { key: 'jirga-meetings', icon: '📅', title: 'Jirga Meetings', description: 'Jirga assembly meeting records', route: isSuper ? '/meetings?body=JIRGA&unitLevel=CENTRAL&unitId=CENTRAL' : '/meetings?body=JIRGA' },
        { key: 'jirga-activities', icon: '🚩', title: 'Jirga Activities', description: 'Jirga activities, gatherings & events', route: isSuper ? '/activities?body=JIRGA&unitLevel=CENTRAL&unitId=CENTRAL' : '/activities?body=JIRGA' },
        { key: 'jirga-finance', icon: '💰', title: 'Jirga Finance', description: 'Jirga donations & expenses ledger', route: isSuper ? '/finance?body=JIRGA&unitLevel=CENTRAL&unitId=CENTRAL' : '/finance?body=JIRGA' },
        { key: 'jirga-transfers', icon: '💸', title: 'Jirga Transfers', description: 'Jirga fund transfers', route: isSuper ? '/finance/transfers?body=JIRGA&unitLevel=CENTRAL&unitId=CENTRAL' : '/finance/transfers?body=JIRGA' },
        { key: 'jirga-reports', icon: '📊', title: 'Jirga Reports', description: 'Jirga reports & exports', route: isSuper ? '/admin/reports?body=JIRGA&unitLevel=CENTRAL&unitId=CENTRAL' : '/admin/reports?body=JIRGA' },
      ],
    },

    // 9. Communication (Always available)
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
  ];

  const visibleSections = sections.filter(s => s.show() && s.items.length > 0);

  const [openSections, setOpenSections] = useState({
    god_mode: true,
    user_manager: true,
    my_org: true,
    my_province: true,
    my_district: true,
    my_area: true,
    admin_tools: true,
    congress: false,
    jirga: false,
    communication: true,
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
              <Text style={styles.heroSub}>{unitDisplayName}</Text>
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
  grid: { 
    flexDirection: 'row', 
    flexWrap: 'wrap', 
    gap: Spacing.sm, 
    padding: Spacing.sm, 
    backgroundColor: Colors.background 
  },
  card: { 
    backgroundColor: Colors.surface, 
    borderRadius: Radius.md, 
    padding: Spacing.md, 
    flexGrow: 1, 
    flexBasis: '47%', 
    minWidth: 140, 
    borderWidth: 1, 
    borderColor: Colors.border, 
    shadowColor: '#000', 
    shadowOpacity: 0.04, 
    shadowRadius: 4, 
    shadowOffset: { width: 0, height: 1 }, 
    elevation: 1 
  },
  cardIcon: { fontSize: 24, marginBottom: Spacing.xs },
  cardTitle: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.text, marginBottom: 2 },
  cardDesc: { fontSize: 11, color: Colors.textMuted, lineHeight: 15 },
  empty: { alignItems: 'center', paddingVertical: 40 },
  emptyText: { color: Colors.textMuted, fontSize: FontSize.sm, textAlign: 'center' },
});
