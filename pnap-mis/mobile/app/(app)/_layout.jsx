import { Redirect, Tabs } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import { ActivityIndicator, View, Platform, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../src/constants/colors';
import OfflineBanner from '../../src/components/OfflineBanner';
import { useLanguage } from '../../src/context/LanguageContext';
import { canManageFinance, isHigherAdmin, isAreaAdmin, isSuperAdmin, canInitiateRole, canDecideRole, hasPermission, isPureMember } from '../../src/utils/permissions';

function TabIcon({ name, color, size }) {
  return <Ionicons name={name} size={size ? Math.min(size, 22) : 22} color={color} />;
}

export default function AppLayout() {
  const { user, loading } = useAuth();
  const { t, isRTL } = useLanguage();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background }}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (!user) return <Redirect href="/login" />;

  const isMember = isPureMember(user);
  const isAdminRole = isSuperAdmin(user) || isHigherAdmin(user) || isAreaAdmin(user);
  const tabTitle = isAdminRole ? t('mobile.adminShort', 'Admin') : (isMember ? t('mobile.portalShort', 'Portal') : t('mobile.cabinetShort', 'Cabinet'));
  const headerTitle = isAdminRole ? t('mobile.admin', 'Admin Panel') : (isMember ? t('mobile.portal', 'Member Portal') : t('mobile.cabinet', 'Cabinet Hub'));
  const iconName = isAdminRole ? 'shield-checkmark' : (isMember ? 'apps' : 'briefcase');

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <OfflineBanner />
      <Tabs
        screenOptions={{
        headerStyle: { backgroundColor: Colors.primary },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '700' },
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarStyle: {
          borderTopColor: Colors.border,
          borderTopWidth: 1,
          backgroundColor: Colors.surface,
          paddingTop: 4,
          paddingBottom: Platform.OS === 'ios' ? 24 : 6,
          height: Platform.OS === 'ios' ? 84 : 64,
          ...Platform.select({
            web: {
              boxShadow: '0 -2px 4px rgba(0, 0, 0, 0.05)',
            },
            default: {
              elevation: 8,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: -2 },
              shadowOpacity: 0.05,
              shadowRadius: 4,
            },
          }),
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '700',
          lineHeight: 14,
          marginTop: 1,
          marginBottom: 0,
        },
        tabBarIconStyle: {
          marginTop: 0,
          marginBottom: 0,
        },
        tabBarItemStyle: {
          paddingVertical: 2,
          justifyContent: 'center',
          alignItems: 'center',
        },
      }}
    >
      {/* ─── 1. Dashboard Tab ─── */}
      <Tabs.Screen
        name="index"
        options={{
          title: t('mobile.dashboard', 'Dashboard'),
          tabBarIcon: ({ color, size }) => <TabIcon name="home" color={color} size={size} />,
          headerTitle: 'PNAP MIS',
          headerLeft: () => (
            <Image
              source={require('../../assets/logo.png')}
              style={{ width: 28, height: 28, borderRadius: 14, marginLeft: 16 }}
              resizeMode="contain"
            />
          ),
        }}
      />

      {/* ─── 2. Profile Tab ─── */}
      <Tabs.Screen
        name="profile"
        options={{
          title: t('mobile.profile', 'Profile'),
          tabBarIcon: ({ color, size }) => <TabIcon name="person-circle" color={color} size={size} />,
          headerTitle: t('auth.myProfile', 'My Profile'),
        }}
      />

      {/* ─── 3. Admin / Cabinet / Member Portal Tab ─── */}
      <Tabs.Screen
        name="admin/index"
        options={{
          title: tabTitle,
          tabBarIcon: ({ color, size }) => (
            <TabIcon name={iconName} color={color} size={size} />
          ),
          headerTitle: headerTitle,
        }}
      />

      {/* ─── All Sub-Screens Hidden from Tab Bar (href: null) ─── */}
      {/* Activities & Meetings */}
      <Tabs.Screen name="activities/index" options={{ href: null, headerTitle: t('nav.activities', 'Activities'), headerShown: true }} />
      <Tabs.Screen name="activities/[id]" options={{ href: null, headerTitle: t('nav.activityDetail', 'Activity Detail'), headerShown: true }} />
      <Tabs.Screen name="meetings/index" options={{ href: null, headerTitle: t('nav.meetings', 'Meetings'), headerShown: true }} />
      <Tabs.Screen name="meetings/[id]" options={{ href: null, headerTitle: t('nav.meetingDetail', 'Meeting Detail'), headerShown: true }} />

      {/* Members & Finance */}
      <Tabs.Screen name="members/index" options={{ href: null, headerTitle: t('nav.members', 'Members'), headerShown: true }} />
      <Tabs.Screen name="members/[id]" options={{ href: null, headerTitle: t('nav.memberDetail', 'Member Detail'), headerShown: true }} />
      <Tabs.Screen name="finance/index" options={{ href: null, headerTitle: t('nav.finance', 'Finance'), headerShown: true }} />
      <Tabs.Screen name="finance/transfers" options={{ href: null, headerTitle: t('nav.transfers', 'Transfers'), headerShown: true }} />

      {/* Cabinet, Announcements, Notifications, Unit */}
      <Tabs.Screen name="cabinet/index" options={{ href: null, headerTitle: t('nav.cabinet', 'Cabinet'), headerShown: true }} />
      <Tabs.Screen name="announcements" options={{ href: null, headerTitle: t('nav.announcements', 'Announcements'), headerShown: false }} />
      <Tabs.Screen name="notifications" options={{ href: null, headerTitle: t('nav.notifications', 'Notifications'), headerShown: true }} />
      <Tabs.Screen name="unit/jirga" options={{ href: null, headerTitle: t('nav.sobayiJirga', 'Sobayi Jirga'), headerShown: true }} />
      <Tabs.Screen name="unit/committee" options={{ href: null, headerTitle: t('nav.committeeRoster', 'Committee Roster'), headerShown: true }} />

      {/* Admin Modules */}
      <Tabs.Screen name="admin/committee" options={{ href: null, headerTitle: t('nav.committeeRoster', 'Committee Roster'), headerShown: true }} />
      <Tabs.Screen name="admin/audit" options={{ href: null, headerTitle: t('nav.auditLogs', 'Audit Logs'), headerShown: true }} />
      <Tabs.Screen name="admin/breakdown" options={{ href: null, headerTitle: t('nav.unitBreakdown', 'Unit Breakdown'), headerShown: true }} />
      <Tabs.Screen name="admin/congress" options={{ href: null, headerTitle: t('nav.nationalCongress', 'National Congress'), headerShown: true }} />
      <Tabs.Screen name="admin/finance-overview" options={{ href: null, headerTitle: t('nav.financeOverview', 'Finance Overview'), headerShown: true }} />
      <Tabs.Screen name="admin/jirga" options={{ href: null, headerTitle: t('nav.sobayiJirga', 'Sobayi Jirga'), headerShown: true }} />
      <Tabs.Screen name="admin/meetings" options={{ href: null, headerTitle: t('nav.meetings', 'Meetings'), headerShown: true }} />
      <Tabs.Screen name="admin/org" options={{ href: null, headerTitle: t('nav.orgStructure', 'Org Structure'), headerShown: true }} />
      <Tabs.Screen name="admin/manage-org" options={{ href: null, headerTitle: t('nav.manageUnits', 'Manage Units'), headerShown: true }} />
      <Tabs.Screen name="admin/pending-approvals" options={{ href: null, headerTitle: t('nav.pendingApprovals', 'Pending Approvals'), headerShown: true }} />
      <Tabs.Screen name="admin/performance" options={{ href: null, headerTitle: t('nav.memberPerformance', 'Member Performance'), headerShown: true }} />
      <Tabs.Screen name="admin/reports" options={{ href: null, headerTitle: t('nav.reportsCenter', 'Reports Center'), headerShown: true }} />
      <Tabs.Screen name="admin/responsibilities" options={{ href: null, headerTitle: t('nav.responsibilities', 'Responsibilities'), headerShown: true }} />
      <Tabs.Screen name="admin/settings" options={{ href: null, headerTitle: t('nav.systemSettings', 'System Settings'), headerShown: true }} />

      {/* Admin Event Types & Fields */}
      <Tabs.Screen name="admin/event-types/activities" options={{ href: null, headerTitle: t('nav.activityTypes', 'Activity Types'), headerShown: true }} />
      <Tabs.Screen name="admin/event-types/meetings" options={{ href: null, headerTitle: t('nav.meetingTypes', 'Meeting Types'), headerShown: true }} />
      <Tabs.Screen name="admin/event-types/[id]" options={{ href: null, headerTitle: t('nav.activityDetail', 'Event Type Detail'), headerShown: true }} />
      <Tabs.Screen name="admin/events/fields" options={{ href: null, headerTitle: t('nav.eventFields', 'Event Fields'), headerShown: true }} />

      {/* Admin Roles & Users */}
      <Tabs.Screen name="admin/roles/index" options={{ href: null, headerTitle: t('nav.roleManagement', 'Role Manager'), headerShown: true }} />
      <Tabs.Screen name="admin/roles/[id]" options={{ href: null, headerTitle: t('nav.rolePermissions', 'Role Permissions'), headerShown: true }} />
      <Tabs.Screen name="admin/users/index" options={{ href: null, headerTitle: t('nav.allUsers', 'Users'), headerShown: true }} />

      {/* Admin Settings Sub-pages */}
      <Tabs.Screen name="admin/settings/dashboard" options={{ href: null, headerTitle: t('nav.dashboardSettings', 'Dashboard Settings'), headerShown: true }} />
      <Tabs.Screen name="admin/settings/history" options={{ href: null, headerTitle: t('nav.settingsHistory', 'Settings History'), headerShown: true }} />
      <Tabs.Screen name="admin/settings/identity" options={{ href: null, headerTitle: t('nav.systemIdentity', 'System Identity'), headerShown: true }} />
      <Tabs.Screen name="admin/settings/login" options={{ href: null, headerTitle: t('nav.loginSettings', 'Login Settings'), headerShown: true }} />
      <Tabs.Screen name="admin/settings/logos" options={{ href: null, headerTitle: t('nav.logoManager', 'Logo Manager'), headerShown: true }} />
      <Tabs.Screen name="admin/settings/reports" options={{ href: null, headerTitle: t('nav.reportBranding', 'Report Settings'), headerShown: true }} />
      <Tabs.Screen name="admin/settings/theme" options={{ href: null, headerTitle: t('nav.themeManager', 'Theme Manager'), headerShown: true }} />
      <Tabs.Screen name="admin/settings/typography" options={{ href: null, headerTitle: t('nav.typography', 'Typography'), headerShown: true }} />

      {/* Admin Units Sub-pages */}
      <Tabs.Screen name="admin/units/cabinet-templates" options={{ href: null, headerTitle: t('nav.cabinetTemplates', 'Cabinet Templates'), headerShown: true }} />
      <Tabs.Screen name="admin/units/index" options={{ href: null, headerTitle: t('nav.unitManagement', 'Unit Management'), headerShown: true }} />
      <Tabs.Screen name="admin/units/performance-rulesets" options={{ href: null, headerTitle: t('nav.performanceRules', 'Performance Rules'), headerShown: true }} />
      <Tabs.Screen name="admin/units/policies" options={{ href: null, headerTitle: t('nav.unitPolicies', 'Unit Policies'), headerShown: true }} />
      <Tabs.Screen name="admin/units/report-templates" options={{ href: null, headerTitle: t('nav.reportTemplates', 'Report Templates'), headerShown: true }} />
      <Tabs.Screen name="admin/units/responsibility-templates" options={{ href: null, headerTitle: t('nav.taskTemplates', 'Task Templates'), headerShown: true }} />
      <Tabs.Screen name="admin/units/tier-configs" options={{ href: null, headerTitle: t('nav.unitTiers', 'Unit Tiers'), headerShown: true }} />
      <Tabs.Screen name="admin/units/workflows" options={{ href: null, headerTitle: t('nav.workflows', 'Approval Workflows'), headerShown: true }} />
    </Tabs>
    </View>
  );
}
