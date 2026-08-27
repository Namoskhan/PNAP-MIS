import { useState, useEffect } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Link } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import { useUnit } from '../../src/context/UnitContext';
import { api } from '../../src/api/client';
import { isPureMember } from '../../src/utils/permissions';
import Card from '../../src/components/Card';
import Badge from '../../src/components/Badge';
import CommandCenter from '../../src/components/CommandCenter';
import UnitDashboard from '../../src/components/dashboard/UnitDashboard';
import { Colors, FontSize, Radius, Spacing } from '../../src/constants/colors';
import { shortDate, MEETING_TYPE_LABEL } from '../../src/utils/formatters';

export default function DashboardScreen() {
  const { user } = useAuth();
  const { ctx } = useUnit();

  // Member Portal state
  const isMember = isPureMember(user);
  const [me, setMe] = useState(null);
  const [meetings, setMeetings] = useState([]);
  const [activities, setActivities] = useState([]);
  const [loadingMember, setLoadingMember] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Executive toggle
  const isSuperOrExecutive = !!user?.canViewExecutiveDashboard || user?.roles?.includes('SUPER_ADMIN');
  const [execView, setExecView] = useState('NATIONAL'); // 'NATIONAL' | 'UNIT'

  useEffect(() => {
    if (!isMember) return;
    loadMemberData();
  }, [isMember, user?.memberId, user?.scope?.basicUnitId]);

  async function loadMemberData(silent = false) {
    if (!silent) setLoadingMember(true);
    const tasks = [];
    if (user?.memberId) {
      tasks.push(api.get(`/members/${user.memberId}`).then((r) => setMe(r.data.data)).catch(() => {}));
    }
    const buId = user?.scope?.basicUnitId || ctx?.unitId;
    if (buId) {
      const params = { unitLevel: 'BASIC_UNIT', unitId: buId };
      tasks.push(api.get('/meetings', { params }).then((r) => setMeetings((r.data.data || []).slice(0, 5))).catch(() => {}));
      tasks.push(api.get('/activities', { params }).then((r) => setActivities((r.data.data || []).slice(0, 5))).catch(() => {}));
    }
    Promise.all(tasks).finally(() => {
      setLoadingMember(false);
      setRefreshing(false);
    });
  }

  function onRefreshMember() {
    setRefreshing(true);
    loadMemberData(true);
  }

  // 1. Executive / Super Admin view
  if (isSuperOrExecutive) {
    if (execView === 'NATIONAL') {
      return (
        <View style={{ flex: 1 }}>
          <View style={styles.execBar}>
            <Text style={styles.execBarText}>National Command Center</Text>
            <TouchableOpacity
              style={styles.execToggleBtn}
              onPress={() => setExecView('UNIT')}
            >
              <Text style={styles.execToggleBtnText}>Switch to Unit Dashboard →</Text>
            </TouchableOpacity>
          </View>
          <CommandCenter />
        </View>
      );
    }
    return (
      <View style={{ flex: 1 }}>
        <View style={styles.execBar}>
          <Text style={styles.execBarText}>Unit Domain: {ctx?.unitName}</Text>
          <TouchableOpacity
            style={styles.execToggleBtn}
            onPress={() => setExecView('NATIONAL')}
          >
            <Text style={styles.execToggleBtnText}>← National Command Center</Text>
          </TouchableOpacity>
        </View>
        <UnitDashboard />
      </View>
    );
  }

  // 2. Member Portal for Pure Members
  if (isMember) {
    const firstName = user?.fullName?.split(' ')[0] || 'Member';
    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefreshMember} tintColor={Colors.primary} />}
        >
          {/* Member Banner */}
          <View style={styles.memberBanner}>
            <View style={{ flex: 1 }}>
              <Text style={styles.bannerEyebrow}>MEMBER PORTAL</Text>
              <Text style={styles.bannerName}>Welcome, {firstName}</Text>
              <Text style={styles.bannerUnit}>
                {me?.basicUnitId?.name ? `Your Unit · ${me.basicUnitId.name}` : 'Your activity at a glance.'}
              </Text>
            </View>
            <View style={styles.bannerActions}>
              <Link href="/announcements" asChild>
                <TouchableOpacity style={styles.bellBtn}>
                  <Text style={styles.bellIcon}>📣</Text>
                </TouchableOpacity>
              </Link>
              <Link href="/notifications" asChild>
                <TouchableOpacity style={styles.bellBtn}>
                  <Text style={styles.bellIcon}>🔔</Text>
                </TouchableOpacity>
              </Link>
            </View>
          </View>

          {/* Member Status Cards */}
          <View style={styles.chipRow}>
            <View style={styles.statChip}>
              <Text style={styles.statChipIcon}>🪪</Text>
              <View>
                <Text style={styles.statChipVal}>{me?.memberId || '—'}</Text>
                <Text style={styles.statChipLabel}>Member ID</Text>
              </View>
            </View>
            <View style={styles.statChip}>
              <Text style={styles.statChipIcon}>●</Text>
              <View>
                <Text style={styles.statChipVal}>{me?.status?.toLowerCase() || 'active'}</Text>
                <Text style={styles.statChipLabel}>Status</Text>
              </View>
            </View>
          </View>

          {/* Profile overview card */}
          <Card style={styles.memberCard}>
            <Text style={styles.sectionTitle}>My Profile</Text>
            {loadingMember && !me ? (
              <ActivityIndicator size="small" color={Colors.primary} />
            ) : me ? (
              <View style={styles.profileGrid}>
                <View style={styles.profileField}>
                  <Text style={styles.fieldLabel}>Full Name</Text>
                  <Text style={styles.fieldVal}>{me.fullName}</Text>
                </View>
                <View style={styles.profileField}>
                  <Text style={styles.fieldLabel}>Member ID</Text>
                  <Text style={styles.fieldVal}>{me.memberId || '—'}</Text>
                </View>
                <View style={styles.profileField}>
                  <Text style={styles.fieldLabel}>CNIC</Text>
                  <Text style={styles.fieldVal}>{me.cnic}</Text>
                </View>
                <View style={styles.profileField}>
                  <Text style={styles.fieldLabel}>Phone</Text>
                  <Text style={styles.fieldVal}>{me.phone || '—'}</Text>
                </View>
                <View style={styles.profileField}>
                  <Text style={styles.fieldLabel}>Basic Unit</Text>
                  <Text style={styles.fieldVal}>{me.basicUnitId?.name || '—'}</Text>
                </View>
              </View>
            ) : (
              <Text style={styles.emptyText}>Could not load profile details.</Text>
            )}
          </Card>

          {/* Recent Meetings */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Meetings</Text>
            <Link href="/meetings" asChild>
              <TouchableOpacity><Text style={styles.seeAll}>See all →</Text></TouchableOpacity>
            </Link>
          </View>
          {meetings.length === 0 ? (
            <Card style={styles.emptyCard}>
              <Text style={styles.emptyIcon}>📋</Text>
              <Text style={styles.emptyText}>No meetings logged for your unit yet.</Text>
            </Card>
          ) : (
            meetings.map((m) => (
              <Link key={m._id} href={`/meetings/${m._id}`} asChild>
                <TouchableOpacity>
                  <Card style={styles.itemCard}>
                    <View style={styles.itemRow}>
                      <View style={styles.itemInfo}>
                        <Text style={styles.itemTitle} numberOfLines={1}>{m.title || MEETING_TYPE_LABEL[m.typeCode] || m.typeCode}</Text>
                        <Text style={styles.itemMeta}>{shortDate(m.startAt)} · {m.venue || '—'}</Text>
                      </View>
                      <Badge label={m.status || 'Scheduled'} status={m.status === 'APPROVED' ? 'APPROVED' : undefined} />
                    </View>
                  </Card>
                </TouchableOpacity>
              </Link>
            ))
          )}

          {/* Recent Activities */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Activities</Text>
            <Link href="/activities" asChild>
              <TouchableOpacity><Text style={styles.seeAll}>See all →</Text></TouchableOpacity>
            </Link>
          </View>
          {activities.length === 0 ? (
            <Card style={styles.emptyCard}>
              <Text style={styles.emptyIcon}>🎯</Text>
              <Text style={styles.emptyText}>No activities recorded for your unit yet.</Text>
            </Card>
          ) : (
            activities.map((a) => (
              <Link key={a._id} href={`/activities/${a._id}`} asChild>
                <TouchableOpacity>
                  <Card style={styles.itemCard}>
                    <View style={styles.itemRow}>
                      <View style={styles.itemInfo}>
                        <Text style={styles.itemTitle} numberOfLines={1}>{a.title || a.typeCode}</Text>
                        <Text style={styles.itemMeta}>{shortDate(a.startAt)} · {a.venue || '—'}</Text>
                      </View>
                      <Badge label={a.typeCode} color={Colors.info} bg={Colors.infoBg} />
                    </View>
                  </Card>
                </TouchableOpacity>
              </Link>
            ))
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // 3. KPK Admin / Province Admin / District Admin / Area Admin / Unit Operators
  // Renders the rich Unit Dashboard matching web /unit
  return <UnitDashboard />;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  scroll: { flex: 1 },
  content: { padding: Spacing.md, paddingBottom: 32 },
  execBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1e293b',
    paddingVertical: 8,
    paddingHorizontal: Spacing.md,
  },
  execBarText: {
    color: '#cbd5e1',
    fontSize: 11,
    fontWeight: '700',
  },
  execToggleBtn: {
    backgroundColor: '#334155',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: Radius.sm,
  },
  execToggleBtnText: {
    color: '#f8fafc',
    fontSize: 11,
    fontWeight: '700',
  },
  memberBanner: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  bannerEyebrow: {
    fontSize: 10,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.7)',
    letterSpacing: 1,
    marginBottom: 4,
  },
  bannerName: {
    fontSize: FontSize.xl,
    fontWeight: '800',
    color: '#fff',
  },
  bannerUnit: {
    fontSize: FontSize.xs,
    color: 'rgba(255,255,255,0.85)',
    marginTop: 2,
  },
  bannerActions: {
    flexDirection: 'row',
    gap: 6,
  },
  bellBtn: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: Radius.full,
    padding: 8,
  },
  bellIcon: {
    fontSize: 16,
  },
  chipRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  statChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.surface,
    padding: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  statChipIcon: {
    fontSize: 18,
  },
  statChipVal: {
    fontSize: FontSize.sm,
    fontWeight: '800',
    color: Colors.text,
    textTransform: 'capitalize',
  },
  statChipLabel: {
    fontSize: 10,
    color: Colors.textMuted,
    fontWeight: '500',
  },
  memberCard: {
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  sectionTitle: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 6,
  },
  seeAll: {
    fontSize: FontSize.xs,
    color: Colors.primary,
    fontWeight: '600',
  },
  profileGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  profileField: {
    width: '45%',
  },
  fieldLabel: {
    fontSize: 10,
    color: Colors.textMuted,
    fontWeight: '600',
  },
  fieldVal: {
    fontSize: FontSize.sm,
    color: Colors.text,
    fontWeight: '700',
    marginTop: 1,
  },
  itemCard: {
    marginBottom: Spacing.xs,
    padding: Spacing.md,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  itemInfo: {
    flex: 1,
  },
  itemTitle: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.text,
  },
  itemMeta: {
    fontSize: 10,
    color: Colors.textMuted,
    marginTop: 2,
  },
  emptyCard: {
    padding: Spacing.lg,
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  emptyIcon: {
    fontSize: 28,
    marginBottom: 6,
  },
  emptyText: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    textAlign: 'center',
  },
});
