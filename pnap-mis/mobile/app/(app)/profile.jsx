import { useState, useEffect } from 'react';
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
import { Storage } from '../../src/utils/storage';
import { useToast } from '../../src/components/Toast';
import { useLanguage } from '../../src/context/LanguageContext';
import LanguageSelector from '../../src/components/LanguageSelector';
import { getScopedCacheMeta, syncUserScopeCache } from '../../src/services/scopeDataCache';
import Avatar from '../../src/components/Avatar';
import Card from '../../src/components/Card';
import Badge from '../../src/components/Badge';
import { Colors, FontSize, Radius, Spacing } from '../../src/constants/colors';
import { shortDate, formatCnic } from '../../src/utils/formatters';

function InfoItem({ icon, label, value, badge, isLast, isRTL }) {
  if (!value && !badge) return null;
  return (
    <View style={[styles.infoItem, isLast && styles.infoItemLast, isRTL && { flexDirection: 'row-reverse' }]}>
      <View style={styles.infoIconWrap}>
        <Ionicons name={icon || 'information-circle-outline'} size={18} color={Colors.primary} />
      </View>
      <View style={[styles.infoContent, isRTL && { alignItems: 'flex-end' }]}>
        <Text style={[styles.infoLabel, isRTL && { textAlign: 'right' }]}>{label}</Text>
        <Text style={[styles.infoValue, isRTL && { textAlign: 'right' }]} numberOfLines={2}>
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
  const { t, isRTL } = useLanguage();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;

  const toast = useToast();
  const [signingOut, setSigningOut] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [sessionInfo, setSessionInfo] = useState({ isRemembered: true, expiryDays: 7 });
  const [cacheMeta, setCacheMeta] = useState(null);
  const [syncingCache, setSyncingCache] = useState(false);

  async function refreshCacheMeta() {
    try {
      const meta = await getScopedCacheMeta();
      setCacheMeta(meta);
    } catch {}
  }

  useEffect(() => {
    (async () => {
      try {
        const [rem, exp] = await Promise.all([
          Storage.getItem('pnap_remember_me'),
          Storage.getItem('pnap_session_expiry'),
        ]);
        const isRemembered = rem !== 'false';
        let expiryDays = 7;
        if (exp) {
          const msLeft = Number(exp) - Date.now();
          expiryDays = Math.max(1, Math.ceil(msLeft / (24 * 60 * 60 * 1000)));
        }
        setSessionInfo({ isRemembered, expiryDays });
      } catch {}
      await refreshCacheMeta();
    })();
  }, []);

  async function handleSyncCache() {
    setSyncingCache(true);
    try {
      const res = await syncUserScopeCache(user, ctx, { force: true });
      if (res?.success) {
        toast?.success?.(t('profile.syncCacheSuccess', 'Offline scope cache updated successfully'));
      } else {
        toast?.info?.(t('profile.syncCacheRetained', 'Could not reach server to refresh cache. Existing cache retained.'));
      }
      await refreshCacheMeta();
    } catch {
      toast?.error?.(t('profile.syncCacheFailed', 'Failed to sync offline cache'));
    } finally {
      setSyncingCache(false);
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    try {
      if (refreshMe) await refreshMe();
      await refreshCacheMeta();
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
      if (typeof window !== 'undefined' && window.confirm(t('profile.signOutConfirmMessage', 'Are you sure you want to sign out of your account?'))) {
        performLogout();
      }
    } else {
      Alert.alert(
        t('profile.signOutConfirmTitle', 'Sign Out'),
        t('profile.signOutConfirmMessage', 'Are you sure you want to sign out of your account?'),
        [
          { text: t('profile.cancel', 'Cancel'), style: 'cancel' },
          {
            text: t('profile.signOut', 'Sign Out'),
            style: 'destructive',
            onPress: performLogout,
          },
        ]
      );
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
            <View style={[styles.profileHeader, isRTL && { flexDirection: 'row-reverse' }]}>
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

              <View style={[styles.profileInfo, isRTL && { alignItems: 'flex-end' }]}>
                <View style={[styles.nameRow, isRTL && { flexDirection: 'row-reverse' }]}>
                  <Text style={[styles.profileName, isRTL && { textAlign: 'right' }]} numberOfLines={2}>
                    {user.fullName || t('roles.MEMBER', 'Member')}
                  </Text>
                  {isSuper && <Badge label={t('roles.SUPER_ADMIN', 'Super Admin')} color="#fff" bg="#0f172a" />}
                </View>

                {user.memberNo || user.memberId || mem.memberId ? (
                  <View style={[styles.memberIdBadge, isRTL && { flexDirection: 'row-reverse' }]}>
                    <Ionicons name="id-card-outline" size={13} color={Colors.primary} />
                    <Text style={styles.memberIdText}>
                      ID: {user.memberNo || mem.memberId || user.memberId}
                    </Text>
                  </View>
                ) : null}

                {user.email ? (
                  <Text style={[styles.profileContact, isRTL && { textAlign: 'right' }]} numberOfLines={1}>
                    <Ionicons name="mail-outline" size={12} color={Colors.textMuted} /> {user.email}
                  </Text>
                ) : null}

                {user.phone ? (
                  <Text style={[styles.profileContact, isRTL && { textAlign: 'right' }]} numberOfLines={1}>
                    <Ionicons name="call-outline" size={12} color={Colors.textMuted} /> {user.phone}
                  </Text>
                ) : null}
              </View>
            </View>
          </Card>

          {/* Active Roles & View As Selector */}
          {allRoles.length > 0 && (
            <Card style={styles.sectionCard}>
              <View style={[styles.sectionHeaderRow, isRTL && { flexDirection: 'row-reverse' }]}>
                <View style={[styles.sectionTitleWrap, isRTL && { flexDirection: 'row-reverse' }]}>
                  <Ionicons name="shield-checkmark-outline" size={18} color={Colors.primary} />
                  <Text style={styles.sectionTitle}>{t('profile.assignedRoles', 'Assigned Roles & Personas')}</Text>
                </View>
                {allRoles.length > 1 && (
                  <Text style={styles.switchRoleHint}>{t('profile.tapToSwitch', 'Tap to switch view')}</Text>
                )}
              </View>

              <View style={[styles.rolePills, isRTL && { flexDirection: 'row-reverse' }]}>
                {allRoles.map((r) => {
                  const isCurrentActive = activeRole === r || (!activeRole && allRoles.length === 1);
                  return (
                    <TouchableOpacity
                      key={r}
                      onPress={() => setActiveRole(r)}
                      style={[styles.rolePillBtn, isCurrentActive && styles.rolePillBtnActive, isRTL && { flexDirection: 'row-reverse' }]}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name={isCurrentActive ? 'radio-button-on' : 'radio-button-off'}
                        size={14}
                        color={isCurrentActive ? '#fff' : Colors.primary}
                        style={isRTL ? { marginLeft: 5 } : { marginRight: 5 }}
                      />
                      <Text style={[styles.rolePillText, isCurrentActive && styles.rolePillTextActive]}>
                        {t(`roles.${r}`, roleLabel(user, r))}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={[styles.roleExplanationBox, isRTL && { flexDirection: 'row-reverse' }]}>
                <Ionicons name="information-circle-outline" size={15} color="#0369a1" style={isRTL ? { marginLeft: 6 } : { marginRight: 6 }} />
                <Text style={[styles.roleExplanationText, isRTL && { textAlign: 'right' }]}>
                  {activeRole
                    ? t('profile.viewingWithPermissions', 'Currently viewing app features with permissions for: {{role}}.', { role: t(`roles.${activeRole}`, roleLabel(user, activeRole)) })
                    : t('profile.viewingDefault', 'Viewing with your default administrative permissions.')}
                </Text>
              </View>
            </Card>
          )}

          {/* Organizational Unit & Scope Card */}
          <Card style={styles.sectionCard}>
            <View style={[styles.sectionHeaderRow, isRTL && { flexDirection: 'row-reverse' }]}>
              <View style={[styles.sectionTitleWrap, isRTL && { flexDirection: 'row-reverse' }]}>
                <Ionicons name="business-outline" size={18} color={Colors.primary} />
                <Text style={styles.sectionTitle}>{t('profile.organizationalUnit', 'Organizational Unit')}</Text>
              </View>
              {ctx?.unitLevel && (
                <Badge
                  label={t(`units.${ctx.unitLevel.toLowerCase()}`, ctx.unitLevel.replace('_', ' '))}
                  color="#1e40af"
                  bg="#dbeafe"
                />
              )}
            </View>

            {hasLocalUnit ? (
              <View style={styles.infoList}>
                {province ? (
                  <InfoItem icon="map-outline" label={t('profile.province', 'Province')} value={province} isRTL={isRTL} />
                ) : null}
                {district ? (
                  <InfoItem icon="navigate-outline" label={t('profile.district', 'District')} value={district} isRTL={isRTL} />
                ) : null}
                {area ? (
                  <InfoItem icon="location-outline" label={t('profile.area', 'Area')} value={area} isRTL={isRTL} />
                ) : null}
                {basicUnit ? (
                  <InfoItem icon="home-outline" label={t('profile.basicUnit', 'Basic Unit')} value={basicUnit} isLast isRTL={isRTL} />
                ) : null}
              </View>
            ) : isSuper || isCentral ? (
              <View style={[styles.centralScopeBox, isRTL && { flexDirection: 'row-reverse' }]}>
                <View style={styles.centralScopeIcon}>
                  <Ionicons name="globe-outline" size={24} color="#0f766e" />
                </View>
                <View style={[{ flex: 1 }, isRTL && { alignItems: 'flex-end' }]}>
                  <Text style={[styles.centralScopeTitle, isRTL && { textAlign: 'right' }]}>{t('profile.centralOrg', 'PKNAP Central Organization')}</Text>
                  <Text style={[styles.centralScopeSub, isRTL && { textAlign: 'right' }]}>
                    {t('profile.centralScopeSub', 'National level jurisdiction with organization-wide access.')}
                  </Text>
                </View>
              </View>
            ) : (
              <View style={[styles.centralScopeBox, isRTL && { flexDirection: 'row-reverse' }]}>
                <View style={styles.centralScopeIcon}>
                  <Ionicons name="business-outline" size={24} color="#0284c7" />
                </View>
                <View style={[{ flex: 1 }, isRTL && { alignItems: 'flex-end' }]}>
                  <Text style={[styles.centralScopeTitle, isRTL && { textAlign: 'right' }]}>
                    {ctx?.unitName || homeUnitName || t('profile.centralOrg', 'Central Unit')}
                  </Text>
                  <Text style={[styles.centralScopeSub, isRTL && { textAlign: 'right' }]}>
                    {t('profile.operatingLevel', 'Operating level: {{level}}', { level: t(`units.${(ctx?.unitLevel || homeLevel || 'General').toLowerCase()}`, ctx?.unitLevel || homeLevel || 'General') })}
                  </Text>
                </View>
              </View>
            )}

            {/* If working context is different from home unit */}
            {ctx?.unitName && (basicUnit || area || district) && ctx.unitName !== (basicUnit || area || district) && (
              <View style={[styles.workingContextBox, isRTL && { alignItems: 'flex-end' }]}>
                <Text style={styles.workingContextLabel}>{t('profile.workingContext', 'Active Working Context:')}</Text>
                <Text style={styles.workingContextValue}>
                  {ctx.unitName} ({t(`units.${ctx.unitLevel?.toLowerCase()}`, ctx.unitLevel?.replace('_', ' '))})
                </Text>
              </View>
            )}
          </Card>

          {/* Member Details Card */}
          {(user.cnic || mem.cnic || mem.bloodGroup || mem.occupation || mem.education || mem.status) && (
            <Card style={styles.sectionCard}>
              <View style={[styles.sectionHeaderRow, isRTL && { flexDirection: 'row-reverse' }]}>
                <View style={[styles.sectionTitleWrap, isRTL && { flexDirection: 'row-reverse' }]}>
                  <Ionicons name="person-circle-outline" size={18} color={Colors.primary} />
                  <Text style={styles.sectionTitle}>{t('profile.personalInfo', 'Personal & Member Information')}</Text>
                </View>
                {mem.status && (
                  <Badge
                    label={t(`common.${mem.status.toLowerCase()}`, mem.status)}
                    color={mem.status === 'ACTIVE' ? '#15803d' : '#b45309'}
                    bg={mem.status === 'ACTIVE' ? '#dcfce7' : '#fef3c7'}
                  />
                )}
              </View>

              <View style={styles.infoList}>
                {user.cnic || mem.cnic ? (
                  <InfoItem
                    icon="card-outline"
                    label={t('profile.cnic', 'National ID (CNIC)')}
                    value={formatCnic(user.cnic || mem.cnic)}
                    isRTL={isRTL}
                  />
                ) : null}

                {mem.fatherOrHusbandName ? (
                  <InfoItem
                    icon="people-outline"
                    label={t('profile.fatherOrHusbandName', 'Father / Husband Name')}
                    value={mem.fatherOrHusbandName}
                    isRTL={isRTL}
                  />
                ) : null}

                {mem.bloodGroup ? (
                  <InfoItem
                    icon="water-outline"
                    label={t('profile.bloodGroup', 'Blood Group')}
                    value={mem.bloodGroup}
                    badge={<Badge label={mem.bloodGroup} color="#b91c1c" bg="#fee2e2" />}
                    isRTL={isRTL}
                  />
                ) : null}

                {mem.occupation ? (
                  <InfoItem
                    icon="briefcase-outline"
                    label={t('profile.occupation', 'Occupation')}
                    value={mem.occupation}
                    isRTL={isRTL}
                  />
                ) : null}

                {mem.education ? (
                  <InfoItem
                    icon="school-outline"
                    label={t('profile.education', 'Education')}
                    value={mem.education}
                    isRTL={isRTL}
                  />
                ) : null}

                {mem.dateJoined ? (
                  <InfoItem
                    icon="calendar-outline"
                    label={t('profile.joinedOrg', 'Joined Organization')}
                    value={shortDate(mem.dateJoined)}
                    isLast
                    isRTL={isRTL}
                  />
                ) : null}
              </View>
            </Card>
          )}

          {/* Offline & Session Status */}
          <Card style={styles.sectionCard}>
            <View style={[styles.sectionHeader, isRTL && { flexDirection: 'row-reverse' }]}>
              <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 8 }, isRTL && { flexDirection: 'row-reverse' }]}>
                <Ionicons name="shield-checkmark" size={18} color="#16a34a" />
                <Text style={styles.sectionTitle}>{t('profile.offlineSecurity', 'Offline & Session Security')}</Text>
              </View>
              <Badge
                text={sessionInfo.isRemembered ? t('profile.offline7Days', '7-Day Offline') : t('profile.standardSession', 'Standard')}
                variant={sessionInfo.isRemembered ? 'success' : 'default'}
              />
            </View>

            <View style={styles.infoList}>
              <InfoItem
                icon="time-outline"
                label={t('profile.sessionValidity', 'Session Validity')}
                value={
                  sessionInfo.isRemembered
                    ? t('profile.sessionActiveDays', 'Active for ~{{days}} day(s) without credentials', { days: sessionInfo.expiryDays })
                    : t('profile.sessionStandard', 'Standard session')
                }
                isRTL={isRTL}
              />
              <InfoItem
                icon="cloud-offline-outline"
                label={t('profile.offlineFieldAccess', 'Offline Field Access')}
                value={t('profile.offlineFieldAccessDesc', 'Enabled — you can view data, create meetings, register members, and record finance offline.')}
                isRTL={isRTL}
              />
              <InfoItem
                icon="server-outline"
                label={t('profile.scopeDataCached', 'Scope Data Cached')}
                value={
                  cacheMeta?.lastSync
                    ? `${new Date(cacheMeta.lastSync).toLocaleDateString()} ${new Date(cacheMeta.lastSync).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} (${cacheMeta.unitLevel || 'Scope'}: ${cacheMeta.unitName || 'Central'})`
                    : t('profile.autoSyncBackground', 'Auto-syncs in background')
                }
                isLast
                isRTL={isRTL}
              />
            </View>

            <TouchableOpacity
              style={[styles.syncCacheBtn, isRTL && { flexDirection: 'row-reverse' }]}
              onPress={handleSyncCache}
              disabled={syncingCache}
            >
              {syncingCache ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <>
                  <Ionicons name="cloud-download-outline" size={16} color="#ffffff" />
                  <Text style={styles.syncCacheBtnText}>{t('profile.updateOfflineCache', 'Update Offline Scope Cache')}</Text>
                </>
              )}
            </TouchableOpacity>
          </Card>

          {/* Language Selection */}
          <LanguageSelector
            variant="card"
            onLanguageChanged={() => {
              toast?.success?.(t('mobile.languageUpdated', 'Language updated successfully'));
            }}
          />

          {/* Account Actions */}
          <Card style={styles.sectionCard}>
            <Text style={[styles.sectionTitle, isRTL && { textAlign: 'right' }]}>{t('profile.accountActions', 'Account Actions')}</Text>
            
            <View style={[styles.actionButtonsRow, isRTL && { flexDirection: 'row-reverse' }]}>
              <TouchableOpacity
                style={[styles.refreshBtn, isRTL && { flexDirection: 'row-reverse' }]}
                onPress={handleRefresh}
                disabled={refreshing}
              >
                {refreshing ? (
                  <ActivityIndicator size="small" color={Colors.primary} />
                ) : (
                  <>
                    <Ionicons name="refresh-outline" size={16} color={Colors.primary} />
                    <Text style={styles.refreshBtnText}>{t('profile.syncProfile', 'Sync Profile')}</Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.logoutBtn, isRTL && { flexDirection: 'row-reverse' }]}
                onPress={handleLogout}
                disabled={signingOut}
              >
                {signingOut ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="log-out-outline" size={16} color="#fff" />
                    <Text style={styles.logoutText}>{t('profile.signOut', 'Sign Out')}</Text>
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
    ...Platform.select({
      web: {
        boxShadow: '0 2px 6px rgba(0, 0, 0, 0.05)',
      },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 6,
        elevation: 2,
      },
    }),
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
    ...Platform.select({
      web: {
        boxShadow: '0 1px 4px rgba(0, 0, 0, 0.04)',
      },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 4,
        elevation: 1,
      },
    }),
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
    ...Platform.select({
      web: {
        boxShadow: '0 2px 3px rgba(30, 64, 175, 0.2)',
      },
      default: {
        shadowColor: Colors.primary,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 3,
        elevation: 2,
      },
    }),
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

  syncCacheBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.primary,
    borderRadius: Radius.lg,
    paddingVertical: 12,
    marginTop: Spacing.md,
  },
  syncCacheBtnText: {
    color: '#ffffff',
    fontSize: FontSize.sm,
    fontWeight: '700',
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
    ...Platform.select({
      web: {
        boxShadow: '0 2px 3px rgba(220, 38, 38, 0.2)',
      },
      default: {
        shadowColor: Colors.error,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 3,
        elevation: 2,
      },
    }),
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
