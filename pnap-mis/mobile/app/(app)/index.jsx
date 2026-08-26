import { useEffect, useState } from 'react';
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
import { isPureMember, canManageFinance, roleLabel } from '../../src/utils/permissions';
import KpiCard from '../../src/components/KpiCard';
import Card from '../../src/components/Card';
import Badge from '../../src/components/Badge';
import CommandCenter from '../../src/components/CommandCenter';
import { Colors, FontSize, Spacing } from '../../src/constants/colors';
import { shortDate, relativeTime, PKR, MEETING_TYPE_LABEL } from '../../src/utils/formatters';

export default function DashboardScreen() {
  const { user } = useAuth();
  const { ctx } = useUnit();
  const [data, setData] = useState(null);
  const [meetings, setMeetings] = useState([]);
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const isMember = isPureMember(user);
  const firstName = user?.fullName?.split(' ')[0] || 'User';

  async function load(silent = false) {
    if (!silent) setLoading(true);
    try {
      if (isMember) {
        const params = user?.scope?.basicUnitId
          ? { unitLevel: 'BASIC_UNIT', unitId: user.scope.basicUnitId }
          : {};
        const [mRes, aRes] = await Promise.all([
          api.get('/meetings', { params }),
          api.get('/activities', { params }),
        ]);
        setMeetings((mRes.data.data || []).slice(0, 5));
        setActivities((aRes.data.data || []).slice(0, 5));
      } else if (ctx?.unitLevel && ctx?.unitId) {
        const params = { unitLevel: ctx.unitLevel, unitId: ctx.unitId };
        const [dashRes, mRes, aRes] = await Promise.all([
          api.get('/dashboard', { params }).catch(() => ({ data: { data: null } })),
          api.get('/meetings', { params }),
          api.get('/activities', { params }),
        ]);
        setData(dashRes.data?.data);
        setMeetings((mRes.data.data || []).slice(0, 5));
        setActivities((aRes.data.data || []).slice(0, 5));
      }
    } catch { /* fail silently */ } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  const isSuperOrCentral = user?.roles?.includes('SUPER_ADMIN') || user?.roles?.includes('CENTRAL_ADMIN') || !!user?.canViewExecutiveDashboard;

  useEffect(() => { 
    if (!isSuperOrCentral) {
      load(); 
    }
  }, [isMember, ctx?.unitId, isSuperOrCentral]);

  function onRefresh() {
    setRefreshing(true);
    load(true);
  }

  if (isSuperOrCentral) {
    return <CommandCenter />;
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
      >
        {/* Welcome Banner */}
        <View style={styles.banner}>
          <View style={{ flex: 1 }}>
            <Text style={styles.bannerEyebrow}>{isMember ? 'MEMBER PORTAL' : 'UNIT DASHBOARD'}</Text>
            <Text style={styles.bannerName}>Welcome, {firstName}</Text>
            {ctx?.unitName && <Text style={styles.bannerUnit}>{ctx.unitName}</Text>}
          </View>
          <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
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

        {/* Role pills */}
        {user?.roles && user.roles.length > 0 && (
          <View style={styles.rolePills}>
            {user.roles.slice(0, 3).map((r) => (
              <Badge key={r} label={roleLabel(user, r)} color={Colors.primaryLight} bg="#eff6ff" />
            ))}
          </View>
        )}

        {/* KPI Grid — operator only */}
        {!isMember && data && (
          <>
            <Text style={styles.sectionTitle}>Overview</Text>
            <View style={styles.kpiGrid}>
              <KpiCard label="Total Members" value={data.memberCount ?? '—'} icon="👥" color={Colors.primary} />
              <KpiCard label="Active" value={data.activeCount ?? '—'} icon="✅" color={Colors.success} />
            </View>
            <View style={styles.kpiGrid}>
              <KpiCard label="Meetings" value={data.meetingCount ?? '—'} icon="📅" color={Colors.warning} />
              <KpiCard label="Activities" value={data.activityCount ?? '—'} icon="🚩" color={Colors.info} />
            </View>
            {canManageFinance(user) && data.balance != null && (
              <View style={styles.kpiGrid}>
                <KpiCard label="Donations" value={PKR(data.totalDonations)} icon="💰" color={Colors.success} />
                <KpiCard label="Expenses" value={PKR(data.totalExpenses)} icon="💸" color={Colors.error} />
              </View>
            )}
          </>
        )}

        {/* Recent Meetings */}
        {meetings.length > 0 && (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Recent Meetings</Text>
              <Link href="/meetings" asChild>
                <TouchableOpacity><Text style={styles.seeAll}>See all</Text></TouchableOpacity>
              </Link>
            </View>
            {meetings.map((m) => (
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
            ))}
          </>
        )}

        {/* Recent Activities */}
        {activities.length > 0 && (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Recent Activities</Text>
              <Link href="/activities" asChild>
                <TouchableOpacity><Text style={styles.seeAll}>See all</Text></TouchableOpacity>
              </Link>
            </View>
            {activities.map((a) => (
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
            ))}
          </>
        )}

        {meetings.length === 0 && activities.length === 0 && !loading && (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyIcon}>📭</Text>
            <Text style={styles.emptyText}>No recent activity in your unit.</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll: { flex: 1 },
  content: { padding: Spacing.lg, paddingBottom: 32 },
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    backgroundColor: Colors.primary,
    borderRadius: 16,
    padding: Spacing.xl,
    marginBottom: Spacing.lg,
  },
  bannerEyebrow: { fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.65)', letterSpacing: 1.5, marginBottom: 4 },
  bannerName: { fontSize: FontSize.xxl, fontWeight: '800', color: '#fff' },
  bannerUnit: { fontSize: FontSize.sm, color: 'rgba(255,255,255,0.75)', marginTop: 2 },
  bellBtn: { backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 12, padding: 10 },
  bellIcon: { fontSize: 20 },
  rolePills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: Spacing.lg },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.sm },
  sectionTitle: { fontSize: FontSize.base, fontWeight: '700', color: Colors.text, marginBottom: Spacing.sm, marginTop: Spacing.sm },
  seeAll: { fontSize: FontSize.sm, color: Colors.primary, fontWeight: '600' },
  kpiGrid: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.sm },
  itemCard: { marginBottom: Spacing.sm },
  itemRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  itemInfo: { flex: 1 },
  itemTitle: { fontSize: FontSize.base, fontWeight: '600', color: Colors.text, marginBottom: 2 },
  itemMeta: { fontSize: FontSize.xs, color: Colors.textMuted },
  emptyBox: { alignItems: 'center', paddingVertical: 48 },
  emptyIcon: { fontSize: 40, marginBottom: Spacing.md },
  emptyText: { fontSize: FontSize.base, color: Colors.textMuted, textAlign: 'center' },
});
