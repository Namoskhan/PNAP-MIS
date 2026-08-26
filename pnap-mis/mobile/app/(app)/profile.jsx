import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import { roleLabel, isPureMember } from '../../src/utils/permissions';
import Avatar from '../../src/components/Avatar';
import Card from '../../src/components/Card';
import Badge from '../../src/components/Badge';
import { Colors, FontSize, Spacing } from '../../src/constants/colors';

function InfoRow({ label, value }) {
  if (!value) return null;
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

export default function ProfileScreen() {
  const { user, logout, allRoles, activeRole, setActiveRole } = useAuth();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  async function performLogout() {
    setSigningOut(true);
    try {
      await logout();
      router.replace('/login');
    } catch (e) {
      console.error('Logout error:', e);
    } finally {
      setSigningOut(false);
    }
  }

  function handleLogout() {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm('Are you sure you want to sign out?')) {
        performLogout();
      }
    } else {
      Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: performLogout,
        },
      ]);
    }
  }


  if (!user) return null;

  const isMember = isPureMember(user);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Profile Header */}
        <Card style={styles.profileCard}>
          <View style={styles.profileHeader}>
            <Avatar name={user.fullName} size={72} color={Colors.primaryDark} />
            <View style={styles.profileInfo}>
              <Text style={styles.profileName}>{user.fullName || 'Unknown User'}</Text>
              <Text style={styles.profileEmail}>{user.email || user.phone || '—'}</Text>
              {user.memberId && (
                <Text style={styles.profileId}>ID: {user.memberId}</Text>
              )}
            </View>
          </View>
        </Card>

        {/* Roles */}
        {allRoles.length > 0 && (
          <Card>
            <Text style={styles.sectionTitle}>My Roles</Text>
            <View style={styles.rolePills}>
              {allRoles.map((r) => (
                <TouchableOpacity
                  key={r}
                  onPress={() => setActiveRole(activeRole === r ? null : r)}
                  style={styles.rolePill}
                >
                  <Badge
                    label={roleLabel(user, r)}
                    color={activeRole === r ? '#fff' : Colors.primaryLight}
                    bg={activeRole === r ? Colors.primary : '#eff6ff'}
                  />
                </TouchableOpacity>
              ))}
            </View>
            {allRoles.length > 1 && (
              <Text style={styles.roleHint}>
                {activeRole ? `Viewing as: ${roleLabel(user, activeRole)}` : 'Tap a role to view as that persona.'}
              </Text>
            )}
          </Card>
        )}

        {/* Unit Info */}
        {user.scope && (
          <Card>
            <Text style={styles.sectionTitle}>Unit</Text>
            <InfoRow label="Basic Unit" value={user.scope.basicUnitName} />
            <InfoRow label="Area" value={user.scope.areaName} />
            <InfoRow label="District" value={user.scope.districtName} />
            <InfoRow label="Province" value={user.scope.provinceName} />
          </Card>
        )}

        {/* Account Actions */}
        <Card>
          <Text style={styles.sectionTitle}>Account</Text>
          <TouchableOpacity
            style={[styles.actionBtn, styles.logoutBtn]}
            onPress={handleLogout}
            disabled={signingOut}
          >
            {signingOut ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.logoutText}>Sign Out</Text>
            )}
          </TouchableOpacity>
        </Card>

        <Text style={styles.version}>PNAP MIS · v1.0.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.lg, paddingBottom: 40 },
  profileCard: { marginBottom: Spacing.md },
  profileHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.lg },
  profileInfo: { flex: 1 },
  profileName: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.text, marginBottom: 2 },
  profileEmail: { fontSize: FontSize.sm, color: Colors.textMuted, marginBottom: 2 },
  profileId: { fontSize: FontSize.xs, color: Colors.textLight },
  sectionTitle: { fontSize: FontSize.base, fontWeight: '700', color: Colors.text, marginBottom: Spacing.md },
  rolePills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: Spacing.sm },
  rolePill: { alignSelf: 'flex-start' },
  roleHint: { fontSize: FontSize.xs, color: Colors.textMuted, fontStyle: 'italic' },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  rowLabel: { fontSize: FontSize.sm, color: Colors.textMuted },
  rowValue: { fontSize: FontSize.sm, color: Colors.text, fontWeight: '500', flex: 1, textAlign: 'right' },
  actionBtn: { borderRadius: 10, paddingVertical: 13, alignItems: 'center' },
  logoutBtn: { backgroundColor: Colors.error },
  logoutText: { color: '#fff', fontSize: FontSize.base, fontWeight: '700' },
  version: { textAlign: 'center', fontSize: FontSize.xs, color: Colors.textLight, marginTop: Spacing.xl },
});
