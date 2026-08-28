import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/context/AuthContext';
import { useUnit } from '../../src/context/UnitContext';
import { roleLabel, isPureMember, isSuperAdmin } from '../../src/utils/permissions';
import { resolveMediaUrl } from '../../src/api/client';
import Avatar from '../../src/components/Avatar';
import Card from '../../src/components/Card';
import Badge from '../../src/components/Badge';
import { Colors, FontSize, Radius, Spacing } from '../../src/constants/colors';
import { shortDate, formatCnic } from '../../src/utils/formatters';

function InfoItem({ icon, label, value, badge, isLast }) {
  if (!value && !badge) return null;
  return (
    <View style={[styles.infoItem, isLast && styles.infoItemLast]}>
      <View style={styles.infoIconWrap}>
        <Ionicons name={icon || 'information-circle-outline'} size={18} color={Colors.primary} />
      </View>
      <View style={styles.infoContent}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue} numberOfLines={2}>
          {value || '—'}
        </Text>
      </View>
      {badge && <View style={styles.infoBadgeWrap}>{badge}</View>}
    </View>
  );
}

export default function ProfileScreen() {
  const { user, logout, allRoles, activeRole, setActiveRole, refreshMe } = useAuth();
  const { ctx, homeLevel, homeUnitName } = useUnit() || {};
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;

  const [signingOut, setSigningOut] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      if (refreshMe) await refreshMe();
    } catch {} finally {
      setRefreshing(false);
    }
  }

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
      Alert.alert('Sign Out', 'Are you sure you want to sign out of your account?', [
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

  const isSuper = isSuperAdmin(user);
  const isCentral = user.roles?.includes('CENTRAL_ADMIN') || user.scope?.central;
  const mem = user.memberProfile || {};

  // Unit hierarchy resolution
  const scope = user.scope || {};
  const basicUnit = scope.basicUnitName;
  const area = scope.areaName;
  const district = scope.districtName;
  const province = scope.provinceName;

  const hasLocalUnit = Boolean(basicUnit || area || district || province);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={[styles.container, isTablet && styles.containerTablet]}>
          
          {/* Profile Header Card */}
          <Card style={styles.profileCard}>
            <View style={styles.profileHeader}>
              <View style={styles.avatarWrapper}>
                {user.photoUrl ? (
                  <Image
                    source={{ uri: resolveMediaUrl(user.photoUrl) }}
                    style={styles.avatarImg}
                  />
                ) : (
                  <Avatar name={user.fullName} size={76} color={Colors.primary} />
                )}
                <View style={styles.statusDot} />
              </View>

              <View style={styles.profileInfo}>
                <View style={styles.nameRow}>
                  <Text style={styles.profileName} numberOfLines={2}>
                    {user.fullName || 'Member'}
                  </Text>
                  {isSuper && <Badge label="Super Admin" color="#fff" bg="#0f172a" />}
                </View>

                {user.memberNo || user.memberId || mem.memberId ? (
                  <View style={styles.memberIdBadge}>
                    <Ionicons name="id-card-outline" size={13} color={Colors.primary} />
                    <Text style={styles.memberIdText}>
                      ID: {user.memberNo || mem.memberId || user.memberId}
                    </Text>
                  </View>
                ) : null}

                {user.email ? (
                  <Text style={styles.profileContact} numberOfLines={1}>
                    <Ionicons name="mail-outline" size={12} color={Colors.textMuted} /> {user.email}
                  </Text>
                ) : null}

                {user.phone ? (
                  <Text style={styles.profileContact} numberOfLines={1}>
                    <Ionicons name="call-outline" size={12} color={Colors.textMuted} /> {user.phone}
                  </Text>
                ) : null}
              </View>
            </View>
          </Card>

          {/* Active Roles & View As Selector */}
          {allRoles.length > 0 && (
            <Card style={styles.sectionCard}>
              <View style={styles.sectionHeaderRow}>
                <View style={styles.sectionTitleWrap}>
                  <Ionicons name="shield-checkmark-outline" size={18} color={Colors.primary} />
                  <Text style={styles.sectionTitle}>Assigned Roles & Personas</Text>
                </View>
                {allRoles.length > 1 && (
                  <Text style={styles.switchRoleHint}>Tap to switch view</Text>
                )}
              </View>

              <View style={styles.rolePills}>
                {allRoles.map((r) => {
                  const isCurrentActive = activeRole === r || (!activeRole && allRoles.length === 1);
                  return (
                    <TouchableOpacity
                      key={r}
                      onPress={() => setActiveRole(activeRole === r ? null : r)}
                      style={[styles.rolePillBtn, isCurrentActive && styles.rolePillBtnActive]}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name={isCurrentActive ? 'radio-button-on' : 'radio-button-off'}
                        size={14}
                        color={isCurrentActive ? '#fff' : Colors.primary}
                        style={{ marginRight: 5 }}
                      />
                      <Text style={[styles.rolePillText, isCurrentActive && styles.rolePillTextActive]}>
                        {roleLabel(user, r)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={styles.roleExplanationBox}>
                <Ionicons name="information-circle-outline" size={15} color="#0369a1" style={{ marginRight: 6 }} />
                <Text style={styles.roleExplanationText}>
                  {activeRole
                    ? `Currently viewing app features with permissions for: ${roleLabel(user, activeRole)}.`
                    : 'Viewing with your default administrative permissions.'}
                </Text>
              </View>
            </Card>
          )}

          {/* Organizational Unit & Scope Card */}
          <Card style={styles.sectionCard}>
            <View style={styles.sectionHeaderRow}>
              <View style={styles.sectionTitleWrap}>
                <Ionicons name="business-outline" size={18} color={Colors.primary} />
                <Text style={styles.sectionTitle}>Organizational Unit</Text>
              </View>
              {ctx?.unitLevel && (
                <Badge
                  label={ctx.unitLevel.replace('_', ' ')}
                  color="#1e40af"
                  bg="#dbeafe"
                />
              )}
            </View>

            {hasLocalUnit ? (
              <View style={styles.infoList}>
                {province ? (
                  <InfoItem icon="map-outline" label="Province" value={province} />
                ) : null}
                {district ? (
                  <InfoItem icon="navigate-outline" label="District" value={district} />
                ) : null}
                {area ? (
                  <InfoItem icon="location-outline" label="Area" value={area} />
                ) : null}
                {basicUnit ? (
                  <InfoItem icon="home-outline" label="Basic Unit" value={basicUnit} isLast />
                ) : null}
              </View>
            ) : isSuper || isCentral ? (
              <View style={styles.centralScopeBox}>
                <View style={styles.centralScopeIcon}>
                  <Ionicons name="globe-outline" size={24} color="#0f766e" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.centralScopeTitle}>PKNAP Central Organization</Text>
                  <Text style={styles.centralScopeSub}>
                    National level jurisdiction with organization-wide access.
                  </Text>
                </View>
              </View>
            ) : (
              <View style={styles.centralScopeBox}>
                <View style={styles.centralScopeIcon}>
                  <Ionicons name="business-outline" size={24} color="#0284c7" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.centralScopeTitle}>
                    {ctx?.unitName || homeUnitName || 'Central Unit'}
                  </Text>
                  <Text style={styles.centralScopeSub}>
                    Operating level: {ctx?.unitLevel || homeLevel || 'General'}
                  </Text>
                </View>
              </View>
            )}

            {/* If working context is different from home unit */}
            {ctx?.unitName && (basicUnit || area || district) && ctx.unitName !== (basicUnit || area || district) && (
              <View style={styles.workingContextBox}>
                <Text style={styles.workingContextLabel}>Active Working Context:</Text>
                <Text style={styles.workingContextValue}>
                  {ctx.unitName} ({ctx.unitLevel?.replace('_', ' ')})
                </Text>
              </View>
            )}
          </Card>

          {/* Member Details Card */}
          {(user.cnic || mem.cnic || mem.bloodGroup || mem.occupation || mem.education || mem.status) && (
            <Card style={styles.sectionCard}>
              <View style={styles.sectionHeaderRow}>
                <View style={styles.sectionTitleWrap}>
                  <Ionicons name="person-circle-outline" size={18} color={Colors.primary} />
                  <Text style={styles.sectionTitle}>Personal & Member Information</Text>
                </View>
                {mem.status && (
                  <Badge
                    label={mem.status}
                    color={mem.status === 'ACTIVE' ? '#15803d' : '#b45309'}
                    bg={mem.status === 'ACTIVE' ? '#dcfce7' : '#fef3c7'}
                  />
                )}
              </View>

              <View style={styles.infoList}>
                {user.cnic || mem.cnic ? (
                  <InfoItem
                    icon="card-outline"
                    label="National ID (CNIC)"
                    value={formatCnic(user.cnic || mem.cnic)}
                  />
                ) : null}

                {mem.fatherOrHusbandName ? (
                  <InfoItem
                    icon="people-outline"
                    label="Father / Husband Name"
                    value={mem.fatherOrHusbandName}
                  />
                ) : null}

                {mem.bloodGroup ? (
                  <InfoItem
                    icon="water-outline"
                    label="Blood Group"
                    value={mem.bloodGroup}
                    badge={<Badge label={mem.bloodGroup} color="#b91c1c" bg="#fee2e2" />}
                  />
                ) : null}

                {mem.occupation ? (
                  <InfoItem
                    icon="briefcase-outline"
                    label="Occupation"
                    value={mem.occupation}
                  />
                ) : null}

                {mem.education ? (
                  <InfoItem
                    icon="school-outline"
                    label="Education"
                    value={mem.education}
                  />
                ) : null}

                {mem.dateJoined ? (
                  <InfoItem
                    icon="calendar-outline"
                    label="Joined Organization"
                    value={shortDate(mem.dateJoined)}
                    isLast
                  />
                ) : null}
              </View>
            </Card>
          )}

          {/* Account Actions */}
          <Card style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Account Actions</Text>
            
            <View style={styles.actionButtonsRow}>
              <TouchableOpacity
                style={styles.refreshBtn}
                onPress={handleRefresh}
                disabled={refreshing}
              >
                {refreshing ? (
                  <ActivityIndicator size="small" color={Colors.primary} />
                ) : (
                  <>
                    <Ionicons name="refresh-outline" size={16} color={Colors.primary} />
                    <Text style={styles.refreshBtnText}>Sync Profile</Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.logoutBtn}
                onPress={handleLogout}
                disabled={signingOut}
              >
                {signingOut ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="log-out-outline" size={16} color="#fff" />
                    <Text style={styles.logoutText}>Sign Out</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </Card>

          {/* Footer branding */}
          <View style={styles.footer}>
            <Text style={styles.footerBrand}>Pashtunkhwa National Awami Party (PKNAP)</Text>
            <Text style={styles.footerVersion}>Management Information System · v1.0.0</Text>
          </View>

        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  scrollContent: { padding: Spacing.md, paddingBottom: 50 },
  container: { width: '100%' },
  containerTablet: { maxWidth: 740, alignSelf: 'center' },

  // Profile Header
  profileCard: {
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    borderRadius: Radius.xl,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.lg,
  },
  avatarWrapper: {
    position: 'relative',
  },
  avatarImg: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 2,
    borderColor: Colors.primary,
    backgroundColor: '#f1f5f9',
  },
  statusDot: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#16a34a',
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  profileInfo: { flex: 1 },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 4,
  },
  profileName: {
    fontSize: FontSize.lg,
    fontWeight: '800',
    color: Colors.text,
    letterSpacing: -0.3,
  },
  memberIdBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    backgroundColor: '#eff6ff',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  memberIdText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.primary,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  profileContact: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: 2,
  },

  // Sections
  sectionCard: {
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    borderRadius: Radius.xl,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  sectionTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    fontSize: FontSize.base,
    fontWeight: '800',
    color: Colors.text,
  },
  switchRoleHint: {
    fontSize: 11,
    color: Colors.primary,
    fontWeight: '600',
  },

  // Role Pills
  rolePills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  rolePillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Radius.md,
    backgroundColor: '#f8fafc',
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
  },
  rolePillBtnActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 2,
  },
  rolePillText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: '#475569',
  },
  rolePillTextActive: {
    color: '#ffffff',
  },
  roleExplanationBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f9ff',
    borderWidth: 1,
    borderColor: '#bae6fd',
    borderRadius: Radius.md,
    padding: 10,
    marginTop: 4,
  },
  roleExplanationText: {
    fontSize: 11,
    color: '#0369a1',
    flex: 1,
    lineHeight: 16,
  },

  // Unit Hierarchy
  infoList: {
    backgroundColor: '#f8fafc',
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    overflow: 'hidden',
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  infoItemLast: {
    borderBottomWidth: 0,
  },
  infoIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#eff6ff',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  infoContent: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 11,
    color: Colors.textMuted,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  infoValue: {
    fontSize: FontSize.sm,
    color: Colors.text,
    fontWeight: '700',
    marginTop: 2,
  },
  infoBadgeWrap: {
    marginLeft: 8,
  },

  centralScopeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0fdfa',
    borderWidth: 1,
    borderColor: '#ccfbf1',
    borderRadius: Radius.lg,
    padding: 14,
    gap: 12,
  },
  centralScopeIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#ccfbf1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  centralScopeTitle: {
    fontSize: FontSize.sm,
    fontWeight: '800',
    color: '#0f766e',
  },
  centralScopeSub: {
    fontSize: 11,
    color: '#115e59',
    marginTop: 2,
  },

  workingContextBox: {
    marginTop: 10,
    padding: 10,
    backgroundColor: '#fffbeb',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: '#fef3c7',
  },
  workingContextLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#b45309',
    textTransform: 'uppercase',
  },
  workingContextValue: {
    fontSize: 12,
    fontWeight: '700',
    color: '#92400e',
    marginTop: 1,
  },

  // Account Actions
  actionButtonsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  refreshBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: Radius.lg,
    paddingVertical: 12,
    backgroundColor: '#f8fafc',
    borderWidth: 1.5,
    borderColor: '#cbd5e1',
  },
  refreshBtnText: {
    color: Colors.primary,
    fontSize: FontSize.sm,
    fontWeight: '700',
  },
  logoutBtn: {
    flex: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: Radius.lg,
    paddingVertical: 12,
    backgroundColor: Colors.error,
    shadowColor: Colors.error,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 2,
  },
  logoutText: {
    color: '#ffffff',
    fontSize: FontSize.sm,
    fontWeight: '700',
  },

  footer: {
    marginTop: Spacing.lg,
    alignItems: 'center',
    paddingVertical: 12,
  },
  footerBrand: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textMuted,
  },
  footerVersion: {
    fontSize: 10,
    color: Colors.textLight,
    marginTop: 2,
  },
});
