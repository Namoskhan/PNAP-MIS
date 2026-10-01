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
import { useLanguage } from '../../../src/context/LanguageContext';
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
  const { t, isRTL } = useLanguage();
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
    ? t('roles.SUPER_ADMIN', 'Super Admin')
    : isCentral
      ? t('roles.CENTRAL_ADMIN', 'Central Admin')
      : isProvince
        ? t('roles.PROVINCE_ADMIN', 'Province Admin')
        : isDistrict
          ? t('roles.DISTRICT_ADMIN', 'District Admin')
          : isArea
            ? t('roles.AREA_ADMIN', 'Area Admin')
            : isMember
              ? t('roles.MEMBER', 'Member')
              : (t(`roles.${user?.roles?.[0]}`, roleLabel(user, user?.roles?.[0])) || t('nav.cabinet', 'Cabinet'));

  const unitDisplayName = isCentral || isSuper
    ? t('profile.centralOrg', 'PKNAP Central')
    : isMember
      ? (ctx?.unitName ? `${t('units.basicUnit', 'Basic Unit')} · ${ctx.unitName}` : t('nav.memberOps', 'My Unit Operations'))
      : (ctx?.unitName || t('admin.controlCenter', 'Administrative Control Center'));

  const sections = [
    // 1. Super Administration
    {
      key: 'super_admin',
      title: t('nav.superAdmin', 'Super Administration'),
      icon: '👑',
      show: () => isSuper,
      items: [
        { key: 'dashboard', icon: '🏠', title: t('nav.dashboard', 'Dashboard'), description: t('admin.descCentralCommand', 'Central Command Center'), route: '/' },
        { key: 'central-admins', icon: '🏛️', title: t('nav.centralAdmins', 'Central Admins'), description: t('admin.descCentralAdmins', 'Manage Central Admin users, credentials, and access.'), route: '/admin/users?role=CENTRAL_ADMIN' },
        { key: 'org', icon: '🏢', title: t('nav.manageUnits', 'Manage Units'), description: t('admin.descManageUnits', 'Create and manage the administrative hierarchy.'), route: '/admin/manage-org' },
        { key: 'members', icon: '👥', title: t('nav.allMembers', 'All Members'), description: t('admin.descAllMembers', 'Browse, filter, and register members globally.'), route: '/members' },
        { key: 'pending-approvals', icon: '⏳', title: t('nav.pendingRoleApprovals', 'Pending Role Approvals'), description: t('admin.descPendingApprovals', 'Approve or reject roles.'), route: '/admin/pending-approvals' },
        { key: 'finance-overview', icon: '💰', title: t('nav.financeOverview', 'Finance Overview'), description: t('admin.descFinanceOverview', 'System-wide finance stats.'), route: '/admin/finance-overview' },
      ],
    },
    {
      key: 'user_manager',
      title: t('nav.userManager', 'User Manager'),
      icon: '👥',
      show: () => isSuper,
      items: [
        { key: 'roles', icon: '🛡️', title: t('nav.roleManagement', 'Role Management'), description: t('admin.descRoles', 'Define system roles and configure permissions.'), route: '/admin/roles' },
        { key: 'users', icon: '👤', title: t('nav.allUsers', 'All Users & Credentials'), description: t('admin.descUsers', 'Manage root administrative login credentials.'), route: '/admin/users' },
        { key: 'audit', icon: '📜', title: t('nav.auditLogs', 'Audit Log'), description: t('admin.descAudit', 'Immutable stream of privileged write and admin actions.'), route: '/admin/audit' },
      ],
    },
    {
      key: 'unit_mgmt',
      title: t('nav.unitManagementEngine', 'Unit Management Engine'),
      icon: '🏢',
      show: () => isSuper || hasPermission(user, 'MANAGE_UNIT_CONFIG') || hasPermission(user, 'VIEW_UNIT_CONFIG'),
      items: [
        { key: 'unit-mgmt', icon: '🏗️', title: t('nav.unitOverview', 'Overview'), description: t('admin.descUnitOverview', 'Unit Management Overview'), route: '/admin/units' },
        { key: 'unit-tiers', icon: '🏢', title: t('nav.unitTiers', 'Unit Type Manager'), description: t('admin.descUnitTiers', 'Configure tier levels'), route: '/admin/units/tier-configs' },
        { key: 'unit-cabinet', icon: '🏛️', title: t('nav.cabinetTemplates', 'Cabinet Structure'), description: t('admin.descCabinetTemplates', 'Configure cabinet templates'), route: '/admin/units/cabinet-templates' },
        { key: 'unit-policies', icon: '📋', title: t('nav.unitPolicies', 'Unit Policies'), description: t('admin.descUnitPolicies', 'Configure unit policies'), route: '/admin/units/policies' },
        { key: 'unit-workflows', icon: '🔄', title: t('nav.workflows', 'Workflow Manager'), description: t('admin.descWorkflows', 'Manage approval workflows'), route: '/admin/units/workflows' },
        { key: 'unit-resp', icon: '✅', title: t('nav.taskTemplates', 'Responsibility Manager'), description: t('admin.descTaskTemplates', 'Configure task templates'), route: '/admin/units/responsibility-templates' },
        { key: 'unit-perf', icon: '📈', title: t('nav.performanceRules', 'Performance Rules'), description: t('admin.descPerformanceRules', 'Configure KPI scoring rules'), route: '/admin/units/performance-rulesets' },
        { key: 'unit-reports', icon: '📑', title: t('nav.reportTemplates', 'Report Templates'), description: t('admin.descReportTemplates', 'Configure PDF report templates'), route: '/admin/units/report-templates' },
      ],
    },
    {
      key: 'event_manager',
      title: t('nav.eventManager', 'Event Manager'),
      icon: '📁',
      show: () => isSuper || hasPermission(user, 'MANAGE_EVENT_CONFIG') || hasPermission(user, 'VIEW_EVENT_CONFIG'),
      items: [
        { key: 'event-types-meetings', icon: '📅', title: t('nav.meetingTypes', 'Meeting Types'), description: t('admin.descMeetingTypes', 'Configure meeting type taxonomy and rules.'), route: '/admin/event-types/meetings' },
        { key: 'event-types-activities', icon: '🚩', title: t('nav.activityTypes', 'Activity Types'), description: t('admin.descActivityTypes', 'Configure activity type taxonomy and rules.'), route: '/admin/event-types/activities' },
        { key: 'event-types-fields', icon: '📝', title: t('nav.fieldLibrary', 'Field Library'), description: t('admin.descFieldLibrary', 'Configure custom fields.'), route: '/admin/events/fields' },
      ],
    },
    {
      key: 'settings',
      title: t('nav.settingsAndIdentity', 'Settings & Identity'),
      icon: '⚙️',
      show: () => isSuper || hasPermission(user, 'VIEW_SYSTEM_BRANDING') || hasPermission(user, 'MANAGE_SYSTEM_BRANDING'),
      items: [
        { key: 'settings-brand', icon: '⚙️', title: t('nav.brandingOverview', 'Branding Overview'), description: t('admin.descBrandingOverview', 'View current system identity and branding configuration.'), route: '/admin/settings' },
        { key: 'settings-id', icon: '🆔', title: t('nav.systemIdentity', 'System Identity'), description: t('admin.descSystemIdentity', 'System name and details'), route: '/admin/settings/identity' },
        { key: 'settings-logo', icon: '🖼️', title: t('nav.logoManager', 'Logo Manager'), description: t('admin.descLogoManager', 'Manage application logos'), route: '/admin/settings/logos' },
        { key: 'settings-theme', icon: '🎨', title: t('nav.themeManager', 'Theme Manager'), description: t('admin.descThemeManager', 'Color themes and UI styles'), route: '/admin/settings/theme' },
        { key: 'settings-type', icon: 'Aa', title: t('nav.typography', 'Typography'), description: t('admin.descTypography', 'Font configurations'), route: '/admin/settings/typography' },
        { key: 'settings-dash', icon: '🖥️', title: t('nav.dashboardSettings', 'UI Preferences'), description: t('admin.descDashboardSettings', 'Dashboard customizations'), route: '/admin/settings/dashboard' },
        { key: 'settings-reports', icon: '📊', title: t('nav.reportBranding', 'Report Branding'), description: t('admin.descReportBranding', 'Report styles and watermarks'), route: '/admin/settings/reports' },
        { key: 'settings-login', icon: '🔐', title: t('nav.loginSettings', 'Login Customization'), description: t('admin.descLoginSettings', 'Login page look and feel'), route: '/admin/settings/login' },
        { key: 'settings-history', icon: '🕒', title: t('nav.settingsHistory', 'Settings History'), description: t('admin.descSettingsHistory', 'Changelog of settings'), route: '/admin/settings/history' },
      ],
    },
    {
      key: 'central_tier',
      title: t('nav.centralTier', 'Central Tier'),
      icon: '🌐',
      show: () => isSuper,
      items: [
        { key: 'ct-dash', icon: '🏠', title: t('nav.centralDashboard', 'Central Dashboard'), description: t('admin.descCentralDashboard', 'Central Command & Analytics Overview'), route: '/' },
        { key: 'ct-cab', icon: '🏛️', title: t('nav.centralCabinet', 'Central Cabinet'), description: t('admin.descCentralCabinet', 'Cabinet appointments and office-holders'), route: '/cabinet' },
        { key: 'ct-meetings', icon: '📅', title: t('nav.centralMeetings', 'Central Meetings'), description: t('admin.descCentralMeetings', 'Central executive assemblies & meeting records'), route: '/meetings?unitLevel=CENTRAL&unitId=CENTRAL' },
        { key: 'ct-activities', icon: '🚩', title: t('nav.centralActivities', 'Central Activities'), description: t('admin.descCentralActivities', 'Central events, campaigns and gatherings'), route: '/activities?unitLevel=CENTRAL&unitId=CENTRAL' },
        { key: 'ct-resp', icon: '📋', title: t('nav.centralResponsibilities', 'Central Responsibilities'), description: t('admin.descCentralResponsibilities', 'Central task allocations and monitoring'), route: '/admin/responsibilities?unitLevel=CENTRAL&unitId=CENTRAL' },
        { key: 'ct-finance', icon: '💰', title: t('nav.centralFinance', 'Central Finance'), description: t('admin.descCentralFinance', 'Central funds, donations and expenses ledger'), route: '/finance?unitLevel=CENTRAL&unitId=CENTRAL' },
        { key: 'ct-transfers', icon: '💸', title: t('nav.centralTransfers', 'Central Fund Transfers'), description: t('admin.descCentralTransfers', 'Central fund transfers and approvals'), route: '/finance/transfers?unitLevel=CENTRAL&unitId=CENTRAL' },
        { key: 'ct-reports', icon: '📈', title: t('nav.centralReports', 'Central Reports'), description: t('admin.descCentralReports', 'Generate and download Central PDF and Excel reports'), route: '/admin/reports?unitLevel=CENTRAL&unitId=CENTRAL' },
      ],
    },

    // 2. Central Admin: My Organization
    {
      key: 'my_org',
      title: t('nav.myOrganization', 'My Organization'),
      icon: '🏛️',
      show: () => isCentral,
      items: [
        { key: 'c-dash', icon: '🏠', title: t('nav.dashboard', 'Dashboard'), description: t('admin.descCentralCommand', 'Central Command & Analytics'), route: '/' },
        { key: 'c-org', icon: '🏢', title: t('nav.manageProvinces', 'Manage Provinces'), description: t('admin.descManageProvinces', 'Create and manage province tier units.'), route: '/admin/manage-org' },
        { key: 'c-members', icon: '👥', title: t('nav.provinceMembers', 'Province Members'), description: t('admin.descProvinceMembers', 'Browse and filter members across provinces.'), route: '/members' },
        { key: 'c-cab', icon: '🏛️', title: t('nav.assignProvinceCabinet', 'Assign Province Cabinet Roles'), description: t('admin.descAssignProvinceCabinet', 'Appoint provincial office-holders and review cabinet.'), route: '/cabinet' },
        { key: 'c-resp', icon: '📋', title: t('nav.responsibilities', 'Responsibilities'), description: t('admin.descCentralTasks', 'Central task allocations and monitoring.'), route: '/admin/responsibilities?unitLevel=CENTRAL&unitId=CENTRAL' },
        { key: 'c-breakdown', icon: '📊', title: t('nav.provinceBreakdown', 'Province Breakdown'), description: t('admin.descProvinceBreakdown', 'Comparative provincial activity, membership & finance stats.'), route: '/admin/breakdown' },
        { key: 'c-reports', icon: '📈', title: t('nav.reports', 'Reports'), description: t('admin.descCentralPdfReports', 'Download PDF and Excel reports for Central.'), route: '/admin/reports?unitLevel=CENTRAL&unitId=CENTRAL' },
      ],
    },

    // 3. Province Admin: My Province
    {
      key: 'my_province',
      title: t('nav.myProvince', 'My Province'),
      icon: '🏢',
      show: () => isProvince,
      items: [
        { key: 'p-dash', icon: '🏠', title: t('nav.dashboard', 'Dashboard'), description: t('admin.descUnitDashboard', 'Provincial Command & Unit Analytics'), route: '/' },
        { key: 'p-org', icon: '🏢', title: t('nav.manageDistricts', 'Manage Districts'), description: t('admin.descManageDistricts', 'Create and manage district tier units.'), route: '/admin/manage-org' },
        { key: 'p-members', icon: '👥', title: t('nav.allProvinceMembers', 'All Province Members'), description: t('admin.descAllMembers', 'Browse, search, and manage all provincial members.'), route: '/members' },
        { key: 'p-cab', icon: '🏛️', title: t('nav.assignDistrictCabinet', 'Assign District Cabinet Roles'), description: t('admin.descAssignCabinetRoles', 'Appoint district office-holders and review cabinet.'), route: '/cabinet' },
        { key: 'p-resp', icon: '📋', title: t('nav.responsibilities', 'Responsibilities'), description: t('admin.descResponsibilities', 'Provincial task allocations and tracking.'), route: '/admin/responsibilities' },
        { key: 'p-breakdown', icon: '📊', title: t('nav.districtBreakdown', 'District Breakdown'), description: t('admin.descDistrictBreakdown', 'Comparative district activity, membership & finance stats.'), route: '/admin/breakdown' },
        { key: 'p-reports', icon: '📈', title: t('nav.reports', 'Reports'), description: t('admin.descReports', 'Generate and download PDF and Excel summary packages.'), route: '/admin/reports' },
      ],
    },

    // 4. District Admin: My District
    {
      key: 'my_district',
      title: t('nav.myDistrict', 'My District'),
      icon: '🏢',
      show: () => isDistrict || hasRole(user, 'DISTRICT_ADMIN'),
      items: [
        { key: 'd-dash', icon: '🏠', title: t('nav.dashboard', 'Dashboard'), description: t('admin.descUnitDashboard', 'District Command & Unit Analytics'), route: '/' },
        { key: 'd-org', icon: '🏢', title: t('nav.manageAreas', 'Manage Areas'), description: t('admin.descManageAreas', 'Create and manage area tier units in your district.'), route: '/admin/manage-org' },
        { key: 'd-members', icon: '👥', title: t('nav.members', 'Members'), description: t('admin.descBrowseUnitMembers', 'Browse and filter members in the district.'), route: '/members' },
        { key: 'd-cab', icon: '🏛️', title: t('nav.assignAreaCabinet', 'Assign Area Cabinet Roles'), description: t('admin.descAssignCabinetRoles', 'Appoint area office-holders and review cabinet.'), route: '/cabinet' },
        { key: 'd-resp', icon: '📋', title: t('nav.responsibilities', 'Responsibilities'), description: t('admin.descResponsibilities', 'District task allocations and monitoring.'), route: '/admin/responsibilities' },
        { key: 'd-breakdown', icon: '📊', title: t('nav.areaBreakdown', 'Area Breakdown'), description: t('admin.descAreaBreakdown', 'Comparative area activity, membership & finance stats.'), route: '/admin/breakdown' },
        { key: 'd-reports', icon: '📈', title: t('nav.reports', 'Reports'), description: t('admin.descReports', 'Download PDF and Excel reports for the district.'), route: '/admin/reports' },
      ],
    },

    // 5. Area Admin: My Area
    {
      key: 'my_area',
      title: t('nav.myArea', 'My Area'),
      icon: '🏢',
      show: () => isArea || hasRole(user, 'AREA_ADMIN'),
      items: [
        { key: 'a-dash', icon: '🏠', title: t('nav.dashboard', 'Dashboard'), description: t('admin.descUnitDashboard', 'Area Command & Analytics'), route: '/' },
        { key: 'a-org', icon: '🏢', title: t('nav.manageBasicUnits', 'Manage Basic Units'), description: t('admin.descManageBasicUnits', 'Create and manage basic units in your area.'), route: '/admin/manage-org' },
        { key: 'a-approvals', icon: '⏳', title: t('nav.memberApprovals', 'Member Approvals'), description: t('admin.descMemberApprovals', 'Review and approve pending member registrations.'), route: '/members?status=PENDING_APPROVAL' },
        { key: 'a-members', icon: '👥', title: t('nav.allMembers', 'All Members'), description: t('admin.descBrowseUnitMembers', 'Browse and filter members in the area.'), route: '/members' },
        { key: 'a-cab', icon: '🏛️', title: t('nav.assignCabinetRoles', 'Assign Cabinet Roles'), description: t('admin.descAssignCabinetRoles', 'Assign office-holders and approve proposals.'), route: '/cabinet' },
        { key: 'a-resp', icon: '📋', title: t('nav.responsibilities', 'Responsibilities'), description: t('admin.descResponsibilities', 'Area task allocations and tracking.'), route: '/admin/responsibilities' },
        { key: 'a-breakdown', icon: '📊', title: t('nav.basicUnitBreakdown', 'Basic Unit Breakdown'), description: t('admin.descBasicUnitBreakdown', 'Comparative basic unit activity, membership & finance stats.'), route: '/admin/breakdown' },
        { key: 'a-reports', icon: '📈', title: t('nav.reports', 'Reports'), description: t('admin.descReports', 'Download PDF and Excel reports for the area.'), route: '/admin/reports' },
      ],
    },

    // 6. Generic Administrative Tools / Cabinet Operations
    {
      key: 'admin_tools',
      title: ctx?.unitName ? `${ctx.unitName} · ${t('nav.adminTools', 'Administrative Tools')}` : t('nav.adminTools', 'Administrative Tools'),
      icon: '🛠️',
      show: () => !isSuper && !isCentral && !isProvince && !isDistrict && !isArea && (isCabinet || isHigherAdmin(user) || canInitiateRole(user) || canDecideRole(user) || hasPermission(user, 'APPROVE_MEMBER')),
      items: isFinanceSec ? [
        { key: 'gen-dash', icon: '🏠', title: user?.canViewExecutiveDashboard ? t('nav.centralDashboard', 'Central Dashboard') : t('nav.dashboard', 'Dashboard'), description: t('admin.descUnitDashboard', 'Unit Dashboard'), route: '/' },
        { key: 'gen-finance', icon: '💰', title: t('nav.finance', 'Finance'), description: t('admin.descUnitFinance', 'Unit finance'), route: '/finance' },
        { key: 'gen-transfers', icon: '💸', title: t('nav.fundTransfers', 'Fund Transfers'), description: t('admin.descUnitTransfers', 'Unit fund transfers and approvals'), route: '/finance/transfers' },
        { key: 'gen-resp', icon: '📋', title: t('nav.myResponsibilities', 'My Responsibilities'), description: t('admin.descMyResponsibilities', 'Assigned tasks and responsibilities'), route: '/admin/responsibilities' },
        ...(ctx?.unitLevel !== 'BASIC_UNIT' ? [{ key: 'gen-breakdown', icon: '📊', title: t('nav.subordinateBreakdown', 'Subordinate Breakdown'), description: t('admin.descSubordinateBreakdown', 'Comparative activity & stats'), route: '/admin/breakdown' }] : []),
        { key: 'gen-reports', icon: '📈', title: t('nav.reports', 'Exports & Reports'), description: t('admin.descExportsReports', 'Download PDF and Excel reports'), route: '/admin/reports' },
      ] : [
        { key: 'gen-dash', icon: '🏠', title: t('nav.dashboard', 'Dashboard'), description: t('admin.descUnitDashboard', 'Unit Dashboard'), route: '/' },
        ...(!isSeniorMawin && (isSecretary || isPresident || hasPermission(user, 'MANAGE_MEMBERS')) ? [{ key: 'gen-members', icon: '👥', title: t('nav.members', 'Members'), description: t('admin.descBrowseUnitMembers', 'Browse members in your unit'), route: '/members' }] : []),
        ...(!isSeniorMawin && (hasPermission(user, 'APPROVE_MEMBER')) ? [{ key: 'gen-approvals', icon: '⏳', title: t('nav.memberApprovals', 'Member Approvals'), description: t('admin.descReviewPendingMembers', 'Review pending member registrations'), route: '/members?status=PENDING_APPROVAL' }] : []),
        { key: 'gen-cab', icon: '🏛️', title: t('nav.cabinetAndRoles', 'Cabinet & Roles'), description: t('admin.descCabinetRoles', 'Cabinet assignments & proposals'), route: '/cabinet' },
        { key: 'gen-meetings', icon: '📅', title: t('nav.meetings', 'Meetings'), description: t('admin.descUnitMeetings', 'Unit meetings'), route: '/meetings' },
        { key: 'gen-activities', icon: '🚩', title: t('nav.activities', 'Activities'), description: t('admin.descUnitActivities', 'Unit activities'), route: '/activities' },
        { key: 'gen-resp', icon: '📋', title: t('nav.responsibilities', 'Responsibilities'), description: t('admin.descUnitTasks', 'Unit tasks and responsibilities'), route: '/admin/responsibilities' },
        ...(canManageFinance(user) || canApproveExpense(user) ? [
          { key: 'gen-finance', icon: '💰', title: t('nav.finance', 'Finance'), description: t('admin.descUnitFinance', 'Unit finance'), route: '/finance' },
          { key: 'gen-transfers', icon: '💸', title: t('nav.fundTransfers', 'Fund Transfers'), description: t('admin.descUnitTransfers', 'Unit fund transfers and approvals'), route: '/finance/transfers' },
        ] : []),
        { key: 'gen-perf', icon: '📈', title: t('nav.memberPerformance', 'Member Performance'), description: t('admin.descMemberPerfMetrics', 'Analyze member performance metrics'), route: '/admin/performance' },
        ...(!isSeniorMawin && ctx?.unitLevel !== 'BASIC_UNIT' && hasPermission(user, 'VIEW_UNIT_BREAKDOWN') ? [{ key: 'gen-breakdown', icon: '📊', title: t('nav.breakdown', 'Breakdown'), description: t('admin.descSubordinateBreakdown', 'Comparative activity & stats'), route: '/admin/breakdown' }] : []),
        { key: 'gen-reports', icon: '📈', title: t('nav.reports', 'Exports & Reports'), description: t('admin.descExportsReports', 'Download PDF and Excel reports'), route: '/admin/reports' },
      ],
    },

    // 7. Member Operations
    {
      key: 'member_ops',
      title: t('nav.memberOps', 'My Unit Operations'),
      icon: '⚡',
      show: () => isMember,
      items: [
        { key: 'm-dash', icon: '🏠', title: t('nav.dashboard', 'Dashboard'), description: t('admin.descMyMemberOverview', 'My Member Overview & Stats'), route: '/' },
        { key: 'm-meetings', icon: '📅', title: t('nav.meetings', 'Meetings'), description: t('admin.descUnitMeetingsSchedule', 'Unit meetings schedule & minutes'), route: '/meetings' },
        { key: 'm-activities', icon: '🎯', title: t('nav.activities', 'Activities'), description: t('admin.descUnitActivitiesEvents', 'Unit activities, events & campaigns'), route: '/activities' },
        { key: 'm-responsibilities', icon: '📋', title: t('nav.myResponsibilities', 'My Responsibilities'), description: t('admin.descAssignedTasksDuties', 'Assigned tasks, duties & due dates'), route: '/admin/responsibilities' },
        { key: 'm-profile', icon: '🪪', title: t('nav.myProfile', 'My Profile'), description: t('admin.descMyProfileDetails', 'Digital ID card, credentials & unit details'), route: '/profile' },
      ],
    },

    // 8. Committee (Central / Sobayi / Zilla / Elaqayi Committee)
    {
      key: 'committee',
      title: isSuper || isCentral || ctx?.unitLevel === 'CENTRAL'
        ? t('units.centralCommittee', 'Central Committee')
        : ctx?.unitLevel === 'PROVINCE'
          ? t('units.sobayiCommittee', 'Sobayi Committee')
          : ctx?.unitLevel === 'DISTRICT'
            ? t('units.zillaCommittee', 'Zilla Committee')
            : t('units.elaqayiCommittee', 'Elaqayi Committee'),
      icon: '👥',
      show: () => ctx?.unitLevel !== 'BASIC_UNIT'
        && !isSuper && !isCentral && !isProvince && !isDistrict && !isArea
        && (isCabinet || isSeniorMawin || isSecretary || isFinanceSec || isPresident),
      items: [
        ...(!isFinanceSec ? [
          { key: 'committee-comp', icon: '👥', title: t('nav.composition', 'Composition'), description: t('admin.descCommitteeRoster', 'Consultative committee roster, cabinet & selective members'), route: '/admin/committee' },
          { key: 'committee-meetings', icon: '📅', title: t('nav.committeeMeetings', 'Committee Meetings'), description: t('admin.descCommitteeMeetings', 'Consultative assembly meeting records'), route: '/meetings?body=COMMITTEE' },
          { key: 'committee-activities', icon: '🚩', title: t('nav.committeeActivities', 'Committee Activities'), description: t('admin.descCommitteeActivities', 'Committee events, gatherings & campaigns'), route: '/activities?body=COMMITTEE' },
        ] : []),
        ...(canManageFinance(user) ? [
          { key: 'committee-finance', icon: '💰', title: t('nav.committeeFinance', 'Committee Finance'), description: t('admin.descCommitteeFinance', 'Committee donations & expense ledger'), route: '/finance?body=COMMITTEE' },
          { key: 'committee-transfers', icon: '💸', title: t('nav.committeeTransfers', 'Committee Transfers'), description: t('admin.descCommitteeTransfers', 'Committee fund transfers & approvals'), route: '/finance/transfers?body=COMMITTEE' },
        ] : []),
        { key: 'committee-reports', icon: '📊', title: t('nav.committeeReports', 'Committee Reports'), description: t('admin.descCommitteeReports', 'Committee reports & data exports'), route: '/admin/reports?body=COMMITTEE' },
      ],
    },

    // 9. National Congress (Exclusively Central Level)
    {
      key: 'congress',
      title: t('nav.nationalCongress', 'National Congress'),
      icon: '🤝',
      show: () => !isSuper && !isCentral && !isProvince && !isDistrict && !isArea
        && (ctx?.unitLevel === 'CENTRAL' || (!ctx?.unitLevel && isCabinet))
        && isCabinet,
      items: [
        ...(!isFinanceSec ? [
          { key: 'congress-roster', icon: '👥', title: t('nav.congressRoster', 'Congress Roster'), description: t('admin.descCongressRoster', 'National Congress composition & member assignments'), route: '/admin/congress?unitLevel=CENTRAL&unitId=CENTRAL' },
          { key: 'congress-meetings', icon: '📅', title: t('nav.congressMeetings', 'Congress Meetings'), description: t('admin.descCongressMeetings', 'Schedule and manage National Congress assemblies'), route: '/meetings?body=CONGRESS&unitLevel=CENTRAL&unitId=CENTRAL' },
          { key: 'congress-activities', icon: '🚩', title: t('nav.congressActivities', 'Congress Activities'), description: t('admin.descCongressActivities', 'Log and monitor National Congress events & campaigns'), route: '/activities?body=CONGRESS&unitLevel=CENTRAL&unitId=CENTRAL' },
        ] : []),
        ...(canManageFinance(user) ? [{ key: 'congress-finance', icon: '💰', title: t('nav.congressFinance', 'Congress Finance'), description: t('admin.descCongressFinance', 'Donations, expenses & funds for National Congress'), route: '/finance?body=CONGRESS&unitLevel=CENTRAL&unitId=CENTRAL' }] : []),
        { key: 'congress-reports', icon: '📊', title: t('nav.congressReports', 'Congress Reports'), description: t('admin.descCongressReports', 'Performance and financial reports for Congress'), route: '/admin/reports?body=CONGRESS&unitLevel=CENTRAL&unitId=CENTRAL' },
      ],
    },

    // 10. Jirga (Sobayi Jirga for Province / Qomi Jirga for Central)
    {
      key: 'jirga',
      title: (ctx?.unitLevel === 'CENTRAL' || (!ctx?.unitLevel && (isSuper || isCentral))) ? t('nav.qomiJirga', 'Qomi Jirga') : t('nav.sobayiJirga', 'Sobayi Jirga'),
      icon: '⚖️',
      show: () => {
        if (isSuper || isCentral || isProvince || isDistrict || isArea) return false;
        const level = ctx?.unitLevel;
        if (level !== 'CENTRAL' && level !== 'PROVINCE') return false;
        return isCabinet;
      },
      items: [
        { key: 'jirga-comp', icon: '⚖️', title: t('nav.composition', 'Composition'), description: (ctx?.unitLevel === 'CENTRAL' || isSuper || isCentral) ? t('admin.descCentralJirgaComp', 'Central Jirga members & elders assembly') : t('admin.descSobayiJirgaComp', 'Sobayi Jirga members & elders assembly'), route: ctx?.unitLevel === 'CENTRAL' ? '/admin/jirga?unitLevel=CENTRAL&unitId=CENTRAL' : (ctx?.unitLevel === 'PROVINCE' ? `/admin/jirga?unitLevel=PROVINCE&unitId=${ctx.unitId}` : (isSuper || isCentral ? '/admin/jirga?unitLevel=CENTRAL&unitId=CENTRAL' : '/admin/jirga')) },
        ...(!isFinanceSec ? [
          { key: 'jirga-meetings', icon: '📅', title: t('nav.jirgaMeetings', 'Jirga Meetings'), description: t('admin.descJirgaMeetings', 'Jirga assembly meeting records'), route: ctx?.unitLevel === 'CENTRAL' ? '/meetings?body=JIRGA&unitLevel=CENTRAL&unitId=CENTRAL' : (ctx?.unitLevel === 'PROVINCE' ? `/meetings?body=JIRGA&unitLevel=PROVINCE&unitId=${ctx.unitId}` : (isSuper || isCentral ? '/meetings?body=JIRGA&unitLevel=CENTRAL&unitId=CENTRAL' : '/meetings?body=JIRGA')) },
          { key: 'jirga-activities', icon: '🚩', title: t('nav.jirgaActivities', 'Jirga Activities'), description: t('admin.descJirgaActivities', 'Jirga activities, gatherings & events'), route: ctx?.unitLevel === 'CENTRAL' ? '/activities?body=JIRGA&unitLevel=CENTRAL&unitId=CENTRAL' : (ctx?.unitLevel === 'PROVINCE' ? `/activities?body=JIRGA&unitLevel=PROVINCE&unitId=${ctx.unitId}` : (isSuper || isCentral ? '/activities?body=JIRGA&unitLevel=CENTRAL&unitId=CENTRAL' : '/activities?body=JIRGA')) },
        ] : []),
        ...(canManageFinance(user) ? [
          { key: 'jirga-finance', icon: '💰', title: t('nav.jirgaFinance', 'Jirga Finance'), description: t('admin.descJirgaFinance', 'Jirga donations & expenses ledger'), route: ctx?.unitLevel === 'CENTRAL' ? '/finance?body=JIRGA&unitLevel=CENTRAL&unitId=CENTRAL' : (ctx?.unitLevel === 'PROVINCE' ? `/finance?body=JIRGA&unitLevel=PROVINCE&unitId=${ctx.unitId}` : (isSuper || isCentral ? '/finance?body=JIRGA&unitLevel=CENTRAL&unitId=CENTRAL' : '/finance?body=JIRGA')) },
          { key: 'jirga-transfers', icon: '💸', title: t('nav.jirgaTransfers', 'Jirga Transfers'), description: t('admin.descJirgaTransfers', 'Jirga fund transfers'), route: ctx?.unitLevel === 'CENTRAL' ? '/finance/transfers?body=JIRGA&unitLevel=CENTRAL&unitId=CENTRAL' : (ctx?.unitLevel === 'PROVINCE' ? `/finance/transfers?body=JIRGA&unitLevel=PROVINCE&unitId=${ctx.unitId}` : (isSuper || isCentral ? '/finance/transfers?body=JIRGA&unitLevel=CENTRAL&unitId=CENTRAL' : '/finance/transfers?body=JIRGA')) },
        ] : []),
        { key: 'jirga-reports', icon: '📊', title: t('nav.jirgaReports', 'Jirga Reports'), description: t('admin.descJirgaReports', 'Jirga reports & exports'), route: ctx?.unitLevel === 'CENTRAL' ? '/admin/reports?body=JIRGA&unitLevel=CENTRAL&unitId=CENTRAL' : (ctx?.unitLevel === 'PROVINCE' ? `/admin/reports?body=JIRGA&unitLevel=PROVINCE&unitId=${ctx.unitId}` : (isSuper || isCentral ? '/admin/reports?body=JIRGA&unitLevel=CENTRAL&unitId=CENTRAL' : '/admin/reports?body=JIRGA')) },
      ],
    },

    // 11. Communication (Always available)
    {
      key: 'communication',
      title: t('nav.communication', 'Communication'),
      icon: '📢',
      show: () => true,
      items: [
        { key: 'notifications', icon: '🔔', title: t('nav.notifications', 'Notifications'), description: t('admin.descNotifications', 'System alerts and updates'), route: '/notifications' },
        { key: 'announcements', icon: '📢', title: t('nav.announcements', 'Announcements'), description: t('admin.descAnnouncements', 'Org-wide broadcasts & direct messages'), route: '/announcements' },
      ],
    },
  ];

  const visibleSections = sections.filter((s) => s.show() && s.items.length > 0);

  const [openSections, setOpenSections] = useState({
    super_admin: true,
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
          <View style={[styles.heroHeader, isRTL && { flexDirection: 'row-reverse' }]}>
            <View style={styles.heroIconBox}>
              <Text style={styles.heroIcon}>🛡️</Text>
            </View>
            <View style={[styles.heroText, isRTL && { alignItems: 'flex-end' }]}>
              <Text style={[styles.heroTitle, isRTL && { textAlign: 'right' }]}>{tierTitle} {t('admin.panel', 'Panel')}</Text>
              <Text style={[styles.heroSub, isRTL && { textAlign: 'right' }]}>{unitDisplayName}</Text>
            </View>
          </View>
          <View style={[styles.heroTagRow, isRTL && { flexDirection: 'row-reverse' }]}>
            <Badge label={t(`roles.${user?.roles?.[0]}`, user?.roles?.[0]?.replace(/_/g, ' ') || 'Admin')} color="#fff" bg="rgba(255,255,255,0.2)" />
            {ctx?.unitLevel && <Badge label={`${t('profile.unitLevel', 'Tier')}: ${t(`units.${ctx.unitLevel.toLowerCase()}`, ctx.unitLevel)}`} color="rgba(255,255,255,0.9)" bg="rgba(0,0,0,0.2)" />}
          </View>
        </View>

        {/* Section Accordion Controls */}
        <View style={[styles.accordionControlsRow, isRTL && { flexDirection: 'row-reverse' }]}>
          <Text style={styles.sectionsHeaderLabel}>{t('admin.sectionsAndModules', 'SECTIONS & MODULES')}</Text>
          <View style={[styles.accordionBtns, isRTL && { flexDirection: 'row-reverse' }]}>
            <TouchableOpacity onPress={() => setAllSections(true)} style={styles.miniBtn}>
              <Text style={styles.miniBtnText}>{t('admin.expandAll', 'Expand all')}</Text>
            </TouchableOpacity>
            <Text style={styles.miniDivider}>·</Text>
            <TouchableOpacity onPress={() => setAllSections(false)} style={styles.miniBtn}>
              <Text style={styles.miniBtnText}>{t('admin.collapseAll', 'Collapse all')}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {visibleSections.length === 0 && (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>{t('admin.noToolsAvailable', 'No administrative tools available for your current role.')}</Text>
          </View>
        )}

        {/* Sections List */}
        {visibleSections.map((section) => {
          const isOpen = !!openSections[section.key];
          return (
            <View key={section.key} style={styles.sectionContainer}>
              <TouchableOpacity
                style={[
                  styles.sectionHeaderBtn,
                  isOpen && styles.sectionHeaderBtnOpen,
                  isRTL && { flexDirection: 'row-reverse' }
                ]}
                onPress={() => toggleSection(section.key)}
                activeOpacity={0.7}
              >
                <View style={[styles.sectionHeaderLeft, isRTL && { flexDirection: 'row-reverse' }]}>
                  <Text style={styles.sectionHeaderIcon}>{section.icon}</Text>
                  <Text style={styles.sectionHeaderTitle}>{section.title}</Text>
                  <View style={styles.countBadge}>
                    <Text style={styles.countBadgeText}>{section.items.length}</Text>
                  </View>
                </View>
                <Ionicons
                  name={isOpen ? 'chevron-down' : (isRTL ? 'chevron-back' : 'chevron-forward')}
                  size={18}
                  color={isOpen ? Colors.primary : Colors.textMuted}
                />
              </TouchableOpacity>
              {isOpen && (
                <View style={[styles.grid, isRTL && { flexDirection: 'row-reverse' }]}>
                  {section.items.map((card) => (
                    <TouchableOpacity
                      key={card.key}
                      style={styles.card}
                      onPress={() => router.push(card.route)}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.cardTop, isRTL && { flexDirection: 'row-reverse' }]}>
                        <View style={styles.cardIconBox}>
                          <Text style={styles.cardIcon}>{card.icon}</Text>
                        </View>
                        <Ionicons name={isRTL ? 'chevron-back' : 'chevron-forward'} size={16} color={Colors.textMuted} />
                      </View>
                      <Text style={[styles.cardTitle, isRTL && { textAlign: 'right' }]} numberOfLines={2}>{card.title}</Text>
                      <Text style={[styles.cardDesc, isRTL && { textAlign: 'right' }]} numberOfLines={2}>
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
    ...Platform.select({
      web: {
        boxShadow: '0 4px 8px rgba(30, 58, 138, 0.2)',
      },
      default: {
        shadowColor: '#1e3a8a',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 4,
      },
    }),
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
