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
import { Colors, FontSize, Radius, Spacing, Shadow } from '../../../src/constants/colors';
import {
  isSuperAdmin, isHigherAdmin, isAreaAdmin,
  hasPermission, canDecideRole, canInitiateRole, canManageFinance, canApproveExpense,
  hasRole, isOperatorPersona, isPresidentPersona, isFinanceOnly, isSecretaryOnly,
  isProvinceAdminOnly, isDistrictAdminOnly, isCentralAdminOnly,
  CABINET_ROLES, isPureMember, roleLabel,
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
  const isMember = isPureMember(user);
  const isCabinet = (Array.isArray(CABINET_ROLES) && CABINET_ROLES.some((r) => hasRole(user, r))) || !isPureMember(user);

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
            : isMember
              ? 'Member'
              : (roleLabel(user, user?.roles?.[0]) || 'Cabinet');

  const unitDisplayName = isCentral || isSuper
    ? 'PKNAP Central'
    : isMember
      ? (ctx?.unitName ? `Basic Unit · ${ctx.unitName}` : 'My Unit Operations')
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
        { key: 'org', icon: '🏢', title: 'Manage Units', description: 'Create and manage the administrative hierarchy.', route: '/admin/manage-org' },
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
      key: 'unit_mgmt',
      title: 'Unit Management Engine',
      icon: '🏢',
      show: () => isSuper || hasPermission(user, 'MANAGE_UNIT_CONFIG') || hasPermission(user, 'VIEW_UNIT_CONFIG'),
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
      key: 'settings',
      title: 'Settings & Identity',
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
      icon: '🌐',
      show: () => isSuper,
      items: [
        { key: 'ct-dash', icon: '🏠', title: 'Central Dashboard', description: 'Central Command & Analytics Overview', route: '/' },
        { key: 'ct-cab', icon: '🏛️', title: 'Central Cabinet', description: 'Cabinet appointments and office-holders', route: '/cabinet' },
        { key: 'ct-meetings', icon: '📅', title: 'Central Meetings', description: 'Central executive assemblies & meeting records', route: '/meetings?unitLevel=CENTRAL&unitId=CENTRAL' },
        { key: 'ct-activities', icon: '🚩', title: 'Central Activities', description: 'Central events, campaigns and gatherings', route: '/activities?unitLevel=CENTRAL&unitId=CENTRAL' },
        { key: 'ct-resp', icon: '📋', title: 'Central Responsibilities', description: 'Central task allocations and monitoring', route: '/admin/responsibilities?unitLevel=CENTRAL&unitId=CENTRAL' },
        { key: 'ct-finance', icon: '💰', title: 'Central Finance', description: 'Central funds, donations and expenses ledger', route: '/finance?unitLevel=CENTRAL&unitId=CENTRAL' },
        { key: 'ct-transfers', icon: '💸', title: 'Central Fund Transfers', description: 'Central fund transfers and approvals', route: '/finance/transfers?unitLevel=CENTRAL&unitId=CENTRAL' },
        { key: 'ct-reports', icon: '📈', title: 'Central Reports', description: 'Generate and download Central PDF and Excel reports', route: '/admin/reports?unitLevel=CENTRAL&unitId=CENTRAL' },
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
        { key: 'c-org', icon: '🏢', title: 'Manage Provinces', description: 'Create and manage province tier units.', route: '/admin/manage-org' },
        { key: 'c-members', icon: '👥', title: 'Province Members', description: 'Browse and filter members across provinces.', route: '/members' },
        { key: 'c-cab', icon: '🏛️', title: 'Assign Province Cabinet Roles', description: 'Appoint provincial office-holders and review cabinet.', route: '/cabinet' },
        { key: 'c-resp', icon: '📋', title: 'Responsibilities', description: 'Central task allocations and monitoring.', route: '/admin/responsibilities?unitLevel=CENTRAL&unitId=CENTRAL' },
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
        { key: 'p-dash', icon: '🏠', title: 'Dashboard', description: 'Provincial Command & Unit Analytics', route: '/' },
        { key: 'p-org', icon: '🏢', title: 'Manage Districts', description: 'Create and manage district tier units.', route: '/admin/manage-org' },
        { key: 'p-members', icon: '👥', title: 'All Province Members', description: 'Browse, search, and manage all provincial members.', route: '/members' },
        { key: 'p-cab', icon: '🏛️', title: 'Assign District Cabinet Roles', description: 'Appoint district office-holders and review cabinet.', route: '/cabinet' },
        { key: 'p-resp', icon: '📋', title: 'Responsibilities', description: 'Provincial task allocations and tracking.', route: '/admin/responsibilities' },
        { key: 'p-breakdown', icon: '📊', title: 'District Breakdown', description: 'Comparative district activity, membership & finance stats.', route: '/admin/breakdown' },
        { key: 'p-reports', icon: '📈', title: 'Reports', description: 'Generate and download PDF and Excel summary packages.', route: '/admin/reports' },
      ],
    },

    // 4. District Admin: My District
    {
      key: 'my_district',
      title: 'My District',
      icon: '🏢',
      show: () => isDistrict || hasRole(user, 'DISTRICT_ADMIN'),
      items: [
        { key: 'd-dash', icon: '🏠', title: 'Dashboard', description: 'District Command & Unit Analytics', route: '/' },
        { key: 'd-org', icon: '🏢', title: 'Manage Areas', description: 'Create and manage area tier units in your district.', route: '/admin/manage-org' },
        { key: 'd-members', icon: '👥', title: 'Members', description: 'Browse and filter members in the district.', route: '/members' },
        { key: 'd-cab', icon: '🏛️', title: 'Assign Area Cabinet Roles', description: 'Appoint area office-holders and review cabinet.', route: '/cabinet' },
        { key: 'd-resp', icon: '📋', title: 'Responsibilities', description: 'District task allocations and monitoring.', route: '/admin/responsibilities' },
        { key: 'd-breakdown', icon: '📊', title: 'Area Breakdown', description: 'Comparative area activity, membership & finance stats.', route: '/admin/breakdown' },
        { key: 'd-reports', icon: '📈', title: 'Reports', description: 'Download PDF and Excel reports for the district.', route: '/admin/reports' },
      ],
    },

    // 5. Area Admin: My Area
    {
      key: 'my_area',
      title: 'My Area',
      icon: '🏢',
      show: () => isArea || hasRole(user, 'AREA_ADMIN'),
      items: [
        { key: 'a-dash', icon: '🏠', title: 'Dashboard', description: 'Area Command & Analytics', route: '/' },
        { key: 'a-org', icon: '🏢', title: 'Manage Basic Units', description: 'Create and manage basic units in your area.', route: '/admin/manage-org' },
        { key: 'a-approvals', icon: '⏳', title: 'Member Approvals', description: 'Review and approve pending member registrations.', route: '/members?status=PENDING_APPROVAL' },
        { key: 'a-members', icon: '👥', title: 'All Members', description: 'Browse and filter members in the area.', route: '/members' },
        { key: 'a-cab', icon: '🏛️', title: 'Assign Cabinet Roles', description: 'Assign office-holders and approve proposals.', route: '/cabinet' },
        { key: 'a-resp', icon: '📋', title: 'Responsibilities', description: 'Area task allocations and tracking.', route: '/admin/responsibilities' },
        { key: 'a-breakdown', icon: '📊', title: 'Basic Unit Breakdown', description: 'Comparative basic unit activity, membership & finance stats.', route: '/admin/breakdown' },
        { key: 'a-reports', icon: '📈', title: 'Reports', description: 'Download PDF and Excel reports for the area.', route: '/admin/reports' },
      ],
    },

    // 6. Generic Administrative Tools / Cabinet Operations
    {
      key: 'admin_tools',
      title: ctx?.unitName ? `${ctx.unitName} · Administrative Tools` : 'Administrative Tools',
      icon: '🛠️',
      show: () => !isSuper && !isCentral && !isProvince && !isDistrict && !isArea && (isCabinet || isHigherAdmin(user) || canInitiateRole(user) || canDecideRole(user) || hasPermission(user, 'APPROVE_MEMBER')),
      items: isFinanceSec ? [
        { key: 'gen-dash', icon: '🏠', title: user?.canViewExecutiveDashboard ? 'Central Dashboard' : 'Dashboard', description: 'Unit Dashboard', route: '/' },
        { key: 'gen-finance', icon: '💰', title: 'Finance', description: 'Unit finance', route: '/finance' },
        { key: 'gen-transfers', icon: '💸', title: 'Fund Transfers', description: 'Unit fund transfers and approvals', route: '/finance/transfers' },
        { key: 'gen-resp', icon: '📋', title: 'My Responsibilities', description: 'Assigned tasks and responsibilities', route: '/admin/responsibilities' },
        ...(ctx?.unitLevel !== 'BASIC_UNIT' ? [{ key: 'gen-breakdown', icon: '📊', title: 'Subordinate Breakdown', description: 'Comparative activity & stats', route: '/admin/breakdown' }] : []),
        { key: 'gen-reports', icon: '📈', title: 'Exports & Reports', description: 'Download PDF and Excel reports', route: '/admin/reports' },
      ] : [
        { key: 'gen-dash', icon: '🏠', title: 'Dashboard', description: 'Unit Dashboard', route: '/' },
        ...(!isSeniorMawin && (isSecretary || isPresident || hasPermission(user, 'MANAGE_MEMBERS')) ? [{ key: 'gen-members', icon: '👥', title: 'Members', description: 'Browse members in your unit', route: '/members' }] : []),
        ...(!isSeniorMawin && (hasPermission(user, 'APPROVE_MEMBER')) ? [{ key: 'gen-approvals', icon: '⏳', title: 'Member Approvals', description: 'Review pending member registrations', route: '/members?status=PENDING_APPROVAL' }] : []),
        { key: 'gen-cab', icon: '🏛️', title: 'Cabinet & Roles', description: 'Cabinet assignments & proposals', route: '/cabinet' },
        { key: 'gen-meetings', icon: '📅', title: 'Meetings', description: 'Unit meetings', route: '/meetings' },
        { key: 'gen-activities', icon: '🚩', title: 'Activities', description: 'Unit activities', route: '/activities' },
        { key: 'gen-resp', icon: '📋', title: 'Responsibilities', description: 'Unit tasks and responsibilities', route: '/admin/responsibilities' },
        ...(canManageFinance(user) || canApproveExpense(user) ? [
          { key: 'gen-finance', icon: '💰', title: 'Finance', description: 'Unit finance', route: '/finance' },
          { key: 'gen-transfers', icon: '💸', title: 'Fund Transfers', description: 'Unit fund transfers and approvals', route: '/finance/transfers' },
        ] : []),
        { key: 'gen-perf', icon: '📈', title: 'Member Performance', description: 'Analyze member performance metrics', route: '/admin/performance' },
        ...(!isSeniorMawin && ctx?.unitLevel !== 'BASIC_UNIT' && hasPermission(user, 'VIEW_UNIT_BREAKDOWN') ? [{ key: 'gen-breakdown', icon: '📊', title: 'Breakdown', description: 'Comparative activity & stats', route: '/admin/breakdown' }] : []),
        { key: 'gen-reports', icon: '📈', title: 'Exports & Reports', description: 'Download PDF and Excel reports', route: '/admin/reports' },
      ],
    },

    // 7. Member Operations
    {
      key: 'member_ops',
      title: 'My Unit Operations',
      icon: '⚡',
      show: () => isMember,
      items: [
        { key: 'm-dash', icon: '🏠', title: 'Dashboard', description: 'My Member Overview & Stats', route: '/' },
        { key: 'm-meetings', icon: '📅', title: 'Meetings', description: 'Unit meetings schedule & minutes', route: '/meetings' },
        { key: 'm-activities', icon: '🎯', title: 'Activities', description: 'Unit activities, events & campaigns', route: '/activities' },
        { key: 'm-responsibilities', icon: '📋', title: 'My Responsibilities', description: 'Assigned tasks, duties & due dates', route: '/admin/responsibilities' },
        { key: 'm-profile', icon: '🪪', title: 'My Profile', description: 'Digital ID card, credentials & unit details', route: '/profile' },
      ],
    },

    // 8. Committee (Central / Sobayi / Zilla / Elaqayi Committee)
    {
      key: 'committee',
      title: isSuper || isCentral || ctx?.unitLevel === 'CENTRAL'
        ? 'Central Committee'
        : ctx?.unitLevel === 'PROVINCE'
          ? 'Sobayi Committee'
          : ctx?.unitLevel === 'DISTRICT'
            ? 'Zilla Committee'
            : 'Elaqayi Committee',
      icon: '👥',
      show: () => ctx?.unitLevel !== 'BASIC_UNIT'
        && !isSuper && !isCentral && !isProvince && !isDistrict && !isArea
        && (isCabinet || isSeniorMawin || isSecretary || isFinanceSec || isPresident),
      items: [
        ...(!isFinanceSec ? [
          { key: 'committee-comp', icon: '👥', title: 'Composition', description: 'Consultative committee roster, cabinet & selective members', route: '/admin/committee' },
          { key: 'committee-meetings', icon: '📅', title: 'Committee Meetings', description: 'Consultative assembly meeting records', route: '/meetings?body=COMMITTEE' },
          { key: 'committee-activities', icon: '🚩', title: 'Committee Activities', description: 'Committee events, gatherings & campaigns', route: '/activities?body=COMMITTEE' },
        ] : []),
        ...(canManageFinance(user) ? [
          { key: 'committee-finance', icon: '💰', title: 'Committee Finance', description: 'Committee donations & expense ledger', route: '/finance?body=COMMITTEE' },
          { key: 'committee-transfers', icon: '💸', title: 'Committee Transfers', description: 'Committee fund transfers & approvals', route: '/finance/transfers?body=COMMITTEE' },
        ] : []),
        { key: 'committee-reports', icon: '📊', title: 'Committee Reports', description: 'Committee reports & data exports', route: '/admin/reports?body=COMMITTEE' },
      ],
    },

    // 9. National Congress (Exclusively Central Level)
    {
      key: 'congress',
      title: 'National Congress',
      icon: '🤝',
      show: () => !isSuper && !isCentral && !isProvince && !isDistrict && !isArea
        && (ctx?.unitLevel === 'CENTRAL' || (!ctx?.unitLevel && isCabinet))
        && isCabinet,
      items: [
        ...(!isFinanceSec ? [
          { key: 'congress-roster', icon: '👥', title: 'Congress Roster', description: 'National Congress composition & member assignments', route: '/admin/congress?unitLevel=CENTRAL&unitId=CENTRAL' },
          { key: 'congress-meetings', icon: '📅', title: 'Congress Meetings', description: 'Schedule and manage National Congress assemblies', route: '/meetings?body=CONGRESS&unitLevel=CENTRAL&unitId=CENTRAL' },
          { key: 'congress-activities', icon: '🚩', title: 'Congress Activities', description: 'Log and monitor National Congress events & campaigns', route: '/activities?body=CONGRESS&unitLevel=CENTRAL&unitId=CENTRAL' },
        ] : []),
        ...(canManageFinance(user) ? [{ key: 'congress-finance', icon: '💰', title: 'Congress Finance', description: 'Donations, expenses & funds for National Congress', route: '/finance?body=CONGRESS&unitLevel=CENTRAL&unitId=CENTRAL' }] : []),
        { key: 'congress-reports', icon: '📊', title: 'Congress Reports', description: 'Performance and financial reports for Congress', route: '/admin/reports?body=CONGRESS&unitLevel=CENTRAL&unitId=CENTRAL' },
      ],
    },

    // 10. Jirga (Sobayi Jirga for Province / Qomi Jirga for Central)
    {
      key: 'jirga',
      title: (ctx?.unitLevel === 'CENTRAL' || (!ctx?.unitLevel && (isSuper || isCentral))) ? 'Qomi Jirga' : 'Sobayi Jirga',
      icon: '⚖️',
      show: () => {
        if (isSuper || isCentral || isProvince || isDistrict || isArea) return false;
        const level = ctx?.unitLevel;
        if (level !== 'CENTRAL' && level !== 'PROVINCE') return false;
        return isCabinet;
      },
      items: [
        { key: 'jirga-comp', icon: '⚖️', title: 'Composition', description: (ctx?.unitLevel === 'CENTRAL' || isSuper || isCentral) ? 'Central Jirga members & elders assembly' : 'Sobayi Jirga members & elders assembly', route: ctx?.unitLevel === 'CENTRAL' ? '/admin/jirga?unitLevel=CENTRAL&unitId=CENTRAL' : (ctx?.unitLevel === 'PROVINCE' ? `/admin/jirga?unitLevel=PROVINCE&unitId=${ctx.unitId}` : (isSuper || isCentral ? '/admin/jirga?unitLevel=CENTRAL&unitId=CENTRAL' : '/admin/jirga')) },
        ...(!isFinanceSec ? [
          { key: 'jirga-meetings', icon: '📅', title: 'Jirga Meetings', description: 'Jirga assembly meeting records', route: ctx?.unitLevel === 'CENTRAL' ? '/meetings?body=JIRGA&unitLevel=CENTRAL&unitId=CENTRAL' : (ctx?.unitLevel === 'PROVINCE' ? `/meetings?body=JIRGA&unitLevel=PROVINCE&unitId=${ctx.unitId}` : (isSuper || isCentral ? '/meetings?body=JIRGA&unitLevel=CENTRAL&unitId=CENTRAL' : '/meetings?body=JIRGA')) },
          { key: 'jirga-activities', icon: '🚩', title: 'Jirga Activities', description: 'Jirga activities, gatherings & events', route: ctx?.unitLevel === 'CENTRAL' ? '/activities?body=JIRGA&unitLevel=CENTRAL&unitId=CENTRAL' : (ctx?.unitLevel === 'PROVINCE' ? `/activities?body=JIRGA&unitLevel=PROVINCE&unitId=${ctx.unitId}` : (isSuper || isCentral ? '/activities?body=JIRGA&unitLevel=CENTRAL&unitId=CENTRAL' : '/activities?body=JIRGA')) },
        ] : []),
        ...(canManageFinance(user) ? [
          { key: 'jirga-finance', icon: '💰', title: 'Jirga Finance', description: 'Jirga donations & expenses ledger', route: ctx?.unitLevel === 'CENTRAL' ? '/finance?body=JIRGA&unitLevel=CENTRAL&unitId=CENTRAL' : (ctx?.unitLevel === 'PROVINCE' ? `/finance?body=JIRGA&unitLevel=PROVINCE&unitId=${ctx.unitId}` : (isSuper || isCentral ? '/finance?body=JIRGA&unitLevel=CENTRAL&unitId=CENTRAL' : '/finance?body=JIRGA')) },
          { key: 'jirga-transfers', icon: '💸', title: 'Jirga Transfers', description: 'Jirga fund transfers', route: ctx?.unitLevel === 'CENTRAL' ? '/finance/transfers?body=JIRGA&unitLevel=CENTRAL&unitId=CENTRAL' : (ctx?.unitLevel === 'PROVINCE' ? `/finance/transfers?body=JIRGA&unitLevel=PROVINCE&unitId=${ctx.unitId}` : (isSuper || isCentral ? '/finance/transfers?body=JIRGA&unitLevel=CENTRAL&unitId=CENTRAL' : '/finance/transfers?body=JIRGA')) },
        ] : []),
        { key: 'jirga-reports', icon: '📊', title: 'Jirga Reports', description: 'Jirga reports & exports', route: ctx?.unitLevel === 'CENTRAL' ? '/admin/reports?body=JIRGA&unitLevel=CENTRAL&unitId=CENTRAL' : (ctx?.unitLevel === 'PROVINCE' ? `/admin/reports?body=JIRGA&unitLevel=PROVINCE&unitId=${ctx.unitId}` : (isSuper || isCentral ? '/admin/reports?body=JIRGA&unitLevel=CENTRAL&unitId=CENTRAL' : '/admin/reports?body=JIRGA')) },
      ],
    },

    // 11. Communication (Always available)
    {
      key: 'communication',
      title: 'Communication',
      icon: '📢',
      show: () => true,
      items: [
        { key: 'notifications', icon: '🔔', title: 'Notifications', description: 'System alerts and updates', route: '/notifications' },
        { key: 'announcements', icon: '📢', title: 'Announcements', description: 'Org-wide broadcasts & direct messages', route: '/announcements' },
      ],
    },
  ];

  const visibleSections = sections.filter((s) => s.show() && s.items.length > 0);

  const [openSections, setOpenSections] = useState({
    god_mode: true,
    user_manager: true,
    unit_mgmt: true,
    event_manager: true,
    settings: true,
    central_tier: true,
    my_org: true,
    my_province: true,
    my_district: true,
    my_area: true,
    admin_tools: true,
    member_ops: true,
    committee: true,
    congress: false,
    jirga: true,
    communication: true,
  });

  function toggleSection(key) {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function setAllSections(open) {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    const updated = {};
    visibleSections.forEach((s) => {
      updated[s.key] = open;
    });
    setOpenSections(updated);
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Admin Header Banner */}
        <View style={styles.heroRow}>
          <View style={styles.heroHeader}>
            <View style={styles.heroIconBox}>
              <Text style={styles.heroIcon}>🛡️</Text>
            </View>
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

        {/* Section Accordion Controls */}
        <View style={styles.accordionControlsRow}>
          <Text style={styles.sectionsHeaderLabel}>SECTIONS & MODULES</Text>
          <View style={styles.accordionBtns}>
            <TouchableOpacity onPress={() => setAllSections(true)} style={styles.miniBtn}>
              <Text style={styles.miniBtnText}>Expand all</Text>
            </TouchableOpacity>
            <Text style={styles.miniDivider}>·</Text>
            <TouchableOpacity onPress={() => setAllSections(false)} style={styles.miniBtn}>
              <Text style={styles.miniBtnText}>Collapse all</Text>
            </TouchableOpacity>
          </View>
        </View>

        {visibleSections.length === 0 && (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No administrative tools available for your current role.</Text>
          </View>
        )}

        {/* Sections List */}
        {visibleSections.map((section) => {
          const isOpen = !!openSections[section.key];
          return (
            <View key={section.key} style={styles.sectionContainer}>
              <TouchableOpacity
                style={[styles.sectionHeaderBtn, isOpen && styles.sectionHeaderBtnOpen]}
                onPress={() => toggleSection(section.key)}
                activeOpacity={0.7}
              >
                <View style={styles.sectionHeaderLeft}>
                  <Text style={styles.sectionHeaderIcon}>{section.icon}</Text>
                  <Text style={styles.sectionHeaderTitle}>{section.title}</Text>
                  <View style={styles.countBadge}>
                    <Text style={styles.countBadgeText}>{section.items.length}</Text>
                  </View>
                </View>
                <Ionicons
                  name={isOpen ? 'chevron-down' : 'chevron-forward'}
                  size={18}
                  color={isOpen ? Colors.primary : Colors.textMuted}
                />
              </TouchableOpacity>
              {isOpen && (
                <View style={styles.grid}>
                  {section.items.map((card) => (
                    <TouchableOpacity
                      key={card.key}
                      style={styles.card}
                      onPress={() => router.push(card.route)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.cardTop}>
                        <View style={styles.cardIconBox}>
                          <Text style={styles.cardIcon}>{card.icon}</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
                      </View>
                      <Text style={styles.cardTitle} numberOfLines={2}>{card.title}</Text>
                      <Text style={styles.cardDesc} numberOfLines={2}>
                        {card.description}
                      </Text>
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
  safe: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    padding: Spacing.md,
    paddingBottom: 40,
  },
  heroRow: {
    backgroundColor: '#1e3a8a',
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    shadowColor: '#1e3a8a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  heroHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: Spacing.sm,
  },
  heroIconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroIcon: {
    fontSize: 22,
  },
  heroText: {
    flex: 1,
  },
  heroTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.3,
  },
  heroSub: {
    fontSize: FontSize.sm,
    color: 'rgba(255,255,255,0.85)',
    fontWeight: '600',
    marginTop: 2,
  },
  heroTagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.15)',
    paddingTop: 8,
    marginTop: 4,
  },
  accordionControlsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
    paddingHorizontal: 2,
  },
  sectionsHeaderLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.textMuted,
    letterSpacing: 0.8,
  },
  accordionBtns: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  miniBtn: {
    paddingVertical: 2,
    paddingHorizontal: 4,
  },
  miniBtnText: {
    fontSize: FontSize.xs,
    color: Colors.primary,
    fontWeight: '700',
  },
  miniDivider: {
    color: Colors.textMuted,
  },
  sectionContainer: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    marginBottom: Spacing.sm,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.sm,
  },
  sectionHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.md,
    backgroundColor: Colors.surface,
  },
  sectionHeaderBtnOpen: {
    backgroundColor: Colors.surfaceAlt,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  sectionHeaderIcon: {
    fontSize: 16,
  },
  sectionHeaderTitle: {
    fontSize: FontSize.base,
    fontWeight: '800',
    color: Colors.text,
  },
  countBadge: {
    backgroundColor: 'rgba(30, 64, 175, 0.1)',
    paddingVertical: 2,
    paddingHorizontal: 7,
    borderRadius: Radius.pill,
  },
  countBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.primary,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    padding: Spacing.sm,
    backgroundColor: '#f8fafc',
    gap: 8,
  },
  card: {
    width: '48.5%',
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    minHeight: 110,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardIconBox: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardIcon: {
    fontSize: 18,
  },
  cardTitle: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 3,
    lineHeight: 18,
  },
  cardDesc: {
    fontSize: 11,
    color: Colors.textMuted,
    lineHeight: 15,
  },
  empty: {
    padding: Spacing.xl,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
  },
});
