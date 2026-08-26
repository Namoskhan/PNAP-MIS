import { Redirect, Tabs } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import { ActivityIndicator, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../src/constants/colors';
import { canManageFinance, isHigherAdmin, isAreaAdmin, canInitiateRole, canDecideRole, hasPermission } from '../../src/utils/permissions';

function TabIcon({ name, color, size }) {
  return <Ionicons name={name} size={size} color={color} />;
}

function ShieldIcon({ color, size }) {
  return <Text style={{ fontSize: size - 4, lineHeight: size, color }}>🛡️</Text>;
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

  const showFinance = canManageFinance(user);
  const showAdmin = isHigherAdmin(user) || isAreaAdmin(user) || canInitiateRole(user) || canDecideRole(user) || hasPermission(user, 'MANAGE_EVENT_CONFIG') || hasPermission(user, 'VIEW_SYSTEM_BRANDING');

  const isAdminOnly = isHigherAdmin(user) || isAreaAdmin(user);
  const showUnitTabs = !isAdminOnly;

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
          paddingTop: 4,
          paddingBottom: 4,
          height: 60,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color, size }) => <TabIcon name="home" color={color} size={size} />,
          headerTitle: 'PNAP MIS',
        }}
      />
      {showUnitTabs ? (
        <Tabs.Screen
          name="members/index"
          options={{
            title: 'Members',
            tabBarIcon: ({ color, size }) => <TabIcon name="people" color={color} size={size} />,
            headerTitle: 'Members',
          }}
        />
      ) : (
        <Tabs.Screen name="members/index" options={{ href: null }} />
      )}
      {showUnitTabs ? (
        <Tabs.Screen
          name="meetings/index"
          options={{
            title: 'Meetings',
            tabBarIcon: ({ color, size }) => <TabIcon name="calendar" color={color} size={size} />,
            headerTitle: 'Meetings',
          }}
        />
      ) : (
        <Tabs.Screen name="meetings/index" options={{ href: null }} />
      )}
      {showUnitTabs ? (
        <Tabs.Screen
          name="activities/index"
          options={{
            title: 'Activities',
            tabBarIcon: ({ color, size }) => <TabIcon name="flag" color={color} size={size} />,
            headerTitle: 'Activities',
          }}
        />
      ) : (
        <Tabs.Screen name="activities/index" options={{ href: null }} />
      )}
      {showFinance && showUnitTabs ? (
        <Tabs.Screen
          name="finance/index"
          options={{
            title: 'Finance',
            tabBarIcon: ({ color, size }) => <TabIcon name="wallet" color={color} size={size} />,
            headerTitle: 'Finance',
          }}
        />
      ) : (
        <Tabs.Screen name="finance/index" options={{ href: null }} />
      )}
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => <TabIcon name="person-circle" color={color} size={size} />,
          headerTitle: 'My Profile',
        }}
      />
      {showAdmin ? (
        <Tabs.Screen
          name="admin/index"
          options={{
            title: 'Admin',
            tabBarIcon: ({ color, size }) => <ShieldIcon color={color} size={size} />,
            headerTitle: 'Admin Panel',
          }}
        />
      ) : (
        <Tabs.Screen name="admin/index" options={{ href: null }} />
      )}
      {/* Hidden screens — navigable via stack but not in tabs */}
      <Tabs.Screen name="members/[id]" options={{ href: null, headerTitle: 'Member Detail', headerShown: true }} />
      <Tabs.Screen name="meetings/[id]" options={{ href: null, headerTitle: 'Meeting Detail', headerShown: true }} />
      <Tabs.Screen name="activities/[id]" options={{ href: null, headerTitle: 'Activity Detail', headerShown: true }} />
      <Tabs.Screen name="notifications" options={{ href: null, headerTitle: 'Notifications', headerShown: true }} />
      {/* Phase 2 — Admin screens (hidden from tab bar, reachable via router.push) */}
      <Tabs.Screen name="cabinet/index" options={{ href: null, headerTitle: 'Cabinet', headerShown: true }} />
      <Tabs.Screen name="admin/org" options={{ href: null, headerTitle: 'Org Structure', headerShown: true }} />
      <Tabs.Screen name="admin/users/index" options={{ href: null, headerTitle: 'Users', headerShown: true }} />
      <Tabs.Screen name="admin/roles/index" options={{ href: null, headerTitle: 'Role Manager', headerShown: true }} />
      <Tabs.Screen name="admin/roles/[id]" options={{ href: null, headerTitle: 'Role Permissions', headerShown: true }} />
      <Tabs.Screen name="admin/event-types/meetings" options={{ href: null, headerTitle: 'Meeting Types', headerShown: true }} />
      <Tabs.Screen name="admin/event-types/activities" options={{ href: null, headerTitle: 'Activity Types', headerShown: true }} />
      <Tabs.Screen name="admin/event-types/[id]" options={{ href: null, headerTitle: 'Event Type Editor', headerShown: true }} />
      <Tabs.Screen name="admin/breakdown" options={{ href: null, headerTitle: 'Breakdown', headerShown: true }} />
      <Tabs.Screen name="admin/responsibilities" options={{ href: null, headerTitle: 'Responsibilities', headerShown: true }} />
      <Tabs.Screen name="admin/reports" options={{ href: null, headerTitle: 'Exports & Reports', headerShown: true }} />
      <Tabs.Screen name="admin/audit" options={{ href: null, headerTitle: 'Audit Log', headerShown: true }} />
      <Tabs.Screen name="admin/settings" options={{ href: null, headerTitle: 'System Settings', headerShown: true }} />
    </Tabs>
  );
}
