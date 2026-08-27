import { Redirect, Tabs } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import { ActivityIndicator, View, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../src/constants/colors';
import { isPureMember } from '../../src/utils/permissions';

function TabIcon({ name, color, size }) {
  return <Ionicons name={name} size={size} color={color} />;
}

export default function AppLayout() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background }}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (!user) return <Redirect href="/login" />;

  const isMemberOnly = isPureMember(user);
  const showAdmin = !isMemberOnly;

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: Colors.primary },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '700' },
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarStyle: {
          borderTopColor: Colors.border,
          backgroundColor: Colors.surface,
          paddingTop: 6,
          paddingBottom: Platform.OS === 'ios' ? 24 : 8,
          height: Platform.OS === 'ios' ? 84 : 64,
          elevation: 8,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.05,
          shadowRadius: 4,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600', marginBottom: 2 },
        tabBarItemStyle: { paddingVertical: 2 },
      }}
    >
      {/* ─── 1. Dashboard Tab ─── */}
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color, size }) => <TabIcon name="home" color={color} size={size} />,
          headerTitle: 'PNAP MIS',
        }}
      />

      {/* ─── 2. Profile Tab ─── */}
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => <TabIcon name="person-circle" color={color} size={size} />,
          headerTitle: 'My Profile',
        }}
      />

      {/* ─── 3. Admin Tab ─── */}
      {showAdmin ? (
        <Tabs.Screen
          name="admin/index"
          options={{
            title: 'Admin',
            tabBarIcon: ({ color, size }) => <TabIcon name="shield-checkmark" color={color} size={size} />,
            headerTitle: 'Admin Panel',
          }}
        />
      ) : (
        <Tabs.Screen name="admin/index" options={{ href: null }} />
      )}

      {/* ─── All Sub-Screens Hidden from Tab Bar (href: null) ─── */}
      {/* Activities & Meetings */}
      <Tabs.Screen name="activities/index" options={{ href: null, headerTitle: 'Activities', headerShown: true }} />
      <Tabs.Screen name="activities/[id]" options={{ href: null, headerTitle: 'Activity Detail', headerShown: true }} />
      <Tabs.Screen name="meetings/index" options={{ href: null, headerTitle: 'Meetings', headerShown: true }} />
      <Tabs.Screen name="meetings/[id]" options={{ href: null, headerTitle: 'Meeting Detail', headerShown: true }} />

      {/* Members & Finance */}
      <Tabs.Screen name="members/index" options={{ href: null, headerTitle: 'Members', headerShown: true }} />
      <Tabs.Screen name="members/[id]" options={{ href: null, headerTitle: 'Member Detail', headerShown: true }} />
      <Tabs.Screen name="finance/index" options={{ href: null, headerTitle: 'Finance', headerShown: true }} />
      <Tabs.Screen name="finance/transfers" options={{ href: null, headerTitle: 'Transfers', headerShown: true }} />

      {/* Cabinet, Announcements, Notifications, Unit */}
      <Tabs.Screen name="cabinet/index" options={{ href: null, headerTitle: 'Cabinet', headerShown: true }} />
      <Tabs.Screen name="announcements" options={{ href: null, headerTitle: 'Announcements', headerShown: false }} />
      <Tabs.Screen name="notifications" options={{ href: null, headerTitle: 'Notifications', headerShown: true }} />
      <Tabs.Screen name="unit/jirga" options={{ href: null, headerTitle: 'Sobayi Jirga', headerShown: true }} />

      {/* Admin Modules */}
      <Tabs.Screen name="admin/audit" options={{ href: null, headerTitle: 'Audit Logs', headerShown: true }} />
      <Tabs.Screen name="admin/breakdown" options={{ href: null, headerTitle: 'Unit Breakdown', headerShown: true }} />
      <Tabs.Screen name="admin/congress" options={{ href: null, headerTitle: 'National Congress', headerShown: true }} />
      <Tabs.Screen name="admin/finance-overview" options={{ href: null, headerTitle: 'Finance Overview', headerShown: true }} />
      <Tabs.Screen name="admin/jirga" options={{ href: null, headerTitle: 'Sobayi Jirga', headerShown: true }} />
      <Tabs.Screen name="admin/meetings" options={{ href: null, headerTitle: 'Meetings', headerShown: true }} />
      <Tabs.Screen name="admin/org" options={{ href: null, headerTitle: 'Org Structure', headerShown: true }} />
      <Tabs.Screen name="admin/manage-org" options={{ href: null, headerTitle: 'Manage Units', headerShown: true }} />
      <Tabs.Screen name="admin/pending-approvals" options={{ href: null, headerTitle: 'Pending Approvals', headerShown: true }} />
      <Tabs.Screen name="admin/reports" options={{ href: null, headerTitle: 'Reports Center', headerShown: true }} />
      <Tabs.Screen name="admin/responsibilities" options={{ href: null, headerTitle: 'Responsibilities', headerShown: true }} />
      <Tabs.Screen name="admin/settings" options={{ href: null, headerTitle: 'System Settings', headerShown: true }} />

      {/* Admin Event Types & Fields */}
      <Tabs.Screen name="admin/event-types/activities" options={{ href: null, headerTitle: 'Activity Types', headerShown: true }} />
      <Tabs.Screen name="admin/event-types/meetings" options={{ href: null, headerTitle: 'Meeting Types', headerShown: true }} />
      <Tabs.Screen name="admin/event-types/[id]" options={{ href: null, headerTitle: 'Event Type Detail', headerShown: true }} />
      <Tabs.Screen name="admin/events/fields" options={{ href: null, headerTitle: 'Event Fields', headerShown: true }} />

      {/* Admin Roles & Users */}
      <Tabs.Screen name="admin/roles/index" options={{ href: null, headerTitle: 'Role Manager', headerShown: true }} />
      <Tabs.Screen name="admin/roles/[id]" options={{ href: null, headerTitle: 'Role Permissions', headerShown: true }} />
      <Tabs.Screen name="admin/users/index" options={{ href: null, headerTitle: 'Users', headerShown: true }} />

      {/* Admin Settings Sub-pages */}
      <Tabs.Screen name="admin/settings/dashboard" options={{ href: null, headerTitle: 'Dashboard Settings', headerShown: true }} />
      <Tabs.Screen name="admin/settings/history" options={{ href: null, headerTitle: 'Settings History', headerShown: true }} />
      <Tabs.Screen name="admin/settings/identity" options={{ href: null, headerTitle: 'System Identity', headerShown: true }} />
      <Tabs.Screen name="admin/settings/index" options={{ href: null, headerTitle: 'System Settings', headerShown: true }} />
      <Tabs.Screen name="admin/settings/login" options={{ href: null, headerTitle: 'Login Settings', headerShown: true }} />
      <Tabs.Screen name="admin/settings/logos" options={{ href: null, headerTitle: 'Logo Manager', headerShown: true }} />
      <Tabs.Screen name="admin/settings/reports" options={{ href: null, headerTitle: 'Report Settings', headerShown: true }} />
      <Tabs.Screen name="admin/settings/theme" options={{ href: null, headerTitle: 'Theme Manager', headerShown: true }} />
      <Tabs.Screen name="admin/settings/typography" options={{ href: null, headerTitle: 'Typography', headerShown: true }} />

      {/* Admin Units Sub-pages */}
      <Tabs.Screen name="admin/units/cabinet-templates" options={{ href: null, headerTitle: 'Cabinet Templates', headerShown: true }} />
      <Tabs.Screen name="admin/units/index" options={{ href: null, headerTitle: 'Unit Management', headerShown: true }} />
      <Tabs.Screen name="admin/units/performance-rulesets" options={{ href: null, headerTitle: 'Performance Rules', headerShown: true }} />
      <Tabs.Screen name="admin/units/policies" options={{ href: null, headerTitle: 'Unit Policies', headerShown: true }} />
      <Tabs.Screen name="admin/units/report-templates" options={{ href: null, headerTitle: 'Report Templates', headerShown: true }} />
      <Tabs.Screen name="admin/units/responsibility-templates" options={{ href: null, headerTitle: 'Task Templates', headerShown: true }} />
      <Tabs.Screen name="admin/units/tier-configs" options={{ href: null, headerTitle: 'Unit Tiers', headerShown: true }} />
      <Tabs.Screen name="admin/units/workflows" options={{ href: null, headerTitle: 'Approval Workflows', headerShown: true }} />
    </Tabs>
  );
}
